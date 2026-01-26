import type { WebGLRenderer } from 'three'
import type { OnsetResult } from '../audio/OnsetResult'

/**
 * Interface that all scenes must implement.
 * Provides a consistent contract for the SceneManager.
 */
export interface IScene {
    /** Update scene state based on time and audio analysis */
    update(deltaTime: number, audio: OnsetResult): void

    /** Render the scene to the WebGL context */
    render(): void

    /** Handle window resize events */
    resize(): void

    /** Clean up resources when scene is disposed */
    dispose(): void
}

/**
 * Base class with common scene functionality.
 * Scenes can extend this or implement IScene directly.
 */
export abstract class BaseScene implements IScene {
    protected renderer: WebGLRenderer

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer
    }

    abstract update(deltaTime: number, audio: OnsetResult): void
    abstract render(): void
    abstract resize(): void

    dispose(): void {
        // Override in subclasses if cleanup is needed
    }
}
