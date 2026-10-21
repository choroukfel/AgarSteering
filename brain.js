// Réseau de neurones dense (perceptron multicouche), écrit en JavaScript pur.
// Il sert à la sélection de l'action : ses sorties ne déplacent rien, elles dosent
// des comportements de steering existants (voir NeuralBotCell.js).
// Il n'est pas entraîné par rétropropagation : ses poids évoluent par neuroévolution
// (croisement + mutation), comme les réseaux des exemples 9 et 9b du cours.
//
// Couches cachées : tanh ∈ ]-1, 1[ ; couche de sortie : sigmoïde ∈ ]0, 1[.
// layers[k] est une matrice de sizes[k + 1] lignes et sizes[k] + 1 colonnes :
// la colonne 0 est le biais du neurone, les suivantes les poids de ses entrées.
const BRAIN_WEIGHT_LIMIT = 4;

class NeuralNetwork {
  constructor(sizes, layers = null, rng = Math.random) {
    if (!Array.isArray(sizes) || sizes.length < 2 || sizes.some(n => !Number.isInteger(n) || n < 1)) {
      throw new Error(`Tailles de couches invalides : ${sizes}`);
    }
    this.sizes = [...sizes];
    this.layers = layers ? NeuralNetwork.cloneLayers(layers) : NeuralNetwork.randomLayers(sizes, rng);
    for (let k = 0; k < this.layers.length; k++) {
      const layer = this.layers[k];
      if (layer.length !== sizes[k + 1] || layer.some(row => row.length !== sizes[k] + 1)) {
        throw new Error(`Couche ${k} incompatible avec les tailles ${sizes}`);
      }
    }
  }

  static cloneLayers(layers) {
    return layers.map(layer => layer.map(row => [...row]));
  }

  // poids initiaux uniformes dans [-1, 1]
  static randomLayers(sizes, rng = Math.random) {
    const layers = [];
    for (let k = 0; k < sizes.length - 1; k++) {
      layers.push(Array.from({ length: sizes[k + 1] }, () =>
        Array.from({ length: sizes[k] + 1 }, () => rng() * 2 - 1)));
    }
    return layers;
  }

  static sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  weightCount() {
    return this.layers.reduce((sum, layer) => sum + layer.length * layer[0].length, 0);
  }

  // Propagation avant : un tableau de sizes[0] nombres → un tableau de sizes[last] nombres.
  forward(inputs) {
    if (inputs.length !== this.sizes[0]) {
      throw new Error(`Le réseau attend ${this.sizes[0]} entrées, reçu ${inputs.length}`);
    }
    let values = inputs;
    for (let k = 0; k < this.layers.length; k++) {
      const output = k === this.layers.length - 1;
      values = this.layers[k].map(row => {
        let sum = row[0];
        for (let i = 0; i < values.length; i++) sum += row[i + 1] * values[i];
        return output ? NeuralNetwork.sigmoid(sum) : Math.tanh(sum);
      });
    }
    return values;
  }

  copy() {
    return new NeuralNetwork(this.sizes, this.layers);
  }

  // Croisement uniforme : chaque poids vient de l'un des deux parents.
  crossover(partner, rng = Math.random) {
    if (partner.sizes.join() !== this.sizes.join()) {
      throw new Error('Croisement impossible entre réseaux de tailles différentes');
    }
    const layers = this.layers.map((layer, k) => layer.map((row, j) => row.map((weight, i) =>
      (rng() < 0.5 ? weight : partner.layers[k][j][i]))));
    return new NeuralNetwork(this.sizes, layers);
  }

  // Mutation : chaque poids a une probabilité `rate` de varier d'au plus `amount`,
  // puis il est borné à ±BRAIN_WEIGHT_LIMIT. Renvoie un nouveau réseau.
  mutate(rate, rng = Math.random, amount = 0.5) {
    const layers = this.layers.map(layer => layer.map(row => row.map(weight => {
      if (rng() >= rate) return weight;
      const mutated = weight + (rng() * 2 - 1) * amount;
      return Math.max(-BRAIN_WEIGHT_LIMIT, Math.min(BRAIN_WEIGHT_LIMIT, mutated));
    })));
    return new NeuralNetwork(this.sizes, layers);
  }

  toJSON() {
    return { sizes: [...this.sizes], layers: NeuralNetwork.cloneLayers(this.layers) };
  }

  static fromJSON(data) {
    return new NeuralNetwork(data.sizes, data.layers);
  }
}
