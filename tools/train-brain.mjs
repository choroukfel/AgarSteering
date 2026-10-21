// Pré-entraînement des cerveaux des bots neuronaux par neuroévolution, sans navigateur.
//
// Modèle en îles : à chaque époque, plusieurs mondes indépendants (« îles », un par cœur)
// tournent en parallèle avec le vrai World, sur des graines différentes. Dans chaque île,
// bots neuronaux et bots à règles se partagent l'arène ; un bot mangé verse son ADN et sa
// fitness dans le réservoir de sa population et ses descendants le remplacent. En fin
// d'époque, les meilleurs ADN de toutes les îles sont fusionnés et servent de point de
// départ à l'époque suivante. Chaque époque est une nouvelle manche : l'accélération
// progressive repart de 1, si bien que les cerveaux apprennent à toutes les vitesses.
// Les meilleurs ADN neuronaux sont écrits dans brainPretrained.js.
//
//   node tools/train-brain.mjs [--islands=6] [--epochs=8] [--minutes=10] [--seed=7]
//                              [--bots=20] [--continue] [--dry-run]
//
// --continue : repart de brainPretrained.js au lieu de cerveaux aléatoires.
import { writeFileSync, existsSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { load, seededRng } from '../tests/helpers.mjs';

// ---------- île (thread de travail) ----------
function runIsland({ seed, minutes, bots, neural, rules }) {
  const g = load();
  const config = g.createAgarConfig();
  config.counts.bots = bots;
  config.neural.usePretrained = false;
  const world = new g.World(config, seededRng(seed));
  // amorçage des deux réservoirs, sans oubli pendant l'amorçage
  for (const [pool, entries, fromJSON] of [
    [world.neuralPool, neural, data => g.NeuralDNA.fromJSON(data)],
    [world.genePool, rules, data => new g.DNA(data.genes, data.generation ?? 0)],
  ]) {
    const decay = pool.decay;
    pool.decay = 1;
    for (const entry of entries) pool.add(fromJSON(entry.dna), entry.fitness);
    pool.decay = decay;
  }
  world.mode = 'spectate';
  world.init();

  const stats = { eaten: { neural: 0, rules: 0 }, births: 0 };
  const isNeural = bot => bot instanceof g.NeuralBotCell;
  for (let frame = 0; frame < minutes * 3600; frame++) {
    world.update(1 / 60, null);
    for (const event of world.events) {
      if (event.type === 'bot-eaten') stats.eaten[isNeural(event.prey) ? 'neural' : 'rules']++;
    }
  }
  // les survivants comptent aussi (leur bonus de survie est plafonné)
  for (const bot of world.bots) world.poolFor(isNeural(bot)).add(bot.dna, bot.fitness());
  stats.births = world.births;
  const serialize = pool => pool.entries.map(({ dna, fitness }) => ({
    fitness,
    dna: dna instanceof g.NeuralDNA ? dna.toJSON() : { genes: { ...dna.genes }, generation: dna.generation },
  }));
  return { neural: serialize(world.neuralPool), rules: serialize(world.genePool), stats };
}

if (!isMainThread) {
  parentPort.postMessage(runIsland(workerData));
} else {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }));
  const islands = Number(args.islands ?? 6);
  const epochs = Number(args.epochs ?? 8);
  const minutes = Number(args.minutes ?? 10);
  const seed = Number(args.seed ?? 7);
  const bots = Number(args.bots ?? 20);
  const dryRun = args['dry-run'] === 'true';
  const g = load();
  const poolSize = g.createAgarConfig().evolution.poolSize;

  let neural = [];
  let rules = [];
  const pretrainedFile = new URL('../brainPretrained.js', import.meta.url);
  if (args.continue === 'true' && existsSync(pretrainedFile)) {
    neural = g.PRETRAINED_BOT_BRAINS.entries.map(e => ({ fitness: e.fitness, dna: e.dna }));
    console.log(`Reprise de ${neural.length} cerveaux pré-entraînés`);
  }

  const island = data => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: data });
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  // fusion : meilleurs ADN de toutes les îles (tri stable, donc reproductible)
  const merge = lists => lists.flat().sort((a, b) => b.fitness - a.fitness).slice(0, poolSize);
  const started = Date.now();
  const history = [];
  for (let epoch = 1; epoch <= epochs; epoch++) {
    const results = await Promise.all(Array.from({ length: islands }, (_, i) =>
      island({ seed: seed * 1000 + epoch * 100 + i, minutes, bots, neural, rules })));
    neural = merge(results.map(r => r.neural));
    rules = merge(results.map(r => r.rules));
    const eaten = results.reduce((acc, r) => ({ neural: acc.neural + r.stats.eaten.neural, rules: acc.rules + r.stats.eaten.rules }), { neural: 0, rules: 0 });
    const generation = Math.max(...neural.map(e => e.dna.generation ?? 0));
    history.push({ epoch, eaten, generation, best: neural[0]?.fitness ?? 0 });
    console.log(`époque ${epoch}/${epochs} · ${islands} îles × ${minutes} min · mangés : 🧠 ${eaten.neural} / règles ${eaten.rules}`
      + ` · génération max ${generation} · meilleure fitness 🧠 ${(neural[0]?.fitness ?? 0).toFixed(1)}`
      + ` · ${((Date.now() - started) / 60000).toFixed(1)} min`);
  }

  const round = x => Math.round(x * 1e4) / 1e4;
  const entries = neural.map(({ dna, fitness }) => ({
    fitness: round(fitness),
    dna: {
      genes: Object.fromEntries(Object.entries(dna.genes).map(([k, v]) => [k, round(v)])),
      generation: dna.generation,
      brain: { sizes: dna.brain.sizes, layers: dna.brain.layers.map(layer => layer.map(row => row.map(round))) },
    },
  }));
  const payload = {
    inputs: g.BOT_BRAIN.inputs, outputs: g.BOT_BRAIN.outputs,
    training: { islands, epochs, minutes, seed, bots, simulatedMinutes: islands * epochs * minutes },
    entries,
  };
  if (dryRun) {
    console.log(`(dry-run) ${entries.length} ADN neuronaux non écrits`);
  } else {
    writeFileSync(pretrainedFile, `// Généré par tools/train-brain.mjs (${islands} îles × ${epochs} époques × ${minutes} min, graine ${seed}) : ne pas modifier à la main.\n`
      + '// Meilleurs ADN neuronaux (gènes + poids du réseau), utilisés pour amorcer World.neuralPool.\n'
      + `const PRETRAINED_BOT_BRAINS = ${JSON.stringify(payload)};\n`);
    console.log(`${entries.length} ADN neuronaux écrits dans brainPretrained.js (générations ${entries.map(e => e.dna.generation).join(', ')})`);
  }
}
