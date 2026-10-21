import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Adaptateur vectoriel minimal, fidèle à p5.Vector 1.7 pour les méthodes utilisées,
// afin d'exécuter le vrai vehicle.js et les modules du jeu sans navigateur.
export class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; this.z = 0; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  div(n) { this.x /= n; this.y /= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  magSq() { return this.x * this.x + this.y * this.y; }
  normalize() { const m = this.mag(); if (m !== 0) this.mult(1 / m); return this; }
  setMag(n) { return this.normalize().mult(n); }
  limit(max) { const mSq = this.magSq(); if (mSq > max * max) this.div(Math.sqrt(mSq)).mult(max); return this; }
  heading() { return Math.atan2(this.y, this.x); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  dist(v) { const dx = v.x - this.x, dy = v.y - this.y; return Math.sqrt(dx * dx + dy * dy); }
  static add(a, b) { return a.copy().add(b); }
  static sub(a, b) { return a.copy().sub(b); }
  static mult(a, n) { return a.copy().mult(n); }
  static dist(a, b) { return a.dist(b); }
}

// Générateur pseudo-aléatoire reproductible (mulberry32).
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// rng qui renvoie toujours la même valeur
export const constantRng = value => () => value;

const FILES = [
  'vehicle.js', 'config.js', 'theme.js', 'mass.js',
  'behaviors/perception.js', 'behaviors/composition.js', 'behaviors/arrive.js', 'behaviors/pursuit.js',
  'behaviors/wander.js', 'behaviors/boundaries.js', 'behaviors/avoidance.js', 'behaviors/pathFollowing.js',
  'behaviors/flocking.js', 'behaviors/collisionAvoidance.js', 'behaviors/flowField.js', 'behaviors/escort.js', 'genetics.js', 'brain.js', 'neuralDNA.js', 'brainPretrained.js', 'escape.js', 'noiseEvent.js',
  'Cell.js', 'Food.js', 'Poison.js', 'Virus.js', 'EjectedMass.js', 'PlanktonBoid.js', 'PlayerCell.js',
  'BotCell.js', 'raySensor.js', 'NeuralBotCell.js', 'EscortCell.js', 'PatrolPath.js', 'SnakeHead.js', 'SnakeSegment.js', 'playerController.js', 'spatialGrid.js', 'EffectParticle.js', 'rules.js',
  'world.js', 'camera.js', 'ui.js', 'controls.js', 'clapDetector.js', 'audio.js',
];

const EXPORTS = `({ Vehicle, createAgarConfig, CellMass, neighborsWithin, nearestWithin, applyWeightedForces, fleeFrom,
  arriveForce, brakeForce, predictPosition, pursueForce, evadeForce, interceptPoint, pursuePerfectForce,
  createWanderState, wanderForce, boundariesForce, avoidForce, projectOnSegment, closestOnPath, followPathForce,
  separationForce, alignmentForce, cohesionForce, unalignedAvoidanceForce, FlowField, flowFieldForce,
  offsetPoint, offsetPursuitForce, interposePoint, interposeForce, applyPrioritizedForces, NoiseEvent, BOT_GENES, DNA, GenePool, EscapeState,
  NeuralNetwork, BOT_BRAIN, NeuralDNA, seedNeuralPool, NeuralBotCell, RaySensor, EscortCell, PRETRAINED_BOT_BRAINS,
  Cell, Food, Poison, Virus, EjectedMass, PlanktonBoid, PlayerCell, BotCell, PatrolPath, SnakeHead, SnakeSegment,
  PlayerController, SpatialGrid, EffectParticle, ClapDetector, AgarAudio, GameRules, World, Camera, AgarControls, AgarTheme, AgarUi, ToastQueue })`;

// Charge tous les modules du jeu dans un contexte isolé.
// width/height ne sont utilisés que par edges() de vehicle.js.
export function load() {
  const context = vm.createContext({
    p5: { Vector },
    createVector: (x = 0, y = 0) => new Vector(x, y),
    width: 800,
    height: 600,
    console,
  });
  for (const file of FILES) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { ...vm.runInContext(EXPORTS, context), Vector };
}

export const v = (x, y) => new Vector(x, y);

// petite entité de test : position + vitesse + rayon
export const body = (x, y, vx = 0, vy = 0, extra = {}) => ({ pos: v(x, y), vel: v(vx, vy), r: 0, ...extra });

export function near(actual, expected, eps = 1e-9) {
  return Math.abs(actual - expected) <= eps;
}
