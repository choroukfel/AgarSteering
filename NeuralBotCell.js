// Bot dont la sélection de l'action est confiée à un réseau de neurones.
// Les trois niveaux de Reynolds restent séparés :
//  1. sélection de l'action (think) : la perception locale est résumée en entrées
//     normalisées ; le réseau en déduit le poids de chaque comportement ;
//  2. steering (steer) : les comportements existants (seek, pursue, evade, wander,
//     arrive) sont composés par somme pondérée avec ces poids ;
//  3. locomotion : Vehicle.update(), appelée une seule fois par image par le monde.
// La fuite réglementée (détection, distance de sécurité, endurance, épuisement)
// reste celle de BotCell : le réseau ne la déclenche ni ne l'interrompt, mais il peut
// apprendre à éviter un prédateur avant qu'il entre dans le cercle de détection.
class NeuralBotCell extends BotCell {
  constructor(x, y, mass, dna, config, name = 'Bot', color = '#ff7043') {
    super(x, y, mass, dna, config, name, color);
    this.brainOutputs = BOT_BRAIN.outputs.map(() => 0);
    this.brainWeights = NeuralBotCell.zeroWeights();
    this.visibleThreat = null;
    // capteurs à rayons (exemple 9) : devant, 45° à gauche, 45° à droite
    this.sensors = [0, -Math.PI / 4, Math.PI / 4].map(offset => new RaySensor(offset));
  }

  static get DEFAULT_BOUNDS() {
    return { x: 0, y: 0, width: 3000, height: 3000 };
  }

  static zeroWeights() {
    return Object.fromEntries(BOT_BRAIN.outputs.map(name => [name, 0]));
  }

  // proximité ∈ [0, 1] : 1 au contact, 0 au bord du rayon de perception ou sans cible
  static proximity(found, radius) {
    if (!found || radius <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - found.distance / radius));
  }

  // proximité ∈ [0, 1] du prédateur le plus proche d'un point visé (cible « gardée »)
  dangerAround(target) {
    if (!target) return 0;
    const threats = this.perception.threats ?? [];
    const found = nearestWithin(target.entity, threats, this.perceptionRadius, threat => threat !== this);
    return NeuralBotCell.proximity(found, this.perceptionRadius);
  }

  // capteurs à rayons : dangers = virus explosifs perçus et cellules menaçantes proches
  senseRays(bounds) {
    const p = this.perception;
    const length = this.perceptionRadius;
    const dangers = [...(p.obstacles ?? []), ...(p.threats ?? []).filter(t => this.pos.dist(t.pos) <= length + t.r)];
    return this.sensors.map(sensor => sensor.sense(this, dangers, bounds, length));
  }

  // Entrées du réseau, dans l'ordre de BOT_BRAIN.inputs, toutes bornées.
  senses() {
    const p = this.perception;
    const radius = this.perceptionRadius;
    const threat = this.visibleThreat;
    let closing = 0;
    if (threat && threat.distance > 0) {
      // vitesse relative de la menace projetée sur la direction menace → bot
      const toMe = p5.Vector.sub(this.pos, threat.entity.pos).mult(1 / threat.distance);
      const relative = p5.Vector.sub(threat.entity.vel, this.vel);
      closing = Math.max(-1, Math.min(1, relative.dot(toMe) / Math.max(this.maxSpeed, 1e-6)));
    }
    return [
      NeuralBotCell.proximity(p.food, radius),
      NeuralBotCell.proximity(p.prey, radius),
      p.prey ? Math.min(1, p.prey.entity.mass / this.mass) : 0,
      NeuralBotCell.proximity(threat, radius),
      threat ? Math.min(1, this.mass / threat.entity.mass) : 0,
      closing,
      NeuralBotCell.proximity(p.poison, radius),
      NeuralBotCell.proximity(p.refuge, radius),
      this.escape.endurance,
      this.mass / (this.mass + 200),
      this.escape.state === 'exhausted' ? 1 : 0,
      this.dangerAround(p.prey),
      this.dangerAround(p.food),
      ...(this.rayReadings ?? [0, 0, 0]),
    ];
  }

  // Sélection de l'action : perception et fuite héritées, puis décision du réseau.
  think(world, dt) {
    const transition = super.think(world, dt);
    this.visibleThreat = nearestWithin(this, this.perception.threats, this.perceptionRadius);
    // la fuite réglementée et la réaction à un bruit entendu passent avant le réseau
    if (NeuralBotCell.RULED.includes(this.decision)) {
      this.brainWeights = NeuralBotCell.zeroWeights();
      return transition;
    }
    this.rayReadings = this.senseRays(world.bounds ? world.bounds() : NeuralBotCell.DEFAULT_BOUNDS);
    this.brainOutputs = this.dna.brain.forward(this.senses());
    this.brainWeights = NeuralBotCell.weightsFromOutputs(this.brainOutputs);
    this.decision = NeuralBotCell.dominantDecision(this.brainWeights, this.perception);
    return transition;
  }

  static weightsFromOutputs(outputs) {
    const weights = {};
    BOT_BRAIN.outputs.forEach((name, i) => { weights[name] = outputs[i] * BOT_BRAIN.scale[name]; });
    return weights;
  }

  // Étiquette affichée : le comportement disponible au plus fort poids.
  static dominantDecision(weights, perception) {
    let decision = 'wander';
    let best = weights.wander;
    if (perception.food && weights.food > best) { decision = 'graze'; best = weights.food; }
    if (perception.prey && weights.pursue > best) decision = 'hunt';
    return decision;
  }

  // Steering : chaque comportement disponible est pondéré par la sortie du réseau.
  steer(bounds, rng = Math.random) {
    if (NeuralBotCell.RULED.includes(this.decision)) return super.steer(bounds, rng);
    const p = this.perception;
    const w = this.brainWeights;
    const forces = {};
    const weights = {};
    if (p.food) {
      forces.food = this.seek(p.food.entity.pos);
      weights.food = w.food;
    }
    if (p.prey) {
      forces.pursue = pursueForce(this, p.prey.entity);
      weights.pursue = w.pursue;
    }
    if (this.visibleThreat) {
      forces.evade = evadeForce(this, this.visibleThreat.entity);
      weights.evade = w.evade;
    }
    if (p.poison) {
      // poids négatif : seek inversé, donc répulsion
      forces.poison = this.seek(p.poison.entity.pos);
      weights.poison = -w.poison;
    }
    if (p.refuge) {
      forces.refuge = arriveForce(this, p.refuge.entity.pos, p.refuge.entity.r);
      weights.refuge = w.refuge;
    }
    forces.wander = wanderForce(this, this.wanderState, rng);
    weights.wander = w.wander;
    // les courants accompagnent l'errance, dans la même proportion
    if (p.flow && this.config.flow.enabled) {
      forces.flow = flowFieldForce(this, p.flow);
      weights.flow = w.wander * this.config.flow.wander;
    }
    this.addSafetyForces(forces, weights, bounds);
    this.lastForces = this.composeForces(forces, weights);
  }

  static get RULED() {
    return ['flee', 'startled', 'investigate'];
  }

  labelSubtitle() {
    const subtitle = super.labelSubtitle();
    return { ...subtitle, text: `IA · ${subtitle.text}` };
  }
}
