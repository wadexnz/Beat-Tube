import type { AudioCallback } from '../OnsetResult'

export default function shareFile(audioChange: AudioCallback, audioError: () => void) {
  const fileShare = document.getElementById('file-share') as HTMLElement
  const fileInput = document.getElementById('file-input') as HTMLInputElement
  const fileError = document.getElementById('file-error') as HTMLElement
  const fileReader = new FileReader()

  const handleFileDecode = async () => {
    const audioCtx = new window.AudioContext()
    // Extract audio samples
    const arrayB = fileReader.result as ArrayBuffer
    const arrayBuffer = await audioCtx.decodeAudioData(arrayB)
    const source = audioCtx.createBufferSource()
    source.disconnect()
    source.buffer = arrayBuffer
    source.connect(audioCtx.destination)
    source.start()
    fileError.style.display = 'none'
    audioChange(source, audioCtx)
  }

  fileShare.addEventListener('click', () => {
    fileInput.click()
  })

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length)
      fileReader.readAsArrayBuffer(fileInput.files[0])
  })

  fileReader.addEventListener('load', () => {
    handleFileDecode().catch(() => {
      fileError.style.display = 'block'
      audioError()
    })
  })
}
