// Tête du serpent gardien. En patrouille, elle suit un chemin fermé (path following
// et projection scalaire). Quand une proie entre dans son rayon de chasse, sans
// s'éloigner du chemin au-delà de la laisse, elle la poursuit avec la poursuite
// parfaite (point d'interception). Sa masse est fixe : elle ne grossit pas.
class SnakeHead extends Cell {
  constructor(x, y, path, config) {
    super(x, y, config.snake.mass, '#facc15');
    this.name = 'Serpent';
    this.team = 'snake';
    this.path = path;
    this.eatRatio = config.cell.eatRatio;
    this.huntRadius = config.snake.huntRadius;
    this.leash = config.snake.leash;
    this.decision = 'patrol';
    this.prey = null;
    this.pathTrace = {};
    this.avoidTrace = {};
    this.lastForces = {};
  }

  // un peu plus vif qu'une cellule de même masse
  normalLimits() {
    const limits = super.normalLimits();
    return { maxSpeed: limits.maxSpeed * 1.3, maxForce: limits.maxForce * 1.2 };
  }

  // Sélection de l'action : chasse si une proie mangeable est proche et reste
  // dans le territoire (distance au chemin <= laisse), sinon patrouille.
  think(preys) {
    const inTerritory = prey => closestOnPath(this.path, prey.pos).distance <= this.leash;
    const found = nearestWithin(this, preys, this.huntRadius,
      prey => prey.team !== this.team && CellMass.canEat(this.mass, prey.mass, this.eatRatio) && inTerritory(prey));
    this.prey = found ? found.entity : null;
    this.decision = this.prey ? 'hunt' : 'patrol';
  }

  steer(viruses, bounds) {
    const forces = {};
    const weights = { pursuit: 1.3, follow: 1.5, cruise: 0.4, avoid: 2, walls: 3 };
    if (this.decision === 'hunt') {
      forces.pursuit = pursuePerfectForce(this, this.prey);
    } else {
      this.pathTrace = {};
      forces.follow = followPathForce(this, this.path, 30, 40, this.pathTrace);
      // petite poussée le long du chemin pour garder l'allure quand on est dans le couloir
      forces.cruise = this.seek(this.pathTrace.target);
    }
    this.avoidTrace = {};
    forces.avoid = avoidForce(this, viruses, 25, 4, this.avoidTrace);
    forces.walls = boundariesForce(this, bounds.x, bounds.y, bounds.width, bounds.height, bounds.margin);
    this.lastForces = applyWeightedForces(this, forces, weights);
  }

  // tête d'anguille : halo, crâne lumineux et deux yeux orientés selon la vitesse
  show() {
    const heading = this.vel.mag() > 0 ? this.vel.heading() : 0;
    push();
    noStroke();
    fill(AgarTheme.alpha(this.color, 0.16));
    circle(this.pos.x, this.pos.y, this.r * 2.6);
    fill(AgarTheme.alpha(this.color, 0.85));
    stroke(AgarTheme.shade(this.color, 0.5));
    strokeWeight(Math.max(2, this.r * 0.08));
    circle(this.pos.x, this.pos.y, this.r * 2);
    noStroke();
    for (const side of [-1, 1]) {
      const a = heading + side * 0.45;
      const ex = this.pos.x + Math.cos(a) * this.r * 0.55;
      const ey = this.pos.y + Math.sin(a) * this.r * 0.55;
      fill(255);
      circle(ex, ey, this.r * 0.3);
      fill(10, 20, 30);
      circle(ex + Math.cos(heading) * this.r * 0.05, ey + Math.sin(heading) * this.r * 0.05, this.r * 0.16);
    }
    pop();
    this.drawLabel();
  }
}
