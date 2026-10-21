// Flow field following (Reynolds, GDC 1999) : l'arène porte un champ de directions
// (« courants »). Un agent qui le suit vise la direction du champ à sa position future :
// vitesse désirée = direction × maxSpeed ; steering = désirée − actuelle.
//
// FlowField n'est pas une entité : c'est une donnée du monde, une grille de directions
// calculée par une somme de sinusoïdes (déterministe, sans aléatoire) qui évolue lentement
// avec le temps pour que les courants ondulent.
class FlowField {
  constructor(width, height, resolution = 150) {
    this.width = width;
    this.height = height;
    this.resolution = resolution;
    this.cols = Math.ceil(width / resolution);
    this.rows = Math.ceil(height / resolution);
    this.angles = new Float32Array(this.cols * this.rows);
    this.update(0);
  }

  // angle du courant en (x, y) à l'instant t (s)
  static angleAt(x, y, t) {
    return Math.sin(x * 0.0021 + t * 0.05) * 1.7 + Math.cos(y * 0.0017 - t * 0.04) * 1.4 + Math.sin((x + y) * 0.0009) * 0.9;
  }

  update(time) {
    this.time = time;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = (col + 0.5) * this.resolution;
        const y = (row + 0.5) * this.resolution;
        this.angles[row * this.cols + col] = FlowField.angleAt(x, y, time);
      }
    }
  }

  // direction unitaire de la case qui contient (x, y) ; bornée aux bords de l'arène
  lookup(pos) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(pos.x / this.resolution)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(pos.y / this.resolution)));
    const angle = this.angles[row * this.cols + col];
    return createVector(Math.cos(angle), Math.sin(angle));
  }
}

// lookAhead : on lit le champ à la position future (vitesse × lookAhead images)
function flowFieldForce(vehicle, field, lookAhead = 10) {
  const future = predictPosition(vehicle, lookAhead);
  const desired = field.lookup(future).mult(vehicle.maxSpeed);
  const steering = p5.Vector.sub(desired, vehicle.vel);
  steering.limit(vehicle.maxForce);
  return steering;
}
