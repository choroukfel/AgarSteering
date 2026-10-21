import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, near, seededRng } from './helpers.mjs';

const g = load();

function smallWorld(seed = 1, tempo = { ratePerMinute: 0.05, max: 1.5 }) {
  const config = g.createAgarConfig();
  config.counts = { food: 60, poison: 6, viruses: 4, bots: 4, plankton: 8 };
  config.tempo = tempo;
  return new g.World(config, seededRng(seed)).init();
}

// avance l'horloge de la manche sans simuler chaque image
function ageRound(world, seconds) {
  world.roundStartTime = world.time - seconds;
}

test('tempo : 1 au départ, croissance linéaire par minute, plafond inclusif', () => {
  const rule = { ratePerMinute: 0.05, max: 1.5 };
  assert.equal(g.World.tempoAt(0, rule), 1);
  assert.ok(near(g.World.tempoAt(60, rule), 1.05));
  assert.ok(near(g.World.tempoAt(300, rule), 1.25));
  assert.equal(g.World.tempoAt(600, rule), 1.5, 'plafond atteint à 10 min');
  assert.equal(g.World.tempoAt(6000, rule), 1.5);
  assert.equal(g.World.tempoAt(-5, rule), 1, 'temps négatif ignoré');
  assert.equal(g.World.tempoAt(600, { ratePerMinute: 0, max: 1.5 }), 1, 'accélération désactivée');
  assert.equal(g.World.tempoAt(600, { ratePerMinute: 0.1, max: 0.5 }), 1, 'jamais de ralentissement');
  // de plus en plus rapide : strictement croissant avant le plafond
  const values = [0, 30, 60, 120, 240, 480].map(s => g.World.tempoAt(s, rule));
  assert.ok(values.every((v, i) => i === 0 || v > values[i - 1]));
});

test('tempo : chaque manche repart de 1 (nouvelle vie, changement de mode)', () => {
  const world = smallWorld();
  for (let i = 0; i < 120; i++) world.update(1 / 60, null);
  assert.ok(near(world.roundTime(), 2, 1e-9));
  assert.ok(world.tempo() > 1);
  world.spawnPlayer();
  assert.equal(world.roundTime(), 0);
  assert.equal(world.tempo(), 1);
  ageRound(world, 90);
  world.setMode('spectate');
  assert.equal(world.tempo(), 1);
});

test('tempo : limites normales × tempo pour cellules, bots, serpent, anneaux et plancton', () => {
  const world = smallWorld(2);
  ageRound(world, 120); // tempo 1.1
  world.update(1 / 60, null);
  const tempo = world.tempo();
  assert.ok(near(tempo, 1.1, 1e-3));
  for (const bot of world.bots) {
    if (bot.escape.state === 'flee' || bot.launch) continue;
    assert.ok(near(bot.maxSpeed, g.CellMass.maxSpeed(bot.mass) * bot.tempo), bot.name);
    assert.ok(near(bot.maxForce, g.CellMass.maxForce(bot.mass) * bot.tempo), bot.name);
  }
  const head = world.snake;
  assert.ok(near(head.maxSpeed, g.CellMass.maxSpeed(head.mass) * 1.3 * head.tempo));
  assert.ok(world.snakeSegments.length > 0);
  for (const segment of world.snakeSegments) assert.ok(near(segment.maxSpeed, 8 * tempo) && near(segment.maxForce, 1.2 * tempo));
  for (const boid of world.plankton) assert.ok(near(boid.maxSpeed, 3 * tempo) && near(boid.maxForce, 0.12 * tempo));
  const player = world.player.cells[0];
  assert.ok(near(player.maxSpeed, g.CellMass.maxSpeed(player.mass) * player.tempo));
});

test('tempo : le sprint de fuite s’ajoute au tempo, puis les limites normales × tempo sont restaurées exactement', () => {
  const config = g.createAgarConfig();
  const dna = g.DNA.random(() => 0.5);
  const bot = new g.BotCell(1000, 1000, 40, dna, config);
  bot.setTempo(1.2);
  const normalSpeed = g.CellMass.maxSpeed(40) * 1.2;
  const normalForce = g.CellMass.maxForce(40) * 1.2;
  assert.ok(near(bot.maxSpeed, normalSpeed));
  const hunter = new g.BotCell(1000 + bot.detectionRadius, 1000, 200, dna, config);
  const world = { food: [], poison: [], viruses: [], cells: () => [bot, hunter], preyCandidates: () => [bot, hunter] };
  bot.think(world, 0.1);
  assert.equal(bot.escape.state, 'flee');
  assert.ok(near(bot.maxSpeed, normalSpeed * config.flee.sprintSpeed));
  assert.ok(near(bot.maxForce, normalForce * config.flee.sprintForce));
  hunter.pos.set(1000 + bot.exitDistance + 1, 1000);
  assert.equal(bot.think(world, 0.1), 'safe');
  assert.equal(bot.maxSpeed, normalSpeed);
  assert.equal(bot.maxForce, normalForce);
});

test('tempo : accélération désactivée, 900 images sans NaN et vitesses inchangées', () => {
  const world = smallWorld(4, { ratePerMinute: 0, max: 1.5 });
  for (let i = 0; i < 900; i++) world.update(1 / 60, null);
  assert.equal(world.tempo(), 1);
  for (const bot of world.bots) {
    assert.ok(Number.isFinite(bot.pos.x) && Number.isFinite(bot.vel.x));
    if (!bot.launch && bot.escape.state !== 'flee') assert.ok(near(bot.maxSpeed, g.CellMass.maxSpeed(bot.mass)));
  }
});

test('tempo : les vitesses montent jusqu’au plafond sans NaN (30 %/min, 110 s)', () => {
  const world = smallWorld(5, { ratePerMinute: 0.3, max: 1.5 });
  world.setMode('spectate');
  const tempos = [];
  for (let i = 0; i < 6600; i++) { // 110 s : plafond atteint à 100 s
    world.update(1 / 60, null);
    if (i % 600 === 0) tempos.push(world.tempo());
  }
  assert.equal(world.tempo(), 1.5);
  assert.ok(tempos.every((t, i) => i === 0 || t >= tempos[i - 1]), 'tempo croissant');
  // au plafond : limites normales × 1,5 pour les bots (hors fuite et impulsion)
  // et pour les anneaux du serpent, toujours présents dans la scène
  const bots = world.bots.filter(bot => !bot.launch && bot.escape.state !== 'flee');
  assert.ok(bots.length > 0);
  for (const bot of bots) assert.ok(near(bot.maxSpeed, g.CellMass.maxSpeed(bot.mass) * 1.5), `${bot.name} au plafond`);
  for (const segment of world.snakeSegments) assert.ok(near(segment.maxSpeed, 8 * 1.5), 'anneau au plafond');
  for (const entity of world.movingEntities()) assert.ok(Number.isFinite(entity.pos.x) && Number.isFinite(entity.vel.y));
  assert.equal(world.stats().tempo, 1.5);
});

test('tempo : curseur « Accélération » dans les réglages et vitesse affichée', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sketch = readFileSync(new URL('../sketch.js', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('../hud.js', import.meta.url), 'utf8');
  assert.ok(html.includes('id="tempo-rate"') && html.includes('id="tempo-rate-value"'));
  assert.match(sketch, /bindSlider\(byId\('tempo-rate'\)[\s\S]*?world\.config\.tempo\.ratePerMinute = v/);
  assert.match(hud, /vitesse ×\$\{world\.tempo\(\)\.toFixed\(2\)\}/);
});
