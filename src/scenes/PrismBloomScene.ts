import type { WebGLRenderer } from 'three'
import type { OnsetResult } from '../audio/OnsetResult'
import type { IScene } from '../core/Scene'
import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
} from 'three'

// =============================================================================
// Prism Bloom Scene Constants
// =============================================================================

const SYMMETRIES = [5, 6, 8, 10, 12, 14] as const

// =============================================================================
// Beat-Reactive Color Palettes
// =============================================================================

const COLOR_PALETTES = [
  {
    primary: new Color(0x00E5FF),
    secondary: new Color(0x6C2BFF),
    accent: new Color(0xFF2BD6),
  },
  {
    primary: new Color(0xFFB000),
    secondary: new Color(0xFF2A6D),
    accent: new Color(0x22FFD2),
  },
  {
    primary: new Color(0xB5FF3B),
    secondary: new Color(0x00A6FF),
    accent: new Color(0xFFFFFF),
  },
  {
    primary: new Color(0xFF4D00),
    secondary: new Color(0x2900FF),
    accent: new Color(0xFFD84D),
  },
  {
    primary: new Color(0xFF007A),
    secondary: new Color(0x00FF99),
    accent: new Color(0x8A5CFF),
  },
]

// =============================================================================
// Shaders
// =============================================================================

const prismVertexShader = /* glsl */ `
void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const prismFragmentShader = /* glsl */ `
uniform vec2 uResolution;
uniform float uTime;
uniform float uFlux;
uniform float uMeanFlux;
uniform float uSegments;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;

const float PI = 3.14159265359;
const float TAU = PI * 2.0;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

mat2 rotate(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

void main() {
    vec2 p = (gl_FragCoord.xy - uResolution.xy * 0.5) / uResolution.y;
    float flux = clamp(uFlux, 0.0, 1.6);
    float meanFlux = clamp(uMeanFlux, 0.0, 1.2);

    // Flux directly controls zoom, rotation speed, line thickness, and brightness.
    float zoom = 1.05 + flux * 0.35 + meanFlux * 0.14;
    p *= zoom;
    p = rotate(uTime * (0.04 + flux * 0.1)) * p;

    float radius = length(p);
    float angle = atan(p.y, p.x);

    // Fold the image into a beat-swapped kaleidoscope symmetry.
    float sector = TAU / uSegments;
    float foldedAngle = mod(angle + sector * 0.5, sector) - sector * 0.5;
    vec2 folded = vec2(cos(foldedAngle), sin(foldedAngle)) * radius;

    float ringFrequency = 18.0 + flux * 20.0;
    float ringSpeed = 1.2 + flux * 7.0;
    float ringWave = sin(radius * ringFrequency - uTime * ringSpeed);
    float rings = 1.0 - smoothstep(0.018 + flux * 0.01, 0.12 + flux * 0.035, abs(ringWave));

    float spokeWidth = 0.012 + flux * 0.025;
    float spokes = 1.0 - smoothstep(spokeWidth, spokeWidth + 0.018, abs(foldedAngle));

    float diamond = abs(folded.x) * (4.0 + flux * 2.5) + abs(folded.y) * (7.0 + meanFlux * 3.0);
    float facetWave = abs(fract(diamond - uTime * (0.08 + flux * 0.18)) - 0.5);
    float facets = 1.0 - smoothstep(0.0, 0.045 + flux * 0.018, facetWave);

    float innerPrism = exp(-radius * radius * (7.0 - flux * 2.2));
    float bloom = exp(-radius * (2.3 - flux * 0.75)) * (0.18 + flux * 0.85);
    float vignette = 1.0 - smoothstep(0.12, 1.45, radius);

    float colorSweep = 0.5 + 0.5 * sin(radius * 8.0 + foldedAngle * uSegments * 0.7 - uTime * 0.55);
    vec3 spectrum = mix(uPrimary, uSecondary, colorSweep);
    spectrum = mix(spectrum, uAccent, spokes * 0.65 + innerPrism * 0.35);

    vec3 background = mix(vec3(0.006, 0.002, 0.018), uSecondary * 0.08, vignette);
    vec3 color = background;
    color += spectrum * rings * (0.45 + flux * 1.35);
    color += mix(uSecondary, uPrimary, colorSweep) * facets * (0.16 + meanFlux * 0.7);
    color += uAccent * spokes * (0.18 + flux * 1.4);
    color += uPrimary * bloom * 0.5;
    color += uAccent * innerPrism * (0.65 + flux * 2.0);

    // Procedural glitter, continuously intensified by flux rather than beat state.
    vec2 starCell = floor((p + vec2(uTime * 0.018, -uTime * 0.014)) * 34.0);
    float star = step(0.986, hash(starCell));
    float twinkle = star * hash(starCell + 17.0) * (0.15 + flux * 1.1) * vignette;
    color += uAccent * twinkle;

    color *= vignette;
    color = color / (1.0 + color);
    color = pow(color, vec3(0.78));

    gl_FragColor = vec4(color, 1.0);
}
`

// =============================================================================
// Prism Bloom Scene
// =============================================================================

export class PrismBloomScene implements IScene {
  private renderer: WebGLRenderer
  private scene: Scene
  private camera: OrthographicCamera
  private prismMesh: Mesh
  private prismMaterial: ShaderMaterial

  private time = 0
  private currentPaletteIndex = 0
  private currentSymmetryIndex = 0

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene = new Scene()
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const { mesh, material } = this.buildPrism()
    this.prismMesh = mesh
    this.prismMaterial = material
    this.scene.add(this.prismMesh)
  }

  private buildPrism(): { mesh: Mesh, material: ShaderMaterial } {
    const palette = COLOR_PALETTES[0]
    const geometry = new PlaneGeometry(2, 2)
    const material = new ShaderMaterial({
      vertexShader: prismVertexShader,
      fragmentShader: prismFragmentShader,
      uniforms: {
        uResolution: { value: new Vector2(window.innerWidth, window.innerHeight) },
        uTime: { value: 0 },
        uFlux: { value: 0 },
        uMeanFlux: { value: 0 },
        uSegments: { value: SYMMETRIES[0] },
        uPrimary: { value: palette.primary.clone() },
        uSecondary: { value: palette.secondary.clone() },
        uAccent: { value: palette.accent.clone() },
      },
      depthTest: false,
      depthWrite: false,
    })

    const mesh = new Mesh(geometry, material)
    return { mesh, material }
  }

  update(deltaTime: number, audio: OnsetResult): void {
    this.time += deltaTime

    this.prismMaterial.uniforms.uTime.value = this.time
    this.prismMaterial.uniforms.uFlux.value = audio.flux
    this.prismMaterial.uniforms.uMeanFlux.value = audio.meanFlux

    if (audio.event) {
      this.currentPaletteIndex = (this.currentPaletteIndex + 1) % COLOR_PALETTES.length
      this.currentSymmetryIndex = (this.currentSymmetryIndex + 1) % SYMMETRIES.length

      const palette = COLOR_PALETTES[this.currentPaletteIndex]
      this.prismMaterial.uniforms.uPrimary.value.copy(palette.primary)
      this.prismMaterial.uniforms.uSecondary.value.copy(palette.secondary)
      this.prismMaterial.uniforms.uAccent.value.copy(palette.accent)
      this.prismMaterial.uniforms.uSegments.value = SYMMETRIES[this.currentSymmetryIndex]
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.prismMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
    this.render()
  }

  dispose(): void {
    this.prismMesh.geometry.dispose()
    this.prismMaterial.dispose()
  }
}
