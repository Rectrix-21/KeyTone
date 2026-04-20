declare module "essentia.js/dist/essentia-wasm.web.js" {
  const createEssentiaWasm: (options?: {
    locateFile?: (path: string, scriptDirectory?: string) => string;
  }) => Promise<any>;
  export default createEssentiaWasm;
}

declare module "essentia.js/dist/essentia.js-core.es.js" {
  class Essentia {
    constructor(essentiaWasm: any, isDebug?: boolean);

    arrayToVector(input: Float32Array): any;
    vectorToArray(input: any): Float32Array;

    RhythmExtractor2013(
      signal: any,
      maxTempo?: number,
      method?: string,
      minTempo?: number,
    ): any;

    LoopBpmConfidence(
      signal: any,
      bpmEstimate: number,
      sampleRate?: number,
    ): any;

    KeyExtractor(
      audio: any,
      averageDetuningCorrection?: boolean,
      frameSize?: number,
      hopSize?: number,
      hpcpSize?: number,
      maxFrequency?: number,
      maximumSpectralPeaks?: number,
      minFrequency?: number,
      pcpThreshold?: number,
      profileType?: string,
      sampleRate?: number,
      spectralPeaksThreshold?: number,
      tuningFrequency?: number,
      weightType?: string,
      windowType?: string,
    ): any;

    TonalExtractor(
      signal: any,
      frameSize?: number,
      hopSize?: number,
      tuningFrequency?: number,
    ): any;

    Loudness(signal: any): any;
  }

  export default Essentia;
}
