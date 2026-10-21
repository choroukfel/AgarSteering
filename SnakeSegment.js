// Anneau du serpent (exemple 3-Arrival_correction) : chaque anneau suit celui
// qui le précède avec arrive et un décalage `spacing`. Il s'arrête donc à
// distance fixe de son meneur, ce qui donne une chaîne souple.
class SnakeSegment extends Vehicle {
  constructor(x, y, leader, spacing, r, color = '#f59e0b') {
    super(x, y);
    this.leader = leader;
    this.spacing = spacing;
    this.r = r;
    this.color = color;
    this.baseLimits = { maxSpeed: 8, maxForce: 1.2 };
    this.maxSpeed = this.baseLimits.maxSpeed;
    this.maxForce = this.baseLimits.maxForce;
    this.border = AgarTheme.shade(color, -0.3);
    this.lastForce = createVector(0, 0);
  }

  // Accélération progressive : un anneau doit suivre une tête devenue plus rapide.
  setTempo(tempo) {
    this.maxSpeed = this.baseLimits.maxSpeed * tempo;
    this.maxForce = this.baseLimits.maxForce * tempo;
  }

  steer() {
    this.lastForce = arriveForce(this, this.leader.pos, this.spacing * 3, this.spacing);
    this.applyForce(this.lastForce);
  }

  // anneau d'anguille électrique : halo et anneau lumineux
  show() {
    push();
    noStroke();
    fill(AgarTheme.alpha(this.color, 0.15));
    circle(this.pos.x, this.pos.y, this.r * 2.6);
    fill(AgarTheme.alpha(this.color, 0.75));
    stroke(this.border);
    strokeWeight(Math.max(2, this.r * 0.14));
    circle(this.pos.x, this.pos.y, this.r * 2);
    pop();
  }
}
