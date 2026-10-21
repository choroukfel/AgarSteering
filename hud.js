// Affichage DOM (interface) : score, classement, compteurs des techniques,
// notifications et écran de fin de partie.
class AgarHud {
  constructor(doc) {
    this.doc = doc;
    this.el = id => doc.getElementById(id);
    this.toasts = new ToastQueue();
    this.toastNodes = new Map();
  }

  // événements du monde → notifications (seulement celles qui concernent le joueur)
  pushEvents(events, config, now) {
    for (const event of events) {
      const message = AgarUi.messageForEvent(event, config);
      if (message) this.toasts.push(message.text, message.tone, now);
    }
    this.renderToasts(now);
  }

  renderToasts(now) {
    const active = this.toasts.active(now);
    const ids = new Set(active.map(item => item.id));
    for (const [id, node] of this.toastNodes) {
      if (!ids.has(id)) {
        node.remove();
        this.toastNodes.delete(id);
      }
    }
    const container = this.el('toasts');
    for (const item of active) {
      if (this.toastNodes.has(item.id)) continue;
      const node = this.doc.createElement('div');
      node.className = `toast ${item.tone}`;
      node.textContent = item.text;
      container.append(node);
      this.toastNodes.set(item.id, node);
    }
  }

  scoreText(world, ui) {
    if (world.mode === 'spectate') {
      if (!world.focus) return 'Spectateur';
      const state = BotCell.STATE_LABELS[world.focus.displayState()];
      return `Spectateur · ${world.focus.name} (${state}, ${Math.round(world.focus.mass)}) · vitesse ×${world.tempo().toFixed(2)} · cliquez sur un bot pour le suivre`;
    }
    if (!world.player.alive) return 'Vous avez été mangé';
    const cells = world.player.cells.length;
    const parts = [`Masse ${Math.round(world.player.totalMass())}`, `record ${Math.round(world.player.peakMass)}`];
    if (cells > 1) parts.push(`${cells} cellules`);
    parts.push(`vitesse ×${world.tempo().toFixed(2)}`);
    return parts.join(' · ');
  }

  update(world, ui) {
    const score = this.el('score');
    score.hidden = ui.screen === 'menu';
    score.textContent = this.scoreText(world, ui);

    const board = this.el('leaderboard-list');
    board.replaceChildren(...world.leaderboard(10).map((row, i) => {
      const item = this.doc.createElement('li');
      const name = this.doc.createElement('span');
      name.textContent = `${i + 1}. ${row.neural ? '🧠 ' : ''}${row.name}`;
      const mass = this.doc.createElement('span');
      mass.className = 'mass';
      mass.textContent = Math.round(row.mass);
      item.append(name, mass);
      if (row.isPlayer) item.className = 'me';
      return item;
    }));

    const stats = world.stats();
    const d = stats.decisions;
    this.el('stat-flee').textContent = d.flee;
    this.el('stat-exhausted').textContent = d.exhausted;
    this.el('stat-hunt').textContent = d.hunt;
    this.el('stat-graze').textContent = d.graze;
    this.el('stat-wander').textContent = d.wander;
    this.el('stat-plankton').textContent = stats.plankton;
    this.el('stat-snake').textContent = stats.snake === 'hunt' ? 'chasse' : stats.snake === 'patrol' ? 'patrouille' : 'mangé';
    this.el('stat-viruses').textContent = stats.viruses;
    this.el('stat-births').textContent = stats.births;
    this.el('stat-generation').textContent = world.bots.reduce((max, bot) => Math.max(max, bot.dna.generation), 0);
    this.el('stat-fitness').textContent = Math.round(stats.bestFitness);
    this.el('stat-genes').textContent = stats.bestGenes
      ? `Meilleur ADN : nourriture ${stats.bestGenes.foodWeight.toFixed(2)}, poison ${stats.bestGenes.poisonWeight.toFixed(2)}, menace ${stats.bestGenes.threatWeight.toFixed(2)}, détection ${Math.round(stats.bestGenes.detection)} px`
      : 'Meilleur ADN : en attente du premier bot mangé';
    this.el('stat-escorts').textContent = stats.escorts;
    this.el('stat-escorts-protecting').textContent = stats.escortsProtecting;
    this.el('stat-investigate').textContent = d.investigate;
    this.el('stat-startled').textContent = d.startled;
    this.el('stat-composition').textContent = world.config.composition.mode === 'priority' ? 'priorités (Reynolds)' : 'somme pondérée';
    const sizes = NeuralDNA.sizes();
    this.el('stat-neural-shape').textContent = `Réseau ${sizes.join(' → ')} : ${new NeuralNetwork(sizes, null, () => 0.5).weightCount()} poids évolués par génération`;
    this.el('stat-neural').textContent = stats.neural.count;
    this.el('stat-neural-generation').textContent = stats.neural.generation;
    this.el('stat-neural-compare').textContent = stats.neural.count && stats.rules.count
      ? `Masse moyenne : 🧠 ${Math.round(stats.neural.averageMass)} contre règles ${Math.round(stats.rules.averageMass)}`
      : 'Masse moyenne : comparaison dès que les deux populations sont présentes';

    const dead = ui.screen === 'game' && world.mode === 'play' && !world.player.alive;
    const gameOver = this.el('game-over');
    if (dead && gameOver.hidden) this.fillGameOver(world);
    gameOver.hidden = !dead;
  }

  fillGameOver(world) {
    const summary = world.player.summary(world.time);
    this.el('killer').textContent = summary.killer ? `Mangé par ${summary.killer}` : '';
    this.el('final-mass').textContent = Math.round(summary.peakMass);
    this.el('final-time').textContent = AgarUi.formatDuration(summary.survival);
    this.el('final-kills').textContent = summary.kills;
    this.el('final-food').textContent = summary.food + summary.plankton;
  }
}
