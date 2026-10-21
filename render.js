// Rendu du monde (fond, ordre d'affichage, mini-carte) et diagnostics debug.
// Le debug lit les données de perception et les forces déjà calculées par les
// entités (perception, lastForces, traces) : il ne recalcule aucune force.
const AgarRender = {
  FORCE_COLORS: {
    arrive: '#ffffff', launch: '#ff9100', separation: '#ff5252', alignment: '#448aff', cohesion: '#69f0ae',
    wander: '#e0e0e0', avoid: '#ffd740', walls: '#b388ff', flee: '#ffd54f', evade: '#ffd54f',
    pursue: '#ff8a80', pursuit: '#ff8a80', food: '#b9f6ca', poison: '#f06292', refuge: '#64ffda',
    follow: '#ffca28', cruise: '#ffe082', collision: '#ff80ab', flow: '#4dd0e1', startle: '#ffcc80',
    investigate: '#80d8ff', escort: '#cfd8dc', interpose: '#ff8a80',
  },

  world(world, camera, debug) {
    const view = camera.viewRect(width, height);
    AgarRender.grid(world, view);
    if (world.config.flow.enabled) AgarRender.flow(world.flowField, view);
    AgarRender.patrolPath(world.path);
    if (world.noise) AgarRender.noise(world.noise, world.time);

    const visible = list => list.filter(e => camera.sees(e, view));
    for (const pellet of visible(world.food)) pellet.show();
    for (const pellet of visible(world.poison)) pellet.show();
    for (const blob of visible(world.ejected)) blob.show();
    for (const boid of visible(world.plankton)) boid.show();
    for (let i = world.snakeSegments.length - 1; i >= 0; i--) world.snakeSegments[i].show();
    for (const escort of visible(world.escorts)) escort.show();

    // les petites cellules sous les grandes ; un virus cache les cellules plus légères
    const massive = [...world.cells(), ...world.viruses].filter(e => camera.sees(e, view));
    massive.sort((a, b) => a.mass - b.mass);
    for (const entity of massive) entity.show();

    for (const particle of visible(world.effects)) particle.show(world.time);
    if (debug) AgarRender.debug(world, visible);
  },

  // courants : une flèche discrète par case visible du champ (lecture du FlowField)
  flow(field, view) {
    push();
    stroke(77, 208, 225, 34);
    strokeWeight(2);
    const size = field.resolution;
    const c0 = Math.max(0, Math.floor(view.left / size)), c1 = Math.min(field.cols - 1, Math.floor(view.right / size));
    const r0 = Math.max(0, Math.floor(view.top / size)), r1 = Math.min(field.rows - 1, Math.floor(view.bottom / size));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const angle = field.angles[row * field.cols + col];
        const x = (col + 0.5) * size, y = (row + 0.5) * size;
        const dx = Math.cos(angle) * size * 0.28, dy = Math.sin(angle) * size * 0.28;
        line(x - dx, y - dy, x + dx, y + dy);
        line(x + dx, y + dy, x + dx - Math.cos(angle - 0.5) * 10, y + dy - Math.sin(angle - 0.5) * 10);
        line(x + dx, y + dy, x + dx - Math.cos(angle + 0.5) * 10, y + dy - Math.sin(angle + 0.5) * 10);
      }
    }
    pop();
  },

  // onde du bruit émis par le joueur : son rayon d'audition s'étend puis s'efface
  noise(noise, time) {
    const progress = Math.min(1, (time - noise.time) / noise.duration);
    push();
    noFill();
    stroke(255, 236, 170, 160 * (1 - progress));
    strokeWeight(4);
    circle(noise.pos.x, noise.pos.y, noise.radius * 2 * Math.min(1, progress * 3));
    pop();
  },

  // arène plus claire que l'extérieur, grille discrète et bordure lumineuse
  grid(world, view) {
    push();
    noStroke();
    fill(AgarTheme.ARENA);
    rect(0, 0, world.width, world.height);
    // réseau hexagonal de points, comme une lame de microscope : un motif
    // précalculé répété par le canvas (un seul remplissage par image)
    drawingContext.fillStyle = AgarRender.latticePattern();
    drawingContext.fillRect(Math.max(0, view.left), Math.max(0, view.top),
      Math.min(world.width, view.right) - Math.max(0, view.left),
      Math.min(world.height, view.bottom) - Math.max(0, view.top));
    // bord de l'arène : membrane lumineuse en pointillés
    noFill();
    stroke(34, 211, 238, 35);
    strokeWeight(22);
    rect(0, 0, world.width, world.height, 40);
    stroke(34, 211, 238, 170);
    strokeWeight(4);
    drawingContext.setLineDash([24, 14]);
    rect(0, 0, world.width, world.height, 40);
    drawingContext.setLineDash([]);
    pop();
  },

  // marquage du territoire du serpent sur le fond
  patrolPath(path) {
    push();
    noFill();
    stroke(245, 158, 11, 18);
    strokeWeight(path.radius * 2);
    strokeJoin(ROUND);
    beginShape();
    for (const p of path.points) vertex(p.x, p.y);
    endShape(CLOSE);
    stroke(250, 204, 21, 80);
    strokeWeight(2);
    drawingContext.setLineDash([12, 12]);
    beginShape();
    for (const p of path.points) vertex(p.x, p.y);
    endShape(CLOSE);
    drawingContext.setLineDash([]);
    pop();
  },

  arrow(origin, vector, color, scaleFactor = 1) {
    const v = vector.copy().mult(scaleFactor);
    if (v.mag() < 0.5) return;
    push();
    stroke(color);
    fill(color);
    strokeWeight(2);
    line(origin.x, origin.y, origin.x + v.x, origin.y + v.y);
    translate(origin.x + v.x, origin.y + v.y);
    rotate(v.heading());
    triangle(0, 3, 0, -3, 7, 0);
    pop();
  },

  forces(entity, scaleFactor) {
    for (const [name, force] of Object.entries(entity.lastForces || {})) {
      AgarRender.arrow(entity.pos, force, AgarRender.FORCE_COLORS[name] || '#ffffff', scaleFactor);
    }
  },

  ring(pos, radius, color, dashed = false) {
    push();
    noFill();
    stroke(color);
    strokeWeight(1.5);
    if (dashed) drawingContext.setLineDash([6, 8]);
    circle(pos.x, pos.y, radius * 2);
    drawingContext.setLineDash([]);
    pop();
  },

  link(from, to, color) {
    push();
    stroke(color);
    strokeWeight(1.5);
    line(from.x, from.y, to.x, to.y);
    pop();
  },

  debug(world, visible) {
    for (const bot of visible(world.bots)) AgarRender.botDebug(bot);
    for (const cell of world.player.cells) {
      AgarRender.ring(cell.pos, cell.slowRadius, 'rgba(255,255,255,0.35)', true);
      AgarRender.forces(cell, 60);
    }
    for (const boid of visible(world.plankton)) {
      AgarRender.forces(boid, 80);
      if (boid.threat) AgarRender.link(boid.pos, boid.threat.pos, 'rgba(255,213,79,0.5)');
    }
    if (world.snake) AgarRender.snakeDebug(world.snake);
    for (const escort of world.escorts) {
      if (!escort.leader) continue;
      AgarRender.forces(escort, 40);
      if (escort.threat) AgarRender.link(escort.leader.pos, escort.threat.pos, 'rgba(255,138,128,0.5)');
      else AgarRender.ring(offsetPoint(escort.leader, escort.slot), 8, 'rgba(207,216,220,0.8)');
    }
    for (const segment of world.snakeSegments) AgarRender.arrow(segment.pos, segment.lastForce, '#ffe082', 20);
  },

  botDebug(bot) {
    const p = bot.perception;
    AgarRender.ring(bot.pos, bot.perceptionRadius, 'rgba(255,255,255,0.15)');
    const detected = bot.escape.threatDistance <= bot.detectionRadius;
    AgarRender.ring(bot.pos, bot.detectionRadius, detected ? '#ff5252' : '#ffd740');
    AgarRender.ring(bot.pos, bot.exitDistance, 'rgba(105,240,174,0.6)', true);
    if (bot.escape.threat) AgarRender.link(bot.pos, bot.escape.threat.pos, 'rgba(255,82,82,0.6)');
    if (p.prey) AgarRender.link(bot.pos, p.prey.entity.pos, 'rgba(255,138,128,0.8)');
    if (p.food) AgarRender.link(bot.pos, p.food.entity.pos, 'rgba(185,246,202,0.6)');
    if (bot.decision === 'wander' && bot.wanderState.center) {
      AgarRender.ring(bot.wanderState.center, bot.wanderState.radius, 'rgba(255,255,255,0.4)');
      AgarRender.link(bot.pos, bot.wanderState.target, 'rgba(255,255,255,0.6)');
    }
    if (bot.collisionTrace && bot.collisionTrace.me) {
      // collision prévue : positions futures des deux cellules à l'instant de plus courte distance
      AgarRender.link(bot.pos, bot.collisionTrace.me, 'rgba(255,128,171,0.8)');
      AgarRender.link(bot.collisionTrace.me, bot.collisionTrace.them, 'rgba(255,128,171,0.5)');
    }
    if (bot.heardNoise) AgarRender.link(bot.pos, bot.heardNoise.pos, 'rgba(255,236,170,0.6)');
    if (bot.avoidTrace.ahead) {
      AgarRender.link(bot.pos, bot.avoidTrace.ahead, bot.avoidTrace.obstacle ? '#ffd740' : 'rgba(255,215,64,0.3)');
    }
    AgarRender.forces(bot, 40);
    if (bot instanceof NeuralBotCell) {
      AgarRender.brainDebug(bot);
      // capteurs à rayons : vert libre, rouge si un danger est touché (dernière mesure)
      for (const sensor of bot.sensors) {
        if (!sensor.origin) continue;
        const end = sensor.origin.copy().add(sensor.direction.copy().mult(sensor.hitDistance));
        AgarRender.link(sensor.origin, end, sensor.hit ? 'rgba(255,82,82,0.8)' : 'rgba(105,240,174,0.35)');
      }
    }
  },

  // Sorties du réseau (déjà calculées dans think) : une barre par comportement,
  // hauteur proportionnelle au poids, couleur de la force correspondante.
  brainDebug(bot) {
    const names = BOT_BRAIN.outputs;
    const barWidth = 7;
    const maxHeight = 26;
    const x0 = bot.pos.x - (names.length * (barWidth + 2)) / 2;
    const y0 = bot.pos.y - bot.r - 22;
    push();
    noStroke();
    fill(0, 140);
    rect(x0 - 3, y0 - maxHeight - 3, names.length * (barWidth + 2) + 4, maxHeight + 6, 3);
    names.forEach((name, i) => {
      const h = maxHeight * (bot.brainWeights[name] / BOT_BRAIN.scale[name]);
      fill(AgarRender.FORCE_COLORS[name] || '#ffffff');
      rect(x0 + i * (barWidth + 2), y0 - h, barWidth, h);
    });
    pop();
  },

  snakeDebug(snake) {
    AgarRender.ring(snake.pos, snake.huntRadius, snake.decision === 'hunt' ? '#ff5252' : 'rgba(255,202,40,0.5)', true);
    const t = snake.pathTrace;
    if (snake.decision === 'patrol' && t.predicted) {
      AgarRender.link(snake.pos, t.predicted, '#ffffff');
      AgarRender.link(t.predicted, t.normal, 'rgba(255,255,255,0.6)');
      push();
      noStroke();
      fill(t.offPath ? '#ff5252' : '#69f0ae');
      circle(t.target.x, t.target.y, 10);
      pop();
    }
    if (snake.prey) AgarRender.link(snake.pos, snake.prey.pos, '#ff5252');
    AgarRender.forces(snake, 40);
  },

  // Motif d'une maille du réseau hexagonal (pas de 70 px), créé une seule fois.
  latticePattern() {
    if (!AgarRender.lattice) {
      const step = 70;
      const tileW = step * 2;
      const tileH = Math.round(step * Math.sqrt(3)) * 2;
      const tile = document.createElement('canvas');
      tile.width = tileW;
      tile.height = tileH;
      const ctx = tile.getContext('2d');
      ctx.fillStyle = AgarTheme.LATTICE;
      for (const [x, y] of [[0, 0], [tileW, 0], [tileW / 2, tileH / 2], [0, tileH], [tileW, tileH]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // dessiné en résolution double, ramené à l'échelle du monde
      AgarRender.lattice = drawingContext.createPattern(tile, 'repeat');
      if (AgarRender.lattice.setTransform) AgarRender.lattice.setTransform(new DOMMatrix().scale(0.5));
    }
    return AgarRender.lattice;
  },

  // Vignettage circulaire de l'oculaire du microscope, précalculé pour la taille de l'écran.
  vignette(w, h) {
    const key = `${w}x${h}`;
    if (AgarRender.vignetteKey !== key) {
      AgarRender.vignetteKey = key;
      const layer = document.createElement('canvas');
      layer.width = Math.max(1, Math.round(w));
      layer.height = Math.max(1, Math.round(h));
      const ctx = layer.getContext('2d');
      const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      gradient.addColorStop(0, 'rgba(2, 9, 16, 0)');
      gradient.addColorStop(1, 'rgba(2, 9, 16, 0.75)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      AgarRender.vignetteLayer = layer;
    }
    drawingContext.drawImage(AgarRender.vignetteLayer, 0, 0, w, h);
  },

  // mini-carte en coin d'écran (rendu de l'interface)
  minimap(world, camera, w, h) {
    const size = Math.min(170, Math.max(110, Math.min(w, h) * 0.22));
    const x0 = w - size - 12;
    const y0 = h - size - 12;
    const k = size / Math.max(world.width, world.height);
    push();
    fill(11, 14, 19, 190);
    stroke(255, 40);
    strokeWeight(1);
    rect(x0, y0, size, size, 8);
    noStroke();
    fill(250, 204, 21, 170);
    if (world.snake) circle(x0 + world.snake.pos.x * k, y0 + world.snake.pos.y * k, 6);
    fill(217, 70, 239, 180);
    for (const v of world.viruses) circle(x0 + v.pos.x * k, y0 + v.pos.y * k, 4);
    for (const bot of world.bots) {
      fill(bot.color);
      circle(x0 + bot.pos.x * k, y0 + bot.pos.y * k, Math.max(3, bot.r * k * 2));
    }
    fill(world.player.color);
    stroke(255);
    strokeWeight(1.5);
    for (const cell of world.player.cells) circle(x0 + cell.pos.x * k, y0 + cell.pos.y * k, Math.max(4, cell.r * k * 2));
    const view = camera.viewRect(w, h);
    noFill();
    stroke(255, 120);
    rect(x0 + Math.max(0, view.left) * k, y0 + Math.max(0, view.top) * k,
      (Math.min(world.width, view.right) - Math.max(0, view.left)) * k,
      (Math.min(world.height, view.bottom) - Math.max(0, view.top)) * k);
    pop();
  },
};
