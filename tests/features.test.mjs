import test from 'node:test';
import assert from 'node:assert/strict';
import { load, v, body, near, constantRng, seededRng } from './helpers.mjs';

const g = load();
const plain = x => JSON.parse(JSON.stringify(x));
const vehicle = (x, y, vx = 0, vy = 0, r = 10) => {
  const agent = new g.Vehicle(x, y);
  agent.vel.set(vx, vy);
  agent.r = r;
  agent.maxSpeed = 4;
  agent.maxForce = 0.4;
  return agent;
};

function smallWorld(seed = 1, overrides = {}) {
  const config = g.createAgarConfig();
  config.counts = { food: 80, poison: 6, viruses: 4, bots: 6, plankton: 12, ...overrides };
  return new g.World(config, seededRng(seed)).init();
}

// ---------- grille spatiale ----------

test('grille spatiale : la requête renvoie tous les voisins (surensemble), mêmes résultats que la recherche exhaustive', () => {
  const rng = seededRng(4);
  const items = Array.from({ length: 400 }, () => body(rng() * 3000, rng() * 3000));
  const grid = new g.SpatialGrid(100).rebuild(items);
  assert.equal(grid.count, 400);
  for (let i = 0; i < 50; i++) {
    const agent = body(rng() * 3000, rng() * 3000);
    const radius = 50 + rng() * 300;
    const candidates = grid.query(agent.pos, radius);
    const exact = items.filter(item => item.pos.dist(agent.pos) <= radius);
    assert.ok(exact.every(item => candidates.includes(item)), 'aucun voisin oublié');
    const brute = g.nearestWithin(agent, items, radius);
    const fast = g.nearestWithin(agent, candidates, radius);
    assert.equal(fast?.entity ?? null, brute?.entity ?? null);
  }
});

test('grille spatiale : les repas de granulés donnent le même résultat qu’en recherche exhaustive', () => {
  const rng = seededRng(7);
  const make = () => Array.from({ length: 300 }, (_, i) => new g.Food(30 + (i * 97) % 900, 30 + (i * 53) % 900));
  const cells = () => [new g.PlayerCell(200, 200, 400), new g.PlayerCell(600, 500, 200), new g.PlayerCell(610, 505, 150)];
  const a = make(), b = make();
  const ca = cells(), cb = cells();
  const brute = g.GameRules.eatPellets(ca, a);
  const fast = g.GameRules.eatPelletsNear(cb, b, new g.SpatialGrid(100).rebuild(b));
  assert.equal(fast.length, brute.length);
  assert.equal(b.length, a.length);
  assert.deepEqual(cb.map(c => Math.round(c.mass * 1000)), ca.map(c => Math.round(c.mass * 1000)));
  void rng;
});

test('perception : le filtre coûteux n’est évalué que pour un candidat plus proche', () => {
  const agent = body(0, 0);
  const others = Array.from({ length: 50 }, (_, i) => body(10 + i * 10, 0));
  let calls = 0;
  const found = g.nearestWithin(agent, [...others].reverse(), 1000, () => { calls++; return true; });
  assert.equal(found.entity, others[0]);
  assert.ok(calls <= others.length);
  calls = 0;
  g.nearestWithin(agent, others, 1000, () => { calls++; return true; });
  assert.equal(calls, 1, 'trié du plus proche : un seul filtre');
});

// ---------- unaligned collision avoidance ----------

test('évitement de collision : croisement prévu → écart latéral ; trajectoires divergentes ou lointaines → rien', () => {
  const me = vehicle(0, 0, 2, 0);
  const other = vehicle(100, 3, -2, 0);
  const trace = {};
  const force = g.unalignedAvoidanceForce(me, [other], 45, 6, trace);
  assert.ok(force.mag() > 0 && force.mag() <= me.maxForce + 1e-9);
  assert.ok(force.y < 0, 's’écarte du côté opposé au point de rencontre');
  assert.ok(near(trace.time, 25, 1e-6), 'instant de plus courte distance : 100 / (2 + 2)');
  // divergent
  assert.equal(g.unalignedAvoidanceForce(vehicle(0, 0, -2, 0), [vehicle(100, 0, 2, 0)]).mag(), 0);
  // croisement trop lointain dans le temps
  assert.equal(g.unalignedAvoidanceForce(vehicle(0, 0, 0.5, 0), [vehicle(1000, 0, -0.5, 0)], 45).mag(), 0);
  // passent à bonne distance
  assert.equal(g.unalignedAvoidanceForce(vehicle(0, 0, 2, 0), [vehicle(100, 80, -2, 0)]).mag(), 0);
  // face à face exact : écart perpendiculaire
  assert.ok(g.unalignedAvoidanceForce(vehicle(0, 0, 2, 0), [vehicle(100, 0, -2, 0)]).mag() > 0);
});

test('évitement de collision : les bots perçoivent leurs pairs (ni proie ni menace) et les évitent', () => {
  const config = g.createAgarConfig();
  const dna = g.DNA.random(constantRng(0.5));
  const a = new g.BotCell(1000, 1000, 40, dna, config);
  const b = new g.BotCell(1100, 1004, 40, dna, config);
  const big = new g.BotCell(1000, 1300, 200, dna, config);
  a.vel.set(2, 0);
  b.vel.set(-2, 0);
  const world = { food: [], poison: [], viruses: [], cells: () => [a, b, big], preyCandidates: () => [a, b, big] };
  a.think(world, 0.1);
  assert.ok(a.perception.peers.includes(b));
  assert.ok(!a.perception.peers.includes(big), 'une menace n’est pas un pair');
  a.steer({ x: 0, y: 0, width: 3000, height: 3000, margin: 80 }, constantRng(0.5));
  assert.ok(a.lastForces.collision.mag() > 0);
  assert.ok(a.collisionTrace.other === b);
});

// ---------- flow field ----------

test('courants : champ de directions unitaires, déterministe ; le suivre aligne la vitesse sur le courant', () => {
  const field = new g.FlowField(3000, 3000, 150);
  assert.equal(field.cols, 20);
  const dir = field.lookup(v(1234, 567));
  assert.ok(near(dir.mag(), 1, 1e-9));
  const again = new g.FlowField(3000, 3000, 150).lookup(v(1234, 567));
  assert.ok(near(again.x, dir.x) && near(again.y, dir.y), 'déterministe');
  assert.ok(field.lookup(v(-500, 99999)).mag() > 0.99, 'borné aux bords');
  const agent = vehicle(1500, 1500, 0, 0);
  for (let i = 0; i < 200; i++) {
    const force = g.flowFieldForce(agent, field, 0);
    assert.ok(force.mag() <= agent.maxForce + 1e-9);
    agent.applyForce(force);
    agent.update();
    agent.pos.set(1500, 1500); // on reste dans la même case pour mesurer l'alignement
  }
  const target = field.lookup(v(1500, 1500)).mult(agent.maxSpeed);
  assert.ok(agent.vel.dist(target) < 0.05, 'vitesse alignée sur le courant');
  field.update(100);
  assert.ok(field.lookup(v(1500, 1500)).dist(target.copy().mult(1 / agent.maxSpeed)) > 1e-6, 'le champ évolue avec le temps');
});

// ---------- composition par priorités ----------

test('priorités : budget rempli dans l’ordre, la force qui déborde est tronquée, les suivantes ignorées', () => {
  const agent = vehicle(0, 0);
  agent.maxForce = 1;
  const forces = { wander: v(0, 1), avoid: v(1, 0), food: v(-1, 0) };
  const weights = { wander: 1, avoid: 2, food: 2 };
  const applied = g.applyPrioritizedForces(agent, forces, weights, ['avoid', 'food', 'wander'], 3);
  assert.ok(near(applied.avoid.mag(), 2));
  assert.ok(near(applied.food.mag(), 1), 'tronquée au budget restant');
  assert.equal(applied.wander, undefined, 'plus de budget');
  assert.ok(near(agent.acc.x, 1) && near(agent.acc.y, 0));
  // somme pondérée, pour comparaison : tout est appliqué
  const other = vehicle(0, 0);
  const all = g.applyWeightedForces(other, forces, weights);
  assert.equal(Object.keys(all).length, 3);
});

test('priorités : un bot en mode priorités n’applique jamais plus que son budget', () => {
  const config = g.createAgarConfig();
  config.composition.mode = 'priority';
  const bot = new g.BotCell(1000, 1000, 40, g.DNA.random(constantRng(0.5)), config);
  const world = { food: [new g.Food(1100, 1000)], poison: [new g.Poison(1000, 1100)], viruses: [], cells: () => [bot], preyCandidates: () => [bot] };
  bot.think(world, 0.1);
  bot.steer({ x: 0, y: 0, width: 3000, height: 3000, margin: 80 }, constantRng(0.5));
  const total = Object.values(bot.lastForces).reduce((sum, f) => sum + f.mag(), 0);
  assert.ok(total <= bot.maxForce * config.composition.budget + 1e-9);
  assert.ok('food' in bot.lastForces);
});

// ---------- offset pursuit, interpose, gardes du corps ----------

test('offset pursuit : point décalé dans le repère du meneur ; interpose : milieu des positions futures', () => {
  const leader = vehicle(100, 100, 0, 2); // cap vers +y
  const p = g.offsetPoint(leader, v(-50, 20));
  // repère local : x vers l'avant (+y monde), y vers la droite (−x monde)
  assert.ok(near(p.x, 100 - 20, 1e-9) && near(p.y, 100 - 50, 1e-9));
  const a = vehicle(0, 0), b = vehicle(200, 0);
  const guard = vehicle(100, 300);
  const mid = g.interposePoint(guard, a, b);
  assert.ok(near(mid.x, 100) && near(mid.y, 0));
  assert.ok(g.interposeForce(guard, a, b).y < 0, 'vers le milieu');
  assert.ok(g.offsetPursuitForce(vehicle(0, 0), leader, v(-50, 20)).mag() > 0);
});

test('gardes du corps : rattachés au plus gros bot (même équipe), interposition face à un prédateur', () => {
  const world = smallWorld(3);
  assert.equal(world.escorts.length, world.config.escort.count);
  const king = world.king();
  assert.ok(world.escorts.every(escort => escort.leader === king && escort.team === king.team));
  assert.ok(world.escorts.every(escort => escort instanceof g.Cell && escort instanceof g.Vehicle));
  assert.ok(!g.GameRules.canEat(king, world.escorts[0], 1.25), 'le roi ne mange pas ses gardes');
  assert.ok(world.escorts.every(escort => near(escort.mass, Math.max(world.config.escort.minMass, king.mass * world.config.escort.massRatio))));
  // un prédateur approche du roi : les gardes s'interposent
  const predator = new g.BotCell(king.pos.x + 200, king.pos.y, king.mass * 3, g.DNA.random(constantRng(0.5)), world.config);
  world.bots.push(predator);
  world.assignEscorts();
  // le prédateur est devenu le plus gros : l'escorte change de roi
  assert.equal(world.escorts[0].leader, predator);
  world.bots.pop();
  world.assignEscorts();
  for (const escort of world.escorts) escort.think([...world.cells(), predator]);
  assert.ok(world.escorts.every(escort => escort.decision === 'interpose' && escort.threat === predator));
  for (const escort of world.escorts) escort.steer(world.bounds());
  assert.ok(world.escorts.every(escort => escort.lastForces.interpose.mag() > 0));
});

test('gardes du corps : un garde mangé réapparaît après le délai', () => {
  const world = smallWorld(5);
  const guard = world.escorts[0];
  world.removeEaten(guard, world.bots[0]);
  assert.equal(world.escorts.length, world.config.escort.count - 1);
  assert.ok(world.events.some(e => e.type === 'escort-eaten'));
  world.refill(0);
  assert.equal(world.escorts.length, world.config.escort.count - 1, 'pas avant le délai');
  world.time = world.escortRespawn;
  world.refill(0);
  assert.equal(world.escorts.length, world.config.escort.count);
});

// ---------- audition ----------

test('audition : le joueur fait du bruit ; les plus gros viennent enquêter, les plus petits sont effrayés', () => {
  const world = smallWorld(6, { bots: 0, plankton: 0 });
  world.setMode('play');
  const player = world.player.cells[0];
  player.setMass(60);
  const noise = world.emitPlayerNoise(0.5);
  assert.ok(noise && near(noise.radius, world.config.noise.baseRadius + 0.5 * world.config.noise.perVolume));
  assert.equal(world.emitPlayerNoise(0.5), null, 'délai entre deux bruits');
  const config = world.config;
  const dna = g.DNA.random(constantRng(0.5));
  // hors de vue (au-delà de son rayon de perception) mais à portée d'oreille
  const big = new g.BotCell(player.pos.x + 700, player.pos.y, 200, dna, config);
  const small = new g.BotCell(player.pos.x - 300, player.pos.y, 20, dna, config);
  const far = new g.BotCell(player.pos.x - noise.radius - 50, player.pos.y, 20, dna, config);
  world.bots.push(big, small, far);
  for (const bot of world.bots) bot.think(world, 1 / 60);
  assert.ok(big.pos.dist(player.pos) > big.perceptionRadius, 'le joueur est hors de vue');
  assert.equal(big.decision, 'investigate');
  assert.equal(small.decision, 'startled');
  assert.notEqual(far.decision, 'startled', 'hors de portée');
  for (const bot of [big, small]) bot.steer(world.bounds(), constantRng(0.5));
  assert.ok(big.lastForces.investigate.x < 0, 'vers le bruit');
  assert.ok(small.lastForces.startle.x < 0, 'loin du bruit');
  world.time += world.config.noise.duration;
  assert.equal(world.activeNoise(), null, 'le bruit s’éteint');
});

test('audition : la fuite réglementée reste prioritaire ; un bot neuronal obéit aussi au bruit', () => {
  const world = smallWorld(8, { bots: 0, plankton: 0 });
  world.setMode('play');
  const player = world.player.cells[0];
  player.setMass(60);
  world.emitPlayerNoise(0.5);
  const config = world.config;
  const neural = new g.NeuralBotCell(player.pos.x - 300, player.pos.y, 20, g.NeuralDNA.random(seededRng(2)), config);
  world.bots.push(neural);
  neural.think(world, 1 / 60);
  assert.equal(neural.decision, 'startled');
  assert.ok(Object.values(neural.brainWeights).every(w => w === 0), 'le réseau ne décide pas pendant la réaction au bruit');
  // une menace dans le cercle de détection : fuite, même si un bruit est entendu
  const hunter = new g.BotCell(neural.pos.x + neural.detectionRadius - 1, neural.pos.y, 300, g.DNA.random(constantRng(0.5)), config);
  world.bots.push(hunter);
  neural.think(world, 1 / 60);
  assert.equal(neural.decision, 'flee');
});

// ---------- son, éclats, caméra ----------

test('son : un son par type d’événement, placé à gauche/droite selon l’écran ; muet sans contexte audio', () => {
  assert.equal(g.AgarAudio.soundFor({ type: 'bot-eaten', by: { team: 'player' } }), 'eatBig');
  assert.equal(g.AgarAudio.soundFor({ type: 'bot-eaten', by: { team: 'bot-3' } }), 'gulp');
  assert.equal(g.AgarAudio.soundFor({ type: 'virus-pop' }), 'pop');
  assert.equal(g.AgarAudio.soundFor({ type: 'inconnu' }), null);
  const camera = new g.Camera(500, 500, 1);
  const left = g.AgarAudio.placement(v(200, 500), camera, 800, 600);
  const right = g.AgarAudio.placement(v(800, 500), camera, 800, 600);
  assert.ok(left.pan < 0 && right.pan > 0);
  assert.ok(near(g.AgarAudio.placement(v(500, 500), camera, 800, 600).level, 1));
  assert.ok(g.AgarAudio.placement(v(5000, 5000), camera, 800, 600).level < 0.05, 'trop loin : inaudible');
  assert.equal(g.AgarAudio.play('pop'), false, 'pas de contexte audio dans les tests');
});

test('éclats : gerbe lors d’un repas, traînée de Reynolds jusqu’à l’arrêt, puis disparition', () => {
  const world = smallWorld(9);
  const prey = world.bots[0];
  prey.setMass(50);
  world.removeEaten(prey, world.bots[1]);
  assert.ok(world.effects.length > 0);
  const particle = world.effects[0];
  assert.ok(particle instanceof g.Vehicle);
  const speed0 = particle.vel.mag();
  particle.steer();
  assert.ok(particle.acc.mag() <= particle.maxForce + 1e-9);
  particle.update();
  assert.ok(near(particle.vel.mag(), speed0 * particle.friction, 1e-9), 'vitesse × frottement');
  for (let i = 0; i < 400; i++) world.update(1 / 60, null);
  assert.ok(world.effects.every(p => p.isAlive(world.time)), 'les éclats expirés sont retirés');
  for (let i = 0; i < 300; i++) world.burst(v(100, 100), '#fff', 10);
  assert.ok(world.effects.length <= 240, 'nombre borné');
});

test('caméra : tremblement qui s’amortit ; conversion monde ↔ écran', () => {
  const camera = new g.Camera(0, 0, 1);
  camera.shake(10);
  camera.shake(4);
  assert.equal(camera.shakeAmount, 10, 'garde la plus forte secousse');
  for (let i = 0; i < 120; i++) camera.follow(0, 0, 32, 1 / 60);
  assert.equal(camera.shakeAmount, 0);
  const s = camera.worldToScreen(10, 20, 800, 600);
  const w = camera.screenToWorld(s.x, s.y, 800, 600);
  assert.ok(near(w.x, 10) && near(w.y, 20));
});

test('commandes : touche C = bruit ; micro : clap et double clap détectés', () => {
  assert.equal(g.AgarControls.actionForKey('c', null), 'call');
  const detector = new g.ClapDetector();
  const types = [[0.6, 0], [0.01, 16], [0.6, 300], [0.01, 316]].map(([l, t]) => detector.update(l, t)).filter(Boolean).map(e => e.type);
  assert.deepEqual(plain(types), ['clap', 'double-clap']);
});

// ---------- tout ensemble ----------

test('monde complet : priorités, courants, bruit, gardes et éclats — 1200 images sans NaN', () => {
  const world = smallWorld(11, { bots: 10 });
  world.config.composition.mode = 'priority';
  world.setMode('play');
  for (let i = 0; i < 1200; i++) {
    if (i % 200 === 0) world.emitPlayerNoise(0.6);
    const target = world.player.alive ? world.player.centroid().add(v(150, 40)) : null;
    world.update(1 / 60, target);
    if (!world.player.alive) world.spawnPlayer();
  }
  for (const entity of [...world.movingEntities(), ...world.effects]) {
    assert.ok(Number.isFinite(entity.pos.x) && Number.isFinite(entity.vel.y), entity.constructor.name);
  }
  const stats = world.stats();
  assert.equal(stats.escorts + (world.escorts.length < world.config.escort.count ? 0 : 0), world.escorts.length);
  assert.ok(Object.values(stats.decisions).every(Number.isFinite));
});
