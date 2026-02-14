/**
 * Neon Grid Shader - Retro synthwave infinite grid with audio-reactive waves
 * Grid scrolls toward camera, vertex displacement driven by flux
 */

export const neonGridVertexShader = /* glsl */ `
uniform float uFlux;
uniform float uOffset;

varying vec3 vWorldPos;
varying float vHeight;
varying float vDepth;

void main() {
    vec3 pos = position;

    // Scrolled Z for wave calculation
    float scrolledZ = pos.z + uOffset;

    // Wave displacement driven by flux — multiple sine layers
    float wave1 = sin(scrolledZ * 0.04 + pos.x * 0.02) * uFlux * 40.0;
    float wave2 = sin(scrolledZ * 0.08 - pos.x * 0.03) * uFlux * 15.0;
    pos.y += wave1 + wave2;

    vHeight = pos.y;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
}
`

export const neonGridFragmentShader = /* glsl */ `
uniform float uFlux;
uniform vec3 uGridColor;
uniform float uOffset;

varying vec3 vWorldPos;
varying float vHeight;
varying float vDepth;

void main() {
    // Use world-space coordinates for grid lines so they tile correctly
    float cellSize = 40.0;

    vec2 gridUv = vec2(vWorldPos.x / cellSize, (vWorldPos.z + uOffset) / cellSize);
    vec2 fw = fwidth(gridUv);
    vec2 halfLine = vec2(0.02);
    vec2 a = smoothstep(halfLine - fw, halfLine + fw, fract(gridUv));
    vec2 b = smoothstep(halfLine - fw, halfLine + fw, 1.0 - fract(gridUv));
    float gridX = 1.0 - min(a.x, b.x);
    float gridZ = 1.0 - min(a.y, b.y);
    float grid = max(gridX, gridZ);

    // Fog — fade to black with distance
    float fog = 1.0 - smoothstep(100.0, 2500.0, vDepth);

    // Height glow — raised areas brighter
    float heightGlow = smoothstep(0.0, 20.0, abs(vHeight)) * 0.4;

    // Base intensity: grid lines only, height glow on lines
    float intensity = grid * (0.7 + heightGlow * 0.3);
    intensity *= fog;

    // Flux adds brightness boost — visible at rest (0.5 base)
    intensity *= 0.5 + uFlux * 1.2;

    vec3 color = uGridColor * intensity;

    gl_FragColor = vec4(color, 1.0);
}
`
