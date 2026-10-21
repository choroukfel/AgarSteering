// Bruit émis par le joueur (touche C ou micro) : un stimulus, pas une entité. Il est perçu
// dans un rayon d'audition qui grandit avec le volume, pendant une durée limitée.
//  - un bot qui pourrait manger l'émetteur vient enquêter à l'endroit du bruit (arrive) ;
//  - un bot ou du plancton qui pourrait être mangé par lui s'en éloigne (flee).
class NoiseEvent {
  constructor(source, loudness, time, { baseRadius = 450, perVolume = 900, duration = 3 } = {}) {
    this.source = source;
    this.pos = source.pos.copy();
    this.mass = source.mass;
    this.loudness = Math.max(0, Math.min(1, loudness));
    this.radius = baseRadius + this.loudness * perVolume;
    this.time = time;
    this.duration = duration;
  }

  isActive(now) {
    return now - this.time < this.duration;
  }
}
