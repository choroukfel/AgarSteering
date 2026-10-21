// Boucle p5 : écrans (menu, jeu), entrées du joueur, mise à jour du monde, caméra et rendu.
let world;
let viewCamera;
let hud;
let sceneCanvas;
const ui = {
  debug: false,
  screen: 'menu',
  ejectCooldown: 0,
  hudTimer: 0,
  touchEject: false,
  name: 'Vous',
  color: AgarTheme.PLAYER_COLORS[0],
};
const EJECT_INTERVAL = 0.12;
const KEY_W = 87;
const byId = id => document.getElementById(id);

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function setup() {
  pixelDensity(Math.min(2, displayDensity()));
  sceneCanvas = createCanvas(windowWidth, windowHeight);
  sceneCanvas.parent('scene');
  textFont(AgarTheme.FONT);

  // le menu s'affiche devant une partie entre bots
  world = new World(createAgarConfig());
  world.setMode('spectate');
  world.init();
  viewCamera = new Camera();
  const focus = world.focusView();
  viewCamera.snapTo(focus.x, focus.y, focus.radius, Camera.screenScale(width, height));

  hud = new AgarHud(document);
  const prefs = AgarControls.loadPrefs(browserStorage(), AgarTheme.PLAYER_COLORS);
  ui.color = prefs.color;
  byId('nickname').value = prefs.name;
  buildColorChoices();
  bindControls();
  if (window.innerWidth < 900) byId('techniques').open = false;
  byId('touch-controls').hidden = !window.matchMedia('(pointer: coarse)').matches;
  hud.update(world, ui);
}

function draw() {
  const dt = Math.min(deltaTime / 1000, 0.05);
  let pointer = viewCamera.screenToWorld(mouseX, mouseY, width, height);
  // menu ouvert pendant une partie : la cellule freine sur place
  if (ui.screen === 'menu' && world.player.alive) pointer = world.player.centroid();

  // W maintenu (ou bouton tactile) : éjection continue, cadencée
  ui.ejectCooldown = Math.max(0, ui.ejectCooldown - dt);
  const ejectHeld = ui.touchEject || (keyIsDown(KEY_W) && !AgarControls.isControl(document.activeElement));
  if (ejectHeld && ui.screen === 'game' && ui.ejectCooldown === 0) ejectMass(pointer);

  handleMicrophone(pointer);
  world.update(dt, pointer);
  hud.pushEvents(world.events, world.config, world.time);
  AgarAudio.handleEvents(world.events, viewCamera, width, height);
  shakeOnEvents(world.events);
  const focus = world.focusView();
  viewCamera.follow(focus.x, focus.y, focus.radius, dt, Camera.screenScale(width, height));

  background(AgarTheme.OUTSIDE);
  push();
  viewCamera.apply(width, height);
  AgarRender.world(world, viewCamera, ui.debug);
  pop();
  AgarRender.vignette(width, height);
  AgarRender.minimap(world, viewCamera, width, height);

  ui.hudTimer -= dt;
  if (ui.hudTimer <= 0) {
    hud.update(world, ui);
    ui.hudTimer = 0.2;
  }
}

function ejectMass(pointer) {
  ui.ejectCooldown = EJECT_INTERVAL;
  if (world.mode !== 'play') return;
  const blobs = world.player.eject(pointer);
  world.ejected.push(...blobs);
  if (blobs.length) AgarAudio.play('eject');
}

// tremblement d'écran : explosion d'un virus près de la vue, mort du joueur
function shakeOnEvents(events) {
  for (const event of events) {
    if (event.type === 'player-dead') viewCamera.shake(14);
    else if (event.type === 'virus-pop' && event.cell && event.cell.team === 'player') viewCamera.shake(10);
    else if (event.type === 'virus-pop') viewCamera.shake(3);
  }
}

// micro : clap = bruit, double clap = split vers le pointeur, cri = grand bruit
const clapDetector = new ClapDetector();
function handleMicrophone(pointer) {
  if (!MicrophoneInput.isActive() || ui.screen !== 'game' || world.mode !== 'play') return;
  const event = clapDetector.update(MicrophoneInput.level(), millis());
  if (!event) return;
  if (event.type === 'double-clap') world.player.split(pointer);
  else if (event.type === 'shout') world.emitPlayerNoise(Math.max(0.8, event.loudness));
  else world.emitPlayerNoise(Math.min(1, event.loudness * 1.5));
}

function keyPressed() {
  const action = AgarControls.actionForKey(key, document.activeElement);
  if (!action) return;
  if (action === 'menu') {
    if (ui.screen === 'menu') closeMenu();
    else openMenu();
  } else if (action === 'debug') {
    AgarControls.toggleDebug(byId('debug'), ui);
  } else if (ui.screen === 'game') {
    const pointer = viewCamera.screenToWorld(mouseX, mouseY, width, height);
    if (action === 'split' && world.mode === 'play') {
      world.player.split(pointer);
      AgarAudio.play('split');
    } else if (action === 'eject') ejectMass(pointer);
    else if (action === 'call') world.emitPlayerNoise(0.4);
    else if (action === 'restart') restartPlayer();
  }
  // empêche le défilement de la page avec Espace
  return false;
}

// En mode spectateur, un clic sur le canvas choisit le bot suivi par la caméra.
function mousePressed(event) {
  if (world.mode !== 'spectate' || ui.screen !== 'game' || !event || event.target !== sceneCanvas.elt) return;
  const pointer = viewCamera.screenToWorld(mouseX, mouseY, width, height);
  const nearest = nearestWithin({ pos: pointer }, world.bots, 250 / viewCamera.zoom);
  if (nearest) world.focus = nearest.entity;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ---------- écrans ----------
function setScreen(screen) {
  ui.screen = screen;
  byId('menu').hidden = screen !== 'menu';
  hud.update(world, ui);
}

function startGame() {
  AgarAudio.unlock();
  ui.name = AgarUi.sanitizeName(byId('nickname').value);
  AgarControls.savePrefs(browserStorage(), { name: byId('nickname').value.trim(), color: ui.color });
  world.player.configure(ui.name, ui.color);
  if (world.mode !== 'play') world.setMode('play');
  else if (!world.player.alive) world.spawnPlayer();
  byId('mode').value = 'play';
  document.activeElement?.blur();
  setScreen('game');
}

function spectate() {
  world.setMode('spectate');
  byId('mode').value = 'spectate';
  document.activeElement?.blur();
  setScreen('game');
}

function openMenu() {
  setScreen('menu');
  if (!window.matchMedia('(pointer: coarse)').matches) byId('nickname').focus();
}

// Échap referme le menu seulement s'il y a une partie (ou une observation) à reprendre.
function closeMenu() {
  if (world.mode === 'spectate' || world.player.alive) setScreen('game');
}

function restartPlayer() {
  if (world.mode === 'play' && !world.player.alive) world.spawnPlayer();
  hud.update(world, ui);
}

// ---------- interface ----------
function buildColorChoices() {
  const container = byId('color-choices');
  const buttons = AgarTheme.PLAYER_COLORS.map(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.background = color;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', `Couleur ${color}`);
    button.addEventListener('click', () => {
      ui.color = color;
      for (const b of buttons) b.setAttribute('aria-checked', String(b === button));
    });
    button.setAttribute('aria-checked', String(color === ui.color));
    return button;
  });
  container.replaceChildren(...buttons);
}

function bindControls() {
  AgarControls.bindDebug(byId('debug'), ui);
  byId('composition').addEventListener('change', event => { world.config.composition.mode = event.target.value; });
  byId('flow-enabled').addEventListener('change', event => { world.config.flow.enabled = event.target.checked; });
  byId('sound-enabled').addEventListener('change', event => {
    AgarAudio.enabled = event.target.checked;
    if (AgarAudio.enabled) AgarAudio.unlock();
  });
  byId('mic-enabled').addEventListener('change', async event => {
    const checkbox = event.target;
    const status = byId('mic-status');
    if (checkbox.checked) {
      const context = AgarAudio.unlock();
      const ok = context ? await MicrophoneInput.start(context) : false;
      checkbox.checked = ok;
      status.textContent = ok ? 'Micro actif : clap = bruit · double clap = split · cri = grand bruit.'
        : 'Micro indisponible ou refusé : touche C pour faire du bruit.';
    } else {
      MicrophoneInput.stop();
      status.textContent = 'Micro coupé : touche C pour faire du bruit.';
    }
    checkbox.blur();
  });

  byId('menu-form').addEventListener('submit', event => {
    event.preventDefault();
    startGame();
  });
  byId('spectate-button').addEventListener('click', spectate);
  byId('menu-button').addEventListener('click', event => {
    event.currentTarget.blur();
    openMenu();
  });
  byId('game-over-menu').addEventListener('click', openMenu);
  for (const id of ['restart', 'game-over-restart']) {
    byId(id).addEventListener('click', event => {
      restartPlayer();
      event.currentTarget.blur();
    });
  }

  byId('mode').addEventListener('change', event => {
    if (event.target.value === 'play') startGame();
    else spectate();
  });

  const toggle = byId('settings-toggle');
  toggle.addEventListener('click', () => {
    const open = byId('settings').hidden;
    byId('settings').hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.blur();
  });

  // commandes tactiles
  byId('touch-split').addEventListener('pointerdown', event => {
    event.preventDefault();
    if (ui.screen === 'game' && world.mode === 'play') {
      world.player.split(viewCamera.screenToWorld(mouseX, mouseY, width, height));
      AgarAudio.play('split');
    }
  });
  byId('touch-call').addEventListener('pointerdown', event => {
    event.preventDefault();
    if (ui.screen === 'game') world.emitPlayerNoise(0.4);
  });
  const eject = byId('touch-eject');
  eject.addEventListener('pointerdown', event => {
    event.preventDefault();
    ui.touchEject = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    eject.addEventListener(type, () => { ui.touchEject = false; });
  }

  AgarControls.bindSlider(byId('bot-count'), byId('bot-count-value'), v => `${v}`, v => world.setBotCount(v));
  AgarControls.bindSlider(byId('food-count'), byId('food-count-value'), v => `${v}`, v => world.setFoodCount(v));
  AgarControls.bindSlider(byId('plankton-count'), byId('plankton-count-value'), v => `${v}`, v => world.setPlanktonCount(v));
  AgarControls.bindSlider(byId('mutation-rate'), byId('mutation-rate-value'), v => `${Math.round(v * 100)} %`,
    v => { world.config.evolution.mutationRate = v; });
  AgarControls.bindSlider(byId('neural-share'), byId('neural-share-value'), v => `${Math.round(v * 100)} %`,
    v => world.setNeuralShare(v));
  AgarControls.bindSlider(byId('tempo-rate'), byId('tempo-rate-value'), v => `${Math.round(v * 100)} %/min`,
    v => { world.config.tempo.ratePerMinute = v; });
  AgarControls.bindSlider(byId('flee-duration'), byId('flee-duration-value'), v => `${v.toFixed(1)} s`, v => {
    world.config.flee.maxDuration = v;
    for (const bot of world.bots) bot.escape.maxDuration = v;
  });
}
