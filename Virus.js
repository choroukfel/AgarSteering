// Virus : obstacle vert hérissé. Les grosses cellules l'évitent (obstacle avoidance)
// car le recouvrir les fait exploser ; les petites peuvent s'y cacher.
// Nourri par de la masse éjectée, il tire un nouveau virus.
class Virus extends Cell {
  constructor(x, y, mass = 100) {
    super(x, y, mass, AgarTheme.VIRUS);
    this.fed = 0;
  }

  // Compte une masse reçue ; renvoie true quand le seuil de tir est atteint.
  feed(feedsToShoot) {
    this.fed++;
    if (this.fed >= feedsToShoot) {
      this.fed = 0;
      return true;
    }
    return false;
  }

  // Un virus tiré glisse puis freine jusqu'à l'arrêt.
  steer() {
    this.applyForce(this.isLaunched() ? this.launchForce() : brakeForce(this));
  }

  // cristal viral : double hexagone qui tourne, avec six « pattes » de phage
  show() {
    const turn = millis() / 4000 + (this.pos.x % 7);
    const hexagon = (radius, rotation) => {
      beginShape();
      for (let i = 0; i < 6; i++) {
        const angle = rotation + (i / 6) * Math.PI * 2;
        vertex(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      endShape(CLOSE);
    };
    this.look ??= {
      halo: AgarTheme.alpha(this.color, 0.12),
      edge: AgarTheme.shade(this.color, 0.4),
      shell: AgarTheme.alpha(this.color, 0.5),
      core: AgarTheme.alpha(AgarTheme.shade(this.color, -0.3), 0.8),
    };
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(this.look.halo);
    circle(0, 0, this.r * 2.6);
    stroke(this.look.edge);
    strokeWeight(Math.max(2, this.r * 0.05));
    for (let i = 0; i < 6; i++) {
      const angle = turn + (i / 6) * Math.PI * 2;
      const x1 = Math.cos(angle) * this.r;
      const y1 = Math.sin(angle) * this.r;
      const x2 = Math.cos(angle) * this.r * 1.22;
      const y2 = Math.sin(angle) * this.r * 1.22;
      line(x1, y1, x2, y2);
      circle(x2, y2, this.r * 0.08);
    }
    fill(this.look.shell);
    hexagon(this.r, turn);
    fill(this.look.core);
    hexagon(this.r * 0.55, -turn * 1.5);
    pop();
  }
}
