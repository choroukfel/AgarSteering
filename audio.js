// Effets sonores synthétisés (Web Audio, aucun fichier) et spatialisés : chaque son est placé
// à gauche ou à droite selon la position à l'écran de son origine (Camera.worldToScreen) et
// atténué avec la distance au centre de la vue. Rendu seulement : aucune influence sur le jeu.
const AgarAudio = {
  context: null,
  enabled: true,
  volume: 0.5,

  // notes : [fréquence Hz, début s, durée s]
  SOUNDS: {
    gulp: { type: 'sine', notes: [[420, 0, 0.09], [260, 0.05, 0.12]], gain: 0.3 },
    eatBig: { type: 'triangle', notes: [[330, 0, 0.12], [494, 0.08, 0.16], [659, 0.16, 0.22]], gain: 0.3 },
    pop: { type: 'square', notes: [[160, 0, 0.08], [90, 0.04, 0.25]], gain: 0.22 },
    shoot: { type: 'sawtooth', notes: [[220, 0, 0.12], [440, 0.05, 0.1]], gain: 0.12 },
    poison: { type: 'sawtooth', notes: [[300, 0, 0.12], [200, 0.1, 0.18]], gain: 0.14 },
    death: { type: 'sawtooth', notes: [[330, 0, 0.2], [247, 0.18, 0.25], [165, 0.4, 0.5]], gain: 0.2 },
    boss: { type: 'triangle', notes: [[392, 0, 0.12], [523, 0.1, 0.12], [659, 0.2, 0.12], [784, 0.3, 0.35]], gain: 0.28 },
    call: { type: 'sine', notes: [[520, 0, 0.3], [780, 0.06, 0.4]], gain: 0.22 },
    split: { type: 'triangle', notes: [[600, 0, 0.06], [900, 0.04, 0.08]], gain: 0.14 },
    eject: { type: 'sine', notes: [[700, 0, 0.05]], gain: 0.08 },
    alarm: { type: 'square', notes: [[880, 0, 0.05], [880, 0.09, 0.05]], gain: 0.05 },
    guard: { type: 'triangle', notes: [[740, 0, 0.08], [554, 0.06, 0.12]], gain: 0.14 },
  },

  // à appeler pendant un geste du joueur (clic sur Jouer), sinon le navigateur bloque le son
  unlock() {
    try {
      if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume();
    } catch {
      this.context = null;
    }
    return this.context;
  },

  // pan (−1..1) et volume (0..1) selon la position à l'écran de l'origine du son
  placement(worldPos, camera, w, h) {
    if (!worldPos || !camera) return { pan: 0, level: 1 };
    const screen = camera.worldToScreen(worldPos.x, worldPos.y, w, h);
    const pan = Math.max(-1, Math.min(1, (screen.x - w / 2) / (w / 2)));
    const distance = Math.hypot(screen.x - w / 2, screen.y - h / 2) / Math.hypot(w / 2, h / 2);
    return { pan, level: Math.max(0, 1 - Math.max(0, distance - 0.6) * 1.2) };
  },

  play(name, worldPos = null, camera = null, w = 1, h = 1) {
    const sound = this.SOUNDS[name];
    if (!sound || !this.enabled || !this.context || this.context.state !== 'running') return false;
    const { pan, level } = this.placement(worldPos, camera, w, h);
    if (level <= 0.02) return false;
    const ctx = this.context;
    const start = ctx.currentTime;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      panner.connect(ctx.destination);
    }
    for (const [frequency, offset, duration] of sound.notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = sound.type;
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(0, start + offset);
      gain.gain.linearRampToValueAtTime(sound.gain * this.volume * level, start + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
      oscillator.connect(gain).connect(panner ?? ctx.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + duration + 0.05);
    }
    return true;
  },

  // son associé à un événement du monde (null si l'événement est silencieux)
  soundFor(event) {
    const byPlayer = event.by && event.by.team === 'player';
    switch (event.type) {
      case 'bot-eaten': return byPlayer ? 'eatBig' : 'gulp';
      case 'snake-eaten': return 'boss';
      case 'virus-pop': return 'pop';
      case 'virus-shot': return 'shoot';
      case 'poison': return event.cell && event.cell.team === 'player' ? 'poison' : null;
      case 'player-dead': return 'death';
      case 'noise': return 'call';
      case 'escort-eaten': return 'guard';
      case 'flee-start': return 'alarm';
      default: return null;
    }
  },

  // origine spatiale d'un événement
  originOf(event) {
    return event.prey?.pos ?? event.virus?.pos ?? event.cell?.pos ?? event.bot?.pos ?? event.noise?.pos ?? null;
  },

  handleEvents(events, camera, w, h) {
    for (const event of events) {
      const name = this.soundFor(event);
      if (name) this.play(name, this.originOf(event), camera, w, h);
    }
  },
};
