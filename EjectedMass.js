// Masse éjectée (touche W) : lancée par une impulsion, elle freine ensuite
// jusqu'à l'arrêt (vitesse désirée nulle). Elle nourrit les virus et peut être mangée.
class EjectedMass extends Cell {
  constructor(x, y, mass, color, ownerTeam = null, ownerCooldown = 0) {
    super(x, y, mass, color);
    this.ownerTeam = ownerTeam;
    // délai pendant lequel l'équipe qui l'a éjectée ne peut pas la ravaler
    this.ownerCooldown = ownerCooldown;
  }

  canBeEatenBy(cell) {
    return cell.team !== this.ownerTeam || this.ownerCooldown <= 0;
  }

  steer() {
    this.applyForce(this.isLaunched() ? this.launchForce() : brakeForce(this));
  }

  tick(dt) {
    super.tick(dt);
    this.ownerCooldown = Math.max(0, this.ownerCooldown - dt);
  }

  // gouttelette : halo et cœur de la couleur de son émetteur
  show() {
    const c = this.palette();
    push();
    noStroke();
    fill(c.halo);
    circle(this.pos.x, this.pos.y, this.r * 2.6);
    fill(c.body);
    stroke(c.membrane);
    strokeWeight(2);
    circle(this.pos.x, this.pos.y, this.r * 2);
    pop();
  }
}
