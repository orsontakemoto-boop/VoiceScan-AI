export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Uint8Array | null = null;
  private bufferLength: number = 0;

  async start(): Promise<MediaStream> {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    this.microphone = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    
    // Config for detailed frequency analysis
    this.analyser.fftSize = 2048; 
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    
    this.microphone.connect(this.analyser);
    
    return this.stream;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.microphone = null;
    this.analyser = null;
    this.audioContext = null;
    this.stream = null;
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyser || !this.dataArray) return new Uint8Array(0);
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }

  getTimeDomainData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const timeData = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(timeData);
    return timeData;
  }

  // Calculate RMS (Root Mean Square) for volume/intensity in Decibels
  getVolume(): number {
    const timeData = this.getTimeDomainData();
    if (timeData.length === 0) return -100;

    let sum = 0;
    // Values are 0-255, 128 is silence. Normalize to -1 to 1.
    for (let i = 0; i < timeData.length; i++) {
      const x = (timeData[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / timeData.length);
    const db = 20 * Math.log10(rms);
    
    // Clamp min db to avoid -Infinity
    return Math.max(-100, db);
  }

  // Auto-correlation algorithm for pitch detection (Fundamental Frequency)
  getPitch(): number {
    if (!this.analyser) return 0;
    
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    
    const sampleRate = this.audioContext?.sampleRate || 44100;
    
    // Simple autocorrelation
    const SIZE = buffer.length;
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;
    let foundGoodCorrelation = false;
    const correlations = new Float32Array(SIZE);

    for (let i = 0; i < SIZE; i++) {
      const val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    if (rms < 0.01) return 0; // Not enough signal

    let lastCorrelation = 1;
    for (let offset = 0; offset < SIZE; offset++) {
      let correlation = 0;

      for (let i = 0; i < SIZE - offset; i++) {
        correlation += Math.abs((buffer[i]) - (buffer[i + offset]));
      }
      
      correlation = 1 - (correlation / SIZE); 
      correlations[offset] = correlation; 
      
      if ((correlation > 0.9) && (correlation > lastCorrelation)) {
        foundGoodCorrelation = true;
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      } else if (foundGoodCorrelation) {
        // Shift exact with interpolation
        const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];  
        return sampleRate / (bestOffset + (8 * shift));
      }
      lastCorrelation = correlation;
    }
    
    if (bestCorrelation > 0.01) {
      return sampleRate / bestOffset;
    }
    
    return 0;
  }
}