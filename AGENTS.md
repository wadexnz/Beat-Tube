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
