import test from 'node:test';
import assert from 'node:assert/strict';
import { load, v, body, near, constantRng, seededRng } from './helpers.mjs';

const g = load();
const bounds = { x: 0, y: 0, width: 3000, height: 3000, margin: 80 };

const owner = (x = 0, y = 0) => body(x, y);
const threatAt = x => body(x, 0);

test('fuite : seuil de détection inclusif et prédateur le plus proche', () => {
  const escape = new g.EscapeState({ maxDuration: 2, regenRate: 0 });
  assert.equal(escape.update(0.5, owner(), [threatAt(101)], 100, 200), null);
  assert.equal(escape.state, 'normal');
  const far = threatAt(300);
  const close = threatAt(100);
  assert.equal(escape.update(0.5, owner(), [far, close], 100, 200), 'start');
  assert.equal(escape.state, 'flee');
  assert.equal(escape.threat, close);
  assert.equal(escape.threatDistance, 100);
});

test('fuite : continue entre détection et sortie, sortie inclusive à la distance de sécurité', () => {
  const escape = new g.EscapeState({ maxDuration: 10 });
  escape.update(0.25, owner(), [threatAt(50)], 100, 200);
  // hors du cercle de détection mais pas encore à la distance de sécurité
  assert.equal(escape.update(0.25, owner(), [threatAt(150)], 100, 200), null);
  assert.equal(escape.state, 'flee');
  assert.equal(escape.update(0.25, owner(), [threatAt(199.99)], 100, 200), null);
  assert.equal(escape.update(0.25, owner(), [threatAt(200)], 100, 200), 'safe');
  assert.equal(escape.state, 'normal');
  // menace mangée pendant la fuite : plus de menace, donc sortie
  escape.update(0.25, owner(), [threatAt(50)], 100, 200);
  assert.equal(escape.update(0.25, owner(), [], 100, 200), 'safe');
});

test('fuite : durée exacte, endurance décroissante, épuisement puis réarmement en sécurité', () => {
  const escape = new g.EscapeState({ maxDuration: 2, regenRate: 0.5 });
  const threats = [threatAt(50)];
  escape.update(0.25, owner(), threats, 100, 200);
  const endurances = [];
  for (let i = 0; i < 7; i++) {
    assert.equal(escape.update(0.25, owner(), threats, 100, 200), null);
    endurances.push(escape.endurance);
  }
  assert.ok(endurances.every((e, i) => i === 0 || e < endurances[i - 1]));
  assert.equal(escape.endurance, 0.125);
  // 8 × 0.25 s = 2 s exactement : épuisement
  assert.equal(escape.update(0.25, owner(), threats, 100, 200), 'exhausted');
  assert.equal(escape.endurance, 0);
  // pas de réarmement à l'image suivante, même hors du cercle de détection
  assert.equal(escape.update(0.25, owner(), [threatAt(150)], 100, 200), null);
  assert.equal(escape.state, 'exhausted');
  assert.equal(escape.endurance, 0, 'pas de régénération pendant l\'épuisement');
  assert.equal(escape.update(0.25, owner(), [threatAt(200)], 100, 200), 'rearmed');
  assert.equal(escape.state, 'normal');
  // en état normal, l'endurance se régénère ; une nouvelle fuite dure endurance × maxDuration
  escape.update(1, owner(), [threatAt(500)], 100, 200);
  assert.equal(escape.endurance, 0.5);
  assert.equal(escape.update(0, owner(), threats, 100, 200), 'start');
  assert.equal(escape.update(0.5, owner(), threats, 100, 200), null);
  assert.equal(escape.update(0.5, owner(), threats, 100, 200), 'exhausted');
});

function makeBot(x, y, mass, genes = {}) {
  const config = g.createAgarConfig();
  const dna = new g.DNA({ ...g.DNA.random(constantRng(0.5)).genes, ...genes });
  return new g.BotCell(x, y, mass, dna, config);
}

// monde minimal fournissant la perception
function fakeWorld({ cells = [], food = [], poison = [], viruses = [], extraPrey = [] } = {}) {
  return {
    food, poison, viruses,
    cells: () => cells,
    preyCandidates: () => [...cells, ...extraPrey],
  };
}

test('bot : priorités fuite > chasse > nourriture > errance', () => {
  const p = { prey: {}, food: {} };
  assert.equal(g.BotCell.decide('flee', p), 'flee');
  assert.equal(g.BotCell.decide('normal', p), 'hunt');
  assert.equal(g.BotCell.decide('exhausted', p), 'hunt');
  assert.equal(g.BotCell.decide('normal', { prey: null, food: {} }), 'graze');
  assert.equal(g.BotCell.decide('normal', { prey: null, food: null }), 'wander');
});

test('bot : perception limitée au rayon, menaces et proies selon le rapport de masse', () => {
  const bot = makeBot(1000, 1000, 40, { perception: 200 });
  const big = makeBot(1000 + bot.detectionRadius, 1000, 100);
  const equal = makeBot(1100, 1000, 40);
  const prey = makeBot(1000, 1000 + bot.perceptionRadius, 10);
  const farPrey = makeBot(1000, 1000 + bot.perceptionRadius + 1, 10);
  const world = fakeWorld({ cells: [bot, big, equal, prey, farPrey], food: [new g.Food(1050, 1000)] });
  const p = bot.perceive(world);
  assert.equal(p.threats.length, 1);
  assert.equal(p.threats[0], big);
  assert.equal(p.prey.entity, prey);
  assert.equal(p.food.distance, 50);

  bot.think(world, 0.1);
  assert.equal(bot.escape.state, 'flee');
  assert.equal(bot.decision, 'flee');
});

test('bot : sprint pendant la fuite puis restauration exacte des limites normales', () => {
  const bot = makeBot(1000, 1000, 40, { detection: 100, safetyMargin: 100 });
  const normalSpeed = g.CellMass.maxSpeed(40);
  const normalForce = g.CellMass.maxForce(40);
  const hunter = makeBot(1000 + bot.detectionRadius, 1000, 200);
  const world = fakeWorld({ cells: [bot, hunter] });
  bot.think(world, 0.1);
  assert.equal(bot.maxSpeed, normalSpeed * bot.config.flee.sprintSpeed);
  assert.equal(bot.maxForce, normalForce * bot.config.flee.sprintForce);
  // manger pendant la fuite garde le sprint (limites recalculées depuis la nouvelle masse)
  bot.setMass(41);
  assert.equal(bot.maxSpeed, g.CellMass.maxSpeed(41) * bot.config.flee.sprintSpeed);
  bot.setMass(40);
  hunter.pos.set(1000 + bot.exitDistance + 1e-6, 1000);
  assert.equal(bot.think(world, 0.1), 'safe');
  assert.equal(bot.maxSpeed, normalSpeed);
  assert.equal(bot.maxForce, normalForce);

  // épuisement : limites normales aussi
  hunter.pos.set(1050, 1000);
  bot.think(world, 0.1);
  bot.escape.maxDuration = 0.1;
  for (let i = 0; i < 30 && bot.escape.state === 'flee'; i++) bot.think(world, 0.1);
  assert.equal(bot.escape.state, 'exhausted');
  assert.equal(bot.maxSpeed, normalSpeed);
  assert.notEqual(bot.decision, 'flee');
});

test('bot : forces selon la décision, poids issus de l\'ADN, poison attractif ou répulsif', () => {
  const genes = { foodWeight: 2, poisonWeight: -1.5, preyWeight: 1.2, threatWeight: 3 };
  const bot = makeBot(1000, 1000, 40, genes);
  const world = fakeWorld({ food: [new g.Food(1100, 1000)], poison: [new g.Poison(1000, 1100)] });
  bot.think(world, 0.1);
  assert.equal(bot.decision, 'graze');
  bot.steer(bounds, constantRng(0.5));
  assert.ok(near(bot.lastForces.food.mag(), bot.maxForce * 2));
  assert.ok(bot.lastForces.poison.y < 0, 'poids négatif : répulsion');
  assert.equal(bot.lastForces.walls.mag(), 0);
  const sum = Object.values(bot.lastForces).reduce((acc, f) => acc.add(f), v(0, 0));
  assert.ok(near(bot.acc.x, sum.x) && near(bot.acc.y, sum.y));

  const greedy = makeBot(1000, 1000, 40, { poisonWeight: 0.5 });
  greedy.think(fakeWorld({ poison: [new g.Poison(1000, 1100)] }), 0.1);
  greedy.steer(bounds, constantRng(0.5));
  assert.ok(greedy.lastForces.poison.y > 0, 'poids positif : attraction');
  assert.equal(greedy.decision, 'wander');
  assert.ok('wander' in greedy.lastForces);

  const hunter = makeBot(1000, 1000, 60, genes);
  const prey = makeBot(1100, 1000, 20);
  prey.vel.set(0, 2);
  hunter.think(fakeWorld({ cells: [hunter, prey] }), 0.1);
  hunter.steer(bounds, constantRng(0.5));
  assert.equal(hunter.decision, 'hunt');
  assert.ok(hunter.lastForces.pursue.y > 0, 'anticipe la position future');
});

test('bot : en fuite, évite la menace, rejoint un virus refuge et contourne les virus dangereux', () => {
  const bot = makeBot(1000, 1000, 40, { threatWeight: 2, refuge: 1 });
  const hunter = makeBot(1100, 1000, 200);
  const refuge = new g.Virus(900, 1150, 100);
  const world = fakeWorld({ cells: [bot, hunter], viruses: [refuge] });
  bot.think(world, 0.1);
  bot.steer(bounds, constantRng(0.5));
  assert.equal(bot.decision, 'flee');
  assert.ok(bot.lastForces.evade.x < 0);
  assert.ok(bot.lastForces.refuge.y > 0);
  assert.equal(bot.perception.obstacles.length, 0, 'un virus plus lourd n\'est pas dangereux');

  const big = makeBot(1000, 1000, 200);
  big.vel.set(3, 0);
  const virus = new g.Virus(1060, 1010, 100);
  big.think(fakeWorld({ cells: [big], viruses: [virus] }), 0.1);
  assert.equal(big.perception.obstacles[0], virus);
  big.steer(bounds, constantRng(0.5));
  assert.ok(big.lastForces.avoid.y < 0);
  assert.equal(big.avoidTrace.obstacle, virus);
});

test('bot : réinitialisation de scénario sans recréer l\'instance', () => {
  const bot = makeBot(1000, 1000, 40);
  const hunter = makeBot(1050, 1000, 200);
  bot.think(fakeWorld({ cells: [bot, hunter] }), 0.1);
  assert.equal(bot.escape.state, 'flee');
  bot.resetEscape();
  assert.equal(bot.escape.state, 'normal');
  assert.equal(bot.escape.endurance, 1);
  assert.equal(bot.escape.threat, null);
  assert.equal(bot.maxSpeed, g.CellMass.maxSpeed(40));
});

test('bot : fitness = masse maximale + temps de survie', () => {
  const bot = makeBot(0, 0, 30);
  bot.setMass(80);
  bot.tick(4);
  bot.setMass(50);
  assert.equal(bot.peakMass, 80);
  assert.equal(bot.fitness(), 82);
});

test('bot : wander reproductible avec un aléa injecté', () => {
  const a = makeBot(1000, 1000, 30);
  const b = makeBot(1000, 1000, 30);
  a.vel.set(1, 0);
  b.vel.set(1, 0);
  const ra = seededRng(9);
  const rb = seededRng(9);
  for (let i = 0; i < 20; i++) {
    a.think(fakeWorld(), 0.016); a.steer(bounds, ra); a.update();
    b.think(fakeWorld(), 0.016); b.steer(bounds, rb); b.update();
  }
  assert.deepEqual([a.pos.x, a.pos.y], [b.pos.x, b.pos.y]);
});
