/**
 * Audio Surf Shader — winding 3-lane highway inspired by Audiosurf.
 * The track undulates (hills) and winds (curves) based on a scrolling offset.
 * Track math constants are exported so the scene can place the ship and
 * blocks on the exact same surface the vertex shader produces.
 */

// =============================================================================
// Shared Track Math Constants
// =============================================================================

export const TRACK_MATH = {
  /** Track ribbon width (3 lanes) */
  WIDTH: 390,
  /** Track ribbon depth (length ahead of camera) */
  DEPTH: 4200,
  /** Hill wave 1: frequency and amplitude */
  HILL_F1: 0.0035,
  HILL_A1: 22,
  /** Hill wave 2: frequency and amplitude */
  HILL_F2: 0.0011,
  HILL_A2: 42,
  /** Hill amplitude: base factor plus flux-driven factor */
  HILL_BASE: 0.4,
  HILL_FLUX: 1.1,
  /** Curve wave 1: frequency and amplitude */
  CURVE_F1: 0.00085,
  CURVE_A1: 320,
  /** Curve wave 2: frequency and amplitude */
  CURVE_F2: 0.00031,
  CURVE_A2: 240,
  /** Spacing between cross ties */
  TIE_SPACING: 150,
} as const

/**
 * Track height at distance z ahead of the camera, given the current scroll
 * offset and flux. Mirrors the vertex shader exactly.
 */
export function trackHeight(z: number, offset: number, flux: number): number {
  const s = z + offset
  const amp = TRACK_MATH.HILL_BASE + flux * TRACK_MATH.HILL_FLUX
  return (
    (Math.sin(s * TRACK_MATH.HILL_F1) * TRACK_MATH.HILL_A1
      + Math.sin(s * TRACK_MATH.HILL_F2) * TRACK_MATH.HILL_A2) * amp
  )
}

/**
 * Sideways track bend at distance z ahead of the camera. Scaled by (z/depth)²
 * so the track stays centered near the ship and winds off in the distance.
 * Mirrors the vertex shader exactly.
 */
export function trackBend(z: number, offset: number): number {
  const s = z + offset
  const t = Math.min(Math.max(z / TRACK_MATH.DEPTH, 0), 1)
  return (
    (Math.sin(s * TRACK_MATH.CURVE_F1) * TRACK_MATH.CURVE_A1
      + Math.sin(s * TRACK_MATH.CURVE_F2) * TRACK_MATH.CURVE_A2) * t * t
  )
}

/** Format a number as a GLSL float literal */
function f(n: number): string {
  return n.toFixed(6)
}

// =============================================================================
// Track Shaders
// =============================================================================

export const audioSurfVertexShader = /* glsl */ `
uniform float uOffset;
uniform float uFlux;

varying vec2 vTrack; // x: local across-track position, y: scrolled z
varying float vT;    // 0 near camera, 1 at horizon

void main() {
    vec3 pos = position;
    float s = pos.z + uOffset;
    float t = clamp(pos.z / ${f(TRACK_MATH.DEPTH)}, 0.0, 1.0);

    // Hills — amplitude driven directly by flux
    float amp = ${f(TRACK_MATH.HILL_BASE)} + uFlux * ${f(TRACK_MATH.HILL_FLUX)};
    pos.y += (sin(s * ${f(TRACK_MATH.HILL_F1)}) * ${f(TRACK_MATH.HILL_A1)}
            + sin(s * ${f(TRACK_MATH.HILL_F2)}) * ${f(TRACK_MATH.HILL_A2)}) * amp;

    // Winding curve — fades to zero near the camera
    pos.x += (sin(s * ${f(TRACK_MATH.CURVE_F1)}) * ${f(TRACK_MATH.CURVE_A1)}
            + sin(s * ${f(TRACK_MATH.CURVE_F2)}) * ${f(TRACK_MATH.CURVE_A2)}) * t * t;

    vTrack = vec2(position.x, s);
    vT = t;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

export const audioSurfFragmentShader = /* glsl */ `
uniform float uFlux;
uniform float uEnergy;
uniform vec3 uCalmRail;
uniform vec3 uHotRail;
uniform vec3 uCalmBase;
uniform vec3 uHotBase;
uniform vec3 uFogColor;

varying vec2 vTrack;
varying float vT;

// Anti-aliased line centered at 0 with half-width w, given coordinate d
float line(float d, float w) {
    float fw = fwidth(d);
    return 1.0 - smoothstep(w - fw, w + fw, abs(d));
}

void main() {
    float x = vTrack.x;
    float s = vTrack.y;
    float halfW = ${f(TRACK_MATH.WIDTH / 2)};
    float laneW = ${f(TRACK_MATH.WIDTH / 3)};

    vec3 base = mix(uCalmBase, uHotBase, uEnergy);
    vec3 rail = mix(uCalmRail, uHotRail, uEnergy);

    // Outer rails — bright edges
    float edge = smoothstep(halfW - 14.0, halfW - 4.0, abs(x));

    // Lane separators at +/- one lane width from center
    float sep = line(abs(x) - laneW * 0.5, 1.6);

    // Cross ties scrolling along the track
    float tiePos = fract(s / ${f(TRACK_MATH.TIE_SPACING)}) - 0.5;
    float tie = line(tiePos * ${f(TRACK_MATH.TIE_SPACING)}, 2.2) * 0.5;

    float brightness = 0.5 + uFlux * 2.2;
    vec3 color = base * (0.6 + uFlux * 0.8)
               + rail * (edge * 1.3 + sep * 0.55 + tie) * brightness;

    // Fog fade toward the horizon
    color = mix(color, uFogColor, pow(vT, 1.6));

    gl_FragColor = vec4(color, 1.0);
}
`
