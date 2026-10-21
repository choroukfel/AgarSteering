// Composition par somme pondérée : chaque force est multipliée par son poids
// puis transmise à applyForce. Les comportements restent indépendants.
// Les forces pondérées sont renvoyées pour que le debug les affiche sans les recalculer.
function applyWeightedForces(vehicle, forces, weights = {}) {
  const applied = {};
  for (const name of Object.keys(forces)) {
    const weight = weights[name] ?? 1;
    const weighted = forces[name].copy().mult(weight);
    vehicle.applyForce(weighted);
    applied[name] = weighted;
  }
  return applied;
}

// Composition par priorités (Reynolds, « prioritized acceleration allocation ») : les forces
// pondérées sont accumulées dans l'ordre `priorities` tant qu'il reste du budget
// (budget = maxForce × budgetFactor). La force qui dépasse le budget est tronquée à ce qui
// reste ; les forces moins prioritaires sont alors ignorées. L'évitement passe ainsi avant
// tout le reste au lieu d'être « dilué » par une somme.
// Renvoie, comme applyWeightedForces, les forces réellement appliquées (pour le debug).
function applyPrioritizedForces(vehicle, forces, weights = {}, priorities = Object.keys(forces), budgetFactor = 3) {
  const applied = {};
  let remaining = vehicle.maxForce * budgetFactor;
  const ordered = [...priorities.filter(name => name in forces), ...Object.keys(forces).filter(name => !priorities.includes(name))];
  for (const name of ordered) {
    if (remaining <= 1e-12) break;
    const weighted = forces[name].copy().mult(weights[name] ?? 1);
    const magnitude = weighted.mag();
    if (magnitude <= 1e-12) continue;
    if (magnitude > remaining) weighted.setMag(remaining);
    remaining -= weighted.mag();
    vehicle.applyForce(weighted);
    applied[name] = weighted;
  }
  return applied;
}

// Fuite « à la Reynolds » : vitesse désirée opposée à la menace, puis
// steering = vitesseDésirée - vitesseActuelle. On réutilise seek() vers le point
// symétrique de la menace par rapport à l'agent.
// (Le flee() hérité vaut -seek() : il s'annule quand l'agent fonce déjà vers la menace.)
function fleeFrom(vehicle, point) {
  const away = p5.Vector.sub(vehicle.pos, point);
  return vehicle.seek(p5.Vector.add(vehicle.pos, away));
}
