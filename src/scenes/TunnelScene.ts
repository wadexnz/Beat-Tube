import type { Texture, WebGLRenderer } from 'three'
import type { OnsetResult } from '../audio/OnsetResult'
import type { IScene } from '../core/Scene'
import {
  AmbientLight,
  BackSide,
  CatmullRomCurve3,
  Clock,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  TextureLoader,
  TubeGeometry,
  Vector3,
} from 'three'
import { SPEED, toTunnelSpeed } from '../core/units'

// =============================================================================
// Tunnel Scene Constants
// =============================================================================

const TUNNEL = {
  /** Number of curve segments */
  SEGMENTS: 100,
  /** Length of each segment in world units */
  SEGMENT_LENGTH: 1600,
  /** Tube radius in world units */
  RADIUS: 100,
  /** Number of path segments per generated tunnel chunk */
  CHUNK_SEGMENTS: 8,
  /** Geometry tube segments per generated chunk */
  CHUNK_TUBE_SEGMENTS: 48,
  /** Number of chunks kept behind the camera */
  CHUNKS_BEHIND: 1,
  /** Number of chunks kept ahead of the camera */
  CHUNKS_AHEAD: 3,
  /** Camera field of view */
  FOV: 90,
  /** Camera near plane */
  NEAR: 1,
  /** Camera far plane */
  FAR: 10000,
  /** Camera offset from orb */
  CAMERA_OFFSET: 100,
  /** Minimum time between rotation direction changes */
  ROTATION_COOLDOWN: 0.1,
} as const

// =============================================================================
// Helper Functions
// =============================================================================

function randColor(color: number): number {
  const inc = 0.15
  if (Math.random() > 0.5 && color + inc < 1)
    return color + inc
  else if (color - inc > 0)
    return color - inc
  else
    return color + inc
}

// =============================================================================
// Tunnel Scene
// =============================================================================

export class TunnelScene implements IScene {
  private totalLength: number
  private chunkCount: number
  private speed: number
  private rotDir = 1
  private pos = 0

  private renderer: WebGLRenderer
  private scene: Scene
  private camera: PerspectiveCamera
  private curve: CatmullRomCurve3
  private curvePoints: Vector3[]
  private orb: Object3D
  private aLight: AmbientLight
  private clock: Clock
  private tubeMaterial?: MeshPhongMaterial
  private tubeMeshes = new Map<number, Mesh>()
  private activeTunnelChunk = -1

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.totalLength = TUNNEL.SEGMENTS * TUNNEL.SEGMENT_LENGTH
    this.chunkCount = Math.ceil(TUNNEL.SEGMENTS / TUNNEL.CHUNK_SEGMENTS)
    this.speed = toTunnelSpeed(SPEED.NORMAL)

    this.camera = this.buildCamera()
    this.scene = new Scene()
    this.curvePoints = this.createCurvePoints()
    this.curve = new CatmullRomCurve3(this.curvePoints)
    this.orb = this.buildOrb()
    this.orb.add(this.camera)
    this.aLight = this.buildALight()
    this.clock = new Clock()

    const loader = new TextureLoader()
    loader.load(`${import.meta.env.BASE_URL}img/stonePattern.jpg`, (texture: Texture) => {
      this.buildTube(texture)
    })
    window.addEventListener('resize', () => this.resize())
  }

  private buildCamera(): PerspectiveCamera {
    const aspectRatio = window.innerWidth / window.innerHeight
    const camera = new PerspectiveCamera(
      TUNNEL.FOV,
      aspectRatio,
      TUNNEL.NEAR,
      TUNNEL.FAR,
    )
    camera.position.set(0, 0, -TUNNEL.CAMERA_OFFSET)
    camera.rotation.y = Math.PI
    return camera
  }

  private buildALight(): AmbientLight {
    const aLight = new AmbientLight('orange', 0.5)
    this.scene.add(aLight)
    return aLight
  }

  private createCurvePoints(): Vector3[] {
    const points: Vector3[] = [new Vector3(0, 0, 0)]
    let height = 0
    let width = 0

    for (let i = 1; i <= TUNNEL.SEGMENTS; i++) {
      const angle = Math.random() * 0.3 - 0.25
      const en = TUNNEL.SEGMENT_LENGTH * Math.sin(angle)
      points.push(new Vector3(
        0,
        (height += TUNNEL.SEGMENT_LENGTH * Math.sin(angle)),
        (width += Math.sqrt(TUNNEL.SEGMENT_LENGTH * TUNNEL.SEGMENT_LENGTH - en * en)),
      ))
    }
    return points
  }

  private buildTube(texture: Texture): void {
    this.tubeMaterial = new MeshPhongMaterial({
      side: BackSide,
      map: texture,
    })
    if (this.tubeMaterial.map) {
      this.tubeMaterial.map.wrapS = RepeatWrapping
      this.tubeMaterial.map.wrapT = RepeatWrapping
      this.tubeMaterial.map.repeat.set(TUNNEL.CHUNK_TUBE_SEGMENTS / 3, 2)
    }
    this.updateTunnelChunks()
  }

  private updateTunnelChunks(): void {
    if (!this.tubeMaterial)
      return

    const currentSegment = Math.min(
      Math.floor(this.pos * TUNNEL.SEGMENTS),
      TUNNEL.SEGMENTS - 1,
    )
    const currentChunk = Math.floor(currentSegment / TUNNEL.CHUNK_SEGMENTS)

    if (currentChunk === this.activeTunnelChunk)
      return

    this.activeTunnelChunk = currentChunk
    const firstChunk = Math.max(0, currentChunk - TUNNEL.CHUNKS_BEHIND)
    const lastChunk = Math.min(this.chunkCount - 1, currentChunk + TUNNEL.CHUNKS_AHEAD)
    const visibleChunks = new Set<number>()

    for (let chunk = firstChunk; chunk <= lastChunk; chunk++) {
      visibleChunks.add(chunk)
      if (!this.tubeMeshes.has(chunk))
        this.addTunnelChunk(chunk)
    }

    for (const [chunk, mesh] of this.tubeMeshes) {
      if (!visibleChunks.has(chunk)) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        this.tubeMeshes.delete(chunk)
      }
    }
  }

  private addTunnelChunk(chunk: number): void {
    if (!this.tubeMaterial)
      return

    const startSegment = chunk * TUNNEL.CHUNK_SEGMENTS
    const endSegment = Math.min(startSegment + TUNNEL.CHUNK_SEGMENTS, TUNNEL.SEGMENTS)
    const firstPoint = Math.max(0, startSegment - 1)
    const lastPoint = Math.min(this.curvePoints.length - 1, endSegment + 1)
    const chunkCurve = new CatmullRomCurve3(this.curvePoints.slice(firstPoint, lastPoint + 1))
    const geometry = new TubeGeometry(
      chunkCurve,
      TUNNEL.CHUNK_TUBE_SEGMENTS,
      TUNNEL.RADIUS,
      12,
      false,
    )
    const mesh = new Mesh(geometry, this.tubeMaterial)

    this.tubeMeshes.set(chunk, mesh)
    this.scene.add(mesh)
  }

  private buildOrb(): Object3D {
    const orb = new Object3D()
    orb.position.set(0, 0, 0)
    this.scene.add(orb)
    return orb
  }

  update(deltaTime: number, audio: OnsetResult): void {
    const movement = this.speed * audio.flux
    const change = ((40 + movement) / this.totalLength) * deltaTime

    if (audio.event) {
      if (this.clock.getElapsedTime() > TUNNEL.ROTATION_COOLDOWN) {
        this.clock = new Clock()
        this.rotDir *= -1
      }
      this.aLight.color.r = randColor(this.aLight.color.r)
      this.aLight.color.b = randColor(this.aLight.color.b)
      this.aLight.color.g = randColor(this.aLight.color.g)
    }

    this.aLight.intensity = Math.min(0.1 + audio.meanFlux * 4, 1.0)

    if (this.pos + change >= 1)
      this.pos = 0
    this.orb.position.copy(this.curve.getPoint((this.pos += change) % 1))
    this.updateTunnelChunks()

    const nextPoint = this.curve.getPoint((this.pos + change) % 1)
    const ang = this.looking(nextPoint, this.orb.position)

    const ort = audio.flux * 2 * deltaTime
    this.orb.rotation.z += ort * this.rotDir
    this.orb.rotation.x = ang
    this.camera.rotation.x = ang
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  private looking(pointTo: Vector3, pointFrom: Vector3): number {
    const vec = new Vector3()
    vec.subVectors(pointTo, pointFrom)
    return -Math.atan(vec.y / vec.z)
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.render()
  }

  dispose(): void {
    for (const mesh of this.tubeMeshes.values()) {
      mesh.geometry.dispose()
    }
    this.tubeMeshes.clear()

    if (this.tubeMaterial) {
      this.tubeMaterial.map?.dispose()
      this.tubeMaterial.dispose()
    }
  }
}
