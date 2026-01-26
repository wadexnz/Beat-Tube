export interface OnsetResult {
    flux: number
    meanFlux: number
    event: boolean
}

export interface OnsetAnalyser {
    update: (time: number) => OnsetResult
}

export type AudioCallback = (source: AudioNode, audioCtx: AudioContext) => void
