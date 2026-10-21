// Monde de la partie : il possède les collections d'entités, fournit la perception
// (listes de cellules, de proies...) et orchestre chaque image dans l'ordre de Reynolds :
//   1. sélection de l'action, 2. steering, 3. locomotion (une seule fois par entité),
// puis les horloges et les règles de scène (repas, virus, fusions, réapparitions).
const FOOD_COLORS = AgarTheme.FOOD_COLORS;
const BOT_COLORS = AgarTheme.BOT_COLORS;
const BOT_NAMES = ['Reynolds', 'Boïd', 'Glouton', 'Prudent', 'Fuyard', 'Chasseur', 'Errant', 'Seeker',
  'Vorace', 'Timide', 'Agile', 'Rapace', 'Nomade', 'Rusé', 'Flâneur', 'Goinfre'];

class World {
  constructor(config = createAgarConfig(), rng = Math.random) {
    this.config = config;
    this.rng = rng;
    this.width = config.world.width;
    this.height = config.world.height;
    this.wallMargin = config.world.wallMargin;
    this.food = [];
    this.poison = [];
    this.viruses = [];
    this.ejected = [];
    this.bots = [];
    this.plankton = [];
    this.player = new PlayerController(config);
    this.path = PatrolPath.loop(this.width / 2, this.height / 2, this.width * 0.27, this.height * 0.27, 16, 0.18, 30);
    this.snake = null;
    this.snakeSegments = [];
    this.snakeRespawn = 0;
    // gardes du corps du roi (plus gros bot) et date de réapparition des gardes manquants
    this.escorts = [];
    this.escortRespawn = 0;
    // éclats lumineux (EffectParticle) projetés par les repas et les explosions
    this.effects = [];
    const { poolSize, decay, seedFitness } = config.evolution;
    // courants de l'arène (flow field following) et bruit en cours (audition)
    this.flowField = new FlowField(this.width, this.height, config.flow.resolution);
    this.noise = null;
    this.nextNoiseTime = 0;
    // grilles spatiales des granulés, reconstruites à chaque image (perception et repas)
    this.grids = { food: new SpatialGrid(100), poison: new SpatialGrid(150) };
    this.genePool = new GenePool(poolSize, DNA, decay);
    // réservoir séparé pour les bots neuronaux : les deux populations évoluent sans se mélanger
    this.neuralPool = new GenePool(poolSize, NeuralDNA, decay);
    if (config.neural.usePretrained && typeof PRETRAINED_BOT_BRAINS !== 'undefined') {
      seedNeuralPool(this.neuralPool, PRETRAINED_BOT_BRAINS, seedFitness);
    }
    this.births = 0;
    this.mode = 'play';
    this.time = 0;
    // début de la manche en cours (accélération progressive)
    this.roundStartTime = 0;
    this.events = [];
    // bot suivi par la caméra en mode spectateur
    this.focus = null;
  }

  init() {
    const counts = this.config.counts;
    while (this.food.length < counts.food) this.food.push(this.createFood());
    while (this.poison.length < counts.poison) this.poison.push(this.createPoison());
    while (this.viruses.length < counts.viruses) this.viruses.push(this.createVirus());
    this.setBotCount(counts.bots);
    this.setPlanktonCount(counts.plankton);
    this.spawnSnake();
    this.spawnEscorts();
    if (this.mode === 'play') this.spawnPlayer();
    return this;
  }

  bounds() {
    return { x: 0, y: 0, width: this.width, height: this.height, margin: this.wallMargin };
  }

  randomPosition(margin = 60) {
    return createVector(margin + this.rng() * (this.width - 2 * margin), margin + this.rng() * (this.height - 2 * margin));
  }

  // position éloignée des cellules capables de manger une cellule de masse `mass`
  safePosition(mass, minDistance = 300) {
    let best = this.randomPosition(150);
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = attempt === 0 ? best : this.randomPosition(150);
      const danger = this.cells().some(c => CellMass.canEat(c.mass, mass, this.config.cell.eatRatio)
        && c.pos.dist(candidate) < minDistance + c.r);
      best = candidate;
      if (!danger) break;
    }
    return best;
  }

  // ---------- création des entités ----------
  createFood() {
    const p = this.randomPosition(20);
    return new Food(p.x, p.y, FOOD_COLORS[Math.floor(this.rng() * FOOD_COLORS.length)]);
  }

  createPoison() {
    const p = this.randomPosition(40);
    return new Poison(p.x, p.y, this.config.poison.massFactor);
  }

  createVirus() {
    const p = this.randomPosition(150);
    return new Virus(p.x, p.y, this.config.virus.mass);
  }

  // neural : bot piloté par un réseau de neurones, né du réservoir neuronal
  createBot(neural = this.nextBotIsNeural()) {
    const dna = this.poolFor(neural).breed(this.rng, this.config.evolution.mutationRate);
    const { minStartMass, maxStartMass } = this.config.bot;
    const mass = minStartMass + this.rng() * (maxStartMass - minStartMass);
    const p = this.safePosition(mass);
    const index = this.births++;
    const round = Math.floor(index / BOT_NAMES.length);
    const name = BOT_NAMES[index % BOT_NAMES.length] + (round > 0 ? ` ${round + 1}` : '');
    const BotClass = neural ? NeuralBotCell : BotCell;
    return new BotClass(p.x, p.y, mass, dna, this.config, name, BOT_COLORS[index % BOT_COLORS.length]);
  }

  poolFor(neural) {
    return neural ? this.neuralPool : this.genePool;
  }

  // Le prochain bot est neuronal tant que la part neuronale reste sous config.neural.share.
  // Avec 50 %, les naissances alternent : règles, neuronal, règles, neuronal…
  nextBotIsNeural() {
    const neural = this.bots.filter(bot => bot instanceof NeuralBotCell).length;
    return neural < Math.floor(this.config.neural.share * (this.bots.length + 1));
  }

  createPlanktonSchool(count) {
    const center = this.randomPosition(200);
    const school = [];
    for (let i = 0; i < count; i++) {
      const angle = this.rng() * Math.PI * 2;
      const distance = this.rng() * 60;
      school.push(new PlanktonBoid(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance, this.rng, this.config.plankton.mass));
    }
    for (const boid of school) boid.fleeRadius = this.config.plankton.fleeRadius;
    return school;
  }

  spawnSnake() {
    const start = this.path.points[0];
    const next = this.path.points[1];
    const dir = p5.Vector.sub(next, start).normalize();
    this.snake = new SnakeHead(start.x, start.y, this.path, this.config);
    this.snake.vel = dir.copy().mult(this.snake.maxSpeed);
    this.snakeSegments = [];
    let leader = this.snake;
    const { segments, spacing } = this.config.snake;
    for (let i = 1; i <= segments; i++) {
      const r = this.snake.r * Math.max(0.3, 0.75 - i * 0.03);
      const segment = new SnakeSegment(start.x - dir.x * spacing * i, start.y - dir.y * spacing * i, leader, spacing, r);
      this.snakeSegments.push(segment);
      leader = segment;
    }
  }

  // ---------- gardes du corps ----------
  // le roi : le plus gros bot de l'arène
  king() {
    return this.bots.reduce((best, bot) => (!best || bot.mass > best.mass ? bot : best), null);
  }

  // complète l'escorte (une place libre par garde manquant), près du roi
  spawnEscorts() {
    const king = this.king();
    if (!king) return;
    const { slots, count } = this.config.escort;
    const taken = new Set(this.escorts.map(escort => escort.slot.y));
    for (let i = 0; i < count && this.escorts.length < count; i++) {
      const slot = slots[i % slots.length];
      if (taken.has(slot.y)) continue;
      const point = offsetPoint(king, createVector(slot.x, slot.y));
      const escort = new EscortCell(point.x, point.y, slot, this.config);
      escort.assign(king);
      this.escorts.push(escort);
      taken.add(slot.y);
    }
  }

  // règle de scène : l'escorte suit toujours le roi actuel
  assignEscorts() {
    const king = this.king();
    for (const escort of this.escorts) if (escort.leader !== king) escort.assign(king);
  }

  killSnake() {
    this.snake = null;
    this.snakeSegments = [];
    this.snakeRespawn = this.config.snake.respawnDelay;
  }

  spawnPlayer() {
    const p = this.safePosition(this.config.player.startMass, 400);
    this.player.spawn(p.x, p.y, this.time);
    this.startRound();
  }

  // ---------- accélération progressive ----------
  // Tempo d'une manche de `seconds` secondes : croissance linéaire, plafonnée.
  static tempoAt(seconds, { ratePerMinute = 0, max = 1 } = {}) {
    return Math.min(Math.max(1, max), 1 + Math.max(0, ratePerMinute) * Math.max(0, seconds) / 60);
  }

  startRound() {
    this.roundStartTime = this.time;
  }

  roundTime() {
    return this.time - this.roundStartTime;
  }

  tempo() {
    return World.tempoAt(this.roundTime(), this.config.tempo);
  }

  // ---------- réglages en cours de partie (les instances existantes sont gardées) ----------
  setBotCount(count) {
    this.config.counts.bots = count;
    while (this.bots.length < count) this.bots.push(this.createBot());
    if (this.bots.length > count) this.bots.length = count;
  }

  setPlanktonCount(count) {
    this.config.counts.plankton = count;
    while (this.plankton.length < count) this.plankton.push(...this.createPlanktonSchool(Math.min(15, count - this.plankton.length)));
    if (this.plankton.length > count) this.plankton.length = count;
  }

  // Part de bots neuronaux : appliquée aux prochaines naissances, sans recréer la population.
  setNeuralShare(share) {
    this.config.neural.share = Math.max(0, Math.min(1, share));
  }

  setFoodCount(count) {
    this.config.counts.food = count;
    if (this.food.length > count) this.food.length = count;
  }

  // Changement de scénario : la fuite des bots est réinitialisée sans recréer la population.
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.startRound();
    for (const bot of this.bots) bot.resetEscape();
    if (mode === 'play') {
      if (!this.player.alive) this.spawnPlayer();
    } else {
      this.player.clear();
    }
  }

  // ---------- audition ----------
  // Le joueur fait du bruit depuis sa plus grosse cellule (touche C ou micro). Renvoie le
  // bruit émis, ou null (pas de joueur, ou bruit trop rapproché du précédent).
  emitPlayerNoise(loudness = 0.4) {
    if (this.mode !== 'play' || !this.player.alive || this.time < this.nextNoiseTime) return null;
    const source = this.player.cells.reduce((best, cell) => (cell.mass > best.mass ? cell : best));
    this.noise = new NoiseEvent(source, loudness, this.time, this.config.noise);
    this.nextNoiseTime = this.time + this.config.noise.cooldown;
    this.events.push({ type: 'noise', noise: this.noise });
    return this.noise;
  }

  activeNoise() {
    return this.noise && this.noise.isActive(this.time) ? this.noise : null;
  }

  // ---------- perception partagée ----------
  // granulés proches d'un point (candidats de la grille, à filtrer par distance)
  nearby(kind, pos, radius) {
    return this.grids[kind] ? this.grids[kind].query(pos, radius) : this[kind];
  }

  // toutes les cellules qui peuvent manger ou être mangées
  cells() {
    const list = [...this.player.cells, ...this.bots];
    if (this.snake) list.push(this.snake);
    return list;
  }

  // les gardes peuvent être mangés, mais ne mangent pas (ils ne sont pas dans cells())
  preyCandidates() {
    return [...this.cells(), ...this.plankton, ...this.ejected, ...this.escorts];
  }

  movingEntities() {
    const list = [...this.player.cells, ...this.bots, ...this.plankton, ...this.viruses, ...this.ejected, ...this.snakeSegments, ...this.escorts];
    if (this.snake) list.push(this.snake);
    return list;
  }

  // ---------- boucle ----------
  update(dt, pointer = null) {
    this.time += dt;
    this.events = [];
    const bounds = this.bounds();
    const ratio = this.config.cell.eatRatio;

    // environnement : courants qui ondulent lentement, bruit qui s'éteint
    if (this.config.flow.enabled) this.flowField.update(this.time);
    if (this.noise && !this.noise.isActive(this.time)) this.noise = null;

    // perception : grilles spatiales des granulés pour cette image
    this.grids.food.rebuild(this.food);
    this.grids.poison.rebuild(this.poison);

    // 0. accélération progressive : chaque entité mobile ajuste ses limites au tempo
    const tempo = this.tempo();
    for (const entity of this.movingEntities()) entity.setTempo?.(tempo);

    // 1. sélection de l'action
    for (const bot of this.bots) {
      const transition = bot.think(this, dt);
      if (transition) this.events.push({ type: `flee-${transition}`, bot });
    }
    if (this.snake) this.snake.think([...this.player.cells, ...this.bots, ...this.plankton]);
    this.assignEscorts();
    for (const escort of this.escorts) escort.think(this.cells());

    // 2. steering : chaque entité calcule et applique ses forces
    if (this.player.alive && pointer) this.player.steer(pointer, bounds);
    for (const bot of this.bots) bot.steer(bounds, this.rng);
    const predators = this.cells();
    for (const boid of this.plankton) {
      const threats = predators.filter(c => CellMass.canEat(c.mass, boid.mass, ratio));
      boid.steer(this.plankton, threats, this.viruses, bounds, this.rng,
        this.config.flow.enabled ? this.flowField : null, this.noise);
    }
    if (this.snake) this.snake.steer(this.viruses, bounds);
    for (const segment of this.snakeSegments) segment.steer();
    for (const virus of this.viruses) virus.steer();
    for (const blob of this.ejected) blob.steer();
    for (const escort of this.escorts) escort.steer(bounds);

    // 3. locomotion héritée de Vehicle, une fois par entité
    for (const entity of this.movingEntities()) {
      entity.update();
      this.keepInside(entity);
    }

    // éclats : traînée de Reynolds puis locomotion héritée, une fois par image
    for (let i = this.effects.length - 1; i >= 0; i--) if (!this.effects[i].isAlive(this.time)) this.effects.splice(i, 1);
    for (const particle of this.effects) particle.steer();
    for (const particle of this.effects) particle.update();

    // 4. horloges (impulsions, délais de fusion, amaigrissement, âge)
    for (const cell of [...this.player.cells, ...this.bots, ...this.viruses, ...this.ejected]) cell.tick(dt);
    if (this.snake) this.snake.tick(dt);

    // 5. règles de scène
    this.resolvePellets();
    this.resolveCells();
    this.resolveViruses();
    this.player.resolveMerges();
    this.player.updatePeak();
    this.refill(dt);
  }

  // Règle de scène explicite : les murs de l'arène bornent la position du centre.
  // Le steering (boundaries) écarte normalement les entités avant d'y arriver.
  keepInside(entity) {
    entity.pos.x = Math.max(0, Math.min(this.width, entity.pos.x));
    entity.pos.y = Math.max(0, Math.min(this.height, entity.pos.y));
  }

  resolvePellets() {
    const eaters = [...this.player.cells, ...this.bots];
    // grilles à jour au moment des repas (des granulés ont pu apparaître depuis le début de l'image)
    this.grids.food.rebuild(this.food);
    this.grids.poison.rebuild(this.poison);
    for (const meal of GameRules.eatPelletsNear(eaters, this.food, this.grids.food)) {
      if (meal.eater.team === 'player') this.player.recordMeal(meal.pellet);
    }
    for (const meal of GameRules.eatPelletsNear(eaters, this.poison, this.grids.poison)) this.events.push({ type: 'poison', cell: meal.eater });
  }

  resolveCells() {
    const meals = GameRules.findMeals(this.cells(), this.preyCandidates(), this.config.cell.eatRatio);
    for (const { eater, prey } of meals) {
      if (eater !== this.snake) eater.setMass(eater.mass + prey.mass);
      if (eater.team === 'player') this.player.recordMeal(prey);
      this.removeEaten(prey, eater);
    }
  }

  // règle de scène : une gerbe d'éclats à l'endroit d'un repas ou d'une explosion
  burst(pos, color, count = 10, speed = 6) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.rng() * 0.5;
      this.effects.push(new EffectParticle(pos.x, pos.y, angle, speed * (0.5 + this.rng() * 0.7), color, 0.6 + this.rng() * 0.4, this.time));
    }
    if (this.effects.length > 240) this.effects.splice(0, this.effects.length - 240);
  }

  removeEaten(prey, eater) {
    if (prey.mass >= 10) this.burst(prey.pos, prey.color ?? '#ffffff', Math.min(18, 6 + Math.round(prey.mass / 20)));
    const remove = (list, item) => {
      const index = list.indexOf(item);
      if (index >= 0) list.splice(index, 1);
      return index >= 0;
    };
    if (remove(this.plankton, prey) || remove(this.ejected, prey)) return;
    if (remove(this.escorts, prey)) {
      this.escortRespawn = this.time + this.config.escort.respawnDelay;
      this.events.push({ type: 'escort-eaten', prey, by: eater });
      return;
    }
    if (prey === this.snake) {
      this.killSnake();
      this.events.push({ type: 'snake-eaten', by: eater });
      return;
    }
    if (prey instanceof BotCell) {
      // l'ADN du bot mangé rejoint le réservoir de sa population ; un descendant
      // de la même population le remplace aussitôt
      const neural = prey instanceof NeuralBotCell;
      this.poolFor(neural).add(prey.dna, prey.fitness());
      const index = this.bots.indexOf(prey);
      if (index >= 0) this.bots.splice(index, 1, this.createBot(neural));
      if (this.focus === prey) this.focus = null;
      this.events.push({ type: 'bot-eaten', prey, by: eater });
      return;
    }
    if (prey instanceof PlayerCell) {
      this.player.remove(prey);
      if (!this.player.alive) {
        this.player.recordDeath(eater, this.time);
        this.events.push({ type: 'player-dead', by: eater });
      }
    }
  }

  resolveViruses() {
    const virusConfig = this.config.virus;
    // masse éjectée qui touche un virus : elle le nourrit ; au seuil, il tire un nouveau virus
    for (let i = this.ejected.length - 1; i >= 0; i--) {
      const blob = this.ejected[i];
      const virus = this.viruses.find(v => v.pos.dist(blob.pos) <= v.r);
      if (!virus) continue;
      this.ejected.splice(i, 1);
      if (virus.feed(virusConfig.feedsToShoot) && this.viruses.length < this.config.counts.viruses * 2) {
        const dir = blob.vel.mag() > 0 ? blob.vel.copy().normalize() : createVector(1, 0);
        const shot = new Virus(virus.pos.x + dir.x * virus.r * 2, virus.pos.y + dir.y * virus.r * 2, virusConfig.mass);
        shot.startLaunch(dir, virusConfig.shootSpeed, virusConfig.shootDuration);
        this.viruses.push(shot);
        this.events.push({ type: 'virus-shot', virus: shot });
      }
    }
    // cellule assez grosse qui recouvre un virus : explosion
    for (const virus of [...this.viruses]) {
      const cell = [...this.player.cells, ...this.bots].find(c => GameRules.popsVirus(c, virus, virusConfig.popRatio));
      if (!cell) continue;
      this.viruses.splice(this.viruses.indexOf(virus), 1);
      if (cell instanceof PlayerCell) {
        cell.setMass(cell.mass + virus.mass);
        this.player.pop(cell, this.rng);
      } else {
        this.scatterMass(cell, cell.mass / 2);
      }
      this.burst(virus.pos, AgarTheme.VIRUS ?? '#a855f7', 16, 8);
      this.events.push({ type: 'virus-pop', cell });
    }
  }

  // Un bot qui explose sur un virus perd la moitié de sa masse, semée en granulés autour de lui.
  scatterMass(cell, lost) {
    cell.setMass(cell.mass - lost);
    const pieces = Math.max(1, Math.min(10, Math.floor(lost / 2)));
    for (let i = 0; i < pieces; i++) {
      const angle = (i / pieces) * Math.PI * 2;
      const distance = cell.r + 20 + this.rng() * 40;
      const pellet = new Food(cell.pos.x + Math.cos(angle) * distance, cell.pos.y + Math.sin(angle) * distance, cell.color, lost / pieces);
      pellet.r = 7;
      this.keepInside(pellet);
      this.food.push(pellet);
    }
  }

  // Réapparitions : on complète les collections progressivement.
  refill(dt) {
    const counts = this.config.counts;
    for (let i = 0; i < 6 && this.food.length < counts.food; i++) this.food.push(this.createFood());
    if (this.poison.length < counts.poison) this.poison.push(this.createPoison());
    if (this.viruses.length < counts.viruses) this.viruses.push(this.createVirus());
    if (this.plankton.length < counts.plankton - 8) this.setPlanktonCount(counts.plankton);
    if (!this.snake) {
      this.snakeRespawn -= dt;
      if (this.snakeRespawn <= 0) this.spawnSnake();
    }
    if (this.escorts.length < this.config.escort.count && this.time >= this.escortRespawn) this.spawnEscorts();
  }

  // ---------- caméra et affichage ----------
  // point suivi par la caméra et rayon apparent (pour le zoom)
  focusView() {
    if (this.mode === 'play' && this.player.alive) {
      const center = this.player.centroid();
      let spread = CellMass.radius(this.player.totalMass());
      for (const cell of this.player.cells) spread = Math.max(spread, center.dist(cell.pos) + cell.r);
      return { x: center.x, y: center.y, radius: spread };
    }
    if (!this.focus || !this.bots.includes(this.focus)) {
      this.focus = this.bots.reduce((best, bot) => (!best || bot.mass > best.mass ? bot : best), null);
    }
    if (this.focus) return { x: this.focus.pos.x, y: this.focus.pos.y, radius: this.focus.r * 2.5 };
    return { x: this.width / 2, y: this.height / 2, radius: 200 };
  }

  // classement : le joueur compte comme une seule entrée (somme de ses cellules)
  leaderboard(limit = 8) {
    const rows = this.bots.map(bot => ({ name: bot.name, mass: bot.mass, isPlayer: false, neural: bot instanceof NeuralBotCell }));
    if (this.player.alive) rows.push({ name: this.player.name, mass: this.player.totalMass(), isPlayer: true });
    return rows.sort((a, b) => b.mass - a.mass).slice(0, limit);
  }

  // répartition des décisions des bots (affichée dans le panneau des techniques)
  stats() {
    const decisions = { flee: 0, hunt: 0, graze: 0, wander: 0, exhausted: 0, investigate: 0, startled: 0 };
    for (const bot of this.bots) {
      if (bot.escape.state === 'exhausted') decisions.exhausted++;
      else decisions[bot.decision]++;
    }
    const best = this.genePool.best();
    const bestNeural = this.neuralPool.best();
    const population = list => ({
      count: list.length,
      averageMass: list.length ? list.reduce((sum, bot) => sum + bot.mass, 0) / list.length : 0,
      generation: list.reduce((max, bot) => Math.max(max, bot.dna.generation), 0),
    });
    return {
      tempo: this.tempo(),
      neural: { ...population(this.bots.filter(b => b instanceof NeuralBotCell)), bestFitness: bestNeural ? bestNeural.fitness : 0 },
      rules: population(this.bots.filter(b => !(b instanceof NeuralBotCell))),
      decisions,
      births: this.births,
      bestFitness: best ? best.fitness : 0,
      bestGenes: best ? best.dna.genes : null,
      plankton: this.plankton.length,
      escorts: this.escorts.length,
      escortsProtecting: this.escorts.filter(escort => escort.decision === 'interpose').length,
      viruses: this.viruses.length,
      snake: this.snake ? this.snake.decision : 'absent',
      playerCells: this.player.cells.length,
    };
  }
}
