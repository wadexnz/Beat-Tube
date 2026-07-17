import type { WebGLRenderer } from 'three'
import type { OnsetResult } from '../audio/OnsetResult'
import type { IScene } from '../core/Scene'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import {
  audioSurfFragmentShader,
  audioSurfVertexShader,
  TRACK_MATH,
  trackBend,
  trackHeight,
} from '../shaders/audioSurfShader'

// =============================================================================
// Audio Surf Scene Constants
// =============================================================================

const VIEW = {
  /** Camera field of view */
  FOV: 72,
  /** Camera near plane */
  NEAR: 1,
  /** Camera far plane */
  FAR: 9000,
  /** Base camera height above the track */
  CAMERA_HEIGHT: 82,
  /** How much the camera follows the ship's height (0-1) */
  CAMERA_FOLLOW: 0.5,
  /** Camera look-ahead distance */
  LOOK_AHEAD: 900,
  /** Look-at height above the track */
  LOOK_HEIGHT: 30,
} as const

const MOTION = {
  /** Base scroll speed when no audio is playing */
  BASE_SPEED: 520,
  /** Scroll speed multiplier for audio flux */
  FLUX_SPEED_MULTIPLIER: 3600,
  /** Scale applied to meanFlux to derive 0-1 energy for color blending */
  ENERGY_SCALE: 3.5,
} as const

const SHIP = {
  /** Distance ahead of the camera */
  Z: 220,
  /** Hover height above the track surface */
  HOVER: 18,
  /** Body radius */
  RADIUS: 13,
  /** Body length */
  LENGTH: 58,
} as const

const BLOCKS = {
  /** Instanced mesh pool size */
  MAX: 72,
  /** Box edge length */
  SIZE: 44,
  /** Hover height above the track surface */
  HOVER: 20,
  /** Spawn distance ahead of the camera */
  SPAWN_Z: 2800,
  /** Distance over which blocks scale in after spawning */
  SPAWN_FADE: 180,
  /** Despawn distance (behind the ship) */
  KILL_Z: -80,
  /** Flux threshold above which a beat spawns two blocks */
  DOUBLE_SPAWN_FLUX: 0.25,
  /** Traffic visible before the first beat arrives */
  INITIAL_COUNT: 18,
  /** Base spin speed (radians/sec) */
  BASE_SPIN: 0.3,
  /** Spin speed multiplier for audio flux */
  FLUX_SPIN_MULTIPLIER: 6,
} as const

/** Lane count and x-position of a lane center */
const LANE_COUNT = 3
const LANE_WIDTH = TRACK_MATH.WIDTH / LANE_COUNT

// =============================================================================
// Colors — calm (purple/blue) to intense (yellow/red), like Audiosurf traffic
// =============================================================================

const COLORS = {
  BACKGROUND: new Color(0x03010A),
  CALM_RAIL: new Color(0x00CCFF),
  HOT_RAIL: new Color(0xFF2266),
  CALM_BASE: new Color(0x0A1436),
  HOT_BASE: new Color(0x33060E),
  CALM_SKY: new Color(0x1133AA),
  HOT_SKY: new Color(0xDD2244),
  SHIP: new Color(0xEEF6FF),
  SHIP_ACCENT: new Color(0x00DDFF),
  SHIP_CANOPY: new Color(0x2255FF),
} as const

/** Block color ramp indexed by flux at spawn time (calm to intense) */
const BLOCK_RAMP = [
  new Color(0x7733FF),
  new Color(0x2266FF),
  new Color(0x00CCAA),
  new Color(0xFFBB00),
  new Color(0xFF3355),
]

/** Sample the block ramp at t in 0-1 */
function rampColor(t: number): Color {
  const clamped = Math.min(Math.max(t, 0), 1) * (BLOCK_RAMP.length - 1)
  const i = Math.min(Math.floor(clamped), BLOCK_RAMP.length - 2)
  return BLOCK_RAMP[i].clone().lerp(BLOCK_RAMP[i + 1], clamped - i)
}

interface BlockState {
  active: boolean
  lane: number
  z: number
  angle: number
}

// =============================================================================
// Audio Surf Scene
// =============================================================================

export class AudioSurfScene implements IScene {
  private renderer: WebGLRenderer
  private scene: Scene
  private camera: PerspectiveCamera
  private trackMesh: Mesh
  private trackMaterial: ShaderMaterial
  private skyMesh: Mesh
  private skyMaterial: ShaderMaterial
  private shipMesh: Group
  private shipMaterials: MeshBasicMaterial[]
  private blocksMesh: InstancedMesh
  private blockMaterial: MeshBasicMaterial
  private blockStates: BlockState[]
  private dummy = new Object3D()

  private offset = 0
  private flux = 0
  private shipLane = 1

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer

    this.camera = this.buildCamera()
    this.scene = new Scene()
    this.scene.background = COLORS.BACKGROUND

    const { mesh: trackMesh, material: trackMat } = this.buildTrack()
    this.trackMesh = trackMesh
    this.trackMaterial = trackMat
    this.scene.add(this.trackMesh)

    const { mesh: skyMesh, material: skyMat } = this.buildSky()
    this.skyMesh = skyMesh
    this.skyMaterial = skyMat
    this.scene.add(this.skyMesh)

    const { mesh: shipMesh, material: shipMat } = this.buildShip()
    this.shipMesh = shipMesh
    this.shipMaterials = shipMat
    this.scene.add(this.shipMesh)

    const { mesh: blocksMesh, material: blockMat, states } = this.buildBlocks()
    this.blocksMesh = blocksMesh
    this.blockMaterial = blockMat
    this.blockStates = states
    this.scene.add(this.blocksMesh)
    this.seedBlocks()

    window.addEventListener('resize', () => this.resize())
  }

  private buildCamera(): PerspectiveCamera {
    const aspectRatio = window.innerWidth / window.innerHeight
    const camera = new PerspectiveCamera(
      VIEW.FOV,
      aspectRatio,
      VIEW.NEAR,
      VIEW.FAR,
    )
    camera.position.set(0, VIEW.CAMERA_HEIGHT, 0)
    camera.lookAt(new Vector3(0, VIEW.LOOK_HEIGHT, VIEW.LOOK_AHEAD))
    return camera
  }

  private buildTrack(): { mesh: Mesh, material: ShaderMaterial } {
    const geometry = new PlaneGeometry(TRACK_MATH.WIDTH, TRACK_MATH.DEPTH, 8, 256)
    geometry.rotateX(-Math.PI / 2)
    // Shift so local z runs 0 (camera) to DEPTH (horizon)
    geometry.translate(0, 0, TRACK_MATH.DEPTH / 2)

    const material = new ShaderMaterial({
      vertexShader: audioSurfVertexShader,
      fragmentShader: audioSurfFragmentShader,
      uniforms: {
        uOffset: { value: 0 },
        uFlux: { value: 0 },
        uEnergy: { value: 0 },
        uCalmRail: { value: COLORS.CALM_RAIL.clone() },
        uHotRail: { value: COLORS.HOT_RAIL.clone() },
        uCalmBase: { value: COLORS.CALM_BASE.clone() },
        uHotBase: { value: COLORS.HOT_BASE.clone() },
        uFogColor: { value: COLORS.BACKGROUND.clone() },
      },
    })

    const mesh = new Mesh(geometry, material)
    return { mesh, material }
  }

  private buildSky(): { mesh: Mesh, material: ShaderMaterial } {
    const geometry = new PlaneGeometry(9000, 3000)
    const material = new ShaderMaterial({
      vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: /* glsl */ `
                uniform float uFlux;
                uniform float uEnergy;
                uniform vec3 uCalmSky;
                uniform vec3 uHotSky;
                varying vec2 vUv;
                void main() {
                    // Horizon glow fading to black overhead
                    float glow = pow(1.0 - vUv.y, 3.0);
                    vec3 horizon = mix(uCalmSky, uHotSky, uEnergy);
                    float brightness = 0.35 + uFlux * 1.2;
                    gl_FragColor = vec4(horizon * glow * brightness, 1.0);
                }
            `,
      uniforms: {
        uFlux: { value: 0 },
        uEnergy: { value: 0 },
        uCalmSky: { value: COLORS.CALM_SKY.clone() },
        uHotSky: { value: COLORS.HOT_SKY.clone() },
      },
      depthWrite: false,
    })

    const mesh = new Mesh(geometry, material)
    mesh.position.set(0, 900, TRACK_MATH.DEPTH + 400)
    return { mesh, material }
  }

  private buildShip(): { mesh: Group, material: MeshBasicMaterial[] } {
    const hullMaterial = new MeshBasicMaterial({ color: COLORS.SHIP })
    const accentMaterial = new MeshBasicMaterial({ color: COLORS.SHIP_ACCENT })
    const canopyMaterial = new MeshBasicMaterial({ color: COLORS.SHIP_CANOPY })
    const ship = new Group()

    const hullGeometry = new ConeGeometry(SHIP.RADIUS, SHIP.LENGTH, 6)
    hullGeometry.rotateX(Math.PI / 2)
    const hull = new Mesh(hullGeometry, hullMaterial)
    hull.scale.set(1.15, 0.55, 1)
    ship.add(hull)

    const wings = new Mesh(new BoxGeometry(72, 5, 25), hullMaterial)
    wings.position.set(0, -4, -8)
    ship.add(wings)

    const canopy = new Mesh(new SphereGeometry(10, 12, 6), canopyMaterial)
    canopy.scale.set(0.75, 0.45, 1.35)
    canopy.position.set(0, 5, 7)
    ship.add(canopy)

    const thrusterGeometry = new BoxGeometry(13, 8, 10)
    for (const x of [-25, 25]) {
      const thruster = new Mesh(thrusterGeometry, accentMaterial)
      thruster.position.set(x, -2, -20)
      ship.add(thruster)
    }

    return {
      mesh: ship,
      material: [hullMaterial, accentMaterial, canopyMaterial],
    }
  }

  private buildBlocks(): {
    mesh: InstancedMesh
    material: MeshBasicMaterial
    states: BlockState[]
  } {
    const geometry = new BoxGeometry(BLOCKS.SIZE, BLOCKS.SIZE, BLOCKS.SIZE)
    const material = new MeshBasicMaterial({ color: 0xFFFFFF })
    const mesh = new InstancedMesh(geometry, material, BLOCKS.MAX)

    const states: BlockState[] = []
    for (let i = 0; i < BLOCKS.MAX; i++) {
      states.push({ active: false, lane: 1, z: 0, angle: 0 })
      this.dummy.position.set(0, -1000, 0)
      this.dummy.scale.setScalar(0)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(i, this.dummy.matrix)
      mesh.setColorAt(i, BLOCK_RAMP[0])
    }
    mesh.instanceMatrix.needsUpdate = true

    return { mesh, material, states }
  }

  /** Fill the road immediately so the scene never opens on an empty horizon. */
  private seedBlocks(): void {
    for (let i = 0; i < BLOCKS.INITIAL_COUNT; i++) {
      const block = this.blockStates[i]
      block.active = true
      block.lane = i % LANE_COUNT
      block.z = 480 + i * 135
      block.angle = (i % 4) * Math.PI / 4
      this.blocksMesh.setColorAt(i, BLOCK_RAMP[i % BLOCK_RAMP.length])
    }
    if (this.blocksMesh.instanceColor)
      this.blocksMesh.instanceColor.needsUpdate = true
    this.updateBlocks(0, 0)
  }

  /** X-position of a lane center (lane 0-2) */
  private laneX(lane: number): number {
    return (lane - 1) * LANE_WIDTH
  }

  /** Spawn blocks on a beat — instant, stateless creation */
  private spawnBlocks(flux: number): void {
    const count = flux > BLOCKS.DOUBLE_SPAWN_FLUX ? 2 : 1
    const firstLane = Math.floor(Math.random() * LANE_COUNT)
    const color = rampColor(flux * 2.5)

    let spawned = 0
    for (let i = 0; i < BLOCKS.MAX && spawned < count; i++) {
      const block = this.blockStates[i]
      if (block.active)
        continue
      block.active = true
      block.lane = (firstLane + spawned) % LANE_COUNT
      block.z = BLOCKS.SPAWN_Z
      block.angle = Math.random() * Math.PI
      this.blocksMesh.setColorAt(i, color)
      spawned++
    }
    if (spawned > 0 && this.blocksMesh.instanceColor)
      this.blocksMesh.instanceColor.needsUpdate = true
  }

  /** Hop the ship to a random different lane — instant beat response */
  private hopLane(): void {
    const shift = 1 + Math.floor(Math.random() * (LANE_COUNT - 1))
    this.shipLane = (this.shipLane + shift) % LANE_COUNT
  }

  private updateBlocks(deltaTime: number, scrollSpeed: number): void {
    const spin = BLOCKS.BASE_SPIN + this.flux * BLOCKS.FLUX_SPIN_MULTIPLIER

    for (let i = 0; i < BLOCKS.MAX; i++) {
      const block = this.blockStates[i]
      if (!block.active)
        continue

      const prevZ = block.z
      block.z -= scrollSpeed * deltaTime
      block.angle += spin * deltaTime

      // Collected: block crossed the ship in the ship's lane
      const collected = block.lane === this.shipLane
        && prevZ >= SHIP.Z && block.z < SHIP.Z

      if (collected || block.z < BLOCKS.KILL_Z) {
        block.active = false
        this.dummy.position.set(0, -1000, 0)
        this.dummy.scale.setScalar(0)
      }
      else {
        // Scale in near the spawn point — direct function of position
        const scaleIn = Math.min(
          (BLOCKS.SPAWN_Z - block.z) / BLOCKS.SPAWN_FADE,
          1,
        )
        this.dummy.position.set(
          this.laneX(block.lane) + trackBend(block.z, this.offset),
          trackHeight(block.z, this.offset, this.flux)
          + BLOCKS.HOVER,
          block.z,
        )
        this.dummy.rotation.set(0, block.angle, 0)
        this.dummy.scale.set(scaleIn, scaleIn * 1.35, scaleIn)
      }
      this.dummy.updateMatrix()
      this.blocksMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.blocksMesh.instanceMatrix.needsUpdate = true
  }

  update(deltaTime: number, audio: OnsetResult): void {
    this.flux = audio.flux
    const scrollSpeed
      = MOTION.BASE_SPEED + audio.flux * MOTION.FLUX_SPEED_MULTIPLIER
    this.offset += scrollSpeed * deltaTime

    const energy = Math.min(audio.meanFlux * MOTION.ENERGY_SCALE, 1)

    // Track uniforms
    this.trackMaterial.uniforms.uOffset.value = this.offset
    this.trackMaterial.uniforms.uFlux.value = audio.flux
    this.trackMaterial.uniforms.uEnergy.value = energy

    // Sky uniforms
    this.skyMaterial.uniforms.uFlux.value = audio.flux
    this.skyMaterial.uniforms.uEnergy.value = energy

    // Block brightness scales directly with flux (multiplies instance colors)
    this.blockMaterial.color.setScalar(0.75 + audio.flux * 0.8)

    // Beat events — instant, stateless changes
    if (audio.event) {
      this.spawnBlocks(audio.flux)
      this.hopLane()
    }

    // Ship rides the track surface at its lane
    const shipY = trackHeight(SHIP.Z, this.offset, this.flux) + SHIP.HOVER
    this.shipMesh.position.set(
      this.laneX(this.shipLane) + trackBend(SHIP.Z, this.offset),
      shipY,
      SHIP.Z,
    )

    // Camera partially follows the ship's height
    this.camera.position.y = VIEW.CAMERA_HEIGHT + shipY * VIEW.CAMERA_FOLLOW
    this.camera.lookAt(
      0,
      VIEW.LOOK_HEIGHT + shipY * VIEW.CAMERA_FOLLOW * 0.5,
      VIEW.LOOK_AHEAD,
    )

    this.updateBlocks(deltaTime, scrollSpeed)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.render()
  }

  dispose(): void {
    this.trackMesh.geometry.dispose()
    this.trackMaterial.dispose()
    this.skyMesh.geometry.dispose()
    this.skyMaterial.dispose()
    this.shipMesh.traverse((child) => {
      if (child instanceof Mesh)
        child.geometry.dispose()
    })
    for (const material of this.shipMaterials)
      material.dispose()
    this.blocksMesh.geometry.dispose()
    this.blockMaterial.dispose()
    this.blocksMesh.dispose()
  }
}
