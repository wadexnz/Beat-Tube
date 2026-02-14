# Beat-Tube

## Commands
- **Dev server**: `bun run dev`
- **Build**: `bun run build`
- **Typecheck**: `bun run tsc --noEmit`
- **Lint**: `bun run lint`

## Package Manager
Use `bun` for all commands (not npm/npx).

## Tech Stack
- Three.js for 3D rendering
- Vite for bundling
- TypeScript
- UnoCSS

## Architecture
- `src/scenes/` - Scene implementations (implement `IScene` interface)
- `src/shaders/` - GLSL shaders as TypeScript template literals
- `src/audio/` - Audio analysis (OnsetByAverage)
- `src/core/` - SceneManager, Scene interface
- `src/ui/` - UI components for audio input

## Audio-Reactive Design Rules

The audio system provides an `OnsetResult` with three values: `flux`, `meanFlux`, and `event`.

### `event` (boolean) — Instant changes only
Beat events fire for a single frame. They must trigger **instant, stateless changes**:
- ✅ Swap color palette
- ✅ Flip rotation direction
- ✅ Change symmetry count
- ❌ Trigger an animation that plays out over time (e.g. "explode then reform")
- ❌ Set a value that decays over subsequent frames

### `flux` / `meanFlux` (number) — Drive all continuous visuals
All motion, scale, displacement, and intensity should be **directly mapped to flux each frame**:
- ✅ Rotation speed = baseSpeed + flux * multiplier
- ✅ Vertex displacement = flux * amplitude
- ✅ Scroll speed = baseSpeed + flux * multiplier
- ❌ Use flux to set a target that lerps over time (the flux already IS the interpolated value)

### General principle
If an effect happens over multiple frames, it must be driven by flux, not triggered by an event. Events are fire-and-forget single-frame state changes.

## Scene Design Guidelines
- Always reference existing scenes for conventions, parameter ranges, and patterns before creating a new scene
- Use conservative default values — start small and scale up. Particle sizes, forces, and multipliers are easy to overshoot
