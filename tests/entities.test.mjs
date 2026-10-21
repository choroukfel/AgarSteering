import test from 'node:test';
import assert from 'node:assert/strict';
import { load, v, body, near, seededRng, constantRng } from './helpers.mjs';

const g = load();
const bounds = { x: 0, y: 0, width: 3000, height: 3000, margin: 80 };

test('toutes les entités visibles héritent de Vehicle', () => {
  const config = g.createAgarConfig();
  const path = g.PatrolPath.loop(500, 500, 200, 200, 8);
  const head = new g.SnakeHead(0, 0, path, config);
  const entities = [
    new g.Cell(0, 0, 10), new g.Food(0, 0), new g.Poison(0, 0), new g.Virus(0, 0),
    new g.EjectedMass(0, 0, 12, 'red'), new g.PlanktonBoid(0, 0, constantRng(0.1)),
    new g.PlayerCell(0, 0, 10), new g.BotCell(0, 0, 20, g.DNA.random(constantRng(0.5)), config),
    head, new g.SnakeSegment(0, 0, head, 20, 10),
  ];
  for (const entity of entities) assert.ok(entity instanceof g.Vehicle, entity.constructor.name);
  assert.ok(new g.Poison(0, 0) instanceof g.Food);
  for (const C of [g.Virus, g.EjectedMass, g.PlayerCell, g.BotCell, g.SnakeHead]) assert.ok(C.prototype instanceof g.Cell);
});

test('masse : rayon croissant, vitesse décroissante, seuil de repas inclusif', () => {
  assert.ok(g.CellMass.radius(100) > g.CellMass.radius(10));
  assert.ok(g.CellMass.maxSpeed(100) < g.CellMass.maxSpeed(10));
  assert.equal(g.CellMass.maxSpeed(1e9), 1.4);
  assert.equal(g.CellMass.canEat(125, 100), true);
  assert.equal(g.CellMass.canEat(124.99, 100), false);
  const big = { pos: v(0, 0), r: 50 };
  assert.equal(g.CellMass.covers(big, { pos: v(46, 0), r: 10 }), true);
  assert.equal(g.CellMass.covers(big, { pos: v(46.01, 0), r: 10 }), false);
});

test('Cell : limites dérivées de la masse, impulsion temporaire puis restauration exacte', () => {
  const cell = new g.Cell(0, 0, 50);
  const normal = { s: g.CellMass.maxSpeed(50), f: g.CellMass.maxForce(50) };
  assert.equal(cell.maxSpeed, normal.s);
  cell.startLaunch(v(0, 3), 20, 0.5);
  assert.equal(cell.maxSpeed, 20);
  assert.ok(near(cell.launch.direction.y, 1));
  const force = cell.launchForce();
  assert.ok(force.y > 0 && force.mag() <= cell.maxForce + 1e-9);
  cell.tick(0.25);
  assert.ok(near(cell.maxSpeed, normal.s + (20 - normal.s) * 0.5));
  cell.tick(0.25);
  assert.equal(cell.isLaunched(), false);
  assert.equal(cell.maxSpeed, normal.s);
  assert.equal(cell.maxForce, normal.f);
  // la locomotion reste celle de Vehicle (vitesse bornée par maxSpeed)
  cell.applyForce(v(100, 0));
  cell.update();
  assert.ok(near(cell.vel.mag(), normal.s));
});

test('Cell : les grosses cellules maigrissent jusqu\'au seuil, pas en dessous', () => {
  const cell = new g.Cell(0, 0, 200);
  cell.decay = { threshold: 60, rate: 0.5 };
  cell.tick(1);
  assert.equal(cell.mass, 100);
  assert.equal(cell.r, g.CellMass.radius(100));
  for (let i = 0; i < 20; i++) cell.tick(1);
  assert.equal(cell.mass, 60);
});

test('granulés : la nourriture ajoute sa masse, le poison en retire une fraction', () => {
  assert.equal(new g.Food(0, 0, 'red', 3).effectOn(20), 23);
  const poison = new g.Poison(0, 0, 0.8);
  assert.equal(poison.effectOn(100), 80);
  assert.equal(poison.effectOn(11), 10);
  assert.equal(poison.effectOn(8), 8);
});

test('virus : tir au 7e repas, puis compteur remis à zéro ; freinage après lancement', () => {
  const virus = new g.Virus(0, 0, 100);
  for (let i = 1; i < 7; i++) assert.equal(virus.feed(7), false);
  assert.equal(virus.feed(7), true);
  assert.equal(virus.fed, 0);
  virus.vel.set(2, 0);
  virus.steer();
  assert.ok(virus.acc.x < 0);
});

test('masse éjectée : impulsion puis freinage, protégée de son équipe pendant le délai', () => {
  const blob = new g.EjectedMass(0, 0, 12, 'red', 'player', 0.6);
  assert.equal(blob.canBeEatenBy({ team: 'player' }), false);
  assert.equal(blob.canBeEatenBy({ team: 'bot-1' }), true);
  blob.tick(0.6);
  assert.equal(blob.canBeEatenBy({ team: 'player' }), true);
  blob.startLaunch(v(1, 0), 16, 0.5);
  blob.steer();
  assert.ok(blob.acc.x > 0);
  blob.update();
  blob.tick(0.5);
  blob.steer();
  assert.ok(blob.acc.x < 0, 'freine une fois l\'impulsion terminée');
});

test('joueur : arrive vers le pointeur, split en deux moitiés lancées vers le pointeur', () => {
  const config = g.createAgarConfig();
  const cell = new g.PlayerCell(500, 500, 100);
  cell.steer(v(900, 500), [cell], bounds);
  assert.ok(cell.lastForces.arrive.x > 0);
  assert.equal(cell.lastForces.launch, undefined);
  const child = cell.split(v(1, 0), config);
  assert.equal(cell.mass, 50);
  assert.equal(child.mass, 50);
  assert.ok(child.pos.x > cell.pos.x);
  assert.equal(child.isLaunched(), true);
  assert.equal(child.maxSpeed, config.cell.splitSpeed);
  const delay = config.cell.mergeDelayBase + config.cell.mergeDelayPerMass * 100;
  assert.equal(cell.mergeTimer, delay);
  assert.equal(child.mergeTimer, delay);
  // pendant l'impulsion, seule la force de lancement (et les murs) pilote
  child.steer(v(0, 0), [cell, child], bounds);
  assert.ok(child.lastForces.launch.x > 0);
  assert.equal(child.lastForces.arrive, undefined);
  assert.equal(new g.PlayerCell(0, 0, config.player.minSplitMass - 0.01).split(v(1, 0), config), null);
});

test('joueur : séparation avant le délai de fusion, cohésion ensuite', () => {
  const a = new g.PlayerCell(500, 500, 50);
  const b = new g.PlayerCell(530, 500, 50);
  a.mergeTimer = b.mergeTimer = 3;
  a.steer(v(500, 500), [a, b], bounds);
  assert.ok(a.lastForces.separation.x < 0);
  assert.equal(a.lastForces.cohesion.mag(), 0);
  a.tick(3);
  b.tick(3);
  a.acc.set(0, 0);
  a.steer(v(500, 500), [a, b], bounds);
  assert.equal(a.lastForces.separation.mag(), 0);
  assert.ok(a.lastForces.cohesion.x > 0);
});

test('joueur : éjection coûte plus qu\'elle ne lance, seuil minimal', () => {
  const config = g.createAgarConfig();
  const cell = new g.PlayerCell(500, 500, 100);
  const blob = cell.eject(v(0, -1), config);
  assert.equal(cell.mass, 100 - config.player.ejectCost);
  assert.equal(blob.mass, config.eject.mass);
  assert.ok(blob.pos.y < cell.pos.y - cell.r);
  assert.equal(blob.ownerTeam, 'player');
  assert.equal(new g.PlayerCell(0, 0, config.player.minEjectMass - 1).eject(v(1, 0), config), null);
});

test('contrôleur du joueur : split limité à maxCells, explosion sur virus, fusion', () => {
  const config = g.createAgarConfig();
  config.player.maxCells = 4;
  const player = new g.PlayerController(config);
  player.spawn(1000, 1000);
  player.cells[0].setMass(400);
  player.split(v(1200, 1000));
  player.split(v(1200, 1000));
  player.split(v(1200, 1000));
  assert.equal(player.cells.length, 4);
  assert.ok(near(player.totalMass(), 400));

  const popper = new g.PlayerController(g.createAgarConfig());
  popper.spawn(0, 0);
  popper.cells[0].setMass(240);
  const pieces = popper.pop(popper.cells[0], constantRng(0));
  assert.equal(pieces.length, 7);
  assert.equal(popper.cells.length, 8);
  assert.ok(near(popper.totalMass(), 240));
  assert.ok(pieces.every(p => p.isLaunched() && p.mergeTimer > 0));

  const merger = new g.PlayerController(g.createAgarConfig());
  merger.spawn(0, 0);
  const extra = merger.createCell(5, 0, 30);
  merger.cells.push(extra);
  merger.cells[0].mergeTimer = 1;
  assert.equal(merger.resolveMerges(), 0, 'pas de fusion avant la fin du délai');
  merger.cells[0].mergeTimer = 0;
  assert.equal(merger.resolveMerges(), 1);
  assert.equal(merger.cells.length, 1);
  assert.equal(merger.cells[0].mass, 42);
});

test('plancton : séparation, alignement, cohésion, wander, murs et fuite composés', () => {
  const rng = seededRng(4);
  const flock = [new g.PlanktonBoid(500, 500, rng), new g.PlanktonBoid(510, 500, rng), new g.PlanktonBoid(500, 530, rng)];
  const boid = flock[0];
  const threat = body(560, 500, 0, 0, { r: 20, mass: 50 });
  boid.steer(flock, [threat], [], bounds, rng);
  for (const name of ['separation', 'alignment', 'cohesion', 'wander', 'avoid', 'walls', 'flee']) {
    assert.ok(name in boid.lastForces, name);
  }
  assert.equal(boid.threat, threat);
  assert.ok(boid.lastForces.flee.x < 0);
  assert.ok(near(boid.lastForces.flee.mag(), boid.maxForce * boid.weights.flee));
  const sum = Object.values(boid.lastForces).reduce((acc, f) => acc.add(f), v(0, 0));
  assert.ok(near(boid.acc.x, sum.x) && near(boid.acc.y, sum.y));
  // hors du rayon de fuite : pas de force de fuite
  const calm = new g.PlanktonBoid(500, 500, rng);
  calm.steer([calm], [body(500 + calm.fleeRadius + 1, 500)], [], bounds, rng);
  assert.equal(calm.lastForces.flee, undefined);
});

test('serpent : anneaux en arrive décalé, tête en patrouille ou en chasse selon la laisse', () => {
  const config = g.createAgarConfig();
  const path = new g.PatrolPath([v(1000, 1000), v(2000, 1000), v(2000, 2000), v(1000, 2000)], 30);
  const head = new g.SnakeHead(1500, 1000, path, config);
  head.vel.set(2, 0);

  const ring = new g.SnakeSegment(1500 - 22, 1000, head, 22, 10);
  ring.steer();
  assert.ok(near(ring.lastForce.x, 0) && ring.lastForce.mag() <= ring.maxForce);
  ring.pos.set(1400, 1000);
  ring.vel.set(0, 0);
  ring.steer();
  assert.ok(ring.lastForce.x > 0);

  head.think([]);
  assert.equal(head.decision, 'patrol');
  head.steer([], bounds);
  assert.ok('follow' in head.lastForces && 'cruise' in head.lastForces);
  assert.ok(head.pathTrace.target);

  const prey = new g.PlayerCell(1600, 1100, 20);
  const bigPrey = new g.PlayerCell(1600, 1100, 200);
  head.think([bigPrey, prey]);
  assert.equal(head.decision, 'hunt');
  assert.equal(head.prey, prey);
  head.steer([], bounds);
  assert.ok('pursuit' in head.lastForces);

  // proie hors du territoire (au-delà de la laisse) : pas de chasse
  const outside = new g.PlayerCell(1500, 1000 - config.snake.leash - 1, 20);
  head.pos.set(1500, 1000 - config.snake.leash + 100);
  head.think([outside]);
  assert.equal(head.decision, 'patrol');
});
