import type { WebGLRenderer } from 'three'
import type { OnsetResult } from '../audio/OnsetResult'
import type { IScene } from '../core/Scene'
import {
  AdditiveBlending,
  CircleGeometry,
  Clock,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
} from 'three'
import {
  zikrFigureFragmentShader,
  zikrFigureVertexShader,
  zikrGlowFragmentShader,
  zikrGlowVertexShader,
  zikrMistFragmentShader,
  zikrMistVertexShader,
} from '../shaders/zikrShader'

// =============================================================================
// Zikr Scene Constants
// =============================================================================
//
// Based on the Chechen Sufi zikr (Qadiriyya dhikr): concentric circles of men,
// elders near the center, younger men in the outer rings. They stomp and sway
// in place, then walk, jog, and finally run counterclockwise as the rhythm
// intensifies, periodically stopping and reversing direction.

const ZIKR = {
  /** Camera field of view */
  FOV: 60,
  /** Camera near plane */
  NEAR: 0.1,
  /** Camera far plane */
  FAR: 200,
  /** Camera height above the ground */
  CAMERA_HEIGHT: 5.2,
  /** Camera distance from the circle center */
  CAMERA_RADIUS: 15.5,
  /** Height the camera looks at */
  LOOK_AT_HEIGHT: 1.1,
  /** Base camera orbit speed (radians/sec) */
  CAMERA_BASE_ORBIT: 0.02,
  /** Camera orbit speed multiplier for flux */
  CAMERA_FLUX_ORBIT: 0.1,
  /** Base ring rotation speed when quiet (radians/sec) - a slow procession */
  BASE_ANGULAR_SPEED: 0.12,
  /** Ring rotation speed multiplier for flux - builds to a run */
  FLUX_ANGULAR_SPEED: 2.6,
  /** Minimum time between rotation direction reversals */
  DIRECTION_COOLDOWN: 2.5,
  /** Minimum time between color changes */
  COLOR_COOLDOWN: 0.15,
  /** Base stomp cadence (radians/sec of phase) */
  STOMP_BASE_SPEED: 3.0,
  /** Stomp cadence multiplier for flux */
  STOMP_FLUX_SPEED: 16.0,
  /** Vertical hop distance at flux 1.0 (world units) */
  STOMP_AMPLITUDE: 0.55,
  /** Forward running lean per unit of flux (radians) */
  LEAN_FACTOR: 1.2,
  /** Maximum forward lean (radians) */
  LEAN_MAX: 0.3,
  /** Side-to-side sway per unit of flux (radians) */
  SWAY_FACTOR: 0.5,
  /** World height where figures fully emerge from the mist */
  MIST_TOP: 1.0,
  /** Base mist drift speed */
  MIST_DRIFT_BASE: 0.05,
  /** Mist drift speed multiplier for flux */
  MIST_DRIFT_FLUX: 0.6,
  /** Radius of the mist planes */
  MIST_RADIUS: 16,
  /** Radius of the dark ground disc */
  GROUND_RADIUS: 28,
} as const

/** Concentric rings: elders inner (larger, steadier), young men outer (faster) */
const RINGS = [
  { radius: 4.5, count: 12, scale: 1.12, speedFactor: 0.85 },
  { radius: 7.4, count: 20, scale: 1.0, speedFactor: 1.0 },
  { radius: 10.3, count: 28, scale: 0.92, speedFactor: 1.15 },
] as const

/** Upper-body profile revolved into a figure: waist, chest, shoulders, head, papakha hat */
const FIGURE_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.001, 0.0],
  [0.4, 0.03],
  [0.44, 0.42],
  [0.47, 0.8],
  [0.52, 1.06],
  [0.34, 1.24],
  [0.14, 1.3],
  [0.17, 1.44],
  [0.2, 1.58],
  [0.23, 1.7],
  [0.22, 1.98],
  [0.001, 2.05],
]

// =============================================================================
// Beat-Reactive Color Palettes
// =============================================================================

const COLOR_PALETTES = [
  { glow: new Color(0xFFAA55), rim: new Color(0xFFE0B0), mist: new Color(0x4A4460) }, // Amber Dusk
  { glow: new Color(0x66BBFF), rim: new Color(0xCCE8FF), mist: new Color(0x3A4A66) }, // Moonlight
  { glow: new Color(0xFF6644), rim: new Color(0xFFB199), mist: new Color(0x554048) }, // Ember
  { glow: new Color(0x55E6C8), rim: new Color(0xC2FFF0), mist: new Color(0x3C5555) }, // Teal Night
  { glow: new Color(0xC080FF), rim: new Color(0xE8CCFF), mist: new Color(0x4A4066) }, // Violet
]

// =============================================================================
// Zikr Scene
// =============================================================================

interface FigureData {
  ring: number
  baseAngle: number
  phaseOffset: number
  sizeJitter: number
}

export class ZikrScene implements IScene {
  private renderer: WebGLRenderer
  private scene: Scene
  private camera: PerspectiveCamera

  private figures: InstancedMesh
  private figureMaterial: ShaderMaterial
  private figureData: FigureData[] = []
  private dummy = new Object3D()

  private mistMaterials: ShaderMaterial[] = []
  private mistMeshes: Mesh[] = []
  private glowMesh: Mesh
  private glowMaterial: ShaderMaterial
  private groundMesh: Mesh

  private ringAngles = RINGS.map(() => 0)
  private direction = -1 // counterclockwise, as the ritual begins
  private stompPhase = 0
  private cameraAngle = 0
  private mistDrift = 0
  private currentPaletteIndex = 0
  private directionClock: Clock
  private colorClock: Clock

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene = new Scene()
    this.scene.background = new Color(0x030409)
    this.camera = this.buildCamera()

    const { mesh, material } = this.buildFigures()
    this.figures = mesh
    this.figureMaterial = material
    this.scene.add(this.figures)

    this.groundMesh = this.buildGround()
    this.scene.add(this.groundMesh)

    const { mesh: glowMesh, material: glowMaterial } = this.buildGlowPillar()
    this.glowMesh = glowMesh
    this.glowMaterial = glowMaterial
    this.scene.add(this.glowMesh)

    this.buildMist()

    this.directionClock = new Clock()
    this.colorClock = new Clock()

    this.updateFigures(0)
    window.addEventListener('resize', () => this.resize())
  }

  private buildCamera(): PerspectiveCamera {
    const aspectRatio = window.innerWidth / window.innerHeight
    const camera = new PerspectiveCamera(ZIKR.FOV, aspectRatio, ZIKR.NEAR, ZIKR.FAR)
    camera.position.set(0, ZIKR.CAMERA_HEIGHT, ZIKR.CAMERA_RADIUS)
    camera.lookAt(0, ZIKR.LOOK_AT_HEIGHT, 0)
    return camera
  }

  private buildFigures(): { mesh: InstancedMesh, material: ShaderMaterial } {
    const profile = FIGURE_PROFILE.map(([x, y]) => new Vector2(x, y))
    const geometry = new LatheGeometry(profile, 24)

    const palette = COLOR_PALETTES[0]
    const material = new ShaderMaterial({
      vertexShader: zikrFigureVertexShader,
      fragmentShader: zikrFigureFragmentShader,
      uniforms: {
        uFlux: { value: 0 },
        uMeanFlux: { value: 0 },
        uGlowColor: { value: palette.glow.clone() },
        uRimColor: { value: palette.rim.clone() },
        uMistColor: { value: palette.mist.clone() },
        uMistTop: { value: ZIKR.MIST_TOP },
      },
    })

    const totalCount = RINGS.reduce((sum, ring) => sum + ring.count, 0)
    const mesh = new InstancedMesh(geometry, material, totalCount)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false

    for (let ring = 0; ring < RINGS.length; ring++) {
      for (let i = 0; i < RINGS[ring].count; i++) {
        this.figureData.push({
          ring,
          baseAngle: (i / RINGS[ring].count) * Math.PI * 2,
          phaseOffset: Math.random() * Math.PI * 2,
          sizeJitter: 0.94 + Math.random() * 0.12,
        })
      }
    }

    return { mesh, material }
  }

  private buildGround(): Mesh {
    const geometry = new CircleGeometry(ZIKR.GROUND_RADIUS, 48)
    geometry.rotateX(-Math.PI / 2)
    const material = new MeshBasicMaterial({ color: 0x05060A })
    const mesh = new Mesh(geometry, material)
    mesh.position.y = -0.02
    return mesh
  }

  private buildGlowPillar(): { mesh: Mesh, material: ShaderMaterial } {
    const geometry = new CylinderGeometry(0.6, 1.0, 5, 24, 1, true)
    const material = new ShaderMaterial({
      vertexShader: zikrGlowVertexShader,
      fragmentShader: zikrGlowFragmentShader,
      uniforms: {
        uFlux: { value: 0 },
        uGlowColor: { value: COLOR_PALETTES[0].glow.clone() },
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })
    const mesh = new Mesh(geometry, material)
    mesh.position.y = 2.5
    mesh.renderOrder = 1
    return { mesh, material }
  }

  private buildMist(): void {
    const layers = [
      { height: 0.3, seed: 0, opacity: 0.85 },
      { height: 0.6, seed: 37.4, opacity: 0.6 },
    ]

    for (const layer of layers) {
      const geometry = new CircleGeometry(ZIKR.MIST_RADIUS, 48)
      geometry.rotateX(-Math.PI / 2)
      const material = new ShaderMaterial({
        vertexShader: zikrMistVertexShader,
        fragmentShader: zikrMistFragmentShader,
        uniforms: {
          uFlux: { value: 0 },
          uMeanFlux: { value: 0 },
          uDrift: { value: 0 },
          uSeed: { value: layer.seed },
          uOpacity: { value: layer.opacity },
          uMistColor: { value: COLOR_PALETTES[0].mist.clone() },
        },
        transparent: true,
        depthWrite: false,
      })
      const mesh = new Mesh(geometry, material)
      mesh.position.y = layer.height
      mesh.renderOrder = 2
      this.mistMaterials.push(material)
      this.mistMeshes.push(mesh)
      this.scene.add(mesh)
    }
  }

  private updateFigures(flux: number): void {
    const lean = Math.min(flux * ZIKR.LEAN_FACTOR, ZIKR.LEAN_MAX)
    this.dummy.rotation.order = 'YXZ'

    for (let i = 0; i < this.figureData.length; i++) {
      const figure = this.figureData[i]
      const ring = RINGS[figure.ring]
      const angle = figure.baseAngle + this.ringAngles[figure.ring]

      const hop = flux * ZIKR.STOMP_AMPLITUDE
        * Math.abs(Math.sin(this.stompPhase + figure.phaseOffset))
      const sway = flux * ZIKR.SWAY_FACTOR
        * Math.sin(this.stompPhase * 0.5 + figure.phaseOffset)

      this.dummy.position.set(
        Math.cos(angle) * ring.radius,
        hop,
        Math.sin(angle) * ring.radius,
      )
      // Face the direction of travel around the ring
      this.dummy.rotation.set(
        lean,
        Math.atan2(-Math.sin(angle) * this.direction, Math.cos(angle) * this.direction),
        sway,
      )
      const size = ring.scale * figure.sizeJitter
      this.dummy.scale.set(size * 1.35, size, size * 0.8)
      this.dummy.updateMatrix()
      this.figures.setMatrixAt(i, this.dummy.matrix)
    }

    this.figures.instanceMatrix.needsUpdate = true
  }

  update(deltaTime: number, audio: OnsetResult): void {
    // Clamp deltaTime to prevent massive jumps when returning from background tab
    const delta = Math.min(deltaTime, 0.1)

    // The circles walk, jog, and run with the music's intensity
    const angularSpeed = ZIKR.BASE_ANGULAR_SPEED + audio.flux * ZIKR.FLUX_ANGULAR_SPEED
    for (let ring = 0; ring < RINGS.length; ring++)
      this.ringAngles[ring] += angularSpeed * RINGS[ring].speedFactor * this.direction * delta

    this.stompPhase += (ZIKR.STOMP_BASE_SPEED + audio.flux * ZIKR.STOMP_FLUX_SPEED) * delta
    this.cameraAngle += (ZIKR.CAMERA_BASE_ORBIT + audio.flux * ZIKR.CAMERA_FLUX_ORBIT) * delta
    this.mistDrift += (ZIKR.MIST_DRIFT_BASE + audio.flux * ZIKR.MIST_DRIFT_FLUX) * delta

    if (audio.event) {
      // The circle halts and reverses - the ritual's stop-and-turn
      if (this.directionClock.getElapsedTime() > ZIKR.DIRECTION_COOLDOWN) {
        this.directionClock = new Clock()
        this.direction *= -1
      }
      if (this.colorClock.getElapsedTime() > ZIKR.COLOR_COOLDOWN) {
        this.colorClock = new Clock()
        this.currentPaletteIndex = (this.currentPaletteIndex + 1) % COLOR_PALETTES.length
        this.applyPalette()
      }
    }

    this.updateFigures(audio.flux)

    this.figureMaterial.uniforms.uFlux.value = audio.flux
    this.figureMaterial.uniforms.uMeanFlux.value = audio.meanFlux
    this.glowMaterial.uniforms.uFlux.value = audio.flux
    for (const material of this.mistMaterials) {
      material.uniforms.uFlux.value = audio.flux
      material.uniforms.uMeanFlux.value = audio.meanFlux
      material.uniforms.uDrift.value = this.mistDrift
    }

    this.camera.position.set(
      Math.sin(this.cameraAngle) * ZIKR.CAMERA_RADIUS,
      ZIKR.CAMERA_HEIGHT,
      Math.cos(this.cameraAngle) * ZIKR.CAMERA_RADIUS,
    )
    this.camera.lookAt(0, ZIKR.LOOK_AT_HEIGHT, 0)
  }

  private applyPalette(): void {
    const palette = COLOR_PALETTES[this.currentPaletteIndex]
    this.figureMaterial.uniforms.uGlowColor.value.copy(palette.glow)
    this.figureMaterial.uniforms.uRimColor.value.copy(palette.rim)
    this.figureMaterial.uniforms.uMistColor.value.copy(palette.mist)
    this.glowMaterial.uniforms.uGlowColor.value.copy(palette.glow)
    for (const material of this.mistMaterials)
      material.uniforms.uMistColor.value.copy(palette.mist)
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
    this.figures.geometry.dispose()
    this.figureMaterial.dispose()
    this.figures.dispose()
    this.glowMesh.geometry.dispose()
    this.glowMaterial.dispose()
    this.groundMesh.geometry.dispose()
    ;(this.groundMesh.material as MeshBasicMaterial).dispose()
    for (const mesh of this.mistMeshes)
      mesh.geometry.dispose()
    for (const material of this.mistMaterials)
      material.dispose()
  }
}
