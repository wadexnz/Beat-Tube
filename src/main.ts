import 'uno.css'
import { Clock, WebGLRenderer } from 'three'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'

import type { OnsetAnalyser } from './OnsetResult'
import { OnsetByAverage } from './OnsetByAverage'
import { TunnelScene } from './TunnelScene'
import shareFile from './ui/FileShare'
import screenShare from './ui/ScreenShare'
import previewFile from './ui/PreviewShare'

const clock = new Clock()
const overlay = document.getElementById('overlay') as HTMLElement
const renderer = buildRenderer()
overlay.prepend(VRButton.createButton(renderer))

const tunnelScene = new TunnelScene(renderer)
let animationFrame = false
let curSource: AudioNode

function audioInputChange(source: AudioNode, audioCtx: AudioContext) {
  if (curSource && curSource !== source)
    curSource.disconnect()
  renderer.setAnimationLoop(null)
  curSource = source
  const analyser = new OnsetByAverage(audioCtx)
  source.connect(analyser.analyser)
  overlay.style.display = 'none'
  animationFrame = true
  renderer.setAnimationLoop(() => draw(analyser))
}

function audioError() {
  overlay.style.display = 'flex'
}

function draw(analyser: OnsetAnalyser) {
  const delta = clock.getDelta()
  const curOnset = analyser.update(delta)
  tunnelScene.update(delta, curOnset)
  tunnelScene.render()
}

document.addEventListener('click', () => {
  if (animationFrame) {
    if (overlay.style.display === 'none')
      overlay.style.display = 'flex'
    else
      overlay.style.display = 'none'
  }
})

function buildRenderer() {
  const renderer = new WebGLRenderer()
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local')
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)
  return renderer
}

shareFile(audioInputChange, audioError)
screenShare(audioInputChange, audioError)
previewFile(audioInputChange)
