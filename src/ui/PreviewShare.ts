import type { AudioCallback } from '../audio/OnsetResult'

export default function previewFile(audioChange: AudioCallback) {
  const button = document.getElementById('default-play') as HTMLButtonElement
  const audioElement = document.getElementById('default-music') as HTMLAudioElement
  let audioCtx: AudioContext
  let source: MediaElementAudioSourceNode
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    if (!audioCtx) {
      audioCtx = new window.AudioContext()
      audioElement.play()
      source = audioCtx.createMediaElementSource(audioElement)
    }
    source.connect(audioCtx.destination)

    // Extract audio samples
    audioChange(source, audioCtx)
  })
}
