// Wander (Reynolds) : un point se déplace sur un cercle placé devant l'agent.
// À chaque image, son angle varie au plus de displaceRange : la direction
// change en continu, sans nouveau tirage brutal.

// distance : distance du centre du cercle devant l'agent
// radius : rayon du cercle ; displaceRange : variation max de l'angle par image (rad)
function createWanderState(options = {}) {
  return { theta: 0, distance: 80, radius: 35, displaceRange: 0.3, center: null, target: null, ...options };
}

// rng est injectable pour rendre les tests reproductibles.
function wanderForce(vehicle, state, rng = Math.random) {
  const heading = vehicle.vel.mag() > 0 ? vehicle.vel.heading() : 0;
  const center = vehicle.pos.copy().add(createVector(Math.cos(heading), Math.sin(heading)).mult(state.distance));
  const angle = heading + state.theta;
  const target = center.copy().add(createVector(Math.cos(angle), Math.sin(angle)).mult(state.radius));

  // gardés pour l'affichage debug
  state.center = center;
  state.target = target;

  state.theta += (rng() * 2 - 1) * state.displaceRange;
  return vehicle.seek(target);
}
