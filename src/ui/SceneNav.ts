import type { SceneManager } from '../core/SceneManager'

/**
 * Set up scene navigation arrows.
 * Creates left/right arrow buttons that call sceneManager.prev()/next().
 */
export default function sceneNav(sceneManager: SceneManager): void {
    const leftArrow = document.getElementById('scene-prev') as HTMLButtonElement
    const rightArrow = document.getElementById('scene-next') as HTMLButtonElement

    if (leftArrow) {
        leftArrow.addEventListener('click', (e) => {
            e.stopPropagation()
            sceneManager.prev()
        })
    }

    if (rightArrow) {
        rightArrow.addEventListener('click', (e) => {
            e.stopPropagation()
            sceneManager.next()
        })
    }
}
