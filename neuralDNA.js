// ADN d'un bot neuronal : les gènes de DNA (rayons de perception, poids de fuite)
// plus les poids de son réseau de neurones. Même interface que DNA
// (random, crossover, mutate) : GenePool le fait évoluer sans traitement particulier.

// Entrées et sorties du cerveau des bots (voir NeuralBotCell.senses()).
const BOT_BRAIN = {
  inputs: [
    'food',        // proximité de la nourriture (1 = au contact, 0 = rien en vue)
    'prey',        // proximité de la proie
    'preyMass',    // masse de la proie / masse du bot
    'threat',      // proximité du prédateur visible le plus proche
    'threatMass',  // masse du bot / masse du prédateur (1 = presque égaux)
    'closing',     // vitesse de rapprochement du prédateur (−1..1)
    'poison',      // proximité du poison
    'refuge',      // proximité d'un virus refuge
    'endurance',   // endurance de fuite restante (0..1)
    'mass',        // masse du bot, normalisée
    'exhausted',   // 1 si le bot est épuisé
    'preyDanger',  // proximité d'un prédateur autour de la proie (proie « gardée »)
    'foodDanger',  // proximité d'un prédateur autour de la nourriture visée
    'rayFront',    // capteur à rayon devant : proximité du premier danger (mur, virus, prédateur)
    'rayLeft',     // capteur à rayon à 45° à gauche
    'rayRight',    // capteur à rayon à 45° à droite
  ],
  hidden: 8,
  outputs: ['food', 'pursue', 'wander', 'evade', 'poison', 'refuge'],
  // poids maximal de chaque comportement : sortie ∈ ]0, 1[ × échelle
  scale: { food: 2.5, pursue: 2.5, wander: 1.5, evade: 3.5, poison: 2.5, refuge: 2 },
  mutationAmount: 0.5,
};

class NeuralDNA extends DNA {
  constructor(genes, generation = 0, brain = null, rng = Math.random) {
    super(genes, generation);
    this.brain = brain ?? new NeuralNetwork(NeuralDNA.sizes(), null, rng);
  }

  static sizes() {
    return [BOT_BRAIN.inputs.length, BOT_BRAIN.hidden, BOT_BRAIN.outputs.length];
  }

  static random(rng = Math.random) {
    return new NeuralDNA(DNA.random(rng).genes, 0, null, rng);
  }

  // Croisement : gènes par DNA, poids par le réseau. Un parent sans réseau
  // (ADN classique) transmet seulement ses gènes.
  crossover(partner, rng = Math.random) {
    const child = super.crossover(partner, rng);
    const brain = partner.brain ? this.brain.crossover(partner.brain, rng) : this.brain.copy();
    return new NeuralDNA(child.genes, child.generation, brain);
  }

  mutate(rate, rng = Math.random) {
    const child = super.mutate(rate, rng);
    return new NeuralDNA(child.genes, child.generation, this.brain.mutate(rate, rng, BOT_BRAIN.mutationAmount));
  }

  toJSON() {
    return { genes: { ...this.genes }, generation: this.generation, brain: this.brain.toJSON() };
  }

  static fromJSON(data) {
    return new NeuralDNA(data.genes, data.generation ?? 0, NeuralNetwork.fromJSON(data.brain));
  }
}

// Amorce un réservoir avec des cerveaux déjà évolués (brainPretrained.js).
// Les données dont les tailles ne correspondent plus au cerveau actuel sont ignorées.
// bestFitness (facultatif) : les scores sont remis à l'échelle pour que le meilleur vaille
// bestFitness, en gardant leur ordre ; des scores d'entraînement trop élevés empêcheraient
// sinon tout bot de la partie d'entrer dans le réservoir.
// L'oubli (decay) est suspendu pendant l'amorçage : les scores gardent leurs écarts.
// Renvoie le nombre d'ADN ajoutés.
function seedNeuralPool(pool, pretrained, bestFitness = null) {
  if (!pretrained || !Array.isArray(pretrained.entries)) return 0;
  const sizes = NeuralDNA.sizes().join();
  const valid = pretrained.entries
    .filter(entry => entry.dna && entry.dna.brain && entry.dna.brain.sizes.join() === sizes);
  if (valid.length === 0) return 0;
  const top = Math.max(...valid.map(entry => entry.fitness));
  const scale = bestFitness !== null && top > 0 ? bestFitness / top : 1;
  const decay = pool.decay ?? 1;
  pool.decay = 1;
  for (const entry of valid) pool.add(NeuralDNA.fromJSON(entry.dna), entry.fitness * scale);
  pool.decay = decay;
  return valid.length;
}
