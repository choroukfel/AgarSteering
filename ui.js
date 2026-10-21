// Logique d'interface sans DOM : pseudo, durées, messages d'événements, notifications.
const AgarUi = {
  NAME_MAX_LENGTH: 15,

  // pseudo affiché : espaces regroupés, 15 caractères au plus, valeur par défaut si vide
  sanitizeName(raw, fallback = 'Vous') {
    const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, AgarUi.NAME_MAX_LENGTH).trim();
    return name || fallback;
  },

  // secondes → « m:ss »
  formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  },

  // Message de notification pour un événement du monde, ou null s'il ne concerne pas le joueur.
  // tone : good | bad | info
  messageForEvent(event, config) {
    const byPlayer = event.by && event.by.team === 'player';
    switch (event.type) {
      case 'bot-eaten':
        if (byPlayer) return { text: `Vous avez mangé ${event.prey.name} !`, tone: 'good' };
        if (event.by && event.by.team === 'snake') return { text: `Le serpent a avalé ${event.prey.name}`, tone: 'info' };
        return null;
      case 'snake-eaten':
        return byPlayer
          ? { text: 'Vous avez mangé le serpent gardien !', tone: 'good' }
          : { text: `${event.by.name} a mangé le serpent`, tone: 'info' };
      case 'player-dead':
        return { text: `${event.by.name} vous a mangé…`, tone: 'bad' };
      case 'virus-pop':
        return event.cell.team === 'player' ? { text: 'Boum ! Vous avez explosé sur un virus', tone: 'bad' } : null;
      case 'virus-shot':
        return { text: 'Un virus a été tiré !', tone: 'info' };
      case 'poison':
        if (event.cell.team !== 'player') return null;
        return { text: `Poison : −${Math.round((1 - config.poison.massFactor) * 100)} % de masse`, tone: 'bad' };
      default:
        return null;
    }
  },
};

// File de notifications : un même texte n'est pas répété pendant `cooldown` secondes,
// chaque notification reste `duration` secondes, au plus `max` à la fois.
class ToastQueue {
  constructor({ duration = 3, cooldown = 1.5, max = 4 } = {}) {
    this.duration = duration;
    this.cooldown = cooldown;
    this.max = max;
    this.items = [];
    this.lastShown = new Map();
    this.nextId = 1;
  }

  push(text, tone, now) {
    const last = this.lastShown.get(text);
    if (last !== undefined && now - last < this.cooldown) return false;
    this.lastShown.set(text, now);
    this.items.push({ id: this.nextId++, text, tone, expires: now + this.duration });
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
    return true;
  }

  active(now) {
    this.items = this.items.filter(item => item.expires > now);
    return this.items;
  }
}
