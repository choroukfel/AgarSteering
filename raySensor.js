// Capteur à rayon (exemples 9 / 9b du cours) : une perception, pas une entité. Le rayon part
// du bot dans une direction relative à son cap et avance par pas ; il s'arrête sur le premier
// danger : mur de l'arène, virus qui ferait exploser le bot, ou cellule capable de le manger.
// La mesure (proximité 0..1 : 1 = danger au contact) nourrit le réseau de neurones.
class RaySensor {
  static STEP = 20;

  constructor(angleOffset) {
    this.angleOffset = angleOffset;
    this.origin = null;
    this.direction = null;
    this.length = 0;
    this.hitDistance = 0;
    this.hit = false;
  }

  // bot : porteur ; dangers : [{ pos, r }] ; bounds : arène { x, y, width, height }
  sense(bot, dangers, bounds, length) {
    const heading = bot.vel.magSq() > 1e-6 ? bot.vel.heading() : 0;
    this.origin = bot.pos.copy();
    this.direction = createVector(Math.cos(heading + this.angleOffset), Math.sin(heading + this.angleOffset));
    this.length = length;
    this.hitDistance = length;
    this.hit = false;
    for (let distance = RaySensor.STEP; distance <= length; distance += RaySensor.STEP) {
      const x = this.origin.x + this.direction.x * distance;
      const y = this.origin.y + this.direction.y * distance;
      const outside = x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height;
      if (outside || dangers.some(d => (d.pos.x - x) ** 2 + (d.pos.y - y) ** 2 <= d.r * d.r)) {
        this.hitDistance = distance;
        this.hit = true;
        break;
      }
    }
    return this.proximity();
  }

  proximity() {
    return this.length > 0 ? Math.max(0, Math.min(1, 1 - this.hitDistance / this.length)) : 0;
  }
}
