/**
 * Centralized unit system for Beat-Tube.
 * Uses normalized values (0-1) that convert to scene-specific units.
 */

// =============================================================================
// Normalized Speed Presets (0-1 scale)
// =============================================================================

export const SPEED = {
    SLOW: 0.2,
    NORMAL: 0.5,
    FAST: 0.8,
} as const

// =============================================================================
// Scene-Specific Conversion Constants
// =============================================================================

/** Tunnel scene: pixels per second at normalized speed of 1.0 */
const TUNNEL_MAX_SPEED = 32000

/** Cube scene: radians per second at normalized speed of 1.0 */
const CUBE_MAX_ROTATION = Math.PI * 4 // 2 full rotations per second

/** Base movement when no audio is playing */
const BASE_MOVEMENT_FACTOR = 0.025

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert normalized speed (0-1) to tunnel movement speed (pixels/sec)
 */
export function toTunnelSpeed(normalized: number): number {
    return normalized * TUNNEL_MAX_SPEED
}

/**
 * Convert normalized speed (0-1) to rotation speed (radians/sec)
 */
export function toRotationSpeed(normalized: number): number {
    return normalized * CUBE_MAX_ROTATION
}

/**
 * Calculate movement multiplier from audio flux.
 * Returns a value suitable for normalizing scene-specific movement.
 */
export function fluxToMovement(flux: number): number {
    return BASE_MOVEMENT_FACTOR + flux * SPEED.NORMAL
}
