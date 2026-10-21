// Chemin de patrouille fermé du serpent : une donnée géométrique (points + rayon
// du couloir), pas une entité. render.js le peint sur le fond de l'arène.
class PatrolPath {
  constructor(points, radius = 30, closed = true) {
    this.points = points;
    this.radius = radius;
    this.closed = closed;
  }

  // Boucle en forme de fleur autour de (cx, cy) : `wobble` fait alterner le rayon.
  static loop(cx, cy, rx, ry, count = 16, wobble = 0.15, radius = 30) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const k = 1 + (i % 2 === 0 ? wobble : -wobble);
      points.push(createVector(cx + Math.cos(angle) * rx * k, cy + Math.sin(angle) * ry * k));
    }
    return new PatrolPath(points, radius, true);
  }
}
