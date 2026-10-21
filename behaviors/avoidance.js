// Évitement d'obstacles (exemple 6) : on regarde deux points devant l'agent,
// ahead (vitesse × lookAhead) et ahead/2, ainsi que sa position.
// Si l'un d'eux entre dans la zone d'un obstacle (rayon obstacle + rayon agent + marge),
// la vitesse désirée part du centre de l'obstacle vers ce point.
// trace (optionnel) reçoit les points calculés pour l'affichage debug.
function avoidForce(vehicle, obstacles, lookAhead = 30, margin = 0, trace = null) {
  const ahead = vehicle.vel.copy().mult(lookAhead);
  const probes = [
    p5.Vector.add(vehicle.pos, ahead),
    p5.Vector.add(vehicle.pos, ahead.copy().mult(0.5)),
    vehicle.pos.copy(),
  ];

  let threat = null;
  for (const obstacle of obstacles) {
    if (obstacle === vehicle) continue;
    const zone = obstacle.r + vehicle.r + margin;
    for (const probe of probes) {
      const penetration = zone - probe.dist(obstacle.pos);
      if (penetration > 0 && (threat === null || penetration > threat.penetration)) {
        threat = { obstacle, probe, penetration };
      }
    }
  }

  if (trace) {
    trace.ahead = probes[0];
    trace.ahead2 = probes[1];
    trace.obstacle = threat ? threat.obstacle : null;
  }
  if (threat === null) return createVector(0, 0);

  let away = p5.Vector.sub(threat.probe, threat.obstacle.pos);
  if (away.mag() === 0) away = createVector(-vehicle.vel.y, vehicle.vel.x);
  return vehicle.seek(p5.Vector.add(vehicle.pos, away));
}
