// Garde du corps du plus gros bot (« le roi »). Il ne mange pas : il protège.
//  1. sélection de l'action (think) : repérer, près du roi, la cellule capable de le manger ;
//  2. steering (steer) :
//     - sans menace : offset pursuit, il tient sa place décalée (gauche ou droite, derrière) ;
//     - menace : interpose, il se place entre le roi et le prédateur — quitte à être mangé ;
//     plus les murs de l'arène ;
//  3. locomotion : celle de Vehicle, appelée une fois par image par le monde.
// Sa masse suit celle du roi (une fraction), donc ses limites de vitesse aussi.
class EscortCell extends Cell {
  constructor(x, y, slot, config) {
    super(x, y, config.escort.minMass, '#cfd8dc');
    this.name = 'Garde';
    this.slot = createVector(slot.x, slot.y);
    this.escortConfig = config.escort;
    this.eatRatio = config.cell.eatRatio;
    this.leader = null;
    this.threat = null;
    this.decision = 'escort';
    this.lastForces = {};
  }

  // rattachement à un roi : même équipe (ils ne se mangent pas), masse proportionnelle
  assign(leader) {
    this.leader = leader;
    this.team = leader ? leader.team : null;
    if (leader) {
      this.color = AgarTheme.shade(leader.color, 0.35);
      this.followLeaderMass();
    }
  }

  followLeaderMass() {
    const { massRatio, minMass } = this.escortConfig;
    this.setMass(Math.max(minMass, this.leader.mass * massRatio));
  }

  think(cells) {
    if (!this.leader) {
      this.threat = null;
      this.decision = 'escort';
      return;
    }
    this.followLeaderMass();
    const found = nearestWithin(this.leader, cells, this.escortConfig.guardRadius,
      c => c !== this && c.team !== this.team && CellMass.canEat(c.mass, this.leader.mass, this.eatRatio));
    this.threat = found ? found.entity : null;
    this.decision = this.threat ? 'interpose' : 'escort';
  }

  steer(bounds) {
    const forces = {};
    const weights = { walls: 3 };
    if (this.leader) {
      if (this.threat) {
        forces.interpose = interposeForce(this, this.leader, this.threat);
        weights.interpose = 2;
      } else {
        forces.escort = offsetPursuitForce(this, this.leader, this.slot);
        weights.escort = 1.5;
      }
    }
    forces.walls = boundariesForce(this, bounds.x, bounds.y, bounds.width, bounds.height, bounds.margin);
    this.lastForces = applyWeightedForces(this, forces, weights);
  }

  labelSubtitle() {
    return { text: this.decision === 'interpose' ? 'protège' : 'escorte', color: this.decision === 'interpose' ? '#ff8a80' : '#cfd8dc' };
  }
}
