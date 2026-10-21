// Évaluation reproductible des bots neuronaux, sur des parties jamais vues à l'entraînement.
//
// Chaque partie : le vrai World en mode spectateur, 20 bots dont 10 neuronaux et 10 à règles,
// accélération progressive et évolution en partie actives, comme dans le jeu. On compare
// trois conditions pour les bots neuronaux, toujours face aux mêmes bots à règles :
//   trained  : cerveaux pré-entraînés (brainPretrained.js) ;
//   random   : cerveaux aléatoires (aucun pré-entraînement) ;
//   constant : cerveaux pré-entraînés figés à leurs poids moyens — le bot ne réagit plus à
//              ce qu'il perçoit (ablation : mesure ce qu'apporte la perception du réseau).
// Résultat : moyenne ± écart-type sur les graines, écrit dans EVALUATION.md.
//
//   node tools/evaluate-brain.mjs [--seeds=6] [--minutes=8] [--first-seed=9001] [--workers=6]
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { load, seededRng } from '../tests/helpers.mjs';

function runGame({ condition, seed, minutes, mean }) {
  const g = load();
  const config = g.createAgarConfig();
  config.counts.bots = 20;
  config.neural.share = 0.5;
  config.neural.usePretrained = condition !== 'random';
  const sums = Object.fromEntries(g.BOT_BRAIN.outputs.map(name => [name, 0]));
  let decisions = 0;
  const think = g.NeuralBotCell.prototype.think;
  if (condition === 'trained') {
    // relevé des poids réellement choisis, pour la condition « constant »
    g.NeuralBotCell.prototype.think = function (world, dt) {
      const transition = think.call(this, world, dt);
      if (this.decision !== 'flee') {
        for (const name of g.BOT_BRAIN.outputs) sums[name] += this.brainWeights[name];
        decisions++;
      }
      return transition;
    };
  } else if (condition === 'constant') {
    const botThink = g.BotCell.prototype.think;
    g.NeuralBotCell.prototype.think = function (world, dt) {
      const transition = botThink.call(this, world, dt);
      this.visibleThreat = g.nearestWithin(this, this.perception.threats, this.perceptionRadius);
      if (this.decision === 'flee') {
        this.brainWeights = g.NeuralBotCell.zeroWeights();
        return transition;
      }
      this.brainWeights = { ...mean };
      this.decision = g.NeuralBotCell.dominantDecision(this.brainWeights, this.perception);
      return transition;
    };
  }
  const world = new g.World(config, seededRng(seed));
  world.mode = 'spectate';
  world.init();
  const kind = bot => (bot instanceof g.NeuralBotCell ? 'neural' : 'rules');
  const eaten = { neural: 0, rules: 0 };
  for (let frame = 0; frame < minutes * 3600; frame++) {
    world.update(1 / 60, null);
    for (const event of world.events) if (event.type === 'bot-eaten') eaten[kind(event.prey)]++;
  }
  const mass = { neural: [], rules: [] };
  for (const bot of world.bots) mass[kind(bot)].push(bot.mass);
  const average = list => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  return { condition, seed, eaten, mass: { neural: average(mass.neural), rules: average(mass.rules) }, sums, decisions };
}

if (!isMainThread) {
  parentPort.postMessage(runGame(workerData));
} else {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }));
  const seedCount = Number(args.seeds ?? 6);
  const minutes = Number(args.minutes ?? 8);
  const firstSeed = Number(args['first-seed'] ?? 9001);
  const workers = Number(args.workers ?? Math.max(1, availableParallelism() - 2));
  const seeds = Array.from({ length: seedCount }, (_, i) => firstSeed + i);

  const runJobs = async jobs => {
    const results = [];
    let next = 0;
    const lane = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        results.push(await new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: job });
          worker.once('message', resolve);
          worker.once('error', reject);
        }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, lane));
    return results.sort((a, b) => a.seed - b.seed);
  };

  const started = Date.now();
  const trained = await runJobs(seeds.map(seed => ({ condition: 'trained', seed, minutes })));
  const total = trained.reduce((acc, r) => acc + r.decisions, 0);
  const mean = Object.fromEntries(Object.keys(trained[0].sums).map(name =>
    [name, trained.reduce((acc, r) => acc + r.sums[name], 0) / Math.max(1, total)]));
  const others = await runJobs(seeds.flatMap(seed => [
    { condition: 'random', seed, minutes },
    { condition: 'constant', seed, minutes, mean },
  ]));
  const results = [...trained, ...others];

  const stat = values => {
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, values.length - 1));
    return { m, sd, text: `${m.toFixed(1)} ± ${sd.toFixed(1)}` };
  };
  const labels = { trained: 'entraînés', random: 'aléatoires', constant: 'entraînés figés (poids constants)' };
  const rows = ['trained', 'random', 'constant'].map(condition => {
    const list = results.filter(r => r.condition === condition);
    return {
      condition,
      neuralEaten: stat(list.map(r => r.eaten.neural)),
      rulesEaten: stat(list.map(r => r.eaten.rules)),
      neuralMass: stat(list.map(r => r.mass.neural)),
      rulesMass: stat(list.map(r => r.mass.rules)),
    };
  });
  const table = [
    '| Cerveaux des bots 🧠 | Bots 🧠 mangés | Bots à règles mangés | Masse finale moyenne 🧠 | Masse finale moyenne règles |',
    '|---|---|---|---|---|',
    ...rows.map(r => `| ${labels[r.condition]} | ${r.neuralEaten.text} | ${r.rulesEaten.text} | ${r.neuralMass.text} | ${r.rulesMass.text} |`),
  ].join('\n');
  const meanText = Object.entries(mean).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
  const report = `# Évaluation des bots neuronaux (Agario)

Généré par \`node tools/evaluate-brain.mjs --seeds=${seedCount} --minutes=${minutes} --first-seed=${firstSeed}\`.

${seedCount} parties inédites (graines ${seeds[0]} à ${seeds.at(-1)}) de ${minutes} min simulées chacune : 20 bots,
dont 10 neuronaux et 10 à règles, accélération progressive et évolution en partie actives, comme dans le jeu.
Valeurs : moyenne ± écart-type sur les parties. « Mangés » : nombre de bots de la population mangés pendant la partie
(moins = meilleure survie).

${table}

Poids moyens des bots entraînés hors fuite (utilisés par la condition « figés ») : ${meanText}.
`;
  writeFileSync(new URL('../EVALUATION.md', import.meta.url), report);
  console.log(table);
  console.log(`\nÉvaluation en ${((Date.now() - started) / 60000).toFixed(1)} min — écrite dans EVALUATION.md`);
}
