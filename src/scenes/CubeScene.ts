import type { WebGLRenderer } from 'three'
import {
    AmbientLight,
    BoxGeometry,
    Color,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    PointLight,
    Scene,
} from 'three'
import type { IScene } from '../core/Scene'
import type { OnsetResult } from '../audio/OnsetResult'
import { toRotationSpeed, SPEED } from '../core/units'

// =============================================================================
// Cube Scene Constants
// =============================================================================

const CUBE = {
    /** Cube size */
    SIZE: 2,
    /** Base rotation speed multiplier */
    BASE_ROTATION: 0.5,
    /** Camera distance from cube */
    CAMERA_DISTANCE: 5,
    /** Camera field of view */
    FOV: 75,
    /** Camera near plane */
    NEAR: 0.1,
    /** Camera far plane */
    FAR: 1000,
    /** Color transition speed */
    COLOR_LERP: 0.1,
} as const

// =============================================================================
// Color Palette
// =============================================================================

const COLORS = [
    new Color(0xff6b6b), // Red
    new Color(0x4ecdc4), // Teal
    new Color(0xffe66d), // Yellow
    new Color(0x95e1d3), // Mint
    new Color(0xf38181), // Coral
    new Color(0xaa96da), // Purple
    new Color(0xfcbad3), // Pink
    new Color(0xa8d8ea), // Sky Blue
]

// =============================================================================
// Cube Scene
// =============================================================================

export class CubeScene implements IScene {
    private renderer: WebGLRenderer
    private scene: Scene
    private camera: PerspectiveCamera
    private cube: Mesh
    private material: MeshStandardMaterial
    private targetColor: Color
    private currentColorIndex = 0
    private rotationSpeed: number = SPEED.NORMAL

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer
        this.scene = new Scene()
        this.scene.background = new Color(0x0a0a0a)

        this.camera = this.buildCamera()
        this.cube = this.buildCube()
        this.material = this.cube.material as MeshStandardMaterial
        this.targetColor = COLORS[0].clone()
        this.buildLights()

        window.addEventListener('resize', () => this.resize())
    }

    private buildCamera(): PerspectiveCamera {
        const aspectRatio = window.innerWidth / window.innerHeight
        const camera = new PerspectiveCamera(
            CUBE.FOV,
            aspectRatio,
            CUBE.NEAR,
            CUBE.FAR,
        )
        camera.position.z = CUBE.CAMERA_DISTANCE
        return camera
    }

    private buildCube(): Mesh {
        const geometry = new BoxGeometry(CUBE.SIZE, CUBE.SIZE, CUBE.SIZE)
        const material = new MeshStandardMaterial({
            color: COLORS[0],
            metalness: 0.3,
            roughness: 0.4,
        })
        const cube = new Mesh(geometry, material)
        this.scene.add(cube)
        return cube
    }

    private buildLights(): void {
        const ambient = new AmbientLight(0xffffff, 0.4)
        this.scene.add(ambient)

        const point1 = new PointLight(0xffffff, 1, 100)
        point1.position.set(5, 5, 5)
        this.scene.add(point1)

        const point2 = new PointLight(0xffffff, 0.5, 100)
        point2.position.set(-5, -5, 5)
        this.scene.add(point2)
    }

    update(deltaTime: number, audio: OnsetResult): void {
        // Rotation speed based on audio flux
        const fluxSpeed = toRotationSpeed(audio.flux * CUBE.BASE_ROTATION)
        const baseSpeed = toRotationSpeed(SPEED.SLOW * 0.1)
        this.rotationSpeed = baseSpeed + fluxSpeed

        // Apply rotation
        this.cube.rotation.x += this.rotationSpeed * deltaTime
        this.cube.rotation.y += this.rotationSpeed * deltaTime * 0.7

        // Change color on beat
        if (audio.event) {
            this.currentColorIndex = (this.currentColorIndex + 1) % COLORS.length
            this.targetColor = COLORS[this.currentColorIndex]
        }

        // Smooth color transition
        this.material.color.lerp(this.targetColor, CUBE.COLOR_LERP)

        // Scale cube slightly with audio intensity
        const scale = 1 + audio.meanFlux * 0.3
        this.cube.scale.setScalar(scale)
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
        this.cube.geometry.dispose()
        this.material.dispose()
    }
}
