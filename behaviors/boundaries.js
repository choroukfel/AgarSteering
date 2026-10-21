// Confinement dans un rectangle (exemples 3, 6 et 7) : près d'un bord, la vitesse
// désirée est « réfléchie » comme au billard, puis
// steering = vitesseDésirée - vitesseActuelle, limitée à maxForce.
// Dans un coin, les deux composantes sont réfléchies.
function boundariesForce(vehicle, bx, by, bw, bh, margin) {
  let dx = null;
  let dy = null;
  if (vehicle.pos.x < bx + margin) dx = vehicle.maxSpeed;
  else if (vehicle.pos.x > bx + bw - margin) dx = -vehicle.maxSpeed;
  if (vehicle.pos.y < by + margin) dy = vehicle.maxSpeed;
  else if (vehicle.pos.y > by + bh - margin) dy = -vehicle.maxSpeed;

  if (dx === null && dy === null) return createVector(0, 0);

  const desired = createVector(dx ?? vehicle.vel.x, dy ?? vehicle.vel.y);
  desired.setMag(vehicle.maxSpeed);
  const steering = p5.Vector.sub(desired, vehicle.vel);
  steering.limit(vehicle.maxForce);
  return steering;
}
