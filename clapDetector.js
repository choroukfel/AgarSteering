// Détection de clap, double clap et cri à partir du volume du micro (0..1), image par image.
// Logique pure (aucun accès au micro) : elle est testée avec des volumes simulés.
//  - clap : pic bref — le volume dépasse le seuil puis retombe en moins de CLAP_MAX_MS ;
//  - double clap : deux claps espacés de DOUBLE_MIN_MS à DOUBLE_MAX_MS ;
//  - cri : volume fort maintenu au moins SHOUT_MIN_MS (signalé une fois par cri).
// Le seuil s'adapte au bruit ambiant : max(threshold, plancher × ratio).
class ClapDetector {
  static CLAP_MAX_MS = 140;
  static SHOUT_MIN_MS = 380;
  static DOUBLE_MIN_MS = 120;
  static DOUBLE_MAX_MS = 650;

  constructor({ threshold = 0.18, floorRatio = 3 } = {}) {
    this.threshold = threshold;
    this.floorRatio = floorRatio;
    this.floor = 0.02;
    this.loudSince = null;
    this.shoutReported = false;
    this.lastClapAt = -Infinity;
    this.peak = 0;
  }

  currentThreshold() {
    return Math.max(this.threshold, this.floor * this.floorRatio);
  }

  // level : volume RMS (0..1) ; now : temps en ms. Renvoie l'événement détecté ou null :
  // { type: 'clap' | 'double-clap' | 'shout', loudness } (loudness = pic de volume).
  update(level, now) {
    const loud = level >= this.currentThreshold();
    if (!loud) {
      // le plancher de bruit ne suit que les moments calmes
      this.floor += (Math.min(level, 0.2) - this.floor) * 0.05;
    }
    if (loud) {
      if (this.loudSince === null) {
        this.loudSince = now;
        this.peak = level;
        this.shoutReported = false;
      }
      this.peak = Math.max(this.peak, level);
      if (!this.shoutReported && now - this.loudSince >= ClapDetector.SHOUT_MIN_MS) {
        this.shoutReported = true;
        return { type: 'shout', loudness: this.peak };
      }
      return null;
    }
    if (this.loudSince === null) return null;
    const duration = now - this.loudSince;
    const peak = this.peak;
    this.loudSince = null;
    if (this.shoutReported || duration > ClapDetector.CLAP_MAX_MS) return null;
    const gap = now - this.lastClapAt;
    if (gap >= ClapDetector.DOUBLE_MIN_MS && gap <= ClapDetector.DOUBLE_MAX_MS) {
      this.lastClapAt = -Infinity; // un troisième clap recommence une série
      return { type: 'double-clap', loudness: peak };
    }
    this.lastClapAt = now;
    return { type: 'clap', loudness: peak };
  }
}
