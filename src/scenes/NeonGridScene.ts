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
    SphereGeometry,
    Vector3,
} from 'three'
import type { IScene } from '../core/Scene'
import type { OnsetResult } from '../audio/OnsetResult'
import { neonGridFragmentShader, neonGridVertexShader } from '../shaders/neonGridShader'

// =============================================================================
// Neon Grid Scene Constants
// =============================================================================

const GRID = {
    /** Grid plane width */
    WIDTH: 1600,
    /** Grid plane depth */
    DEPTH: 3000,
    /** Subdivision segments (enough for smooth waves) */
    SEGMENTS: 256,
    /** Camera field of view */
    FOV: 70,
    /** Camera near plane */
    NEAR: 1,
    /** Camera far plane */
    FAR: 4000,
    /** Camera height above grid */
    CAMERA_HEIGHT: 60,
    /** Camera look-ahead distance */
    LOOK_AHEAD: 300,
    /** Base scroll speed */
    BASE_SPEED: 30,
    /** Speed multiplier for audio flux */
    FLUX_SPEED_MULTIPLIER: 2000,
    /** Minimum time between color changes */
    COLOR_COOLDOWN: 0.15,
} as const

const SUN = {
    /** Sun radius */
    RADIUS: 150,
    /** Horizontal segments */
    WIDTH_SEGMENTS: 32,
    /** Vertical segments */
    HEIGHT_SEGMENTS: 16,
    /** Distance from camera */
    DISTANCE: 1800,
    /** Height above grid — half submerged below horizon */
    HEIGHT: 40,
} as const

const STARFIELD = {
    /** Number of stars */
    COUNT: 1500,
    /** Horizontal spread */
    SPREAD_X: 3000,
    /** Vertical range (above grid) */
    MIN_Y: 30,
    MAX_Y: 500,
    /** Depth spread */
    SPREAD_Z: 3000,
    /** Star particle size */
    SIZE: 1.5,
} as const

const SKY = {
    /** Backdrop plane width */
    WIDTH: 4000,
    /** Backdrop plane height */
    HEIGHT: 800,
    /** Distance from camera (behind sun) */
    DISTANCE: 2200,
    /** Vertical offset */
    Y_OFFSET: 150,
} as const

// =============================================================================
// Color Palettes — synthwave neon tones
// =============================================================================

const COLOR_PALETTES = [
    { grid: new Color(0xff00ff), sun: new Color(0xff6600) },  // Magenta / Orange
    { grid: new Color(0x00ffff), sun: new Color(0xff0066) },  // Cyan / Hot Pink
    { grid: new Color(0xff3399), sun: new Color(0xffcc00) },  // Pink / Gold
    { grid: new Color(0x6600ff), sun: new Color(0xff3300) },  // Purple / Red
    { grid: new Color(0x00ff99), sun: new Color(0xff6633) },  // Mint / Tangerine
]

// =============================================================================
// Neon Grid Scene
// =============================================================================

export class NeonGridScene implements IScene {
    private renderer: WebGLRenderer
    private scene: Scene
    private camera: PerspectiveCamera
    private gridMesh: Mesh
    private gridMaterial: ShaderMaterial
    private sunMesh: Mesh
    private skyMesh: Mesh
    private skyMaterial: ShaderMaterial
    private starfield: Points
    private starfieldMaterial: PointsMaterial
    private colorClock: Clock

    private offset = 0
    private currentPaletteIndex = 0

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer

        this.camera = this.buildCamera()
        this.scene = new Scene()
        this.scene.background = new Color(0x050008)

        const { mesh, material } = this.buildGrid()
        this.gridMesh = mesh
        this.gridMaterial = material
        this.scene.add(this.gridMesh)

        const { mesh: skyMesh, material: skyMat } = this.buildSky()
        this.skyMesh = skyMesh
        this.skyMaterial = skyMat
        this.scene.add(this.skyMesh)

        this.sunMesh = this.buildSun()
        this.scene.add(this.sunMesh)

        const { points, material: starMat } = this.buildStarfield()
        this.starfield = points
        this.starfieldMaterial = starMat
        this.scene.add(this.starfield)

        this.colorClock = new Clock()

        window.addEventListener('resize', () => this.resize())
    }

    private buildCamera(): PerspectiveCamera {
        const aspectRatio = window.innerWidth / window.innerHeight
        const camera = new PerspectiveCamera(
            GRID.FOV,
            aspectRatio,
            GRID.NEAR,
            GRID.FAR,
        )
        camera.position.set(0, GRID.CAMERA_HEIGHT, 0)
        camera.lookAt(new Vector3(0, 20, GRID.LOOK_AHEAD))
        return camera
    }

    private buildGrid(): { mesh: Mesh, material: ShaderMaterial } {
        const geometry = new PlaneGeometry(
            GRID.WIDTH,
            GRID.DEPTH,
            GRID.SEGMENTS,
            GRID.SEGMENTS,
        )
        geometry.rotateX(-Math.PI / 2)

        const palette = COLOR_PALETTES[0]
        const material = new ShaderMaterial({
            vertexShader: neonGridVertexShader,
            fragmentShader: neonGridFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uFlux: { value: 0 },
                uOffset: { value: 0 },
                uGridColor: { value: palette.grid.clone() },
            },
        })

        const mesh = new Mesh(geometry, material)
        mesh.position.set(0, 0, GRID.DEPTH * 0.5)
        return { mesh, material }
    }

    private buildSun(): Mesh {
        const geometry = new SphereGeometry(
            SUN.RADIUS,
            SUN.WIDTH_SEGMENTS,
            SUN.HEIGHT_SEGMENTS,
        )
        const palette = COLOR_PALETTES[0]
        const material = new ShaderMaterial({
            vertexShader: /* glsl */ `
                uniform float uFlux;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    // Scale sun with flux
                    float scale = 1.0 + uFlux * 0.4;
                    vec3 pos = position * scale;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uSunColor;
                uniform float uFlux;
                varying vec2 vUv;
                void main() {
                    // Horizontal scanline bands — only in bottom half
                    float scanline = smoothstep(0.46, 0.5, abs(fract(vUv.y * 10.0) - 0.5));
                    // Fade: bottom dark, top bright (half-set sun)
                    float fade = smoothstep(0.25, 0.6, vUv.y);
                    // Brightness pulses strongly with flux
                    float brightness = 0.4 + uFlux * 3.0;
                    vec3 color = uSunColor * (0.4 + fade * 0.6) * brightness;
                    // Cut scanline gaps in bottom portion
                    float gap = mix(1.0 - scanline * 0.7, 1.0, fade);
                    gl_FragColor = vec4(color * gap, 1.0);
                }
            `,
            uniforms: {
                uSunColor: { value: palette.sun.clone() },
                uFlux: { value: 0 },
            },
        })

        const mesh = new Mesh(geometry, material)
        mesh.position.set(0, SUN.HEIGHT, SUN.DISTANCE)
        return mesh
    }

    private buildSky(): { mesh: Mesh, material: ShaderMaterial } {
        const geometry = new PlaneGeometry(SKY.WIDTH, SKY.HEIGHT)
        const palette = COLOR_PALETTES[0]
        const material = new ShaderMaterial({
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uGlowColor;
                uniform float uFlux;
                varying vec2 vUv;
                void main() {
                    // Vertical gradient: bright glow at bottom (horizon), fading to black at top
                    float grad = 1.0 - vUv.y;
                    float glow = pow(grad, 3.0);
                    float brightness = 0.3 + uFlux * 1.0;
                    vec3 color = uGlowColor * glow * brightness;
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            uniforms: {
                uGlowColor: { value: palette.sun.clone() },
                uFlux: { value: 0 },
            },
            depthWrite: false,
        })

        const mesh = new Mesh(geometry, material)
        mesh.position.set(0, SKY.Y_OFFSET, SKY.DISTANCE)
        return { mesh, material }
    }

    private buildStarfield(): { points: Points, material: PointsMaterial } {
        const count = STARFIELD.COUNT
        const positions = new Float32Array(count * 3)

        for (let i = 0; i < count; i++) {
            const i3 = i * 3
            positions[i3] = (Math.random() - 0.5) * STARFIELD.SPREAD_X
            positions[i3 + 1] = Math.random() * (STARFIELD.MAX_Y - STARFIELD.MIN_Y) + STARFIELD.MIN_Y
            positions[i3 + 2] = Math.random() * STARFIELD.SPREAD_Z
        }

        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(positions, 3))

        const material = new PointsMaterial({
            color: 0xffffff,
            size: STARFIELD.SIZE,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.7,
        })

        const points = new Points(geometry, material)
        return { points, material }
    }

    update(deltaTime: number, audio: OnsetResult): void {
        // Scroll grid toward camera, speed driven by flux
        const scrollSpeed = GRID.BASE_SPEED + audio.flux * GRID.FLUX_SPEED_MULTIPLIER
        this.offset += scrollSpeed * deltaTime

        // Update shader uniforms
        this.gridMaterial.uniforms.uFlux.value = audio.flux
        this.gridMaterial.uniforms.uOffset.value = this.offset

        // Update sun and sky flux
        const sunMaterial = this.sunMesh.material as ShaderMaterial
        sunMaterial.uniforms.uFlux.value = audio.flux
        this.skyMaterial.uniforms.uFlux.value = audio.flux

        // Handle beat events — instant color swap
        if (audio.event && this.colorClock.getElapsedTime() > GRID.COLOR_COOLDOWN) {
            this.colorClock = new Clock()

            this.currentPaletteIndex = (this.currentPaletteIndex + 1) % COLOR_PALETTES.length
            const palette = COLOR_PALETTES[this.currentPaletteIndex]

            this.gridMaterial.uniforms.uGridColor.value.copy(palette.grid)
            const sunMat = this.sunMesh.material as ShaderMaterial
            sunMat.uniforms.uSunColor.value.copy(palette.sun)
            this.skyMaterial.uniforms.uGlowColor.value.copy(palette.sun)
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
        this.gridMesh.geometry.dispose()
        this.gridMaterial.dispose()
        this.sunMesh.geometry.dispose()
        ;(this.sunMesh.material as ShaderMaterial).dispose()
        this.skyMesh.geometry.dispose()
        this.skyMaterial.dispose()
        this.starfield.geometry.dispose()
        this.starfieldMaterial.dispose()
    }
}
