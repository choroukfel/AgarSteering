// Unaligned collision avoidance (Reynolds, GDC 1999) : deux agents qui se croisent sans
// suivre la même direction. Pour chaque voisin, on calcule l'instant de plus courte
// distance en supposant les vitesses constantes :
//   p = position relative, v = vitesse relative, t* = −(p·v) / |v|²
// Si 0 < t* ≤ horizon et que la distance prévue à t* est inférieure à la somme des rayons
// (plus une marge), une collision est prévue. On retient la plus proche dans le temps et on
// s'écarte latéralement : vitesse désirée dans la direction « ma position future − la
// sienne », de norme maxSpeed ; steering = désirée − actuelle (via seek).
// trace (facultatif) reçoit { other, time, me, them } pour le debug.
function unalignedAvoidanceForce(vehicle, others, horizon = 45, margin = 6, trace = null) {
  let threat = null;
  for (const other of others) {
    if (other === vehicle) continue;
    const p = p5.Vector.sub(other.pos, vehicle.pos);
    const v = p5.Vector.sub(other.vel, vehicle.vel);
    const speedSq = v.magSq();
    if (speedSq < 1e-9) continue;
    const time = -p.dot(v) / speedSq;
    if (time <= 0 || time > horizon) continue;
    const separation = p.copy().add(v.copy().mult(time)).mag();
    if (separation >= (vehicle.r || 0) + (other.r || 0) + margin) continue;
    if (!threat || time < threat.time) threat = { other, time };
  }
  if (!threat) return createVector(0, 0);
  const me = predictPosition(vehicle, threat.time);
  const them = predictPosition(threat.other, threat.time);
  if (trace) Object.assign(trace, { other: threat.other, time: threat.time, me, them });
  const away = p5.Vector.sub(me, them);
  // collision frontale exacte : s'écarter perpendiculairement à sa propre vitesse
  if (away.magSq() < 1e-9) away.set(-vehicle.vel.y, vehicle.vel.x);
  if (away.magSq() < 1e-9) return createVector(0, 0);
  return vehicle.seek(p5.Vector.add(vehicle.pos, away));
}
