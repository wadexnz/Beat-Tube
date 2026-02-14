import type { WebGLRenderer } from "three";
import {
  Clock,
  Color,
  DoubleSide,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { IScene } from "../core/Scene";
import type { OnsetResult } from "../audio/OnsetResult";
import {
  neonGridFragmentShader,
  neonGridVertexShader,
} from "../shaders/neonGridShader";

// =============================================================================
// Neon Grid Scene Constants
// =============================================================================

const GRID = {
  /** Grid plane width */
  WIDTH: 3000,
  /** Grid plane depth */
  DEPTH: 5000,
  /** Subdivision segments (enough for smooth waves) */
  SEGMENTS: 128,
  /** Camera field of view */
  FOV: 60,
  /** Camera near plane */
  NEAR: 1,
  /** Camera far plane */
  FAR: 6000,
  /** Camera height above grid */
  CAMERA_HEIGHT: 60,
  /** Camera look-ahead distance */
  LOOK_AHEAD: 300,
  /** Base scroll speed */
  BASE_SPEED: 0,
  /** Speed multiplier for audio flux */
  FLUX_SPEED_MULTIPLIER: 4000,
  /** Minimum time between color changes */
  COLOR_COOLDOWN: 0,
} as const;

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
} as const;

const LASERS = {
  /** Number of horizontal beams */
  COUNT: 5,
  /** Plane width (matches sky) */
  WIDTH: 4000,
  /** Plane height — vertical range the beams span */
  HEIGHT: 300,
  /** Distance from camera (behind sun, in front of sky) */
  DISTANCE: 1900,
  /** Vertical center offset */
  Y_OFFSET: 100,
} as const;

const BUILDINGS = {
  /** Plane width */
  WIDTH: 4000,
  /** Plane height */
  HEIGHT: 800,
  /** Distance from camera (in front of lasers to mask edges) */
  DISTANCE: 1850,
  /** Vertical offset */
  Y_OFFSET: 140,
  /** Gap in center where sun is visible (fraction of width, 0–1) */
  CENTER_GAP: 0.25,
} as const;

const SKY = {
  /** Backdrop plane width */
  WIDTH: 4000,
  /** Backdrop plane height */
  HEIGHT: 800,
  /** Distance from camera (behind sun) */
  DISTANCE: 2200,
  /** Vertical offset */
  Y_OFFSET: 150,
} as const;

// =============================================================================
// Color Palettes — synthwave neon tones
// =============================================================================

const COLOR_PALETTES = [
  { grid: new Color(0xff00ff), sun: new Color(0xff6600) }, // Magenta / Orange
  { grid: new Color(0x00ffff), sun: new Color(0xff0066) }, // Cyan / Hot Pink
  { grid: new Color(0xff3399), sun: new Color(0xffcc00) }, // Pink / Gold
  { grid: new Color(0x6600ff), sun: new Color(0xff3300) }, // Purple / Red
  { grid: new Color(0x00ff99), sun: new Color(0xff6633) }, // Mint / Tangerine
];

// =============================================================================
// Neon Grid Scene
// =============================================================================

export class NeonGridScene implements IScene {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private gridMesh: Mesh;
  private gridMaterial: ShaderMaterial;
  private sunMesh: Mesh;
  private skyMesh: Mesh;
  private skyMaterial: ShaderMaterial;
  private laserMesh: Mesh;
  private laserMaterial: ShaderMaterial;
  private buildingsMesh: Mesh;
  private buildingsMaterial: ShaderMaterial;
  private colorClock: Clock;

  private offset = 0;
  private currentPaletteIndex = 0;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;

    this.camera = this.buildCamera();
    this.scene = new Scene();
    this.scene.background = new Color(0x050008);

    const { mesh, material } = this.buildGrid();
    this.gridMesh = mesh;
    this.gridMaterial = material;
    this.scene.add(this.gridMesh);

    const { mesh: skyMesh, material: skyMat } = this.buildSky();
    this.skyMesh = skyMesh;
    this.skyMaterial = skyMat;
    this.scene.add(this.skyMesh);

    this.sunMesh = this.buildSun();
    this.scene.add(this.sunMesh);

    const { mesh: laserMesh, material: laserMat } = this.buildLasers();
    this.laserMesh = laserMesh;
    this.laserMaterial = laserMat;
    this.scene.add(this.laserMesh);

    const { mesh: bldgMesh, material: bldgMat } = this.buildBuildings();
    this.buildingsMesh = bldgMesh;
    this.buildingsMaterial = bldgMat;
    this.scene.add(this.buildingsMesh);

    this.colorClock = new Clock();

    window.addEventListener("resize", () => this.resize());
  }

  private buildCamera(): PerspectiveCamera {
    const aspectRatio = window.innerWidth / window.innerHeight;
    const camera = new PerspectiveCamera(
      GRID.FOV,
      aspectRatio,
      GRID.NEAR,
      GRID.FAR
    );
    camera.position.set(0, GRID.CAMERA_HEIGHT, 0);
    camera.lookAt(new Vector3(0, 20, GRID.LOOK_AHEAD));
    return camera;
  }

  private buildGrid(): { mesh: Mesh; material: ShaderMaterial } {
    const geometry = new PlaneGeometry(
      GRID.WIDTH,
      GRID.DEPTH,
      GRID.SEGMENTS,
      GRID.SEGMENTS
    );
    geometry.rotateX(-Math.PI / 2);

    const palette = COLOR_PALETTES[0];
    const material = new ShaderMaterial({
      vertexShader: neonGridVertexShader,
      fragmentShader: neonGridFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uFlux: { value: 0 },
        uOffset: { value: 0 },
        uGridColor: { value: palette.grid.clone() },
      },
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, 0, GRID.DEPTH * 0.5);
    return { mesh, material };
  }

  private buildSun(): Mesh {
    const geometry = new SphereGeometry(
      SUN.RADIUS,
      SUN.WIDTH_SEGMENTS,
      SUN.HEIGHT_SEGMENTS
    );
    const palette = COLOR_PALETTES[0];
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
                    float brightness = 0.4 + uFlux * 3.0;
                    float fade = smoothstep(0.2, 0.65, vUv.y);
                    vec3 color = uSunColor * (0.3 + fade * 0.7) * brightness;
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
      uniforms: {
        uSunColor: { value: palette.sun.clone() },
        uFlux: { value: 0 },
      },
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, SUN.HEIGHT, SUN.DISTANCE);
    return mesh;
  }

  private buildSky(): { mesh: Mesh; material: ShaderMaterial } {
    const geometry = new PlaneGeometry(SKY.WIDTH, SKY.HEIGHT);
    const palette = COLOR_PALETTES[0];
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
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, SKY.Y_OFFSET, SKY.DISTANCE);
    return { mesh, material };
  }

  private buildBuildings(): { mesh: Mesh; material: ShaderMaterial } {
    const geometry = new PlaneGeometry(BUILDINGS.WIDTH, BUILDINGS.HEIGHT);
    const palette = COLOR_PALETTES[0];
    const material = new ShaderMaterial({
      vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: /* glsl */ `
                uniform vec3 uEdgeColor;
                uniform float uFlux;
                uniform float uCenterGap;
                varying vec2 vUv;

                float hash(float n) {
                    return fract(sin(n) * 43758.5453);
                }

                void main() {
                    // Distance from center (0 = center, 1 = edge)
                    float fromCenter = abs(vUv.x - 0.5) * 2.0;

                    // Transparent in the center gap
                    if (fromCenter < uCenterGap) discard;

                    // Remap remaining range to 0–1 (edge of gap to edge of plane)
                    float edge = (fromCenter - uCenterGap) / (1.0 - uCenterGap);

                    // Procedural building heights — hash based on x column
                    float col = floor(vUv.x * 80.0);
                    float h = hash(col) * 0.45 + 0.15;
                    // Taller buildings closer to center, shorter at edges
                    h *= mix(1.2, 0.4, edge);
                    // Some variation: occasional tall towers
                    h += step(0.8, hash(col + 100.0)) * 0.3;

                    // Building: pixel is below height threshold (vUv.y < h means bottom of plane)
                    if (vUv.y > h) discard;

                    // Dark building body with subtle edge highlight
                    float colFrac = fract(vUv.x * 60.0);
                    float edgeLine = step(0.95, colFrac) + step(colFrac, 0.05);
                    float topLine = step(h - 0.008, vUv.y);
                    float outline = max(edgeLine, topLine);

                    float brightness = 0.08 + uFlux * 0.5;
                    vec3 bodyColor = vec3(0.01, 0.0, 0.02);
                    vec3 glowColor = uEdgeColor * outline * brightness;

                    // Tiny window lights
                    float winX = fract(vUv.x * 180.0);
                    float winY = fract(vUv.y * 40.0);
                    float win = step(0.6, winX) * step(0.6, winY);
                    float lit = step(0.7, hash(col * 13.0 + floor(vUv.y * 40.0)));
                    vec3 windowColor = uEdgeColor * win * lit * 0.15;

                    gl_FragColor = vec4(bodyColor + glowColor + windowColor, 1.0);
                }
            `,
      uniforms: {
        uEdgeColor: { value: palette.grid.clone() },
        uFlux: { value: 0 },
        uCenterGap: { value: BUILDINGS.CENTER_GAP },
      },
      side: DoubleSide,
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, BUILDINGS.Y_OFFSET, BUILDINGS.DISTANCE);
    return { mesh, material };
  }

  private buildLasers(): { mesh: Mesh; material: ShaderMaterial } {
    const geometry = new PlaneGeometry(LASERS.WIDTH, LASERS.HEIGHT);
    const palette = COLOR_PALETTES[0];
    const material = new ShaderMaterial({
      vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: /* glsl */ `
                uniform vec3 uLaserColor;
                uniform float uFlux;
                uniform float uBeamCount;
                varying vec2 vUv;
                void main() {
                    float beam = 0.0;
                    for (float i = 0.0; i < 10.0; i++) {
                        if (i >= uBeamCount) break;
                        float center = (i + 0.5) / uBeamCount;
                        float dist = abs(vUv.y - center);
                        // Thick bright core
                        float core = smoothstep(0.012, 0.002, dist);
                        // Wide soft glow around each beam
                        float glow = exp(-dist * 30.0) * 0.8;
                        beam += core + glow;
                    }
                    // Fade out at horizontal edges
                    float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
                    float brightness = 0.4 + uFlux * 3.0;
                    vec3 color = uLaserColor * beam * brightness * edgeFade;
                    float alpha = clamp(beam * brightness * edgeFade, 0.0, 1.0);
                    gl_FragColor = vec4(color, alpha);
                }
            `,
      uniforms: {
        uLaserColor: { value: palette.grid.clone() },
        uFlux: { value: 0 },
        uBeamCount: { value: LASERS.COUNT },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, LASERS.Y_OFFSET, LASERS.DISTANCE);
    return { mesh, material };
  }

  update(deltaTime: number, audio: OnsetResult): void {
    // Scroll grid toward camera, speed driven by flux
    const scrollSpeed =
      GRID.BASE_SPEED + audio.flux * GRID.FLUX_SPEED_MULTIPLIER;
    this.offset += scrollSpeed * deltaTime;

    // Update shader uniforms
    this.gridMaterial.uniforms.uFlux.value = audio.flux;
    this.gridMaterial.uniforms.uOffset.value = this.offset;

    // Update sun, sky, and laser flux
    const sunMaterial = this.sunMesh.material as ShaderMaterial;
    sunMaterial.uniforms.uFlux.value = audio.flux;
    this.skyMaterial.uniforms.uFlux.value = audio.flux;
    this.laserMaterial.uniforms.uFlux.value = audio.flux;
    this.buildingsMaterial.uniforms.uFlux.value = audio.flux;

    // Handle beat events — instant color swap
    if (audio.event && this.colorClock.getElapsedTime() > GRID.COLOR_COOLDOWN) {
      this.colorClock = new Clock();

      this.currentPaletteIndex =
        (this.currentPaletteIndex + 1) % COLOR_PALETTES.length;
      const palette = COLOR_PALETTES[this.currentPaletteIndex];

      this.gridMaterial.uniforms.uGridColor.value.copy(palette.grid);
      const sunMat = this.sunMesh.material as ShaderMaterial;
      sunMat.uniforms.uSunColor.value.copy(palette.sun);
      this.skyMaterial.uniforms.uGlowColor.value.copy(palette.sun);
      this.laserMaterial.uniforms.uLaserColor.value.copy(palette.grid);
      this.buildingsMaterial.uniforms.uEdgeColor.value.copy(palette.grid);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  dispose(): void {
    this.gridMesh.geometry.dispose();
    this.gridMaterial.dispose();
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as ShaderMaterial).dispose();
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.laserMesh.geometry.dispose();
    this.laserMaterial.dispose();
    this.buildingsMesh.geometry.dispose();
    this.buildingsMaterial.dispose();
  }
}
