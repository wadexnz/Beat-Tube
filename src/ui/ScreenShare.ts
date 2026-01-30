import type { AudioCallback } from '../audio/OnsetResult'

export default function shareFile(audioChange: AudioCallback, audioError: () => void) {
  const scrShare = document.getElementById('scr-share') as HTMLElement
  const scrError = document.getElementById('scr-error') as HTMLElement
  const handleAudioChange = async () => {
    const audioCtx = new window.AudioContext()
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    })
    const source = audioCtx.createMediaStreamSource(stream)
    // Extract audio samples
    scrError.style.display = 'none'
    audioChange(source, audioCtx)
  }

  scrShare.addEventListener('click', () => {
    handleAudioChange().catch(() => {
      scrError.style.display = 'block'
      audioError()
    })
  })
}
