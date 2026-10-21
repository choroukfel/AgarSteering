// Éclat lumineux projeté quand une cellule est mangée ou qu'un virus explose. C'est une
// entité du monde : elle hérite de Vehicle et bouge par steering — une traînée de Reynolds
// (vitesse désirée = vitesse × frottement, donc steering = désirée − actuelle) qui la ralentit
// jusqu'à l'arrêt —, puis disparaît. La locomotion reste update() de Vehicle.
class EffectParticle extends Vehicle {
  constructor(x, y, angle, speed, color, life = 0.8, born = 0) {
    super(x, y);
    this.vel = createVector(Math.cos(angle), Math.sin(angle)).mult(speed);
    this.maxSpeed = speed;
    this.friction = 0.92;
    this.maxForce = speed * (1 - this.friction);
    this.r = 3 + (speed % 3);
    this.color = color;
    this.life = life;
    this.born = born;
  }

  isAlive(now) {
    return now - this.born < this.life;
  }

  steer() {
    const drag = p5.Vector.sub(p5.Vector.mult(this.vel, this.friction), this.vel);
    drag.limit(this.maxForce);
    this.applyForce(drag);
  }

  show(now) {
    const alpha = Math.max(0, 1 - (now - this.born) / this.life);
    push();
    noStroke();
    fill(AgarTheme.alpha(this.color, alpha * 0.25));
    circle(this.pos.x, this.pos.y, this.r * 4);
    fill(AgarTheme.alpha(this.color, alpha));
    circle(this.pos.x, this.pos.y, this.r * 2);
    pop();
  }
}
