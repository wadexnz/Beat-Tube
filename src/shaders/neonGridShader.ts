/**
 * Neon Grid Shader - Retro synthwave infinite grid with audio-reactive waves
 * Grid scrolls toward camera, vertex displacement driven by flux
 */

export const neonGridVertexShader = /* glsl */ `
uniform float uTime;
uniform float uFlux;
uniform float uOffset;

varying vec2 vUv;
varying float vHeight;
varying float vDepth;

void main() {
    vUv = uv;

    vec3 pos = position;

    // Scrolled Z for wave calculation
    float scrolledZ = pos.z + uOffset;

    // Wave displacement driven by flux — multiple sine layers
    float wave1 = sin(scrolledZ * 0.04 + pos.x * 0.02) * uFlux * 40.0;
    float wave2 = sin(scrolledZ * 0.08 - pos.x * 0.03) * uFlux * 15.0;
    pos.y += wave1 + wave2;

    vHeight = pos.y;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
}
`

export const neonGridFragmentShader = /* glsl */ `
uniform float uFlux;
uniform vec3 uGridColor;
uniform float uOffset;

varying vec2 vUv;
varying float vHeight;
varying float vDepth;

void main() {
    // Scrolled UV for grid lines that move with the terrain
    float scrolledV = vUv.y + uOffset * 0.001;

    // Grid lines — thin bright lines on dark background
    float lineX = abs(fract(vUv.x * 40.0) - 0.5);
    float lineZ = abs(fract(scrolledV * 80.0) - 0.5);

    float gridX = 1.0 - smoothstep(0.44, 0.48, lineX);
    float gridZ = 1.0 - smoothstep(0.44, 0.48, lineZ);
    float grid = max(gridX, gridZ);

    // Fog — fade to black with distance
    float fog = 1.0 - smoothstep(100.0, 3000.0, vDepth);

    // Height glow — raised areas brighter
    float heightGlow = smoothstep(0.0, 30.0, abs(vHeight)) * 0.5;

    // Base intensity: grid lines + subtle fill on raised parts
    float intensity = grid * 0.8 + heightGlow * 0.3;
    intensity *= fog;

    // Flux adds overall brightness boost
    intensity *= 0.4 + uFlux * 1.5;

    vec3 color = uGridColor * intensity;

    gl_FragColor = vec4(color, 1.0);
}
`
