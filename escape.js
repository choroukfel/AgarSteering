// État de fuite d'une cellule : normal → fuite → (sortie | épuisement) → normal.
//
// - Le rayon de déclenchement (detection) et la distance de sécurité (exit) sont distincts.
//   Pendant la fuite, on mesure la distance réelle à la menace la plus proche, même
//   au-delà du rayon de détection : sortir du cercle de détection ne suffit pas.
// - L'endurance (0..1) se consomme pendant la fuite (une endurance pleine dure
//   exactement maxDuration secondes) et se régénère en état normal.
// - Après épuisement, pas de réarmement immédiat : il faut d'abord que toutes
//   les menaces soient à la distance de sécurité.
const ESCAPE_EPSILON = 1e-9;

class EscapeState {
  constructor({ maxDuration = 3, regenRate = 0.25 } = {}) {
    this.maxDuration = maxDuration;
    this.regenRate = regenRate;
    this.reset();
  }

  reset() {
    this.state = 'normal';
    this.endurance = 1;
    this.elapsed = 0;
    this.startEndurance = 1;
    this.threat = null;
    this.threatDistance = Infinity;
  }

  isFleeing() {
    return this.state === 'flee';
  }

  // threats : entités capables de manger le propriétaire. Renvoie l'éventuelle transition.
  update(dt, owner, threats, detectionRadius, exitDistance) {
    const nearest = nearestWithin(owner, threats);
    this.threat = nearest ? nearest.entity : null;
    this.threatDistance = nearest ? nearest.distance : Infinity;

    if (this.state === 'normal') {
      this.endurance = Math.min(1, this.endurance + this.regenRate * dt);
      if (this.threatDistance <= detectionRadius && this.endurance > 0) {
        this.state = 'flee';
        this.elapsed = 0;
        this.startEndurance = this.endurance;
        return 'start';
      }
      return null;
    }

    if (this.state === 'flee') {
      this.elapsed += dt;
      this.endurance = Math.max(0, this.startEndurance - this.elapsed / this.maxDuration);
      if (this.threatDistance >= exitDistance) {
        this.state = 'normal';
        return 'safe';
      }
      if (this.elapsed >= this.startEndurance * this.maxDuration - ESCAPE_EPSILON) {
        this.endurance = 0;
        this.state = 'exhausted';
        return 'exhausted';
      }
      return null;
    }

    // épuisé : on attend le retour en sécurité pour réarmer
    if (this.threatDistance >= exitDistance) {
      this.state = 'normal';
      return 'rearmed';
    }
    return null;
  }
}
