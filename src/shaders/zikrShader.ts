/**
 * Zikr Shaders - Silhouetted figures, ground mist, and a central glow pillar
 * for the Chechen Sufi zikr circle scene. Figures fade into mist below the
 * waist; all intensities are driven directly by flux.
 */

// =============================================================================
// Figure Shader (InstancedMesh silhouettes)
// =============================================================================

export const zikrFigureVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
    vec4 worldPosition = vec4(position, 1.0);
    vec3 objectNormal = normal;

    #ifdef USE_INSTANCING
        worldPosition = instanceMatrix * worldPosition;
        objectNormal = mat3(instanceMatrix) * objectNormal;
    #endif

    worldPosition = modelMatrix * worldPosition;
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const zikrFigureFragmentShader = /* glsl */ `
uniform float uFlux;
uniform float uMeanFlux;
uniform vec3 uGlowColor;
uniform vec3 uRimColor;
uniform vec3 uMistColor;
uniform float uMistTop;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Near-black body with a faint tint of the glow color
    vec3 color = uGlowColor * 0.02 + vec3(0.012, 0.012, 0.02);

    // Warm light cast from the center of the circle
    vec3 centerPoint = vec3(0.0, 1.6, 0.0);
    vec3 toCenter = centerPoint - vWorldPosition;
    float centerDistance = length(toCenter);
    float centerLambert = max(dot(normal, toCenter / centerDistance), 0.0);
    float centerFalloff = 1.0 / (1.0 + centerDistance * centerDistance * 0.02);
    color += uGlowColor * centerLambert * centerFalloff * (0.35 + uFlux * 2.0);

    // Rim light so silhouettes read against the dark
    float rim = pow(1.0 - abs(dot(viewDir, normal)), 2.6);
    color += uRimColor * rim * (0.2 + uFlux * 1.2);

    // Dissolve the lower body into the mist
    float mist = 1.0 - smoothstep(0.0, uMistTop, vWorldPosition.y);
    color = mix(color, uMistColor * (0.4 + uMeanFlux * 0.8), mist * 0.92);

    gl_FragColor = vec4(color, 1.0);
}
`

// =============================================================================
// Ground Mist Shader
// =============================================================================

export const zikrMistVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const zikrMistFragmentShader = /* glsl */ `
uniform float uFlux;
uniform float uMeanFlux;
uniform float uDrift;
uniform float uSeed;
uniform float uOpacity;
uniform vec3 uMistColor;

varying vec2 vUv;

float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.5);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p = p * 2.03 + vec2(11.7, 5.3);
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 p = (vUv - 0.5) * 14.0;
    float n = fbm(p + vec2(uDrift, -uDrift * 0.7) + uSeed);
    n = smoothstep(0.25, 0.85, n);

    float radial = 1.0 - smoothstep(0.26, 0.5, length(vUv - 0.5));
    float alpha = n * radial * uOpacity * (0.55 + uMeanFlux * 1.2);

    vec3 color = uMistColor * (0.9 + uFlux * 1.1);
    gl_FragColor = vec4(color, alpha);
}
`

// =============================================================================
// Center Glow Pillar Shader
// =============================================================================

export const zikrGlowVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const zikrGlowFragmentShader = /* glsl */ `
uniform float uFlux;
uniform vec3 uGlowColor;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float core = abs(dot(viewDir, normalize(vWorldNormal)));

    // Bright core through the middle, fading toward silhouette edges and top
    float vertical = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
    float alpha = pow(core, 1.8) * vertical * (0.18 + uFlux * 1.5);

    gl_FragColor = vec4(uGlowColor, alpha);
}
`
