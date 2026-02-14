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

    // Mirrored hills on left and right edges, scrolling with grid
    float scrolledZ = pos.z + uOffset;
    float edgeDist = abs(pos.x) / 1500.0; // 0 at center, 1 at edge
    float edgeMask = smoothstep(0.0, 1.0, edgeDist);
    float hill1 = sin(scrolledZ * 0.008) * 2000.0;
    // Fade hills to zero near the buildings to prevent intersection
    float worldZ = (modelMatrix * vec4(pos, 1.0)).z;
    float depthFade = smoothstep(1850.0, 1600.0, worldZ);
    pos.y += (hill1) * edgeMask * uFlux * depthFade;

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

    // Height glow — raised areas brighter
    float heightGlow = smoothstep(0.0, 20.0, abs(vHeight)) * 0.4;

    // Base intensity: grid lines only, height glow on lines
    float intensity = grid * (0.7 + heightGlow * 0.3);

    // Flux adds brightness boost — visible at rest (0.5 base)
    intensity *= 0.5 + uFlux * 1.2;

    vec3 color = uGridColor * intensity;

    gl_FragColor = vec4(color, 1.0);
}
`
