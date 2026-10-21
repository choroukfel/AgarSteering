import test from 'node:test';
import assert from 'node:assert/strict';
import { load, constantRng, seededRng } from './helpers.mjs';

const g = load();
const names = () => Object.keys(g.BOT_GENES);

test('ADN aléatoire : chaque gène dans son intervalle, reproductible', () => {
  const rng = seededRng(11);
  for (let i = 0; i < 50; i++) {
    const dna = g.DNA.random(rng);
    for (const name of names()) {
      const [min, max] = g.BOT_GENES[name];
      assert.ok(dna.genes[name] >= min && dna.genes[name] <= max, name);
    }
    assert.equal(dna.generation, 0);
  }
  const a = g.DNA.random(seededRng(5));
  const b = g.DNA.random(seededRng(5));
  for (const name of names()) assert.equal(a.genes[name], b.genes[name]);
  // bornes appliquées à la construction
  const clamped = new g.DNA({ ...a.genes, foodWeight: 99, poisonWeight: -99 });
  assert.equal(clamped.genes.foodWeight, g.BOT_GENES.foodWeight[1]);
  assert.equal(clamped.genes.poisonWeight, g.BOT_GENES.poisonWeight[0]);
});

test('croisement uniforme : chaque gène vient d\'un parent, génération incrémentée', () => {
  const a = g.DNA.random(constantRng(0));
  const b = g.DNA.random(constantRng(0.999));
  const fromA = a.crossover(b, constantRng(0.1));
  const fromB = a.crossover(b, constantRng(0.9));
  for (const name of names()) {
    assert.equal(fromA.genes[name], a.genes[name]);
    assert.equal(fromB.genes[name], b.genes[name]);
  }
  const mixed = a.crossover(b, seededRng(3));
  for (const name of names()) assert.ok([a.genes[name], b.genes[name]].includes(mixed.genes[name]));
  assert.equal(fromA.generation, 1);
  assert.equal(fromA.crossover(a, seededRng(1)).generation, 2);
});

test('mutation : taux nul = copie, variation bornée à 10 % de l\'intervalle', () => {
  const dna = g.DNA.random(constantRng(0.5));
  const same = dna.mutate(0, seededRng(2));
  for (const name of names()) assert.equal(same.genes[name], dna.genes[name]);
  assert.notEqual(same, dna);
  const mutated = dna.mutate(1, seededRng(2));
  let changed = 0;
  for (const name of names()) {
    const [min, max] = g.BOT_GENES[name];
    const delta = Math.abs(mutated.genes[name] - dna.genes[name]);
    assert.ok(delta <= 0.1 * (max - min) + 1e-9, name);
    if (delta > 0) changed++;
  }
  assert.ok(changed > 0);
  assert.equal(mutated.generation, dna.generation);
});

test('réservoir génétique : tri par fitness, taille bornée, sélection et reproduction', () => {
  const pool = new g.GenePool(3);
  const dnas = [0.1, 0.3, 0.5, 0.7].map(x => g.DNA.random(constantRng(x)));
  pool.add(dnas[0], 10);
  pool.add(dnas[1], 40);
  pool.add(dnas[2], -5);
  pool.add(dnas[3], 20);
  assert.equal(pool.entries.length, 3);
  assert.deepEqual([...pool.entries.map(e => e.fitness)], [40, 20, 10]);
  assert.equal(pool.best().dna, dnas[1]);
  // roulette : rng proche de 0 → le meilleur, proche de 1 → le dernier
  assert.equal(pool.select(constantRng(0)), dnas[1]);
  assert.equal(pool.select(constantRng(0.99)), dnas[0]);
  const child = pool.breed(seededRng(8), 0);
  assert.equal(child.generation, 1);

  const empty = new g.GenePool(3);
  assert.equal(empty.breed(constantRng(0.5)).generation, 0, 'réservoir trop petit : ADN aléatoire');
});
