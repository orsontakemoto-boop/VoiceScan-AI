export interface AudioMetrics {
  pitch: number; // Fundamental frequency in Hz
  volume: number; // RMS amplitude in dB
  clarity: number; // Zero-crossing rate or spectral flatness (proxy for noise/clarity)
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface AnalysisResult {
  text: string;
  metrics: {
    averagePitch?: number;
    averageVolume?: number;
  };
}