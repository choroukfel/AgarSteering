// Contrôleur du joueur (non visible) : il regroupe les cellules du joueur et
// traduit ses commandes (split, éjection) ; chaque cellule calcule ses forces.
class PlayerController {
  constructor(config, name = 'Vous', color = '#29b6f6') {
    this.config = config;
    this.name = name;
    this.color = color;
    this.cells = [];
    this.peakMass = 0;
    this.stats = PlayerController.emptyStats(0);
  }

  // statistiques de la vie en cours (affichées en fin de partie)
  static emptyStats(time) {
    return { bornAt: time, diedAt: null, kills: 0, food: 0, plankton: 0, killer: null };
  }

  // pseudo et couleur choisis dans le menu, appliqués aussi aux cellules existantes
  configure(name, color) {
    this.name = name;
    this.color = color;
    for (const cell of this.cells) {
      cell.name = name;
      cell.color = color;
    }
  }

  get alive() {
    return this.cells.length > 0;
  }

  createCell(x, y, mass) {
    const cell = new PlayerCell(x, y, mass, this.color, this.name);
    cell.decay = { threshold: this.config.cell.decayThreshold, rate: this.config.cell.decayRate };
    return cell;
  }

  spawn(x, y, time = 0) {
    this.cells = [this.createCell(x, y, this.config.player.startMass)];
    this.peakMass = this.config.player.startMass;
    this.stats = PlayerController.emptyStats(time);
  }

  // repas d'une cellule du joueur : granulé, plancton ou cellule
  recordMeal(prey) {
    if (prey instanceof Food) this.stats.food++;
    else if (prey instanceof PlanktonBoid) this.stats.plankton++;
    else if (prey instanceof BotCell || prey instanceof SnakeHead) this.stats.kills++;
  }

  recordDeath(killer, time) {
    this.stats.killer = killer ? killer.name : null;
    this.stats.diedAt = time;
  }

  summary(now) {
    const end = this.stats.diedAt ?? now;
    return { ...this.stats, peakMass: this.peakMass, survival: end - this.stats.bornAt };
  }

  clear() {
    this.cells = [];
  }

  remove(cell) {
    const index = this.cells.indexOf(cell);
    if (index >= 0) this.cells.splice(index, 1);
  }

  totalMass() {
    return this.cells.reduce((sum, cell) => sum + cell.mass, 0);
  }

  // centre de gravité pondéré par la masse
  centroid() {
    const center = createVector(0, 0);
    const total = this.totalMass();
    if (total === 0) return center;
    for (const cell of this.cells) center.add(cell.pos.copy().mult(cell.mass / total));
    return center;
  }

  steer(target, bounds) {
    for (const cell of this.cells) cell.steer(target, this.cells, bounds);
  }

  // Split (Espace) : chaque cellule assez grosse se divise vers le pointeur,
  // en commençant par les plus grosses, dans la limite de maxCells.
  split(target) {
    const created = [];
    const bySize = [...this.cells].sort((a, b) => b.mass - a.mass);
    for (const cell of bySize) {
      if (this.cells.length >= this.config.player.maxCells) break;
      const child = cell.split(p5.Vector.sub(target, cell.pos), this.config);
      if (child) {
        this.cells.push(child);
        created.push(child);
      }
    }
    return created;
  }

  // Éjection (W) : chaque cellule assez grosse lance une masse vers le pointeur.
  eject(target) {
    const blobs = [];
    for (const cell of this.cells) {
      const blob = cell.eject(p5.Vector.sub(target, cell.pos), this.config);
      if (blob) blobs.push(blob);
    }
    return blobs;
  }

  // Explosion sur un virus : la cellule se divise en morceaux lancés en étoile.
  pop(cell, rng = Math.random) {
    const free = this.config.player.maxCells - this.cells.length;
    const pieces = Math.min(free + 1, this.config.virus.maxPieces, Math.floor(cell.mass / 16));
    if (pieces <= 1) return [];
    const total = cell.mass;
    const pieceMass = total / pieces;
    const delay = this.config.cell.mergeDelayBase + this.config.cell.mergeDelayPerMass * total;
    cell.setMass(pieceMass);
    cell.mergeTimer = delay;
    const created = [];
    const offset = rng() * Math.PI * 2;
    for (let i = 1; i < pieces; i++) {
      const angle = offset + (i / pieces) * Math.PI * 2;
      const dir = createVector(Math.cos(angle), Math.sin(angle));
      const piece = this.createCell(cell.pos.x + dir.x * cell.r, cell.pos.y + dir.y * cell.r, pieceMass);
      piece.vel = cell.vel.copy();
      piece.startLaunch(dir, this.config.cell.splitSpeed * 0.8, this.config.cell.splitDuration);
      piece.mergeTimer = delay;
      this.cells.push(piece);
      created.push(piece);
    }
    return created;
  }

  // Fusion : deux cellules prêtes, hors impulsion, qui se recouvrent largement
  // fusionnent dans la plus grosse. Renvoie le nombre de fusions.
  resolveMerges() {
    let merges = 0;
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const a = this.cells[i];
        const b = this.cells[j];
        if (!a.canMerge() || !b.canMerge() || a.isLaunched() || b.isLaunched()) continue;
        const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
        if (big.pos.dist(small.pos) <= big.r - small.r * 0.5) {
          big.setMass(big.mass + small.mass);
          this.remove(small);
          merges++;
          // les indices ont changé : on repart de la cellule courante
          j = i;
        }
      }
    }
    return merges;
  }

  updatePeak() {
    this.peakMass = Math.max(this.peakMass, this.totalMass());
  }
}
