// Pursue / Evade (Reynolds) : on anticipe la position future de l'autre agent.

// Position de l'agent dans `frames` images s'il garde sa vitesse.
function predictPosition(agent, frames) {
  return agent.pos.copy().add(agent.vel.copy().mult(frames));
}

// Horizon de prédiction T = distance / vitesse du poursuivant, borné à maxPrediction
// images : plus la cible est proche, moins on anticipe.
function predictionFrames(vehicle, other, maxPrediction) {
  if (vehicle.maxSpeed <= 0) return 0;
  return Math.min(maxPrediction, vehicle.pos.dist(other.pos) / vehicle.maxSpeed);
}

function pursueForce(vehicle, target, maxPrediction = 30) {
  const future = predictPosition(target, predictionFrames(vehicle, target, maxPrediction));
  return vehicle.seek(future);
}

function evadeForce(vehicle, threat, maxPrediction = 30) {
  const future = predictPosition(threat, predictionFrames(vehicle, threat, maxPrediction));
  return fleeFrom(vehicle, future);
}

// Poursuite parfaite (exemple 2-PursueEvade_correction) : point d'interception exact
// si la cible garde sa vitesse. On résout |D + V t| = s t, avec D = cible - poursuivant,
// V la vitesse de la cible et s la vitesse max du poursuivant.
// Renvoie null si l'interception est impossible (cible plus rapide qui s'éloigne).
function interceptPoint(pursuer, target) {
  const d = p5.Vector.sub(target.pos, pursuer.pos);
  const v = target.vel;
  const s = pursuer.maxSpeed;
  const a = v.dot(v) - s * s;
  const b = 2 * d.dot(v);
  const c = d.dot(d);
  let t;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return c === 0 ? target.pos.copy() : null;
    t = -c / b;
  } else {
    const delta = b * b - 4 * a * c;
    if (delta < 0) return null;
    const root = Math.sqrt(delta);
    const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(x => x >= 0);
    if (candidates.length === 0) return null;
    t = Math.min(...candidates);
  }
  if (t < 0) return null;
  return predictPosition(target, t);
}

function pursuePerfectForce(vehicle, target, maxPrediction = 30) {
  const point = interceptPoint(vehicle, target);
  return point ? vehicle.seek(point) : pursueForce(vehicle, target, maxPrediction);
}
