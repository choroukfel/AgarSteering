import test from 'node:test';
import assert from 'node:assert/strict';
import { load, v, near, constantRng, seededRng } from './helpers.mjs';

const g = load();

function smallWorld(seed = 1, overrides = {}) {
  const config = g.createAgarConfig();
  config.counts = { food: 60, poison: 6, viruses: 4, bots: 6, plankton: 12, ...overrides };
  return new g.World(config, seededRng(seed)).init();
}

// monde vide (aucune entité générée), pour placer les entités à la main
function emptyWorld(seed = 1) {
  const config = g.createAgarConfig();
  config.counts = { food: 0, poison: 0, viruses: 0, bots: 0, plankton: 0 };
  const world = new g.World(config, seededRng(seed));
  world.player.spawn(500, 500);
  return world;
}

const isFiniteVector = vec => Number.isFinite(vec.x) && Number.isFinite(vec.y);

test('règles : repas inclusif à 1.25, centre recouvert, pas entre coéquipiers', () => {
  const eater = new g.PlayerCell(0, 0, 125);
  const prey = new g.BotCell(0, 0, 100, g.DNA.random(constantRng(0.5)), g.createAgarConfig());
  assert.equal(g.GameRules.canEat(eater, prey, 1.25), true);
  eater.setMass(124.9);
  assert.equal(g.GameRules.canEat(eater, prey, 1.25), false);
  eater.setMass(400);
  prey.pos.set(eater.r - prey.r * 0.4 + 0.01, 0);
  assert.equal(g.GameRules.canEat(eater, prey, 1.25), false, 'centre pas assez recouvert');
  const sibling = new g.PlayerCell(0, 0, 10);
  assert.equal(g.GameRules.canEat(eater, sibling, 1.25), false);
  assert.equal(g.GameRules.canEat(eater, eater, 1.25), false);
  const blob = new g.EjectedMass(0, 0, 12, 'red', 'player', 1);
  assert.equal(g.GameRules.canEat(eater, blob, 1.25), false, 'masse encore protégée');
});

test('règles : chaque proie mangée une fois, par le plus gros ; une proie ne mange plus', () => {
  const config = g.createAgarConfig();
  const dna = g.DNA.random(constantRng(0.5));
  const huge = new g.BotCell(0, 0, 500, dna, config);
  const big = new g.BotCell(0, 0, 200, dna, config);
  const small = new g.BotCell(0, 0, 20, dna, config);
  const meals = g.GameRules.findMeals([small, big, huge], [small, big], 1.25);
  assert.equal(meals.length, 2);
  assert.ok(meals.every(m => m.eater === huge));
  assert.equal(g.GameRules.findMeals([small], [huge], 1.25).length, 0);
});

test('règles : granulés avalés au contact, poison appliqué', () => {
  const cell = new g.PlayerCell(0, 0, 100);
  // parcours de la fin vers le début : granulé au contact (rayon inclusif), puis le poison
  const pellets = [new g.Poison(0, 5, 0.5), new g.Food(cell.r, 0, 'red', 2), new g.Food(cell.r + 1, 0)];
  const eaten = g.GameRules.eatPellets([cell], pellets);
  assert.equal(eaten.length, 2);
  assert.equal(pellets.length, 1);
  assert.equal(cell.mass, 51);
});

test('monde : initialisation des collections, joueur et serpent', () => {
  const world = smallWorld();
  assert.equal(world.food.length, 60);
  assert.equal(world.poison.length, 6);
  assert.equal(world.viruses.length, 4);
  assert.equal(world.bots.length, 6);
  assert.equal(world.plankton.length, 12);
  assert.equal(world.player.cells.length, 1);
  assert.ok(world.snake instanceof g.SnakeHead);
  assert.equal(world.snakeSegments.length, world.config.snake.segments);
  assert.equal(world.snakeSegments[0].leader, world.snake);
  assert.equal(world.snakeSegments[1].leader, world.snakeSegments[0]);
});

test('monde : une seule intégration de locomotion par entité et par image', () => {
  const world = smallWorld(2);
  const counts = new Map();
  for (const entity of world.movingEntities()) {
    const original = entity.update.bind(entity);
    entity.update = () => { counts.set(entity, (counts.get(entity) ?? 0) + 1); original(); };
  }
  const tracked = [...counts.keys(), ...world.movingEntities()];
  world.update(1 / 60, v(1500, 1500));
  for (const entity of world.movingEntities()) assert.equal(counts.get(entity), 1);
  assert.ok(tracked.length > 0);
});

test('monde : 900 images sans NaN, entités dans l\'arène, population maintenue', () => {
  const world = smallWorld(3);
  // La vitesse est bornée au moment de la locomotion. Un repas pris ensuite (règle de
  // scène) alourdit la cellule et baisse sa vitesse maximale : la locomotion de l'image
  // suivante la borne de nouveau. On vérifie donc la borne juste après chaque update().
  const locomotion = g.Vehicle.prototype.update;
  const tooFast = [];
  g.Vehicle.prototype.update = function () {
    locomotion.call(this);
    if (this.vel.mag() > this.maxSpeed + 1e-9) tooFast.push(this.constructor.name);
  };
  try {
    for (let frame = 0; frame < 900; frame++) {
      const target = world.player.alive ? world.player.centroid().add(v(200, 50)) : null;
      world.update(1 / 60, target);
      if (!world.player.alive && frame % 120 === 0) world.spawnPlayer();
    }
  } finally {
    g.Vehicle.prototype.update = locomotion;
  }
  assert.deepEqual(tooFast, []);
  for (const entity of world.movingEntities()) {
    assert.ok(isFiniteVector(entity.pos) && isFiniteVector(entity.vel), entity.constructor.name);
    assert.ok(entity.pos.x >= 0 && entity.pos.x <= world.width && entity.pos.y >= 0 && entity.pos.y <= world.height);
  }
  for (const bot of world.bots) {
    assert.ok(bot.maxSpeed > 0 && Number.isFinite(bot.maxSpeed));
  }
  assert.equal(world.bots.length, 6);
  assert.ok(world.food.length > 0);
});

test('monde : un bot mangé enrichit le réservoir génétique et est remplacé', () => {
  const world = emptyWorld(4);
  const player = world.player.cells[0];
  player.setMass(300);
  world.setBotCount(1);
  const victim = world.bots[0];
  victim.setMass(30);
  victim.pos.set(player.pos.x, player.pos.y);
  world.resolveCells();
  assert.equal(world.bots.length, 1);
  assert.notEqual(world.bots[0], victim);
  assert.equal(world.genePool.entries.length, 1);
  assert.equal(world.genePool.entries[0].dna, victim.dna);
  assert.equal(player.mass, 330);
  assert.equal(world.events[0]?.type ?? 'bot-eaten', 'bot-eaten');
});

test('monde : le joueur entièrement mangé déclenche la fin de partie', () => {
  const world = emptyWorld(5);
  world.setBotCount(1);
  const hunter = world.bots[0];
  hunter.setMass(300);
  hunter.pos.set(500, 500);
  world.resolveCells();
  assert.equal(world.player.alive, false);
  assert.ok(world.events.some(e => e.type === 'player-dead' && e.by === hunter));
});

test('monde : virus nourri 7 fois → tir d\'un nouveau virus dans la direction des masses', () => {
  const world = emptyWorld(6);
  const virus = new g.Virus(1000, 1000, 100);
  world.viruses.push(virus);
  world.config.counts.viruses = 1;
  for (let i = 0; i < 7; i++) {
    const blob = new g.EjectedMass(1000 - 10, 1000, 12, 'red', 'player', 0);
    blob.vel.set(5, 0);
    world.ejected.push(blob);
    world.resolveViruses();
  }
  assert.equal(world.ejected.length, 0);
  assert.equal(world.viruses.length, 2);
  const shot = world.viruses[1];
  assert.ok(shot.pos.x > virus.pos.x);
  assert.equal(shot.isLaunched(), true);
  assert.ok(near(shot.launch.direction.x, 1));
});

test('monde : grosse cellule du joueur sur un virus → absorption et explosion en morceaux', () => {
  const world = emptyWorld(7);
  const cell = world.player.cells[0];
  cell.setMass(200);
  world.viruses.push(new g.Virus(cell.pos.x, cell.pos.y, 100));
  world.resolveViruses();
  assert.equal(world.viruses.length, 0);
  assert.ok(world.player.cells.length > 1);
  assert.ok(near(world.player.totalMass(), 300));
  // une cellule trop petite (< 1.15 × virus) ne fait pas exploser le virus
  const safe = emptyWorld(8);
  safe.player.cells[0].setMass(110);
  safe.viruses.push(new g.Virus(500, 500, 100));
  safe.resolveViruses();
  assert.equal(safe.viruses.length, 1);
});

test('monde : un bot sur un virus perd la moitié de sa masse en granulés', () => {
  const world = emptyWorld(9);
  world.player.clear();
  world.setBotCount(1);
  const bot = world.bots[0];
  bot.setMass(200);
  world.viruses.push(new g.Virus(bot.pos.x, bot.pos.y, 100));
  world.resolveViruses();
  assert.equal(bot.mass, 100);
  const scattered = world.food.reduce((sum, f) => sum + f.mass, 0);
  assert.ok(near(scattered, 100));
  assert.ok(world.food.every(f => f.pos.dist(bot.pos) > bot.r));
});

test('monde : changement de mode = fuite réinitialisée sans recréer la population', () => {
  const world = smallWorld(10);
  const before = [...world.bots];
  const bot = world.bots[0];
  bot.escape.state = 'flee';
  bot.escape.endurance = 0.3;
  bot.refreshLimits();
  world.setMode('spectate');
  assert.equal(world.player.alive, false);
  assert.ok(world.bots.every((b, i) => b === before[i]));
  assert.equal(bot.escape.state, 'normal');
  assert.equal(bot.escape.endurance, 1);
  assert.equal(bot.maxSpeed, g.CellMass.maxSpeed(bot.mass));
  const view = world.focusView();
  assert.ok(world.bots.includes(world.focus));
  assert.equal(view.x, world.focus.pos.x);
  world.setMode('play');
  assert.equal(world.player.alive, true);
});

test('monde : réglages en cours de partie conservent les instances existantes', () => {
  const world = smallWorld(11);
  const first = world.bots[0];
  world.setBotCount(10);
  assert.equal(world.bots.length, 10);
  assert.equal(world.bots[0], first);
  world.setBotCount(3);
  assert.equal(world.bots.length, 3);
  assert.equal(world.bots[0], first);
  world.setPlanktonCount(5);
  assert.equal(world.plankton.length, 5);
  world.setFoodCount(10);
  assert.equal(world.food.length, 10);
});

test('monde : serpent mangé puis réapparition après le délai', () => {
  const world = emptyWorld(12);
  world.snake = null;
  world.spawnSnake();
  const cell = world.player.cells[0];
  cell.setMass(1000);
  cell.pos.set(world.snake.pos.x, world.snake.pos.y);
  world.resolveCells();
  assert.equal(world.snake, null);
  assert.equal(world.snakeSegments.length, 0);
  world.refill(world.config.snake.respawnDelay - 1);
  assert.equal(world.snake, null);
  world.refill(1);
  assert.ok(world.snake instanceof g.SnakeHead);
});

test('monde : classement et statistiques des décisions', () => {
  const world = smallWorld(13);
  world.update(1 / 60, v(1500, 1500));
  const board = world.leaderboard(3);
  assert.equal(board.length, 3);
  assert.ok(board[0].mass >= board[1].mass && board[1].mass >= board[2].mass);
  const stats = world.stats();
  const total = Object.values(stats.decisions).reduce((a, b) => a + b, 0);
  assert.equal(total, world.bots.length);
});

test('contrôles : touches du jeu ignorées dans les champs, debug synchronisé', () => {
  const field = { matches: selector => selector.includes('input') };
  const canvas = { matches: () => false };
  assert.equal(g.AgarControls.actionForKey('d', field), null);
  assert.equal(g.AgarControls.actionForKey('D', canvas), 'debug');
  assert.equal(g.AgarControls.actionForKey(' ', null), 'split');
  assert.equal(g.AgarControls.actionForKey('w', canvas), 'eject');
  assert.equal(g.AgarControls.actionForKey('x', canvas), null);

  const listeners = {};
  const checkbox = { checked: true, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const state = { debug: false };
  g.AgarControls.bindDebug(checkbox, state);
  assert.equal(checkbox.checked, false);
  g.AgarControls.toggleDebug(checkbox, state);
  assert.deepEqual([state.debug, checkbox.checked], [true, true]);
  checkbox.checked = false;
  listeners.change();
  assert.equal(state.debug, false);

  const slider = { value: '7', addEventListener: (type, fn) => { listeners[`slider-${type}`] = fn; } };
  const output = {};
  const values = [];
  g.AgarControls.bindSlider(slider, output, x => `${x} u`, x => values.push(x));
  slider.value = '9';
  listeners['slider-input']();
  assert.deepEqual(values, [7, 9]);
  assert.equal(output.value, '9 u');
});

test('caméra : conversion écran ↔ monde et zoom décroissant avec la taille', () => {
  const camera = new g.Camera(1000, 500, 2);
  const p = camera.screenToWorld(400, 300, 800, 600);
  assert.deepEqual([p.x, p.y], [1000, 500]);
  const q = camera.screenToWorld(600, 300, 800, 600);
  assert.equal(q.x, 1100);
  const back = camera.worldToScreen(q.x, q.y, 800, 600);
  assert.deepEqual([back.x, back.y], [600, 300]);
  assert.ok(g.Camera.zoomFor(200) < g.Camera.zoomFor(20));
  assert.equal(g.Camera.zoomFor(1e6), 0.3);
  // le zoom suit la taille de l'écran : un téléphone voit autant d'arène qu'un bureau
  assert.equal(g.Camera.screenScale(1600, 900), 1);
  assert.equal(g.Camera.screenScale(600, 1000), 600 / 900);
  assert.equal(g.Camera.screenScale(200, 300), 0.45);
  assert.equal(g.Camera.screenScale(4000, 3000), 1.2);
  assert.equal(g.Camera.zoomFor(1e6, 0.5), 0.15);
  const phone = new g.Camera();
  phone.snapTo(0, 0, 20, 0.5);
  assert.equal(phone.zoom, g.Camera.zoomFor(20) * 0.5);
  const view = camera.viewRect(800, 600);
  assert.equal(camera.sees({ pos: v(1000, 500), r: 1 }, view), true);
  assert.equal(camera.sees({ pos: v(5000, 500), r: 1 }, view), false);
});
