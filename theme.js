// Thème visuel « microscope bioluminescent » partagé par le rendu et l'interface :
// membranes ondulantes, noyaux, spores lumineuses, réseau hexagonal.
const AgarTheme = {
  FONT: '"Exo 2", system-ui, sans-serif',
  PLAYER_COLORS: ['#22d3ee', '#a3e635', '#f472b6', '#fb923c', '#a78bfa', '#facc15'],
  FOOD_COLORS: ['#22d3ee', '#a3e635', '#f472b6', '#facc15', '#38bdf8', '#34d399', '#fb7185', '#c084fc'],
  BOT_COLORS: ['#fb923c', '#f472b6', '#34d399', '#c084fc', '#f87171', '#fbbf24', '#60a5fa', '#2dd4bf'],
  VIRUS: '#d946ef',
  POISON: '#ef4444',
  ARENA: '#06141f',
  OUTSIDE: '#020910',
  LATTICE: 'rgba(56, 189, 248, 0.22)',

  // '#rgb' ou '#rrggbb' → { r, g, b } ; null si la couleur n'est pas hexadécimale
  hexToRgb(hex) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!match) return null;
    let digits = match[1];
    if (digits.length === 3) digits = digits.split('').map(d => d + d).join('');
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  },

  // amount < 0 assombrit vers le noir, amount > 0 éclaircit vers le blanc (|amount| <= 1).
  // Une couleur non hexadécimale est renvoyée telle quelle.
  shade(hex, amount) {
    const rgb = AgarTheme.hexToRgb(hex);
    if (!rgb) return hex;
    const target = amount < 0 ? 0 : 255;
    const t = Math.min(1, Math.abs(amount));
    const channel = c => Math.round(c + (target - c) * t).toString(16).padStart(2, '0');
    return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
  },

  // couleur hexadécimale avec opacité (0..1) au format '#rrggbbaa'
  alpha(hex, opacity) {
    const rgb = AgarTheme.hexToRgb(hex);
    if (!rgb) return hex;
    const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
    const two = n => n.toString(16).padStart(2, '0');
    return `#${two(rgb.r)}${two(rgb.g)}${two(rgb.b)}${two(a)}`;
  },

  // Rayon de la membrane à l'angle donné : deux ondulations lentes, au plus ±5,5 % du rayon.
  // seed décale la phase pour que deux cellules n'ondulent pas à l'unisson.
  membraneRadius(r, angle, time, seed = 0) {
    return r * (1 + 0.035 * Math.sin(5 * angle + time * 2 + seed) + 0.02 * Math.sin(3 * angle - time * 1.3 + seed * 2));
  },
};
