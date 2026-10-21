// Grille spatiale (« bin-lattice », Reynolds, Big Fast Crowds) : l'arène est découpée en
// cases ; chaque entité est rangée dans la case de son centre. Une requête autour d'un
// point ne parcourt que les cases qui recoupent le disque de recherche, au lieu de toute
// la collection. Elle renvoie des candidats : le filtre exact par distance reste à faire
// (nearestWithin, neighborsWithin). Ce n'est pas une entité : c'est une structure de perception.
class SpatialGrid {
  constructor(cellSize = 100) {
    this.cellSize = cellSize;
    this.buckets = new Map();
    this.count = 0;
  }

  // clé numérique d'une case (positions de l'arène positives et bornées)
  key(cx, cy) {
    return cy * 100003 + cx;
  }

  rebuild(entities) {
    this.buckets.clear();
    this.count = 0;
    for (const entity of entities) this.insert(entity);
    return this;
  }

  insert(entity) {
    const key = this.key(Math.floor(entity.pos.x / this.cellSize), Math.floor(entity.pos.y / this.cellSize));
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(entity);
    this.count++;
  }

  // entités des cases qui recoupent le disque (pos, radius) : surensemble des voisins
  query(pos, radius) {
    const found = [];
    const size = this.cellSize;
    const x0 = Math.floor((pos.x - radius) / size);
    const x1 = Math.floor((pos.x + radius) / size);
    const y0 = Math.floor((pos.y - radius) / size);
    const y1 = Math.floor((pos.y + radius) / size);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (bucket) for (const entity of bucket) found.push(entity);
      }
    }
    return found;
  }
}
