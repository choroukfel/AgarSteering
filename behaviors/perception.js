// Perception locale : un agent ne regarde que son voisinage utile.
// Les distances sont mesurées entre centres ; le rayon est inclusif.

// Renvoie les voisins (sauf l'agent lui-même) à une distance <= radius,
// avec leur distance, triés du plus proche au plus lointain.
function neighborsWithin(agent, others, radius = Infinity, accept = () => true) {
  const found = [];
  for (const other of others) {
    if (other === agent) continue;
    const distance = agent.pos.dist(other.pos);
    if (distance <= radius && accept(other)) found.push({ entity: other, distance });
  }
  return found.sort((a, b) => a.distance - b.distance);
}

// Le plus proche voisin accepté à une distance <= radius, ou null.
// Le filtre `accept`, parfois coûteux, n'est évalué que pour un candidat assez proche.
function nearestWithin(agent, others, radius = Infinity, accept = () => true) {
  let best = null;
  for (const other of others) {
    if (other === agent) continue;
    const distance = agent.pos.dist(other.pos);
    if (distance > radius || (best !== null && distance >= best.distance)) continue;
    if (accept(other)) best = { entity: other, distance };
  }
  return best;
}
