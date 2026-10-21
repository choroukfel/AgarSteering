import test from 'node:test';
import assert from 'node:assert/strict';
import { load, v, near, constantRng, seededRng } from './helpers.mjs';

const g = load();
const bounds = { x: 0, y: 0, width: 3000, height: 3000, margin: 80 };
const HIDDEN = g.BOT_BRAIN.hidden;
const INPUTS = g.BOT_BRAIN.inputs.length;
const OUTPUTS = g.BOT_BRAIN.outputs;

// Cerveau contrôlé : couche cachée nulle (tanh(0) = 0), donc sortie i = sigmoïde(biais i).
// Un biais de ±20 donne une sortie ≈ 1 ou ≈ 0.
function fixedBrain(biases = {}) {
  const hidden = Array.from({ length: HIDDEN }, () => new Array(INPUTS + 1).fill(0));
  const output = OUTPUTS.map(name => [biases[name] ?? -20, ...new Array(HIDDEN).fill(0)]);
  return new g.NeuralNetwork([INPUTS, HIDDEN, OUTPUTS.length], [hidden, output]);
}

function neuralBot(x, y, mass, biases = {}, genes = {}) {
  const base = g.DNA.random(constantRng(0.5)).genes;
  const dna = new g.NeuralDNA({ ...base, ...genes }, 0, fixedBrain(biases));
  return new g.NeuralBotCell(x, y, mass, dna, g.createAgarConfig());
}

function classicBot(x, y, mass) {
  return new g.BotCell(x, y, mass, g.DNA.random(constantRng(0.5)), g.createAgarConfig());
}

function fakeWorld({ cells = [], food = [], poison = [], viruses = [] } = {}) {
  return { food, poison, viruses, cells: () => cells, preyCandidates: () => cells };
}

// les tableaux créés dans le contexte vm n'ont pas le même prototype : on compare leur JSON
const plain = x => JSON.parse(JSON.stringify(x));
const same = (a, b, message) => assert.deepEqual(plain(a), plain(b), message);
const notSame = (a, b, message) => assert.notDeepEqual(plain(a), plain(b), message);
const sumForces = forces => Object.values(forces).reduce((acc, f) => acc.add(f), v(0, 0));

// ---------- réseau ----------

test('réseau : propagation avant exacte (tanh caché, sigmoïde en sortie)', () => {
  const net = new g.NeuralNetwork([2, 1, 1], [[[0.5, 1, -1]], [[0, 2]]]);
  const [out] = net.forward([1, 0.5]);
  assert.ok(near(out, 1 / (1 + Math.exp(-2 * Math.tanh(1)))));
  assert.equal(net.weightCount(), 5);
  assert.throws(() => net.forward([1]), /attend 2 entrées/);
  assert.throws(() => new g.NeuralNetwork([2]), /invalides/);
  assert.throws(() => new g.NeuralNetwork([2, 1], [[[0, 1]]]), /incompatible/);
});

test('réseau : sorties toujours dans ]0, 1[, même pour des entrées extrêmes', () => {
  const rng = seededRng(3);
  for (let n = 0; n < 20; n++) {
    const net = new g.NeuralNetwork([INPUTS, HIDDEN, OUTPUTS.length], null, rng);
    const inputs = Array.from({ length: INPUTS }, () => (rng() < 0.5 ? -1 : 1));
    for (const out of net.forward(inputs)) assert.ok(out >= 0 && out <= 1 && Number.isFinite(out));
  }
});

test('réseau : copie indépendante et aller-retour JSON', () => {
  const net = new g.NeuralNetwork([3, 4, 2], null, seededRng(1));
  const copy = net.copy();
  copy.layers[0][0][0] += 10;
  assert.notEqual(net.layers[0][0][0], copy.layers[0][0][0]);
  const restored = g.NeuralNetwork.fromJSON(JSON.parse(JSON.stringify(net)));
  same(restored.forward([0.1, -0.4, 0.9]), net.forward([0.1, -0.4, 0.9]));
});

test('réseau : croisement uniforme reproductible, tailles différentes refusées', () => {
  const a = new g.NeuralNetwork([2, 2, 1], null, seededRng(1));
  const b = new g.NeuralNetwork([2, 2, 1], null, seededRng(2));
  same(a.crossover(b, constantRng(0)).layers, a.layers, 'rng < 0.5 : poids du premier parent');
  same(a.crossover(b, constantRng(0.9)).layers, b.layers, 'rng ≥ 0.5 : poids du second parent');
  const mixed = a.crossover(b, seededRng(5)).layers.flat(2);
  const fromA = a.layers.flat(2), fromB = b.layers.flat(2);
  assert.ok(mixed.every((w, i) => w === fromA[i] || w === fromB[i]));
  assert.throws(() => a.crossover(new g.NeuralNetwork([2, 3, 1])), /tailles différentes/);
});

test('réseau : mutation selon le taux, amplitude et bornes ±4', () => {
  const net = new g.NeuralNetwork([2, 1], [[[0, 1, 3.9]]]);
  const unchanged = net.mutate(0, seededRng(1));
  assert.notEqual(unchanged, net);
  same(unchanged.layers, net.layers);
  // rng constant 0.75 : tous les poids mutent de +0.5 × amount
  const shifted = net.mutate(1, constantRng(0.75), 0.4);
  same(shifted.layers[0][0].map(w => Math.round(w * 1e9) / 1e9), [0.2, 1.2, 4]);
  same(net.layers, [[[0, 1, 3.9]]], 'l\'original est intact');
});

// ---------- ADN neuronal ----------

test('ADN neuronal : aléatoire reproductible, gènes bornés, croisement et mutation', () => {
  const a = g.NeuralDNA.random(seededRng(4));
  const b = g.NeuralDNA.random(seededRng(4));
  same(a.brain.layers, b.brain.layers);
  same(a.genes, b.genes);
  same(a.brain.sizes, [INPUTS, HIDDEN, OUTPUTS.length]);
  assert.ok(a instanceof g.DNA);

  const other = g.NeuralDNA.random(seededRng(8));
  const child = a.crossover(other, seededRng(2));
  assert.ok(child instanceof g.NeuralDNA);
  assert.equal(child.generation, 1);
  const mutated = child.mutate(1, seededRng(3));
  assert.ok(mutated instanceof g.NeuralDNA);
  notSame(mutated.brain.layers, child.brain.layers);
  for (const [name, [min, max]] of Object.entries(g.BOT_GENES)) {
    assert.ok(mutated.genes[name] >= min && mutated.genes[name] <= max, name);
  }
  // partenaire classique (sans cerveau) : le cerveau est recopié
  const withClassic = a.crossover(g.DNA.random(seededRng(1)), seededRng(2));
  same(withClassic.brain.layers, a.brain.layers);
  assert.notEqual(withClassic.brain, a.brain);
  // aller-retour JSON
  const restored = g.NeuralDNA.fromJSON(JSON.parse(JSON.stringify(a)));
  same(restored.genes, a.genes);
  same(restored.brain.layers, a.brain.layers);
});

test('ADN neuronal : GenePool crée des ADN neuronaux et amorçage pré-entraîné', () => {
  const pool = new g.GenePool(3, g.NeuralDNA);
  assert.ok(pool.breed(seededRng(1)) instanceof g.NeuralDNA, 'réservoir vide : ADN neuronal aléatoire');
  assert.ok(new g.GenePool(3).breed(seededRng(1)) instanceof g.DNA, 'comportement par défaut inchangé');

  const good = { fitness: 50, dna: g.NeuralDNA.random(seededRng(2)).toJSON() };
  const outdated = { fitness: 90, dna: { genes: good.dna.genes, brain: { sizes: [2, 1], layers: [[[0, 0, 0]]] } } };
  assert.equal(g.seedNeuralPool(pool, { entries: [good, outdated, {}] }), 1);
  assert.equal(pool.entries.length, 1);
  assert.equal(pool.entries[0].fitness, 50);
  assert.ok(pool.entries[0].dna instanceof g.NeuralDNA);
  assert.equal(g.seedNeuralPool(pool, undefined), 0);
  pool.add(g.NeuralDNA.random(seededRng(3)), 10);
  assert.ok(pool.breed(seededRng(4)) instanceof g.NeuralDNA, 'descendant de deux ADN neuronaux');
});

// ---------- bot neuronal ----------

test('bot neuronal : hérite de BotCell et de Vehicle', () => {
  const bot = neuralBot(0, 0, 30);
  assert.ok(bot instanceof g.BotCell && bot instanceof g.Vehicle);
});

test('bot neuronal : proximité inclusive et entrées bornées', () => {
  assert.equal(g.NeuralBotCell.proximity({ distance: 0 }, 100), 1);
  assert.equal(g.NeuralBotCell.proximity({ distance: 100 }, 100), 0);
  assert.equal(g.NeuralBotCell.proximity({ distance: 150 }, 100), 0);
  assert.equal(g.NeuralBotCell.proximity(null, 100), 0);
  assert.ok(near(g.NeuralBotCell.proximity({ distance: 25 }, 100), 0.75));

  const rng = seededRng(11);
  for (let n = 0; n < 30; n++) {
    const bot = neuralBot(1000, 1000, 10 + rng() * 300);
    bot.vel.set(rng() * 4 - 2, rng() * 4 - 2);
    const other = classicBot(1000 + rng() * 400 - 200, 1000 + rng() * 400 - 200, 5 + rng() * 600);
    other.vel.set(rng() * 6 - 3, rng() * 6 - 3);
    const world = fakeWorld({ cells: [bot, other], food: [new g.Food(1000 + rng() * 300, 1000)], poison: [new g.Poison(1000, 1000 + rng() * 300)] });
    bot.think(world, 0.1);
    const inputs = bot.senses();
    assert.equal(inputs.length, INPUTS);
    for (const x of inputs) assert.ok(Number.isFinite(x) && x >= -1 && x <= 1, `entrée hors bornes : ${x}`);
  }
});

test('bot neuronal : vitesse de rapprochement positive si la menace approche, négative si elle s\'éloigne', () => {
  const bot = neuralBot(1000, 1000, 30);
  const radius = bot.perceptionRadius;
  const hunter = classicBot(1000 + bot.detectionRadius + 30, 1000, 300);
  assert.ok(hunter.pos.x - 1000 < radius);
  const world = fakeWorld({ cells: [bot, hunter] });
  hunter.vel.set(-2, 0);
  bot.think(world, 0.1);
  assert.equal(bot.escape.state, 'normal', 'hors du cercle de détection');
  assert.ok(bot.senses()[5] > 0);
  hunter.vel.set(2, 0);
  bot.think(world, 0.1);
  assert.ok(bot.senses()[5] < 0);
  assert.ok(near(bot.senses()[4], 30 / 300));
});

test('bot neuronal : la sortie du réseau choisit entre brouter, chasser et errer', () => {
  const food = new g.Food(1100, 1000);
  const make = biases => {
    const bot = neuralBot(1000, 1000, 60, biases);
    const prey = classicBot(1000, 1120, 20);
    bot.think(fakeWorld({ cells: [bot, prey], food: [food] }), 0.1);
    return bot;
  };
  assert.equal(make({ food: 20 }).decision, 'graze');
  assert.equal(make({ pursue: 20 }).decision, 'hunt');
  assert.equal(make({ wander: 20 }).decision, 'wander');
  const grazer = make({ food: 20 });
  assert.ok(near(grazer.brainWeights.food, g.BOT_BRAIN.scale.food, 1e-6));
  assert.ok(near(grazer.brainWeights.pursue, 0, 1e-6));
  // sans nourriture visible, un fort poids « food » ne peut pas faire brouter
  const blind = neuralBot(1000, 1000, 60, { food: 20 });
  blind.think(fakeWorld({ cells: [blind] }), 0.1);
  assert.equal(blind.decision, 'wander');
});

test('bot neuronal : forces pondérées par le réseau, limitées à maxForce × poids, appliquées par applyForce', () => {
  const bot = neuralBot(1000, 1000, 60, { food: 20, poison: 20, wander: 0 });
  const world = fakeWorld({ cells: [bot], food: [new g.Food(1100, 1000)], poison: [new g.Poison(1000, 1100)] });
  bot.think(world, 0.1);
  bot.steer(bounds, constantRng(0.5));
  const f = bot.lastForces;
  assert.ok(near(f.food.mag(), bot.maxForce * g.BOT_BRAIN.scale.food, 1e-6), 'seek pleine force × poids max');
  assert.ok(f.food.x > 0);
  assert.ok(f.poison.y < 0, 'poids négatif : répulsion du poison');
  assert.ok(f.poison.mag() <= bot.maxForce * g.BOT_BRAIN.scale.poison + 1e-9);
  assert.ok(near(f.wander.mag(), bot.maxForce * 0.5 * g.BOT_BRAIN.scale.wander, 1e-6), 'sigmoïde(0) = 0.5');
  assert.ok(!('pursue' in f) && !('evade' in f) && !('refuge' in f), 'pas de force sans cible perçue');
  assert.ok('avoid' in f && 'walls' in f);
  const sum = sumForces(f);
  assert.ok(near(bot.acc.x, sum.x) && near(bot.acc.y, sum.y), 'accélération = somme des forces appliquées');
  // locomotion héritée : la vitesse reste bornée par maxSpeed
  bot.update();
  assert.ok(bot.vel.mag() <= bot.maxSpeed + 1e-9);
});

test('bot neuronal : prudence apprise, évite un prédateur visible avant la détection', () => {
  const bot = neuralBot(1000, 1000, 40, { evade: 20 });
  const hunter = classicBot(1000 + bot.detectionRadius + 40, 1000, 200);
  bot.think(fakeWorld({ cells: [bot, hunter] }), 0.1);
  assert.equal(bot.escape.state, 'normal');
  assert.equal(bot.visibleThreat.entity, hunter);
  bot.steer(bounds, constantRng(0.5));
  assert.ok(bot.lastForces.evade.x < 0, 'force opposée à la menace');

  const careless = neuralBot(1000, 1000, 40, { evade: -20 });
  careless.think(fakeWorld({ cells: [careless, hunter] }), 0.1);
  careless.steer(bounds, constantRng(0.5));
  assert.ok(careless.lastForces.evade.mag() < 1e-6, 'poids presque nul');
});

test('bot neuronal : la fuite réglementée de BotCell reste prioritaire sur le réseau', () => {
  const bot = neuralBot(1000, 1000, 40, { food: 20, wander: 20 }, { threatWeight: 3 });
  const hunter = classicBot(1000 + bot.detectionRadius, 1000, 200);
  bot.think(fakeWorld({ cells: [bot, hunter], food: [new g.Food(1050, 1000)] }), 0.1);
  assert.equal(bot.escape.state, 'flee', 'seuil de détection inclusif');
  assert.equal(bot.decision, 'flee');
  assert.ok(Object.values(bot.brainWeights).every(w => w === 0));
  bot.steer(bounds, constantRng(0.5));
  assert.ok(!('wander' in bot.lastForces) && !('food' in bot.lastForces));
  assert.ok(bot.lastForces.evade.x < 0);
  assert.ok(near(bot.lastForces.evade.mag(), bot.maxForce * 3, 1e-6), 'poids du gène threatWeight');
  assert.equal(bot.maxSpeed, g.CellMass.maxSpeed(40) * bot.config.flee.sprintSpeed);

  // épuisé : le réseau reprend la main et sait qu'il est épuisé
  bot.escape.state = 'exhausted';
  bot.escape.endurance = 0;
  hunter.pos.set(1000 + bot.detectionRadius + 10, 1000);
  bot.think(fakeWorld({ cells: [bot, hunter], food: [new g.Food(1050, 1000)] }), 0.1);
  assert.equal(bot.escape.state, 'exhausted', 'pas de réarmement avant la distance de sécurité');
  assert.equal(bot.senses()[10], 1);
  assert.notEqual(bot.decision, 'flee');
  assert.equal(bot.maxSpeed, g.CellMass.maxSpeed(40), 'limites normales restaurées');
});

test('bot neuronal : étiquette et réinitialisation de scénario', () => {
  const bot = neuralBot(1000, 1000, 40, { food: 20 });
  bot.think(fakeWorld({ cells: [bot], food: [new g.Food(1050, 1000)] }), 0.1);
  assert.equal(bot.labelSubtitle().text, 'IA · broute');
  bot.resetEscape();
  assert.equal(bot.decision, 'wander');
  assert.equal(bot.escape.state, 'normal');
});

// ---------- cerveaux pré-entraînés ----------

test('cerveaux pré-entraînés : format compatible et amorçage du réservoir neuronal', () => {
  const data = g.PRETRAINED_BOT_BRAINS;
  same(data.inputs, g.BOT_BRAIN.inputs);
  same(data.outputs, g.BOT_BRAIN.outputs);
  assert.ok(data.entries.length > 0);
  const config = g.createAgarConfig();
  const world = new g.World(config, seededRng(1));
  assert.equal(world.neuralPool.entries.length, Math.min(data.entries.length, config.evolution.poolSize));
  assert.ok(world.neuralPool.entries.every(e => e.dna instanceof g.NeuralDNA));
  // les cerveaux restent utilisables : sorties bornées pour des entrées quelconques
  const brain = world.neuralPool.best().dna.brain;
  for (const out of brain.forward(new Array(INPUTS).fill(0.5))) assert.ok(out > 0 && out < 1);
  config.neural.usePretrained = false;
  assert.equal(new g.World(config, seededRng(1)).neuralPool.entries.length, 0, 'option désactivée : réservoir vide');
});

// ---------- évolution en partie ----------

test('réservoir : oubli progressif (decay) des anciens scores ; sans decay, comportement inchangé', () => {
  const forgetful = new g.GenePool(3, g.DNA, 0.5);
  forgetful.add(g.DNA.random(seededRng(1)), 10);
  forgetful.add(g.DNA.random(seededRng(2)), 4);
  same(forgetful.entries.map(e => e.fitness), [5, 4]);
  forgetful.add(g.DNA.random(seededRng(3)), 3);
  same(forgetful.entries.map(e => e.fitness), [3, 2.5, 2]);
  const plain = new g.GenePool(3);
  plain.add(g.DNA.random(seededRng(1)), 10);
  plain.add(g.DNA.random(seededRng(2)), 4);
  same(plain.entries.map(e => e.fitness), [10, 4]);
});

test('amorçage : scores remis à l’échelle (ordre conservé) et oubli suspendu pendant l’amorçage', () => {
  const entry = fitness => ({ fitness, dna: g.NeuralDNA.random(seededRng(fitness)).toJSON() });
  const pool = new g.GenePool(5, g.NeuralDNA, 0.5);
  assert.equal(g.seedNeuralPool(pool, { entries: [entry(400), entry(100), entry(200)] }, 150), 3);
  same(pool.entries.map(e => e.fitness), [150, 75, 37.5]);
  assert.equal(pool.decay, 0.5, 'decay restauré');
  const raw = new g.GenePool(5, g.NeuralDNA, 0.5);
  g.seedNeuralPool(raw, { entries: [entry(400), entry(100)] });
  same(raw.entries.map(e => e.fitness), [400, 100], 'sans échelle : scores d’origine');
});

test('fitness : bonus de survie plafonné à AGE_CAP secondes', () => {
  const bot = new g.BotCell(0, 0, 30, g.DNA.random(constantRng(0.5)), g.createAgarConfig());
  bot.setMass(80);
  bot.tick(100);
  assert.equal(bot.fitness(), 80 + 50);
  bot.tick(10000);
  assert.equal(bot.fitness(), 80 + g.BotCell.AGE_CAP * 0.5, 'au-delà du plafond, seule la masse compte');
});

test('monde : les cerveaux pré-entraînés ne bloquent plus l’évolution de la partie', () => {
  const config = g.createAgarConfig();
  const world = new g.World(config, seededRng(1));
  assert.equal(world.neuralPool.best().fitness, config.evolution.seedFitness, 'meilleur pré-entraîné ramené à seedFitness');
  const worst = world.neuralPool.entries.at(-1).fitness;
  // un bot neuronal ordinaire de la partie, mangé avec une fitness typique
  world.neuralPool.add(g.NeuralDNA.random(seededRng(9)), worst + 1);
  assert.ok(world.neuralPool.entries.some(e => near(e.fitness, worst + 1)), 'il entre dans le réservoir');
  assert.ok(world.neuralPool.entries.every(e => e.fitness <= config.evolution.seedFitness));
});

// ---------- monde ----------

function smallWorld(share, seed = 1, bots = 6) {
  const config = g.createAgarConfig();
  config.counts = { food: 60, poison: 6, viruses: 4, bots, plankton: 12 };
  config.neural.share = share;
  return new g.World(config, seededRng(seed)).init();
}

test('monde : part de bots neuronaux respectée, naissances alternées à 50 %', () => {
  const half = smallWorld(0.5);
  const kinds = half.bots.map(bot => bot instanceof g.NeuralBotCell);
  same(kinds, [false, true, false, true, false, true]);
  assert.equal(smallWorld(0).bots.filter(b => b instanceof g.NeuralBotCell).length, 0);
  assert.equal(smallWorld(1).bots.filter(b => b instanceof g.NeuralBotCell).length, 6);
  const stats = half.stats();
  assert.equal(stats.neural.count, 3);
  assert.equal(stats.rules.count, 3);
  assert.ok(stats.neural.averageMass > 0);
});

test('monde : un bot neuronal mangé nourrit le réservoir neuronal et un bot neuronal le remplace', () => {
  const world = smallWorld(1, 2, 1);
  world.neuralPool.entries = [];
  const player = world.player.cells[0];
  player.setMass(300);
  const victim = world.bots[0];
  victim.setMass(30);
  victim.pos.set(player.pos.x, player.pos.y);
  world.resolveCells();
  assert.equal(world.neuralPool.entries.length, 1);
  assert.equal(world.neuralPool.entries[0].dna, victim.dna);
  assert.equal(world.genePool.entries.length, 0, 'les deux populations ne se mélangent pas');
  assert.ok(world.bots[0] instanceof g.NeuralBotCell);
  assert.notEqual(world.bots[0], victim);
});

test('monde : changer la part neuronale garde la population et agit sur les naissances', () => {
  const world = smallWorld(0, 3, 4);
  const before = [...world.bots];
  world.setNeuralShare(2);
  assert.equal(world.config.neural.share, 1);
  assert.ok(world.bots.length === before.length && world.bots.every((b, i) => b === before[i]), 'aucun bot recréé');
  world.setBotCount(6);
  assert.ok(world.bots.slice(4).every(b => b instanceof g.NeuralBotCell));
  world.setNeuralShare(-1);
  assert.equal(world.config.neural.share, 0);
});

test('monde : 600 images avec 100 % de bots neuronaux, sans NaN, une intégration par image', () => {
  const world = smallWorld(1, 5, 8);
  world.setMode('spectate');
  const valid = new Set(['flee', 'hunt', 'graze', 'wander']);
  for (let i = 0; i < 600; i++) {
    world.update(1 / 60, null);
    for (const bot of world.bots) {
      assert.ok(Number.isFinite(bot.pos.x) && Number.isFinite(bot.pos.y) && Number.isFinite(bot.vel.x));
      assert.ok(valid.has(bot.decision), bot.decision);
      assert.ok(bot.acc.mag() === 0, 'accélération remise à zéro par update()');
    }
  }
  assert.equal(world.bots.length, 8);
  assert.ok(world.bots.every(b => b instanceof g.NeuralBotCell));
});
