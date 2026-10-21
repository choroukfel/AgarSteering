// Cellule du joueur. Elle suit le pointeur avec arrive (ralentit près du curseur).
// Après un split, les cellules sœurs se repoussent (séparation) tant que le délai
// de fusion court, puis se rapprochent (cohésion) pour refusionner.
class PlayerCell extends Cell {
  constructor(x, y, mass, color = '#29b6f6', name = 'Vous') {
    super(x, y, mass, color);
    this.name = name;
    this.team = 'player';
    // secondes restantes avant de pouvoir refusionner
    this.mergeTimer = 0;
    this.lastForces = {};
    this.slowRadius = 0;
  }

  canMerge() {
    return this.mergeTimer <= 0;
  }

  steer(target, siblings, bounds) {
    const forces = {
      walls: boundariesForce(this, bounds.x, bounds.y, bounds.width, bounds.height, bounds.margin),
    };
    const weights = { launch: 1, arrive: 1, separation: 1.6, cohesion: 0.6, walls: 3 };

    if (this.isLaunched()) {
      // priorité à l'impulsion du split
      forces.launch = this.launchForce();
    } else {
      this.slowRadius = this.r + 80;
      forces.arrive = arriveForce(this, target, this.slowRadius);
      const others = siblings.filter(other => other !== this);
      const blocking = others.filter(other => !(this.canMerge() && other.canMerge()));
      forces.separation = separationForce(this, blocking, other => this.r + other.r);
      const mergeable = this.canMerge() ? others.filter(other => other.canMerge()) : [];
      forces.cohesion = cohesionForce(this, mergeable, Infinity);
    }
    this.lastForces = applyWeightedForces(this, forces, weights);
  }

  // Divise la cellule en deux ; la moitié créée est lancée vers `direction`.
  split(direction, config) {
    if (this.mass < config.player.minSplitMass) return null;
    const total = this.mass;
    const half = total / 2;
    this.setMass(half);
    const dir = direction.mag() > 0 ? direction.copy().normalize() : createVector(1, 0);
    const child = new PlayerCell(this.pos.x + dir.x * this.r, this.pos.y + dir.y * this.r, half, this.color, this.name);
    child.decay = this.decay;
    child.vel = this.vel.copy();
    child.startLaunch(dir, config.cell.splitSpeed, config.cell.splitDuration);
    const delay = config.cell.mergeDelayBase + config.cell.mergeDelayPerMass * total;
    this.mergeTimer = delay;
    child.mergeTimer = delay;
    return child;
  }

  // Éjecte une petite masse vers `direction` (coût > masse éjectée, comme dans Agar.io).
  eject(direction, config) {
    if (this.mass < config.player.minEjectMass) return null;
    this.setMass(this.mass - config.player.ejectCost);
    const dir = direction.mag() > 0 ? direction.copy().normalize() : createVector(1, 0);
    const offset = this.r + CellMass.radius(config.eject.mass) + 2;
    const blob = new EjectedMass(this.pos.x + dir.x * offset, this.pos.y + dir.y * offset,
      config.eject.mass, this.color, this.team, config.eject.ownerCooldown);
    blob.vel = this.vel.copy();
    blob.startLaunch(dir, config.eject.speed, config.eject.duration);
    return blob;
  }

  tick(dt) {
    super.tick(dt);
    this.mergeTimer = Math.max(0, this.mergeTimer - dt);
  }

  // la masse s'affiche sous le pseudo
  labelSubtitle() {
    return { text: String(Math.round(this.mass)), color: '#ffffff' };
  }
}
