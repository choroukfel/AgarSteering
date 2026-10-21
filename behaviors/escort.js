// Comportements d'escorte (Reynolds, GDC 1999 ; interpose d'après Buckland) :
//  - offset pursuit : suivre un meneur en gardant une position décalée, exprimée dans son
//    repère local (x vers l'avant, y vers la droite) ; on vise la position future du point
//    décalé, puis on ralentit en arrivant (arrive) ;
//  - interpose : se placer au milieu des positions futures de deux agents (ici, entre le
//    meneur et la menace qui le vise).

// point décalé (offset local) autour du meneur, à sa position future dans `frames` images
function offsetPoint(leader, offset, frames = 0) {
  const heading = leader.vel.magSq() > 1e-6 ? leader.vel.heading() : 0;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const world = createVector(offset.x * cos - offset.y * sin, offset.x * sin + offset.y * cos);
  return predictPosition(leader, frames).add(world);
}

function offsetPursuitForce(vehicle, leader, offset, slowRadius = 80) {
  const distance = vehicle.pos.dist(offsetPoint(leader, offset));
  const frames = vehicle.maxSpeed > 0 ? Math.min(30, distance / vehicle.maxSpeed) : 0;
  return arriveForce(vehicle, offsetPoint(leader, offset, frames), slowRadius);
}

// milieu des positions futures de a et b, à l'horizon du temps de trajet jusqu'au milieu actuel
function interposePoint(vehicle, a, b) {
  const middle = p5.Vector.add(a.pos, b.pos).mult(0.5);
  const frames = vehicle.maxSpeed > 0 ? Math.min(30, vehicle.pos.dist(middle) / vehicle.maxSpeed) : 0;
  return p5.Vector.add(predictPosition(a, frames), predictPosition(b, frames)).mult(0.5);
}

function interposeForce(vehicle, a, b, slowRadius = 40) {
  return arriveForce(vehicle, interposePoint(vehicle, a, b), slowRadius);
}
