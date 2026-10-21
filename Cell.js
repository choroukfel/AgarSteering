// Cellule massique : base commune des entités dont la taille et les limites
// dépendent de la masse (joueur, bots, virus, masse éjectée, tête du serpent).
// La locomotion reste celle de Vehicle : Cell ne fait que régler maxSpeed et
// maxForce, et fournir une impulsion temporaire (split, éjection, tir de virus).
class Cell extends Vehicle {
  constructor(x, y, mass, color = '#4fc3f7') {
    super(x, y);
    this.color = color;
    this.name = '';
    // équipe : deux cellules de la même équipe ne se mangent pas
    this.team = null;
    // impulsion en cours : { direction, speed, duration, elapsed } ou null
    this.launch = null;
    // amaigrissement des grosses cellules : { threshold, rate } ou null
    this.decay = null;
    this.setMass(mass);
  }

  setMass(mass) {
    this.mass = Math.max(1, mass);
    this.r = CellMass.radius(this.mass);
    this.refreshLimits();
  }

  // limites normales, dérivées de la masse et du tempo de la partie (1 au départ)
  normalLimits() {
    const tempo = this.tempo ?? 1;
    return { maxSpeed: CellMass.maxSpeed(this.mass) * tempo, maxForce: CellMass.maxForce(this.mass) * tempo };
  }

  // Accélération progressive : le monde fournit le tempo, la cellule recalcule ses limites.
  setTempo(tempo) {
    if (tempo === this.tempo) return;
    this.tempo = tempo;
    this.refreshLimits();
  }

  // multiplicateurs temporaires (sprint de fuite des bots) ; 1 = limites normales
  limitMultipliers() {
    return { speed: 1, force: 1 };
  }

  // Applique les limites courantes. Pendant une impulsion, maxSpeed décroît
  // linéairement de la vitesse de lancement vers la vitesse normale.
  refreshLimits() {
    const normal = this.normalLimits();
    if (this.launch) {
      const remaining = 1 - this.launch.elapsed / this.launch.duration;
      this.maxSpeed = normal.maxSpeed + (this.launch.speed - normal.maxSpeed) * remaining;
      this.maxForce = Math.max(normal.maxForce, this.maxSpeed);
      return;
    }
    const multipliers = this.limitMultipliers();
    this.maxSpeed = normal.maxSpeed * multipliers.speed;
    this.maxForce = normal.maxForce * multipliers.force;
  }

  startLaunch(direction, speed, duration) {
    const dir = direction.mag() > 0 ? direction.copy().normalize() : createVector(1, 0);
    this.launch = { direction: dir, speed, duration, elapsed: 0 };
    this.refreshLimits();
  }

  isLaunched() {
    return this.launch !== null;
  }

  // Force de lancement : seek vers un point situé dans la direction du lancement,
  // la vitesse désirée vaut donc maxSpeed (élevée pendant l'impulsion).
  launchForce() {
    return this.seek(p5.Vector.add(this.pos, this.launch.direction.copy().mult(100)));
  }

  // Horloge de la cellule, appelée une fois par image avec le temps écoulé (s).
  tick(dt) {
    if (this.launch) {
      this.launch.elapsed += dt;
      if (this.launch.elapsed >= this.launch.duration) this.launch = null;
    }
    if (this.decay && this.mass > this.decay.threshold) {
      this.setMass(Math.max(this.decay.threshold, this.mass - this.mass * this.decay.rate * dt));
    }
    this.refreshLimits();
  }

  // Teintes dérivées de la couleur (halo, cytoplasme translucide, membrane, noyau),
  // recalculées seulement quand la couleur change.
  palette() {
    if (this.paletteFor !== this.color) {
      this.paletteFor = this.color;
      this.colors = {
        halo: AgarTheme.alpha(this.color, 0.13),
        body: AgarTheme.alpha(this.color, 0.42),
        membrane: AgarTheme.shade(this.color, 0.25),
        nucleus: AgarTheme.alpha(AgarTheme.shade(this.color, 0.55), 0.38),
        nucleusEdge: AgarTheme.alpha(AgarTheme.shade(this.color, 0.7), 0.7),
        nucleolus: AgarTheme.alpha(AgarTheme.shade(this.color, -0.45), 0.9),
        sparkle: AgarTheme.alpha('#ffffff', 0.55),
      };
    }
    return this.colors;
  }

  // texte affiché sous le nom ({ text, color }) ou null
  labelSubtitle() {
    return null;
  }

  // Micro-organisme : halo, membrane ondulante translucide et noyau décalé
  // dans le sens du mouvement (rendu seulement, aucune influence sur le steering).
  show() {
    const c = this.palette();
    const time = millis() / 1000;
    if (this.seed === undefined) this.seed = (Math.abs(this.pos.x * 0.37 + this.pos.y * 0.11)) % (Math.PI * 2);
    push();
    noStroke();
    fill(c.halo);
    circle(this.pos.x, this.pos.y, this.r * 2.35);

    fill(c.body);
    stroke(c.membrane);
    strokeWeight(Math.max(1.5, this.r * 0.06));
    const steps = Math.max(16, Math.min(40, Math.round(this.r * 0.6)));
    beginShape();
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const radius = AgarTheme.membraneRadius(this.r, angle, time, this.seed);
      vertex(this.pos.x + Math.cos(angle) * radius, this.pos.y + Math.sin(angle) * radius);
    }
    endShape(CLOSE);

    const speedRatio = this.maxSpeed > 0 ? Math.min(1, this.vel.mag() / this.maxSpeed) : 0;
    const drift = this.vel.mag() > 0 ? this.vel.copy().setMag(this.r * 0.22 * speedRatio) : createVector(0, 0);
    // noyau clair cerclé, avec un nucléole sombre
    fill(c.nucleus);
    stroke(c.nucleusEdge);
    strokeWeight(Math.max(1, this.r * 0.035));
    circle(this.pos.x + drift.x, this.pos.y + drift.y, this.r * 0.8);
    noStroke();
    fill(c.nucleolus);
    circle(this.pos.x + drift.x * 1.4 + this.r * 0.1, this.pos.y + drift.y * 1.4 - this.r * 0.08, this.r * 0.22);
    fill(c.sparkle);
    circle(this.pos.x - this.r * 0.38, this.pos.y - this.r * 0.42, this.r * 0.18);
    pop();
    this.drawLabel();
  }

  // nom en blanc avec une ombre bleu nuit
  drawLabel() {
    if (!this.name || this.r < 14) return;
    const size = Math.max(11, this.r * 0.36);
    push();
    textFont(AgarTheme.FONT);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    textSize(size);
    stroke(2, 12, 20, 200);
    strokeWeight(Math.max(2, size * 0.12));
    fill(255);
    text(this.name, this.pos.x, this.pos.y);
    const subtitle = this.labelSubtitle();
    if (subtitle) {
      textSize(Math.max(8, size * 0.55));
      strokeWeight(Math.max(1.5, size * 0.09));
      fill(subtitle.color);
      text(subtitle.text, this.pos.x, this.pos.y + size * 0.85);
    }
    pop();
  }
}
