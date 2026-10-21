// Poison (exemple 8-EvolutionarySteeringBehavior) : avalé comme un granulé,
// mais il fait perdre une fraction de la masse. Les bots apprennent à l'éviter
// par évolution de leur gène poisonWeight.
class Poison extends Food {
  constructor(x, y, massFactor = 0.85) {
    super(x, y, AgarTheme.POISON, 0);
    this.massFactor = massFactor;
    this.r = 7;
  }

  // on perd (1 - massFactor) de sa masse, sans descendre sous 10 ni grossir
  effectOn(mass) {
    return Math.min(mass, Math.max(10, mass * this.massFactor));
  }

  // oursin toxique : étoile à piquants qui tourne lentement
  show() {
    const spikes = 8;
    const turn = millis() / 1500;
    push();
    noStroke();
    this.look ??= { halo: AgarTheme.alpha(this.color, 0.2), edge: AgarTheme.shade(this.color, 0.45) };
    fill(this.look.halo);
    circle(this.pos.x, this.pos.y, this.r * 3.4);
    fill(this.color);
    stroke(this.look.edge);
    strokeWeight(1.5);
    beginShape();
    for (let i = 0; i < spikes * 2; i++) {
      const angle = turn + (i / (spikes * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? this.r * 1.45 : this.r * 0.65;
      vertex(this.pos.x + Math.cos(angle) * radius, this.pos.y + Math.sin(angle) * radius);
    }
    endShape(CLOSE);
    noStroke();
    fill(40, 0, 0, 200);
    circle(this.pos.x, this.pos.y, this.r * 0.7);
    pop();
  }
}
