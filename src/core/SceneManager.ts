import type { WebGLRenderer } from 'three'
import type { IScene } from './Scene'
import type { OnsetResult } from '../audio/OnsetResult'

/**
 * Manages scene lifecycle, switching, and shared resources.
 */
export class SceneManager {
    private renderer: WebGLRenderer
    private scenes: IScene[] = []
    private currentIndex = 0
    private onSceneChange?: (index: number, total: number) => void

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer
    }

    /**
     * Register a scene. First registered scene becomes active.
     */
    register(scene: IScene): void {
        this.scenes.push(scene)
    }

    /**
     * Get the currently active scene.
     */
    get current(): IScene | undefined {
        return this.scenes[this.currentIndex]
    }

    /**
     * Get total number of registered scenes.
     */
    get count(): number {
        return this.scenes.length
    }

    /**
     * Get current scene index.
     */
    get index(): number {
        return this.currentIndex
    }

    /**
     * Set callback for scene change events.
     */
    setOnSceneChange(callback: (index: number, total: number) => void): void {
        this.onSceneChange = callback
    }

    /**
     * Switch to scene by index.
     */
    setScene(index: number): void {
        if (index < 0 || index >= this.scenes.length) return
        if (index === this.currentIndex) return

        this.current?.dispose()
        this.currentIndex = index
        this.current?.resize()
        this.onSceneChange?.(index, this.scenes.length)
    }

    /**
     * Switch to next scene (wraps around).
     */
    next(): void {
        const nextIndex = (this.currentIndex + 1) % this.scenes.length
        this.setScene(nextIndex)
    }

    /**
     * Switch to previous scene (wraps around).
     */
    prev(): void {
        const prevIndex = (this.currentIndex - 1 + this.scenes.length) % this.scenes.length
        this.setScene(prevIndex)
    }

    /**
     * Update the current scene.
     */
    update(deltaTime: number, audio: OnsetResult): void {
        this.current?.update(deltaTime, audio)
    }

    /**
     * Render the current scene.
     */
    render(): void {
        this.current?.render()
    }

    /**
     * Handle resize for the current scene.
     */
    resize(): void {
        this.current?.resize()
    }

    /**
     * Get the renderer instance.
     */
    getRenderer(): WebGLRenderer {
        return this.renderer
    }
}
