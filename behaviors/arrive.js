// Arrive (Reynolds) : comme seek, mais la vitesse désirée diminue dans le
// rayon de freinage slowRadius, jusqu'à 0 sur la cible.
// offset arrête l'agent à une distance donnée de la cible (anneaux du serpent,
// exemple 3-Arrival_correction) ; en deçà, la vitesse désirée s'inverse.
function arriveForce(vehicle, target, slowRadius = 100, offset = 0) {
  const desired = p5.Vector.sub(target, vehicle.pos);
  const distance = desired.mag();
  let speed = vehicle.maxSpeed;
  if (distance < slowRadius && slowRadius > offset) {
    speed = vehicle.maxSpeed * (distance - offset) / (slowRadius - offset);
    speed = Math.max(-vehicle.maxSpeed, speed);
  }
  desired.setMag(speed);
  const steering = p5.Vector.sub(desired, vehicle.vel);
  steering.limit(vehicle.maxForce);
  return steering;
}

// Freinage : vitesse désirée nulle, donc steering = -vitesse (limité à maxForce).
function brakeForce(vehicle) {
  const steering = vehicle.vel.copy().mult(-1);
  steering.limit(vehicle.maxForce);
  return steering;
}
