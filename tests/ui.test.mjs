import test from 'node:test';
import assert from 'node:assert/strict';
import { load, constantRng, seededRng } from './helpers.mjs';

const g = load();

test('thème : conversion hexadécimale et nuances vers le noir ou le blanc', () => {
  const rgb = g.AgarTheme.hexToRgb('#29b6f6');
  assert.deepEqual([rgb.r, rgb.g, rgb.b], [41, 182, 246]);
  const short = g.AgarTheme.hexToRgb('#fa0');
  assert.deepEqual([short.r, short.g, short.b], [255, 170, 0]);
  assert.equal(g.AgarTheme.hexToRgb('red'), null);
  assert.equal(g.AgarTheme.shade('#808080', -0.5), '#404040');
  assert.equal(g.AgarTheme.shade('#808080', 0.5), '#c0c0c0');
  assert.equal(g.AgarTheme.shade('#123456', 0), '#123456');
  assert.equal(g.AgarTheme.shade('#ffffff', -1), '#000000');
  assert.equal(g.AgarTheme.shade('#000000', 2), '#ffffff', 'amount borné à 1');
  assert.equal(g.AgarTheme.shade('rgb(1,2,3)', -0.3), 'rgb(1,2,3)');
});

test('thème : opacité et ondulation bornée de la membrane', () => {
  assert.equal(g.AgarTheme.alpha('#22d3ee', 1), '#22d3eeff');
  assert.equal(g.AgarTheme.alpha('#22d3ee', 0), '#22d3ee00');
  assert.equal(g.AgarTheme.alpha('#fff', 0.5), '#ffffff80');
  assert.equal(g.AgarTheme.alpha('#000000', 3), '#000000ff', 'opacité bornée');
  assert.equal(g.AgarTheme.alpha('blue', 0.5), 'blue');

  for (let i = 0; i < 200; i++) {
    const angle = i * 0.37;
    const radius = g.AgarTheme.membraneRadius(100, angle, i * 0.11, 1.3);
    assert.ok(radius >= 94.5 - 1e-9 && radius <= 105.5 + 1e-9);
  }
  // fermée : même rayon à 0 et 2π
  const a = g.AgarTheme.membraneRadius(50, 0, 3, 2);
  const b = g.AgarTheme.membraneRadius(50, Math.PI * 2, 3, 2);
  assert.ok(Math.abs(a - b) < 1e-9);
  // deux cellules de phases différentes n'ondulent pas à l'unisson
  assert.notEqual(g.AgarTheme.membraneRadius(50, 1, 0, 0), g.AgarTheme.membraneRadius(50, 1, 0, 2));

});

test('cellules : teintes dérivées de la couleur, mises en cache et recalculées si elle change', () => {
  const cell = new g.Cell(0, 0, 20, '#808080');
  const first = cell.palette();
  assert.equal(first.membrane, g.AgarTheme.shade('#808080', 0.25));
  assert.equal(first.halo, g.AgarTheme.alpha('#808080', 0.13));
  assert.equal(cell.palette(), first, 'cache');
  cell.color = '#ffffff';
  assert.equal(cell.palette().body, g.AgarTheme.alpha('#ffffff', 0.42));
  assert.equal(cell.labelSubtitle(), null);
  const player = new g.PlayerCell(0, 0, 41.6);
  assert.equal(player.labelSubtitle().text, '42');
  const bot = new g.BotCell(0, 0, 20, g.DNA.random(constantRng(0.5)), g.createAgarConfig());
  bot.decision = 'hunt';
  assert.equal(bot.labelSubtitle().text, 'chasse');
  bot.escape.state = 'exhausted';
  assert.equal(bot.displayState(), 'exhausted');
  assert.equal(bot.labelSubtitle().text, 'épuisé');
});

test('pseudo : espaces regroupés, 15 caractères maximum, valeur par défaut', () => {
  assert.equal(g.AgarUi.sanitizeName('  Super   Cellule  '), 'Super Cellule');
  assert.equal(g.AgarUi.sanitizeName('abcdefghijklmnopqrst'), 'abcdefghijklmno');
  assert.equal(g.AgarUi.sanitizeName('   '), 'Vous');
  assert.equal(g.AgarUi.sanitizeName(null, 'Anonyme'), 'Anonyme');
  assert.equal(g.AgarUi.sanitizeName('<b>x</b>'), '<b>x</b>', 'texte brut, affiché via textContent et le canvas');
});

test('durée : format m:ss', () => {
  assert.equal(g.AgarUi.formatDuration(0), '0:00');
  assert.equal(g.AgarUi.formatDuration(59.9), '0:59');
  assert.equal(g.AgarUi.formatDuration(61), '1:01');
  assert.equal(g.AgarUi.formatDuration(-5), '0:00');
  assert.equal(g.AgarUi.formatDuration(3725), '62:05');
});

test('messages : seuls les événements qui concernent le joueur sont notifiés', () => {
  const config = g.createAgarConfig();
  const me = { team: 'player', name: 'Vous' };
  const bot = { team: 'bot-1', name: 'Reynolds' };
  const snake = { team: 'snake', name: 'Serpent' };
  const msg = event => g.AgarUi.messageForEvent(event, config);
  assert.equal(msg({ type: 'bot-eaten', prey: bot, by: me }).tone, 'good');
  assert.equal(msg({ type: 'bot-eaten', prey: bot, by: snake }).text, 'Le serpent a avalé Reynolds');
  assert.equal(msg({ type: 'bot-eaten', prey: bot, by: { team: 'bot-2', name: 'X' } }), null);
  assert.equal(msg({ type: 'player-dead', by: bot }).text, 'Reynolds vous a mangé…');
  assert.equal(msg({ type: 'snake-eaten', by: me }).tone, 'good');
  assert.equal(msg({ type: 'snake-eaten', by: bot }).tone, 'info');
  assert.equal(msg({ type: 'virus-pop', cell: me }).tone, 'bad');
  assert.equal(msg({ type: 'virus-pop', cell: bot }), null);
  assert.equal(msg({ type: 'poison', cell: me }).text, 'Poison : −15 % de masse');
  assert.equal(msg({ type: 'poison', cell: bot }), null);
  assert.equal(msg({ type: 'flee-start', bot }), null);
});

test('notifications : anti-répétition, durée de vie et nombre maximal', () => {
  const queue = new g.ToastQueue({ duration: 3, cooldown: 1.5, max: 2 });
  assert.equal(queue.push('A', 'good', 0), true);
  assert.equal(queue.push('A', 'good', 1), false, 'même texte trop tôt');
  assert.equal(queue.push('A', 'good', 1.5), true);
  queue.push('B', 'bad', 1.6);
  assert.deepEqual([...queue.active(1.6).map(t => t.text)], ['A', 'B'], 'au plus 2 à la fois');
  assert.deepEqual([...queue.active(4.5).map(t => t.text)], ['B']);
  assert.equal(queue.active(4.6).length, 0);
  const ids = new Set();
  for (let i = 0; i < 5; i++) { queue.push(`m${i}`, 'info', 10); }
  for (const item of queue.active(10)) ids.add(item.id);
  assert.equal(ids.size, 2);
});

test('préférences : lecture, écriture et stockage indisponible sans erreur', () => {
  const colors = g.AgarTheme.PLAYER_COLORS;
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, value) => { data[k] = value; } };
  assert.equal(g.AgarControls.loadPrefs(storage, colors).color, colors[0]);
  assert.equal(g.AgarControls.savePrefs(storage, { name: 'Omar', color: colors[2] }), true);
  const prefs = g.AgarControls.loadPrefs(storage, colors);
  assert.deepEqual([prefs.name, prefs.color], ['Omar', colors[2]]);
  data[g.AgarControls.PREFS_KEY] = JSON.stringify({ name: 42, color: '#000000' });
  const invalid = g.AgarControls.loadPrefs(storage, colors);
  assert.deepEqual([invalid.name, invalid.color], ['', colors[0]]);
  data[g.AgarControls.PREFS_KEY] = '{oops';
  assert.equal(g.AgarControls.loadPrefs(storage, colors).color, colors[0]);
  const blocked = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
  assert.equal(g.AgarControls.loadPrefs(blocked, colors).name, '');
  assert.equal(g.AgarControls.savePrefs(blocked, {}), false);
  assert.equal(g.AgarControls.loadPrefs(null, colors).color, colors[0]);
  assert.equal(g.AgarControls.savePrefs(null, {}), false);
});

test('clavier : Échap ouvre ou ferme le menu, sauf dans un champ', () => {
  assert.equal(g.AgarControls.actionForKey('Escape', null), 'menu');
  assert.equal(g.AgarControls.actionForKey('Escape', { matches: () => true }), null);
});

test('statistiques de partie : repas comptés par type, mort et durée de survie', () => {
  const config = g.createAgarConfig();
  config.counts = { food: 0, poison: 0, viruses: 0, bots: 0, plankton: 0 };
  const world = new g.World(config, seededRng(3));
  world.time = 10;
  world.player.spawn(500, 500, world.time);
  world.player.configure('Omar', '#66bb6a');
  const cell = world.player.cells[0];
  assert.deepEqual([cell.name, cell.color], ['Omar', '#66bb6a']);
  cell.setMass(200);

  world.food.push(new g.Food(500, 500), new g.Food(505, 500));
  world.plankton.push(new g.PlanktonBoid(500, 500, constantRng(0.1)));
  world.setBotCount(1);
  const victim = world.bots[0];
  victim.setMass(20);
  victim.pos.set(500, 500);
  world.resolvePellets();
  world.resolveCells();
  let summary = world.player.summary(world.time);
  assert.deepEqual([summary.food, summary.plankton, summary.kills], [2, 1, 1]);

  world.time = 75;
  const hunter = world.bots[0];
  hunter.setMass(2000);
  hunter.pos.set(cell.pos.x, cell.pos.y);
  world.resolveCells();
  summary = world.player.summary(200);
  assert.equal(summary.killer, hunter.name);
  assert.equal(summary.survival, 65, 'durée figée à la mort');
  assert.ok(summary.peakMass >= 0);

  world.spawnPlayer();
  assert.equal(world.player.summary(world.time).kills, 0, 'nouvelle vie, statistiques remises à zéro');
  assert.equal(world.player.cells[0].name, 'Omar');
});

test('téléphone : boutons Split, W et Bruit, aide tactile, réglages défilables', async () => {
  const { readFileSync } = await import('node:fs');
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const html = read('index.html');
  for (const id of ['touch-split', 'touch-eject', 'touch-call']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(read('sketch.js'), /'touch-call'\)\.addEventListener\('pointerdown'[\s\S]{0,120}emitPlayerNoise\(0\.4\)/);
  const css = read('style.css');
  assert.match(css, /canvas \{[^}]*touch-action: none/, 'le glissement du doigt ne fait pas défiler la page');
  assert.match(css, /#settings \{[^}]*overflow-y: auto/);
  assert.match(css, /@media \(pointer: coarse\) \{[\s\S]{0,80}\.keys-mouse \{ display: none; \}/);
  assert.match(css, /@media \(max-height: 500px\)[\s\S]*#corner-buttons \{ top: 12px; bottom: auto/, 'téléphone à l’horizontale : boutons hors du classement');
});
