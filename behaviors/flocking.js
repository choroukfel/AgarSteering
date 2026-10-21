// Flocking (Reynolds, exemple 7-Boids) : séparation, alignement et cohésion
// restent trois comportements distincts ; la composition se fait dans l'entité.
// Chaque règle ne considère que les voisins à une distance <= radius.
// radius peut être un nombre ou une fonction (voisin) => rayon.

function radiusFor(radius, other) {
  return typeof radius === 'function' ? radius(other) : radius;
}

// Séparation : s'éloigner des voisins trop proches, d'autant plus qu'ils sont près (poids 1/d).
function separationForce(vehicle, others, radius) {
  const sum = createVector(0, 0);
  let count = 0;
  for (const other of others) {
    if (other === vehicle) continue;
    const d = vehicle.pos.dist(other.pos);
    if (d > 0 && d <= radiusFor(radius, other)) {
      sum.add(p5.Vector.sub(vehicle.pos, other.pos).setMag(1 / d));
      count++;
    }
  }
  if (count === 0 || sum.mag() === 0) return createVector(0, 0);
  return vehicle.seek(p5.Vector.add(vehicle.pos, sum));
}

// Alignement : prendre la vitesse moyenne des voisins.
function alignmentForce(vehicle, others, radius) {
  const sum = createVector(0, 0);
  let count = 0;
  for (const other of others) {
    if (other === vehicle) continue;
    if (vehicle.pos.dist(other.pos) <= radiusFor(radius, other)) {
      sum.add(other.vel);
      count++;
    }
  }
  if (count === 0) return createVector(0, 0);
  return vehicle.seek(p5.Vector.add(vehicle.pos, sum.div(count)));
}

// Cohésion : se diriger vers le centre de gravité des voisins (seek du centre).
function cohesionForce(vehicle, others, radius) {
  const center = createVector(0, 0);
  let count = 0;
  for (const other of others) {
    if (other === vehicle) continue;
    if (vehicle.pos.dist(other.pos) <= radiusFor(radius, other)) {
      center.add(other.pos);
      count++;
    }
  }
  if (count === 0) return createVector(0, 0);
  return vehicle.seek(center.div(count));
}
