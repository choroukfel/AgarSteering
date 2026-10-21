// Évolution des bots (exemples 8-EvolutionarySteeringBehavior et 10-missiles) :
// l'ADN fixe les poids des comportements et les rayons de perception.
// Un bot mangé laisse son ADN et sa fitness dans un réservoir ; les nouveaux bots
// naissent d'un croisement de deux parents choisis selon leur fitness, puis d'une mutation.

// Intervalle [min, max] de chaque gène.
const BOT_GENES = {
  foodWeight: [0.2, 2.5],     // attraction vers la nourriture
  poisonWeight: [-2.5, 0.5],  // < 0 : répulsion du poison, > 0 : attraction (mauvais gène)
  preyWeight: [0.2, 2.5],     // poursuite des proies
  threatWeight: [0.5, 3.5],   // fuite des menaces
  perception: [150, 450],     // rayon de perception (px)
  detection: [90, 260],       // rayon de déclenchement de la fuite (px)
  safetyMargin: [60, 220],    // distance de sécurité = détection + marge (px)
  refuge: [0, 2],             // attraction vers un virus refuge pendant la fuite
};

class DNA {
  // generation : 0 pour un ADN aléatoire, 1 + max(parents) après croisement
  constructor(genes, generation = 0) {
    this.generation = generation;
    this.genes = {};
    for (const name of Object.keys(BOT_GENES)) this.genes[name] = DNA.clamp(name, genes[name]);
  }

  static clamp(name, value) {
    const [min, max] = BOT_GENES[name];
    return Math.max(min, Math.min(max, value));
  }

  static random(rng = Math.random) {
    const genes = {};
    for (const [name, [min, max]] of Object.entries(BOT_GENES)) genes[name] = min + rng() * (max - min);
    return new DNA(genes);
  }

  // Croisement uniforme : chaque gène vient de l'un des deux parents.
  crossover(partner, rng = Math.random) {
    const genes = {};
    for (const name of Object.keys(BOT_GENES)) genes[name] = rng() < 0.5 ? this.genes[name] : partner.genes[name];
    return new DNA(genes, Math.max(this.generation, partner.generation) + 1);
  }

  // Mutation : chaque gène a une probabilité `rate` de varier d'au plus 10 % de son intervalle.
  mutate(rate, rng = Math.random) {
    const genes = { ...this.genes };
    for (const [name, [min, max]] of Object.entries(BOT_GENES)) {
      if (rng() < rate) genes[name] += (rng() * 2 - 1) * 0.1 * (max - min);
    }
    return new DNA(genes, this.generation);
  }
}

// Réservoir des meilleurs ADN observés, trié par fitness décroissante.
// dnaClass fournit l'ADN aléatoire quand le réservoir est trop petit (DNA ou NeuralDNA).
// decay : à chaque ajout, les scores déjà mémorisés sont multipliés par ce facteur.
// Avec decay < 1, un record ancien finit par céder sa place : le réservoir suit les
// performances récentes au lieu de se figer (1 = mémoire sans oubli).
class GenePool {
  constructor(size = 12, dnaClass = DNA, decay = 1) {
    this.size = size;
    this.dnaClass = dnaClass;
    this.decay = decay;
    this.entries = [];
  }

  add(dna, fitness) {
    for (const entry of this.entries) entry.fitness *= this.decay;
    this.entries.push({ dna, fitness: Math.max(0, fitness) });
    this.entries.sort((a, b) => b.fitness - a.fitness);
    this.entries.length = Math.min(this.entries.length, this.size);
  }

  // Sélection proportionnelle à la fitness (roulette).
  select(rng = Math.random) {
    const total = this.entries.reduce((sum, e) => sum + e.fitness, 0);
    if (total === 0) return this.entries[Math.floor(rng() * this.entries.length)].dna;
    let pick = rng() * total;
    for (const entry of this.entries) {
      pick -= entry.fitness;
      if (pick < 0) return entry.dna;
    }
    return this.entries[this.entries.length - 1].dna;
  }

  // Nouvel ADN : croisement de deux parents puis mutation ; aléatoire si le réservoir est trop petit.
  breed(rng = Math.random, mutationRate = 0.1) {
    if (this.entries.length < 2) return this.dnaClass.random(rng);
    const a = this.select(rng);
    const b = this.select(rng);
    return a.crossover(b, rng).mutate(mutationRate, rng);
  }

  best() {
    return this.entries[0] ?? null;
  }
}
