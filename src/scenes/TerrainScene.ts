import type { WebGLRenderer } from 'three'
import {
    Clock,
    Color,
    Mesh,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    Vector3,
} from 'three'
import type { IScene } from '../core/Scene'
import type { OnsetResult } from '../audio/OnsetResult'
import { terrainFragmentShader, terrainVertexShader } from '../shaders/terrainShader'

// =============================================================================
// Terrain Scene Constants
// =============================================================================

const TERRAIN = {
    /** Terrain plane width */
    WIDTH: 1200,
    /** Terrain plane depth */
    DEPTH: 2400,
    /** Terrain subdivision segments */
    SEGMENTS: 512,
    /** Camera field of view */
    FOV: 75,
    /** Camera near plane */
    NEAR: 1,
    /** Camera far plane */
    FAR: 2000,
    /** Camera height above terrain */
    CAMERA_HEIGHT: 80,
    /** Camera look-ahead distance */
    LOOK_AHEAD: 200,
    /** Base scroll speed */
    BASE_SPEED: 10,
    /** Speed multiplier for audio flux */
    FLUX_SPEED_MULTIPLIER: 3200,
    /** Minimum time between color changes */
    COLOR_COOLDOWN: 0.15,
} as const

// =============================================================================
// Color Palettes for Beat-Reactive Changes
// =============================================================================

const COLOR_PALETTES = [
    { base: new Color(0x4a7a4a), highlight: new Color(0x8fcf8f) }, // Forest Green
    { base: new Color(0x6a4a35), highlight: new Color(0xc9a080) }, // Earth Brown
    { base: new Color(0x3a6a8a), highlight: new Color(0x7ac0e0) }, // Ocean Blue
    { base: new Color(0x7a6a4a), highlight: new Color(0xe8d090) }, // Desert Sand
    { base: new Color(0x5a7a5a), highlight: new Color(0xa0d0a0) }, // Moss Green
    { base: new Color(0x6a6a8a), highlight: new Color(0xb0b0d8) }, // Mountain Slate
]

// =============================================================================
// Terrain Scene
// =============================================================================

export class TerrainScene implements IScene {
    private renderer: WebGLRenderer
    private scene: Scene
    private camera: PerspectiveCamera
    private terrainMesh: Mesh
    private terrainMaterial: ShaderMaterial
    private colorClock: Clock

    private offset = 0
    private time = 0
    private currentPaletteIndex = 0

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer

        this.camera = this.buildCamera()
        this.scene = new Scene()
        this.scene.background = new Color(0x050510)

        const { mesh, material } = this.buildTerrain()
        this.terrainMesh = mesh
        this.terrainMaterial = material
        this.scene.add(this.terrainMesh)

        this.colorClock = new Clock()

        window.addEventListener('resize', () => this.resize())
    }

    private buildCamera(): PerspectiveCamera {
        const aspectRatio = window.innerWidth / window.innerHeight
        const camera = new PerspectiveCamera(
            TERRAIN.FOV,
            aspectRatio,
            TERRAIN.NEAR,
            TERRAIN.FAR,
        )
        camera.position.set(0, TERRAIN.CAMERA_HEIGHT, -TERRAIN.DEPTH * 0.3)
        camera.lookAt(new Vector3(0, 0, TERRAIN.LOOK_AHEAD))
        return camera
    }

    private buildTerrain(): { mesh: Mesh, material: ShaderMaterial } {
        const geometry = new PlaneGeometry(
            TERRAIN.WIDTH,
            TERRAIN.DEPTH,
            TERRAIN.SEGMENTS,
            TERRAIN.SEGMENTS,
        )
        geometry.rotateX(-Math.PI / 2)

        const palette = COLOR_PALETTES[0]
        const material = new ShaderMaterial({
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uFlux: { value: 0 },
                uMeanFlux: { value: 0 },
                uOffset: { value: 0 },
                uBaseColor: { value: palette.base.clone() },
                uHighlightColor: { value: palette.highlight.clone() },
            },
        })

        const mesh = new Mesh(geometry, material)
        mesh.position.set(0, 0, 0)
        return { mesh, material }
    }

    update(deltaTime: number, audio: OnsetResult): void {
        // Update time and offset for terrain scrolling
        this.time += deltaTime
        const scrollSpeed = TERRAIN.BASE_SPEED + audio.flux * TERRAIN.FLUX_SPEED_MULTIPLIER
        this.offset += scrollSpeed * deltaTime

        // Update shader uniforms
        this.terrainMaterial.uniforms.uTime.value = this.time
        this.terrainMaterial.uniforms.uFlux.value = audio.flux
        this.terrainMaterial.uniforms.uMeanFlux.value = audio.meanFlux
        this.terrainMaterial.uniforms.uOffset.value = this.offset

        // Handle beat events - change colors
        if (audio.event && this.colorClock.getElapsedTime() > TERRAIN.COLOR_COOLDOWN) {
            this.colorClock = new Clock()

            // Cycle to next color palette
            this.currentPaletteIndex = (this.currentPaletteIndex + 1) % COLOR_PALETTES.length
            const palette = COLOR_PALETTES[this.currentPaletteIndex]

            // Update terrain colors
            this.terrainMaterial.uniforms.uBaseColor.value.copy(palette.base)
            this.terrainMaterial.uniforms.uHighlightColor.value.copy(palette.highlight)
        }
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
        this.terrainMesh.geometry.dispose()
        this.terrainMaterial.dispose()
    }
}
