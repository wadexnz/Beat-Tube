import type { WebGLRenderer } from 'three'
import type { OnsetResult } from '../audio/OnsetResult'
import type { IScene } from '../core/Scene'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
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
  /** Side-to-side wave frequency along the scrolling track */
  SWAY_FREQUENCY: 0.0022,
  /** Gentle movement when audio is quiet */
  BASE_SWAY: 38,
  /** Additional side-to-side range driven directly by flux */
  FLUX_SWAY: 260,
  /** Fraction of the ship's sway followed by the chase camera */
  CAMERA_SWAY_FOLLOW: 0.25,
  /** Base banking angle during a turn */
  BASE_BANK: 0.08,
  /** Additional banking driven directly by flux */
  FLUX_BANK: 0.45,
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
  /** Despawn distance just before blocks would obscure the ship */
  KILL_Z: SHIP.Z + 20,
  /** Flux threshold above which a beat spawns two blocks */
  DOUBLE_SPAWN_FLUX: 0.25,
  /** Traffic visible before the first beat arrives */
  INITIAL_COUNT: 18,
  /** Base spin speed (radians/sec) */
  BASE_SPIN: 0.3,
  /** Spin speed multiplier for audio flux */
  FLUX_SPIN_MULTIPLIER: 6,
} as const

const HORIZON = {
  /** Sun disc radius */
  SUN_RADIUS: 260,
  /** Sun distance beyond the end of the track */
  Z: TRACK_MATH.DEPTH + 700,
  /** Star count above the road */
  STAR_COUNT: 900,
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
  SHIP: new Color(0xD8F6FF),
  SHIP_WING: new Color(0x10265C),
  SHIP_ACCENT: new Color(0x00DDFF),
  SHIP_CANOPY: new Color(0x2864FF),
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
  private horizon: Group
  private stars: Points
  private blocksMesh: InstancedMesh
  private blockMaterial: MeshBasicMaterial
  private blockStates: BlockState[]
  private dummy = new Object3D()

  private offset = 0
  private flux = 0

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

    this.horizon = this.buildHorizon()
    this.scene.add(this.horizon)

    this.stars = this.buildStars()
    this.scene.add(this.stars)

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

    // Position every reactive element before the first frame is rendered.
    this.update(0, { flux: 0, meanFlux: 0, event: false })

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

  private buildHorizon(): Group {
    const horizon = new Group()
    const sunMaterial = new MeshBasicMaterial({
      color: 0xFF2B88,
      side: DoubleSide,
    })
    const sun = new Mesh(new CircleGeometry(HORIZON.SUN_RADIUS, 64), sunMaterial)
    sun.position.set(0, 170, HORIZON.Z)
    horizon.add(sun)

    for (const [radius, opacity] of [[350, 0.3], [470, 0.15]] as const) {
      const ringMaterial = new MeshBasicMaterial({
        color: 0x7B2CFF,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      })
      const ring = new Mesh(
        new RingGeometry(HORIZON.SUN_RADIUS + 18, radius, 64),
        ringMaterial,
      )
      ring.position.copy(sun.position)
      ring.position.z += 4
      horizon.add(ring)
    }

    return horizon
  }

  private buildStars(): Points {
    const positions = new Float32Array(HORIZON.STAR_COUNT * 3)
    for (let i = 0; i < HORIZON.STAR_COUNT; i++) {
      const i3 = i * 3
      positions[i3] = (Math.random() - 0.5) * 7600
      positions[i3 + 1] = 180 + Math.random() * 2100
      positions[i3 + 2] = 500 + Math.random() * (TRACK_MATH.DEPTH + 900)
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    const material = new PointsMaterial({
      color: 0xB8D9FF,
      size: 7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    return new Points(geometry, material)
  }

  private buildShip(): { mesh: Group, material: MeshBasicMaterial[] } {
    const hullMaterial = new MeshBasicMaterial({ color: COLORS.SHIP })
    const wingMaterial = new MeshBasicMaterial({ color: COLORS.SHIP_WING })
    const accentMaterial = new MeshBasicMaterial({ color: COLORS.SHIP_ACCENT })
    const canopyMaterial = new MeshBasicMaterial({ color: COLORS.SHIP_CANOPY })
    const ship = new Group()

    const hullGeometry = new ConeGeometry(SHIP.RADIUS, SHIP.LENGTH, 6)
    hullGeometry.rotateX(Math.PI / 2)
    const hull = new Mesh(hullGeometry, hullMaterial)
    hull.scale.set(1.15, 0.55, 1)
    ship.add(hull)

    const wingGeometry = new ConeGeometry(22, 48, 3)
    wingGeometry.rotateX(Math.PI / 2)
    for (const x of [-25, 25]) {
      const wing = new Mesh(wingGeometry, wingMaterial)
      wing.position.set(x, -5, -8)
      wing.scale.set(1, 0.28, 1)
      ship.add(wing)
    }

    const spine = new Mesh(new BoxGeometry(7, 5, 40), accentMaterial)
    spine.position.set(0, 1, -8)
    ship.add(spine)

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
      material: [hullMaterial, wingMaterial, accentMaterial, canopyMaterial],
    }
  }

  private buildBlocks(): {
    mesh: InstancedMesh
    material: MeshBasicMaterial
    states: BlockState[]
  } {
    const geometry = new OctahedronGeometry(BLOCKS.SIZE * 0.68, 0)
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

  private updateBlocks(deltaTime: number, scrollSpeed: number): void {
    const spin = BLOCKS.BASE_SPIN + this.flux * BLOCKS.FLUX_SPIN_MULTIPLIER

    for (let i = 0; i < BLOCKS.MAX; i++) {
      const block = this.blockStates[i]
      if (!block.active)
        continue

      block.z -= scrollSpeed * deltaTime
      block.angle += spin * deltaTime

      if (block.z < BLOCKS.KILL_Z) {
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
        this.dummy.scale.set(scaleIn * 0.8, scaleIn * 1.45, scaleIn * 0.8)
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

    // Horizon elements pulse directly with the current audio values.
    this.horizon.scale.setScalar(1 + audio.flux * 0.12)
    ;(this.stars.material as PointsMaterial).opacity
      = Math.min(0.6 + audio.flux * 0.8, 1)

    // Block brightness scales directly with flux (multiplies instance colors)
    this.blockMaterial.color.setScalar(0.75 + audio.flux * 0.8)

    // Beat events — instant, stateless changes
    if (audio.event)
      this.spawnBlocks(audio.flux)

    // Smooth weaving and banking are direct functions of the current flux and
    // track offset; beat events never start a multi-frame animation.
    const swayPhase = this.offset * SHIP.SWAY_FREQUENCY
    const swayAmplitude = SHIP.BASE_SWAY + audio.flux * SHIP.FLUX_SWAY
    const sway = Math.sin(swayPhase) * swayAmplitude
    const shipY = trackHeight(SHIP.Z, this.offset, this.flux) + SHIP.HOVER
    const roadAtShipX = trackBend(SHIP.Z, this.offset)
    const shipX = roadAtShipX + sway
    this.shipMesh.position.set(
      shipX,
      shipY,
      SHIP.Z,
    )
    this.shipMesh.rotation.z = -Math.cos(swayPhase)
      * (SHIP.BASE_BANK + audio.flux * SHIP.FLUX_BANK)

    // Follow only part of the weave so the side-to-side motion stays visible.
    this.camera.position.x
      = roadAtShipX + sway * SHIP.CAMERA_SWAY_FOLLOW
    this.camera.position.y = VIEW.CAMERA_HEIGHT + shipY * VIEW.CAMERA_FOLLOW
    const roadAheadX = trackBend(VIEW.LOOK_AHEAD, this.offset)
    this.camera.lookAt(
      roadAheadX + sway * SHIP.CAMERA_SWAY_FOLLOW,
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
    this.horizon.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose()
        ;(child.material as MeshBasicMaterial).dispose()
      }
    })
    this.stars.geometry.dispose()
    ;(this.stars.material as PointsMaterial).dispose()
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
