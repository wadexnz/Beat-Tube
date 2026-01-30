import type { WebGLRenderer } from 'three'
import {
    BufferAttribute,
    BufferGeometry,
    Clock,
    Color,
    Mesh,
    PerspectiveCamera,
    PlaneGeometry,
    Points,
    PointsMaterial,
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

const STARFIELD = {
    /** Number of stars in the sky */
    STAR_COUNT: 2000,
    /** Horizontal spread of stars */
    SPREAD_X: 2000,
    /** Vertical spread of stars (height) */
    SPREAD_Y: 600,
    /** Minimum star height above terrain */
    MIN_HEIGHT: 40,
    /** Depth spread of stars */
    SPREAD_Z: 2000,
    /** Star size */
    SIZE: 2,
    /** Parallax scroll multiplier (relative to terrain) */
    PARALLAX: 1.5,
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

    // Starfield
    private starfield: Points
    private starfieldGeometry: BufferGeometry
    private starfieldMaterial: PointsMaterial

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

        const { points, geometry, material: starMaterial } = this.buildStarfield()
        this.starfield = points
        this.starfieldGeometry = geometry
        this.starfieldMaterial = starMaterial
        this.scene.add(this.starfield)

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

    private buildStarfield(): {
        points: Points,
        geometry: BufferGeometry,
        material: PointsMaterial,
    } {
        const count = STARFIELD.STAR_COUNT
        const positions = new Float32Array(count * 3)

        for (let i = 0; i < count; i++) {
            const i3 = i * 3

            // Position stars in the sky
            positions[i3] = (Math.random() - 0.5) * STARFIELD.SPREAD_X
            positions[i3 + 1] = Math.random() * STARFIELD.SPREAD_Y + STARFIELD.MIN_HEIGHT
            positions[i3 + 2] = (Math.random() - 0.5) * STARFIELD.SPREAD_Z
        }

        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(positions, 3))

        const material = new PointsMaterial({
            color: 0xffffff,
            size: STARFIELD.SIZE,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
        })

        const points = new Points(geometry, material)
        return { points, geometry, material }
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

        // Update starfield - twinkling effect based on audio
        this.updateStarfield(audio.flux, deltaTime)

        // Handle beat events - change colors instantly
        if (audio.event && this.colorClock.getElapsedTime() > TERRAIN.COLOR_COOLDOWN) {
            this.colorClock = new Clock()

            // Cycle to next color palette
            this.currentPaletteIndex = (this.currentPaletteIndex + 1) % COLOR_PALETTES.length
            const palette = COLOR_PALETTES[this.currentPaletteIndex]

            // Update colors instantly
            this.terrainMaterial.uniforms.uBaseColor.value.copy(palette.base)
            this.terrainMaterial.uniforms.uHighlightColor.value.copy(palette.highlight)
            this.starfieldMaterial.color.copy(palette.highlight)
        }
    }

    private updateStarfield(flux: number, deltaTime: number): void {
        const positions = this.starfieldGeometry.getAttribute('position') as BufferAttribute
        const count = STARFIELD.STAR_COUNT

        // Clamp deltaTime to prevent massive jumps when returning from background tab
        const clampedDelta = Math.min(deltaTime, 0.1)

        // Calculate scroll speed (same as terrain but with parallax)
        const scrollSpeed = (TERRAIN.BASE_SPEED + flux * TERRAIN.FLUX_SPEED_MULTIPLIER) * STARFIELD.PARALLAX

        for (let i = 0; i < count; i++) {
            const i3 = i * 3

            // Move stars forward (parallax scroll with terrain)
            positions.array[i3 + 2] -= scrollSpeed * clampedDelta

            // Wrap stars when they go behind camera
            if (positions.array[i3 + 2] < -STARFIELD.SPREAD_Z * 0.5) {
                positions.array[i3 + 2] = STARFIELD.SPREAD_Z * 0.5
                positions.array[i3] = (Math.random() - 0.5) * STARFIELD.SPREAD_X
                positions.array[i3 + 1] = Math.random() * STARFIELD.SPREAD_Y + STARFIELD.MIN_HEIGHT
            }
        }

        positions.needsUpdate = true
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
        this.starfieldGeometry.dispose()
        this.starfieldMaterial.dispose()
    }
}
