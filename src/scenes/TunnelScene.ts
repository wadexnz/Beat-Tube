import type { Texture, WebGLRenderer } from 'three'
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
import type { IScene } from '../core/Scene'
import type { OnsetResult } from '../audio/OnsetResult'
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
    /** Geometry tube segments for smoothness */
    TUBE_SEGMENTS: 500,
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
    private speed: number
    private rotDir = 1
    private pos = 0

    private renderer: WebGLRenderer
    private scene: Scene
    private camera: PerspectiveCamera
    private curve: CatmullRomCurve3
    private orb: Object3D
    private aLight: AmbientLight
    private clock: Clock
    private tubeMesh?: Mesh

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer
        this.totalLength = TUNNEL.SEGMENTS * TUNNEL.SEGMENT_LENGTH
        this.speed = toTunnelSpeed(SPEED.NORMAL)

        this.camera = this.buildCamera()
        this.scene = new Scene()
        this.curve = this.createCurve()
        this.orb = this.buildOrb()
        this.orb.add(this.camera)
        this.aLight = this.buildALight()
        this.clock = new Clock()

        const loader = new TextureLoader()
        loader.load('/img/stonePattern.jpg', (texture: Texture) => {
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

    private createCurve(): CatmullRomCurve3 {
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
        return new CatmullRomCurve3(points)
    }

    private buildTube(texture: Texture): void {
        const geometry = new TubeGeometry(
            this.curve,
            TUNNEL.TUBE_SEGMENTS,
            TUNNEL.RADIUS,
            12,
            false,
        )
        const tubeMaterial = new MeshPhongMaterial({
            side: BackSide,
            map: texture,
        })
        if (tubeMaterial.map) {
            tubeMaterial.map.wrapS = RepeatWrapping
            tubeMaterial.map.wrapT = RepeatWrapping
            tubeMaterial.map.repeat.set(TUNNEL.TUBE_SEGMENTS / 3, 2)
        }
        this.tubeMesh = new Mesh(geometry, tubeMaterial)
        this.scene.add(this.tubeMesh)
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
        if (this.tubeMesh) {
            this.tubeMesh.geometry.dispose()
            if (this.tubeMesh.material instanceof MeshPhongMaterial) {
                this.tubeMesh.material.map?.dispose()
                this.tubeMesh.material.dispose()
            }
        }
    }
}
