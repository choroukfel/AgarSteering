// Micro (facultatif) : volume RMS lu à chaque image par un AnalyserNode du Web Audio.
// N'est activé que sur demande du joueur ; le navigateur demande l'autorisation.
// En cas de refus ou d'absence de micro, le jeu reste jouable au clavier (touche C).
const MicrophoneInput = {
  stream: null,
  analyser: null,
  buffer: null,
  error: null,

  isActive() {
    return this.analyser !== null;
  },

  async start(audioContext) {
    if (this.isActive()) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      const source = audioContext.createMediaStreamSource(this.stream);
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buffer = new Float32Array(this.analyser.fftSize);
      source.connect(this.analyser);
      this.error = null;
      return true;
    } catch (error) {
      this.error = error;
      this.stop();
      return false;
    }
  },

  stop() {
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.analyser = null;
    this.buffer = null;
  },

  // volume RMS courant (0..1), 0 si le micro est coupé
  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const sample of this.buffer) sum += sample * sample;
    return Math.sqrt(sum / this.buffer.length);
  },
};
