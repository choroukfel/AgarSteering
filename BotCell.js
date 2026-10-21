// Cellule autonome. Reynolds sépare trois niveaux, repris ici :
//  1. sélection de l'action (think) : perception locale + état de fuite → décision
//     par priorités : fuite > chasse > nourriture > errance ;
//  2. steering (steer) : forces de la décision + évitement des virus + murs,
//     composées par somme pondérée avec les poids de l'ADN ;
//  3. locomotion : Vehicle.update(), appelée une seule fois par image par le monde.
class BotCell extends Cell {
  static nextId = 1;

  constructor(x, y, mass, dna, config, name = 'Bot', color = '#ff7043') {
    super(x, y, mass, color);
    this.dna = dna;
    this.config = config;
    this.name = name;
    this.id = BotCell.nextId++;
    this.team = `bot-${this.id}`;
    this.decay = { threshold: config.cell.decayThreshold, rate: config.cell.decayRate };
    this.escape = new EscapeState(config.flee);
    this.wanderState = createWanderState({ distance: 90, radius: 40, displaceRange: 0.25 });
    this.age = 0;
    this.peakMass = mass;
    this.decision = 'wander';
    this.perception = BotCell.emptyPerception();
    this.avoidTrace = {};
    this.lastForces = {};
    this.refreshLimits();
  }

  static emptyPerception() {
    return { threats: [], prey: null, food: null, poison: null, refuge: null, obstacles: [], transition: null };
  }

  // Les rayons sont mesurés entre centres : on ajoute le rayon du bot.
  get perceptionRadius() { return this.dna.genes.perception + this.r; }
  get detectionRadius() { return this.dna.genes.detection + this.r; }
  get exitDistance() { return this.detectionRadius + this.dna.genes.safetyMargin; }

  // Sprint pendant la fuite : limites temporaires, restaurées exactement à la sortie.
  limitMultipliers() {
    if (this.escape && this.escape.isFleeing()) {
      return { speed: this.config.flee.sprintSpeed, force: this.config.flee.sprintForce };
    }
    return { speed: 1, force: 1 };
  }

  // Perception locale. Les menaces sont toutes listées : pendant une fuite,
  // la distance réelle à la plus proche compte, même hors du cercle de détection.
  perceive(world) {
    const ratio = this.config.cell.eatRatio;
    const popRatio = this.config.virus.popRatio;
    const radius = this.perceptionRadius;
    return {
      threats: world.cells().filter(c => c !== this && CellMass.canEat(c.mass, this.mass, ratio)),
      prey: nearestWithin(this, world.preyCandidates(), radius,
        p => p.team !== this.team && CellMass.canEat(this.mass, p.mass, ratio)),
      // granulés : candidats de la grille spatiale du monde, sinon toute la collection
      food: nearestWithin(this, world.nearby ? world.nearby('food', this.pos, radius) : world.food, radius),
      poison: nearestWithin(this, world.nearby ? world.nearby('poison', this.pos, radius) : world.poison, radius),
      // un virus plus lourd que soi ne fait pas exploser : c'est un refuge
      refuge: nearestWithin(this, world.viruses, radius, v => this.mass < v.mass),
      // un virus qu'on recouvrirait nous ferait exploser : c'est un obstacle
      obstacles: world.viruses.filter(v => this.mass >= v.mass * popRatio && this.pos.dist(v.pos) <= radius),
      // pairs : cellules proches qu'on ne peut ni manger ni craindre (évitement de collision)
      peers: neighborsWithin(this, world.cells(), radius,
        c => c.team !== this.team && !CellMass.canEat(c.mass, this.mass, ratio) && !CellMass.canEat(this.mass, c.mass, ratio))
        .map(found => found.entity),
      // environnement perçu : courants et bruit en cours
      flow: world.flowField ?? null,
      noise: world.activeNoise ? world.activeNoise() : null,
    };
  }

  // Sélection de l'action ; dt sert à l'endurance.
  think(world, dt) {
    const perception = this.perceive(world);
    const transition = this.escape.update(dt, this, perception.threats, this.detectionRadius, this.exitDistance);
    this.refreshLimits();
    this.decision = BotCell.decide(this.escape.state, perception);
    this.perception = { ...perception, transition };
    this.applyHearing();
    return transition;
  }

  // Audition : un bruit entendu (dans son rayon) change la décision, sauf pendant une fuite.
  // Le bot qui pourrait manger l'émetteur vient enquêter (s'il ne chasse pas déjà une proie
  // visible) ; celui qui pourrait être mangé par lui est effrayé et s'en éloigne.
  applyHearing() {
    const noise = this.perception.noise;
    this.heardNoise = null;
    if (!noise || this.decision === 'flee' || noise.source === this || this.pos.dist(noise.pos) > noise.radius) return;
    const ratio = this.config.cell.eatRatio;
    if (CellMass.canEat(noise.mass, this.mass, ratio)) {
      this.decision = 'startled';
    } else if (CellMass.canEat(this.mass, noise.mass, ratio) && this.decision !== 'hunt') {
      this.decision = 'investigate';
    } else {
      return;
    }
    this.heardNoise = noise;
  }

  static decide(escapeState, perception) {
    if (escapeState === 'flee') return 'flee';
    if (perception.prey) return 'hunt';
    if (perception.food) return 'graze';
    return 'wander';
  }

  steer(bounds, rng = Math.random) {
    const p = this.perception;
    const genes = this.dna.genes;
    const forces = {};
    const weights = {};

    if (this.decision === 'flee') {
      forces.evade = evadeForce(this, this.escape.threat);
      weights.evade = genes.threatWeight;
      if (p.refuge) {
        forces.refuge = arriveForce(this, p.refuge.entity.pos, p.refuge.entity.r);
        weights.refuge = genes.refuge;
      }
    } else if (this.decision === 'hunt') {
      forces.pursue = pursueForce(this, p.prey.entity);
      weights.pursue = genes.preyWeight;
    } else if (this.decision === 'graze') {
      forces.food = this.seek(p.food.entity.pos);
      weights.food = genes.foodWeight;
    } else if (this.decision === 'startled') {
      forces.startle = fleeFrom(this, this.heardNoise.pos);
      weights.startle = genes.threatWeight;
    } else if (this.decision === 'investigate') {
      forces.investigate = arriveForce(this, this.heardNoise.pos, 80);
      weights.investigate = genes.preyWeight;
    } else {
      forces.wander = wanderForce(this, this.wanderState, rng);
      weights.wander = 1;
      // en errance, le bot se laisse porter par les courants
      if (p.flow && this.config.flow.enabled) {
        forces.flow = flowFieldForce(this, p.flow);
        weights.flow = this.config.flow.wander;
      }
    }

    // poids négatif : répulsion ; positif : attraction (mauvais gène, éliminé par l'évolution)
    if (p.poison) {
      forces.poison = this.seek(p.poison.entity.pos);
      weights.poison = genes.poisonWeight;
    }
    this.addSafetyForces(forces, weights, bounds);
    this.lastForces = this.composeForces(forces, weights);
  }

  // Forces communes à toutes les décisions : évitement des virus, des collisions avec les
  // cellules voisines (unaligned collision avoidance) et murs de l'arène.
  addSafetyForces(forces, weights, bounds) {
    this.avoidTrace = {};
    this.collisionTrace = {};
    const collision = this.config.collision;
    forces.avoid = avoidForce(this, this.perception.obstacles, 25, 4, this.avoidTrace);
    forces.collision = unalignedAvoidanceForce(this, this.perception.peers ?? [], collision.horizon, collision.margin, this.collisionTrace);
    forces.walls = boundariesForce(this, bounds.x, bounds.y, bounds.width, bounds.height, bounds.margin);
    weights.avoid = 3;
    weights.collision = collision.weight;
    weights.walls = 3;
  }

  // Composition : somme pondérée, ou allocation par priorités de Reynolds selon les réglages.
  composeForces(forces, weights) {
    const { mode, budget } = this.config.composition;
    return mode === 'priority'
      ? applyPrioritizedForces(this, forces, weights, BotCell.PRIORITIES, budget)
      : applyWeightedForces(this, forces, weights);
  }

  setMass(mass) {
    super.setMass(mass);
    this.peakMass = Math.max(this.peakMass ?? 0, this.mass);
  }

  tick(dt) {
    super.tick(dt);
    this.age += dt;
  }

  // Fitness pour l'évolution : masse maximale atteinte et temps de survie.
  // Le bonus de survie est plafonné à AGE_CAP secondes : au-delà, seule la masse compte,
  // pour récompenser la compétence plutôt que le simple fait d'avoir duré.
  fitness() {
    return this.peakMass + Math.min(this.age, BotCell.AGE_CAP) * 0.5;
  }

  // transition de scénario : la fuite repart de zéro, limites normales
  resetEscape() {
    this.escape.reset();
    this.refreshLimits();
    this.decision = 'wander';
  }

  // état courant affiché sous le nom : fuite, chasse, broute, erre ou épuisé
  displayState() {
    return this.escape.state === 'exhausted' ? 'exhausted' : this.decision;
  }

  labelSubtitle() {
    const state = this.displayState();
    return { text: BotCell.STATE_LABELS[state], color: BotCell.STATE_COLORS[state] };
  }

  show() {
    super.show();
    // barre d'endurance pendant la fuite et l'épuisement
    if (this.escape.state === 'normal') return;
    const w = Math.max(30, this.r * 1.4);
    const y = this.pos.y - this.r - 12;
    push();
    noStroke();
    fill(0, 150);
    rect(this.pos.x - w / 2, y, w, 6, 3);
    fill(this.escape.state === 'flee' ? '#ffd54f' : '#ef5350');
    rect(this.pos.x - w / 2, y, w * this.escape.endurance, 6, 3);
    pop();
  }
}

BotCell.AGE_CAP = 300;
// ordre de priorité pour la composition 'priority' : la sécurité d'abord
BotCell.PRIORITIES = ['walls', 'avoid', 'collision', 'evade', 'startle', 'refuge', 'poison', 'pursue', 'investigate', 'food', 'flow', 'wander'];
BotCell.STATE_LABELS = { flee: 'fuite', hunt: 'chasse', graze: 'broute', wander: 'erre', exhausted: 'épuisé', investigate: 'enquête', startled: 'effrayé' };
BotCell.STATE_COLORS = { flee: '#ffd54f', hunt: '#ff8a80', graze: '#b9f6ca', wander: '#e0e0e0', exhausted: '#ef9a9a', investigate: '#80d8ff', startled: '#ffcc80' };
