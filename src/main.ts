import 'uno.css'
import { Clock } from 'three'
import type { OnsetAnalyser } from './OnsetResult'
import { OnsetByAverage } from './OnsetByAverage'
import { TunnelScene } from './TunnelScene'
import shareFile from './ui/FileShare'
import screenShare from './ui/ScreenShare'

const clock = new Clock()
const overlay = document.getElementById('overlay') as HTMLElement
const tunnelScene = new TunnelScene()
let animationFrame = 0
let curSource: AudioNode

function audioInputChange(source: AudioNode, audioCtx: AudioContext) {
  if (curSource)
    curSource.disconnect()
  window.cancelAnimationFrame(animationFrame)
  curSource = source
  const analyser = new OnsetByAverage(audioCtx)
  source.connect(analyser.analyser)
  overlay.style.display = 'none'
  draw(analyser)
}

function audioError() {
  overlay.style.display = 'flex'
}

function draw(analyser: OnsetAnalyser) {
  animationFrame = window.requestAnimationFrame(() => draw(analyser))
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

shareFile(audioInputChange, audioError)
screenShare(audioInputChange, audioError)
