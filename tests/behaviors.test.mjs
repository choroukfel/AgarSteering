import test from 'node:test';
import assert from 'node:assert/strict';
import { load, v, body, near, constantRng, seededRng } from './helpers.mjs';

const g = load();

function vehicle(x, y, vx = 0, vy = 0, { maxSpeed = 4, maxForce = 0.2, r = 10 } = {}) {
  const veh = new g.Vehicle(x, y);
  veh.vel.set(vx, vy);
  veh.maxSpeed = maxSpeed;
  veh.maxForce = maxForce;
  veh.r = r;
  return veh;
}

test('perception : rayon inclusif, exclusion de soi, tri et filtre', () => {
  const agent = vehicle(0, 0);
  const others = [agent, body(100, 0), body(30, 0), body(0, 50), body(101, 0)];
  const found = g.neighborsWithin(agent, others, 100);
  assert.equal(found.length, 3);
  assert.equal(found[0].distance, 30);
  assert.equal(found[2].distance, 100);
  assert.equal(g.nearestWithin(agent, others, 100).distance, 30);
  assert.equal(g.nearestWithin(agent, others, 29), null);
  assert.equal(g.nearestWithin(agent, others, 100, o => o.pos.y > 0).distance, 50);
  assert.equal(g.nearestWithin(agent, [agent]), null);
});

test('composition : forces pondérées appliquées une fois et renvoyées pour le debug', () => {
  const veh = vehicle(0, 0);
  const applied = g.applyWeightedForces(veh, { a: v(1, 0), b: v(0, 2), c: v(3, 3) }, { a: 2, b: -0.5 });
  assert.deepEqual([veh.acc.x, veh.acc.y], [2 + 3, -1 + 3]);
  assert.deepEqual([applied.a.x, applied.b.y, applied.c.x], [2, -1, 3]);
});

test('fleeFrom : vitesse désirée opposée, ne s\'annule pas en fonçant vers la menace', () => {
  const veh = vehicle(0, 0, 4, 0);
  // le flee hérité (= -seek) est nul quand on fonce déjà vers la menace à vitesse max
  assert.equal(veh.flee(v(100, 0)).mag(), 0);
  const force = g.fleeFrom(veh, v(100, 0));
  assert.ok(force.x < 0);
  assert.ok(near(force.mag(), veh.maxForce));
});

test('arrive : vitesse max loin, proportionnelle dans le rayon, nulle sur la cible', () => {
  const far = vehicle(0, 0, 0, 0, { maxForce: 100 });
  const f1 = g.arriveForce(far, v(500, 0), 100);
  assert.ok(near(f1.x, 4) && near(f1.y, 0));
  const mid = vehicle(0, 0, 0, 0, { maxForce: 100 });
  assert.ok(near(g.arriveForce(mid, v(50, 0), 100).x, 2));
  const onTarget = vehicle(10, 10, 3, 0, { maxForce: 100 });
  const brake = g.arriveForce(onTarget, v(10, 10), 100);
  assert.ok(near(brake.x, -3) && near(brake.y, 0));
});

test('arrive : limite maxForce et décalage (offset) du serpent', () => {
  const veh = vehicle(0, 0, -4, 0, { maxForce: 0.3 });
  assert.ok(near(g.arriveForce(veh, v(500, 0), 100).mag(), 0.3));
  const ring = vehicle(0, 0, 0, 0, { maxForce: 100 });
  assert.equal(g.arriveForce(ring, v(20, 0), 60, 20).mag(), 0);
  assert.ok(g.arriveForce(ring, v(40, 0), 60, 20).x > 0);
  assert.ok(g.arriveForce(ring, v(10, 0), 60, 20).x < 0);
  // jamais plus que maxSpeed vers l'arrière
  assert.ok(g.arriveForce(ring, v(0.001, 0), 30, 25).mag() <= ring.maxSpeed + 1e-9);
});

test('brake : force opposée à la vitesse, limitée, nulle à l\'arrêt', () => {
  assert.ok(near(g.brakeForce(vehicle(0, 0, 10, 0, { maxForce: 0.5 })).x, -0.5));
  assert.equal(g.brakeForce(vehicle(0, 0)).mag(), 0);
});

test('pursue : vise la position future, horizon borné, cible immobile = seek', () => {
  const hunter = vehicle(0, 0, 0, 0, { maxSpeed: 5, maxForce: 100 });
  const still = body(100, 0);
  const seek = hunter.seek(still.pos);
  const pursue = g.pursueForce(hunter, still);
  assert.ok(near(pursue.x, seek.x) && near(pursue.y, seek.y));
  const moving = body(100, 0, 0, 2);
  assert.ok(g.pursueForce(hunter, moving).y > 0);
  // horizon T = d / vitesse = 20 images, borné à maxPrediction
  assert.equal(g.predictPosition(moving, 20).y, 40);
  const capped = g.pursueForce(hunter, moving, 5);
  const expected = hunter.seek(v(100, 10));
  assert.ok(near(capped.x, expected.x) && near(capped.y, expected.y));
});

test('evade : fuit la position future, limitée à maxForce', () => {
  const prey = vehicle(0, 0, 0, 0, { maxSpeed: 4, maxForce: 0.2 });
  const threat = body(100, 0, -3, 0);
  const force = g.evadeForce(prey, threat);
  assert.ok(force.x < 0);
  assert.ok(near(force.mag(), 0.2));
});

test('poursuite parfaite : point d\'interception exact ou null', () => {
  const hunter = vehicle(0, 0, 0, 0, { maxSpeed: 5 });
  const target = body(100, 0, 0, 3);
  const point = g.interceptPoint(hunter, target);
  // à l'interception, les deux temps de trajet sont égaux
  const t = (point.y - target.pos.y) / 3;
  assert.ok(near(point.dist(hunter.pos) / hunter.maxSpeed, t, 1e-6));
  assert.ok(near(t, 25, 1e-6));
  const runaway = body(100, 0, 10, 0);
  assert.equal(g.interceptPoint(hunter, runaway), null);
  // repli sur pursue quand l'interception est impossible
  const fallback = g.pursuePerfectForce(hunter, runaway);
  const expected = g.pursueForce(hunter, runaway);
  assert.ok(near(fallback.x, expected.x));
});

test('wander : angle continu, borné par displaceRange, reproductible', () => {
  const state = g.createWanderState({ displaceRange: 0.3 });
  const veh = vehicle(0, 0, 2, 0, { maxForce: 0.5 });
  let previous = state.theta;
  const rng = seededRng(7);
  for (let i = 0; i < 50; i++) {
    const force = g.wanderForce(veh, state, rng);
    assert.ok(force.mag() <= 0.5 + 1e-9);
    assert.ok(Math.abs(state.theta - previous) <= 0.3 + 1e-12);
    previous = state.theta;
  }
  const a = g.createWanderState();
  const b = g.createWanderState();
  const va = vehicle(0, 0, 1, 1);
  const vb = vehicle(0, 0, 1, 1);
  const fa = g.wanderForce(va, a, seededRng(3));
  const fb = g.wanderForce(vb, b, seededRng(3));
  assert.deepEqual([fa.x, fa.y, a.theta], [fb.x, fb.y, b.theta]);
  // rng = 0.5 : aucune variation de l'angle
  const still = g.createWanderState({ theta: 0.2 });
  g.wanderForce(vehicle(0, 0, 1, 0), still, constantRng(0.5));
  assert.equal(still.theta, 0.2);
  // cible sur le cercle placé devant le véhicule
  assert.ok(near(still.target.dist(still.center), still.radius));
  assert.ok(near(still.center.x, still.distance) && near(still.center.y, 0));
});

test('boundaries : nul au centre, réfléchi près des bords et dans les coins', () => {
  const center = vehicle(500, 500, 3, 0);
  assert.equal(g.boundariesForce(center, 0, 0, 1000, 1000, 50).mag(), 0);
  const left = vehicle(10, 500, -3, 0, { maxForce: 100 });
  const fLeft = g.boundariesForce(left, 0, 0, 1000, 1000, 50);
  assert.ok(fLeft.x > 0);
  const corner = vehicle(990, 990, 3, 3, { maxForce: 100 });
  const fCorner = g.boundariesForce(corner, 0, 0, 1000, 1000, 50);
  assert.ok(fCorner.x < 0 && fCorner.y < 0);
  const limited = vehicle(10, 500, -3, 0, { maxForce: 0.1 });
  assert.ok(near(g.boundariesForce(limited, 0, 0, 1000, 1000, 50).mag(), 0.1));
  // seuil : exactement à la marge, pas encore de force
  assert.equal(g.boundariesForce(vehicle(50, 500, -1, 0), 0, 0, 1000, 1000, 50).mag(), 0);
});

test('avoid : obstacle devant → force latérale, derrière ou absent → nulle', () => {
  const veh = vehicle(0, 0, 2, 0, { r: 10, maxForce: 100 });
  const ahead = body(60, 8, 0, 0, { r: 20 });
  const trace = {};
  const force = g.avoidForce(veh, [ahead], 30, 0, trace);
  assert.ok(force.y < 0, 'repoussé du côté opposé à l\'obstacle');
  assert.equal(trace.obstacle, ahead);
  assert.equal(trace.ahead.x, 60);
  assert.equal(g.avoidForce(veh, [body(-80, 0, 0, 0, { r: 20 })], 30).mag(), 0);
  assert.equal(g.avoidForce(veh, [], 30).mag(), 0);
  // l'obstacle le plus pénétré est choisi
  const deep = body(30, -2, 0, 0, { r: 25 });
  const t2 = {};
  g.avoidForce(veh, [ahead, deep], 30, 0, t2);
  assert.equal(t2.obstacle, deep);
  const limited = vehicle(0, 0, 2, 0, { r: 10, maxForce: 0.2 });
  assert.ok(g.avoidForce(limited, [ahead], 30).mag() <= 0.2 + 1e-9);
});

test('projection scalaire : projection orthogonale bornée au segment', () => {
  const a = v(0, 0);
  const b = v(100, 0);
  const p = g.projectOnSegment(v(30, 40), a, b);
  assert.deepEqual([p.x, p.y], [30, 0]);
  assert.deepEqual([g.projectOnSegment(v(-50, 10), a, b).x, g.projectOnSegment(v(150, 10), a, b).x], [0, 100]);
  assert.equal(g.projectOnSegment(v(5, 5), a, a.copy()).x, 0);
});

test('path following : aucune correction dans le couloir, seek hors du couloir', () => {
  const path = new g.PatrolPath([v(0, 0), v(400, 0), v(400, 400), v(0, 400)], 20, true);
  const inside = vehicle(100, 5, 3, 0);
  const trace = {};
  assert.equal(g.followPathForce(inside, path, 25, 25, trace).mag(), 0);
  assert.equal(trace.offPath, false);
  const outside = vehicle(100, 80, 3, 0, { maxForce: 100 });
  const t2 = {};
  const force = g.followPathForce(outside, path, 25, 25, t2);
  assert.ok(force.y < 0, 'ramené vers le segment du haut');
  assert.equal(t2.offPath, true);
  assert.deepEqual([t2.normal.x, t2.normal.y], [125, 0]);
  assert.deepEqual([t2.target.x, t2.target.y], [150, 0]);
  // chemin fermé : le dernier segment relie le dernier point au premier
  const closest = g.closestOnPath(path, v(-10, 200));
  assert.deepEqual([closest.normal.x, closest.normal.y], [0, 200]);
});

test('séparation : voisins inclusifs, poids 1/d, soi et superposés ignorés, maxForce', () => {
  const veh = vehicle(0, 0, 0, 0, { maxForce: 100 });
  assert.equal(g.separationForce(veh, [veh, body(0, 0)], 20).mag(), 0);
  assert.equal(g.separationForce(veh, [body(21, 0)], 20).mag(), 0);
  assert.ok(g.separationForce(veh, [body(20, 0)], 20).x < 0);
  // le voisin proche (1/d) l'emporte sur le lointain
  assert.ok(g.separationForce(veh, [body(5, 0), body(-15, 0)], 20).x < 0);
  // rayon fonction du voisin (cellules du joueur : somme des rayons)
  assert.ok(g.separationForce(veh, [body(30, 0, 0, 0, { r: 25 })], o => 10 + o.r).x < 0);
  assert.ok(g.separationForce(vehicle(0, 0, 0, 0, { maxForce: 0.1 }), [body(5, 0)], 20).mag() <= 0.1 + 1e-9);
});

test('alignement et cohésion : moyenne des voisins dans le rayon uniquement', () => {
  const veh = vehicle(0, 0, 0, 0, { maxForce: 100 });
  const neighbors = [body(10, 0, 0, 2), body(-10, 0, 0, 4), body(500, 0, 3, 0)];
  const align = g.alignmentForce(veh, neighbors, 50);
  assert.ok(near(align.x, 0) && near(align.y, 4));
  const cohesion = g.cohesionForce(veh, [body(40, 0), body(40, 40)], 100);
  const expected = veh.seek(v(40, 20));
  assert.ok(near(cohesion.x, expected.x) && near(cohesion.y, expected.y));
  assert.equal(g.alignmentForce(veh, [body(500, 0, 1, 0)], 50).mag(), 0);
  assert.equal(g.cohesionForce(veh, [veh], 50).mag(), 0);
  assert.ok(g.cohesionForce(vehicle(0, 0, 0, 0, { maxForce: 0.05 }), [body(40, 0)], 100).mag() <= 0.05 + 1e-9);
});
