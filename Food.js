// Granulé de nourriture. Il reste immobile (aucune force, maxSpeed nul),
// mais c'est une entité du monde : il étend donc Vehicle.
class Food extends Vehicle {
  constructor(x, y, color = '#8bc34a', mass = 1) {
    super(x, y);
    this.mass = mass;
    this.r = 5;
    this.color = color;
    this.maxSpeed = 0;
    this.maxForce = 0;
  }

  // nouvelle masse de la cellule qui avale ce granulé
  effectOn(mass) {
    return mass + this.mass;
  }

  // spore lumineuse : halo doux et cœur clair
  show() {
    this.halo ??= AgarTheme.alpha(this.color, 0.22);
    const ctx = drawingContext;
    const { x, y } = this.pos;
    ctx.fillStyle = this.halo;
    ctx.beginPath();
    ctx.arc(x, y, this.r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x, y, this.r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, this.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}
