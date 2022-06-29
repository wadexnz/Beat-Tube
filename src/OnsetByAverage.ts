import type { OnsetAnalyser, OnsetResult } from './OnsetResult'

export class OnsetByAverage implements OnsetAnalyser {
  onset: OnsetResult = {
    flux: 0,
    meanFlux: 0,
    event: false,
  }

  threshold = 1.025
  peaking = false
  analyser: AnalyserNode
  curSpectrum: Uint8Array
  prevFlux = new Array<number>(4).fill(0)
  constructor(audioCtx: AudioContext) {
    this.analyser = audioCtx.createAnalyser()
    this.analyser.fftSize = 1024
    this.curSpectrum = new Uint8Array(this.analyser.frequencyBinCount)
  }

  update(time: number): OnsetResult {
    this.analyser.getByteFrequencyData(this.curSpectrum)
    if (this.curSpectrum[0] !== Infinity && this.curSpectrum[0] !== -Infinity) {
      // average the spectrum
      this.onset.flux = 0
      for (const band of this.curSpectrum)
        this.onset.flux += band / 255
      this.onset.flux /= this.analyser.frequencyBinCount

      // average last 4 spectrums
      this.prevFlux.push(this.onset.flux)
      this.prevFlux.shift()
      let totalMag = 0
      for (const magnitude of this.prevFlux)
        totalMag += magnitude
      this.onset.meanFlux = totalMag / this.prevFlux.length

      // is event
      if (this.onset.meanFlux > 0) {
        if (this.onset.flux > this.onset.meanFlux * this.threshold) {
          this.threshold = this.onset.flux / this.onset.meanFlux
          if (!this.peaking)
            this.peaking = true
        }
        else {
          if (this.peaking)
            this.onset.event = true
          else
            this.onset.event = false
          this.peaking = false
        }
        this.threshold -= (time * this.threshold) / (this.onset.flux / this.onset.meanFlux) / 1.5
        if (this.threshold < 1.025)
          this.threshold = 1.025
      }
    }
    return this.onset
  }
}
