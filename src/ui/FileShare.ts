import type { AudioCallback } from '../audio/OnsetResult'

// add event listeners to the file input and file share buttons and call the audioChange callback when a file is selected and decoded
export default function shareFile(audioChange: AudioCallback, audioError: () => void) {
  // ui components
  const fileShare = document.getElementById('file-share') as HTMLElement
  const fileInput = document.getElementById('file-input') as HTMLInputElement
  const fileError = document.getElementById('file-error') as HTMLElement
  const fileReader = new FileReader()

  // trigger file input when button clicked
  fileShare.addEventListener('click', () => {
    fileInput.click()
  })

  // read file from file input selection
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length)
      fileReader.readAsArrayBuffer(fileInput.files[0])
  })

  // decode selected file on load
  fileReader.addEventListener('load', () => {
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
    handleFileDecode().catch(() => {
      fileError.style.display = 'block'
      audioError()
    })
  })
}
