// Projection scalaire (exemple 5-1) : projection orthogonale du point p sur le
// segment [a, b]. Le paramètre t = (ap · ab) / |ab|² est borné à [0, 1].
function projectOnSegment(p, a, b) {
  const ab = p5.Vector.sub(b, a);
  const lengthSq = ab.dot(ab);
  if (lengthSq === 0) return a.copy();
  const t = Math.max(0, Math.min(1, p5.Vector.sub(p, a).dot(ab) / lengthSq));
  return a.copy().add(ab.mult(t));
}

// Point du chemin le plus proche de p, avec la direction du segment concerné.
function closestOnPath(path, p) {
  let best = null;
  const count = path.closed ? path.points.length : path.points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = path.points[i];
    const b = path.points[(i + 1) % path.points.length];
    const normal = projectOnSegment(p, a, b);
    const distance = p.dist(normal);
    if (best === null || distance < best.distance) {
      best = { normal, distance, direction: p5.Vector.sub(b, a) };
    }
  }
  return best;
}

// Path following (Reynolds, exemples 5-2 et 5-3) : on prédit la position future,
// on la projette sur le chemin. Si elle sort du couloir (path.radius), on vise un
// point un peu plus loin sur le chemin ; sinon aucune correction.
function followPathForce(vehicle, path, predictDistance = 25, lookAhead = 25, trace = null) {
  const predicted = vehicle.pos.copy();
  if (vehicle.vel.mag() > 0) predicted.add(vehicle.vel.copy().setMag(predictDistance));

  const closest = closestOnPath(path, predicted);
  const target = closest.normal.copy().add(closest.direction.copy().setMag(lookAhead));

  if (trace) {
    trace.predicted = predicted;
    trace.normal = closest.normal;
    trace.target = target;
    trace.offPath = closest.distance > path.radius;
  }
  if (closest.distance > path.radius) return vehicle.seek(target);
  return createVector(0, 0);
}
