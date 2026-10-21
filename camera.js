// Caméra (rendu uniquement) : elle suit le joueur ou le bot observé et dézoome
// quand la cellule grossit, comme dans Agar.io.
class Camera {
  constructor(x = 0, y = 0, zoom = 1) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    // tremblement d'écran (rendu seulement) : amplitude en pixels, décroît avec le temps
    this.shakeAmount = 0;
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  // zoom décroissant avec le rayon apparent, borné ; screenScale adapte le zoom
  // à la taille de l'écran (un téléphone voit autant d'arène qu'un écran de bureau)
  static zoomFor(radius, screenScale = 1) {
    return Math.max(0.3, Math.min(1.4, Math.pow(32 / Math.max(radius, 1), 0.45))) * screenScale;
  }

  // facteur d'écran : 1 pour un écran dont le petit côté fait 900 px, borné
  static screenScale(w, h) {
    return Math.max(0.45, Math.min(1.2, Math.min(w, h) / 900));
  }

  snapTo(x, y, radius, screenScale = 1) {
    this.x = x;
    this.y = y;
    this.zoom = Camera.zoomFor(radius, screenScale);
  }

  // rapprochement exponentiel, indépendant de la cadence d'affichage
  follow(x, y, radius, dt, screenScale = 1) {
    const ease = 1 - Math.exp(-dt * 6);
    const zoomEase = 1 - Math.exp(-dt * 2);
    this.x += (x - this.x) * ease;
    this.y += (y - this.y) * ease;
    this.zoom += (Camera.zoomFor(radius, screenScale) - this.zoom) * zoomEase;
    this.shakeAmount *= Math.exp(-dt * 8);
    if (this.shakeAmount < 0.2) this.shakeAmount = 0;
  }

  screenToWorld(sx, sy, w, h) {
    return createVector(this.x + (sx - w / 2) / this.zoom, this.y + (sy - h / 2) / this.zoom);
  }

  worldToScreen(wx, wy, w, h) {
    return { x: (wx - this.x) * this.zoom + w / 2, y: (wy - this.y) * this.zoom + h / 2 };
  }

  viewRect(w, h) {
    const halfW = w / 2 / this.zoom;
    const halfH = h / 2 / this.zoom;
    return { left: this.x - halfW, top: this.y - halfH, right: this.x + halfW, bottom: this.y + halfH };
  }

  // l'entité (cercle de rayon r) est-elle au moins en partie visible ?
  sees(entity, view) {
    const r = entity.r ?? 0;
    return entity.pos.x + r >= view.left && entity.pos.x - r <= view.right
      && entity.pos.y + r >= view.top && entity.pos.y - r <= view.bottom;
  }

  apply(w, h) {
    const angle = this.shakeAmount ? (this.x * 12.9898 + this.y * 78.233 + this.shakeAmount * 43.7) : 0;
    translate(w / 2 + Math.cos(angle) * this.shakeAmount, h / 2 + Math.sin(angle * 1.3) * this.shakeAmount);
    scale(this.zoom);
    translate(-this.x, -this.y);
  }
}
