import 'virtual:uno.css'
import { Clock, WebGLRenderer } from 'three'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'

import type { OnsetAnalyser } from './audio/OnsetResult'
import { OnsetByAverage } from './audio/OnsetByAverage'
import { SceneManager } from './core/SceneManager'
import { TunnelScene } from './scenes/TunnelScene'
import { CubeScene } from './scenes/CubeScene'
import { TerrainScene } from './scenes/TerrainScene'
import shareFile from './ui/FileShare'
import screenShare from './ui/ScreenShare'
import previewFile from './ui/PreviewShare'
import sceneNav from './ui/SceneNav'

// =============================================================================
// Setup
// =============================================================================

const clock = new Clock()
const overlay = document.getElementById('overlay') as HTMLElement
const leftArrow = document.getElementById('scene-prev') as HTMLButtonElement
const rightArrow = document.getElementById('scene-next') as HTMLButtonElement

const renderer = buildRenderer()
overlay.prepend(VRButton.createButton(renderer))

// Initialize SceneManager and register scenes
const sceneManager = new SceneManager(renderer)
sceneManager.register(new TunnelScene(renderer))
sceneManager.register(new CubeScene(renderer))
sceneManager.register(new TerrainScene(renderer))

// Wire up scene navigation
sceneNav(sceneManager)

let animationFrame = false
let curSource: AudioNode

// =============================================================================
// Audio Input Handling
// =============================================================================

function audioInputChange(source: AudioNode, audioCtx: AudioContext) {
  if (curSource && curSource !== source)
    curSource.disconnect()
  renderer.setAnimationLoop(null)
  curSource = source
  const analyser = new OnsetByAverage(audioCtx)
  source.connect(analyser.analyser)
  overlay.style.display = 'none'

  // Show scene navigation arrows
  leftArrow.classList.add('visible')
  rightArrow.classList.add('visible')

  animationFrame = true
  renderer.setAnimationLoop(() => draw(analyser))
}

function audioError() {
  overlay.style.display = 'flex'
}

// =============================================================================
// Render Loop
// =============================================================================

function draw(analyser: OnsetAnalyser) {
  const delta = clock.getDelta()
  const curOnset = analyser.update(delta)
  sceneManager.update(delta, curOnset)
  sceneManager.render()
}

// =============================================================================
// Event Handlers
// =============================================================================

document.addEventListener('click', () => {
  if (animationFrame) {
    if (overlay.style.display === 'none')
      overlay.style.display = 'flex'
    else
      overlay.style.display = 'none'
  }
})

window.addEventListener('resize', () => {
  sceneManager.resize()
})

// =============================================================================
// Renderer Setup
// =============================================================================

function buildRenderer() {
  const renderer = new WebGLRenderer()
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local')
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)
  return renderer
}

// =============================================================================
// Initialize Audio Input Options
// =============================================================================

shareFile(audioInputChange, audioError)
screenShare(audioInputChange, audioError)
previewFile(audioInputChange)
