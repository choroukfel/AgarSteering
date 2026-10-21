// Interface DOM : clavier, case Debug synchronisée avec la touche D, curseurs.
// Les frappes faites dans un contrôle (champ, liste, bouton) ne sont pas interceptées.
const AgarControls = {
  isControl(element) {
    return !!element && typeof element.matches === 'function' && element.matches('input, select, textarea, button');
  },

  // action de jeu associée à une touche, ou null
  actionForKey(key, activeElement) {
    if (AgarControls.isControl(activeElement)) return null;
    const k = String(key).toLowerCase();
    if (k === 'd') return 'debug';
    if (k === ' ') return 'split';
    if (k === 'w') return 'eject';
    if (k === 'r') return 'restart';
    if (k === 'c') return 'call';
    if (k === 'escape') return 'menu';
    return null;
  },

  PREFS_KEY: 'agar-steering-prefs',

  // Pseudo et couleur mémorisés dans le navigateur (simple confort : tout échec est ignoré).
  loadPrefs(storage, colors) {
    const defaults = { name: '', color: colors[0] };
    try {
      const saved = JSON.parse(storage.getItem(AgarControls.PREFS_KEY) || '{}');
      return {
        name: typeof saved.name === 'string' ? saved.name : defaults.name,
        color: colors.includes(saved.color) ? saved.color : defaults.color,
      };
    } catch {
      return defaults;
    }
  },

  savePrefs(storage, prefs) {
    try {
      storage.setItem(AgarControls.PREFS_KEY, JSON.stringify(prefs));
      return true;
    } catch {
      return false;
    }
  },

  bindDebug(checkbox, state) {
    checkbox.checked = state.debug;
    checkbox.addEventListener('change', () => { state.debug = checkbox.checked; });
  },

  toggleDebug(checkbox, state) {
    state.debug = !state.debug;
    checkbox.checked = state.debug;
  },

  // curseur → valeur numérique, appliquée pendant le glissement (événement input)
  bindSlider(slider, output, format, onValue) {
    const apply = () => {
      const value = Number(slider.value);
      output.value = format(value);
      onValue(value);
    };
    slider.addEventListener('input', apply);
    apply();
  },
};
