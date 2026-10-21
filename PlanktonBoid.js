// Plancton : petit boid comestible (exemple 7-Boids). Il nage en banc grâce à
// séparation + alignement + cohésion, erre un peu (wander), évite les virus,
// reste dans l'arène et fuit la cellule menaçante la plus proche.
class PlanktonBoid extends Vehicle {
  constructor(x, y, rng = Math.random, mass = 2) {
    super(x, y);
    this.mass = mass;
    this.r = 5;
    this.baseLimits = { maxSpeed: 3, maxForce: 0.12 };
    this.maxSpeed = this.baseLimits.maxSpeed;
    this.maxForce = this.baseLimits.maxForce;
    const angle = rng() * Math.PI * 2;
    this.vel = createVector(Math.cos(angle), Math.sin(angle)).mult(2);
    this.color = '#5eead4';
    this.wanderState = createWanderState({ distance: 40, radius: 20, displaceRange: 0.25 });
    // rayons de perception de chaque règle (px)
    this.radii = { separation: 20, alignment: 45, cohesion: 60 };
    this.fleeRadius = 110;
    this.weights = { separation: 1.8, alignment: 1, cohesion: 0.8, wander: 0.4, avoid: 2.5, walls: 3, flee: 2.5, flow: 0.7, startle: 2.5 };
    this.threat = null;
    this.lastForces = {};
  }

  // Accélération progressive : limites de base × tempo de la partie.
  setTempo(tempo) {
    this.maxSpeed = this.baseLimits.maxSpeed * tempo;
    this.maxForce = this.baseLimits.maxForce * tempo;
  }

  // flock : le banc ; threats : cellules capables de le manger ; viruses : obstacles
  // flow : courants (facultatif) ; noise : bruit en cours (facultatif) — le banc s'éparpille
  steer(flock, threats, viruses, bounds, rng = Math.random, flow = null, noise = null) {
    // perception limitée au voisinage utile : le plus grand rayon des règles du banc
    flock = neighborsWithin(this, flock, Math.max(this.radii.separation, this.radii.alignment, this.radii.cohesion))
      .map(found => found.entity);
    const forces = {
      separation: separationForce(this, flock, this.radii.separation),
      alignment: alignmentForce(this, flock, this.radii.alignment),
      cohesion: cohesionForce(this, flock, this.radii.cohesion),
      wander: wanderForce(this, this.wanderState, rng),
      avoid: avoidForce(this, viruses, 20),
      walls: boundariesForce(this, bounds.x, bounds.y, bounds.width, bounds.height, bounds.margin),
    };
    const threat = nearestWithin(this, threats, this.fleeRadius);
    this.threat = threat ? threat.entity : null;
    if (this.threat) forces.flee = fleeFrom(this, this.threat.pos);
    if (flow) forces.flow = flowFieldForce(this, flow);
    this.heardNoise = noise && this.pos.dist(noise.pos) <= noise.radius ? noise : null;
    if (this.heardNoise) forces.startle = fleeFrom(this, this.heardNoise.pos);
    this.lastForces = applyWeightedForces(this, forces, this.weights);
  }

  // têtard : tête lumineuse et queue qui ondule derrière lui
  show() {
    const heading = this.vel.heading();
    const wiggle = Math.sin(millis() / 90 + this.pos.x * 0.05) * 0.5;
    const back = heading + Math.PI;
    const tailX = this.pos.x + Math.cos(back + wiggle * 0.4) * this.r * 2.4;
    const tailY = this.pos.y + Math.sin(back + wiggle * 0.4) * this.r * 2.4;
    push();
    noFill();
    stroke(AgarTheme.alpha(this.color, 0.7));
    strokeWeight(2);
    bezier(this.pos.x, this.pos.y,
      this.pos.x + Math.cos(back - wiggle) * this.r * 1.2, this.pos.y + Math.sin(back - wiggle) * this.r * 1.2,
      this.pos.x + Math.cos(back + wiggle) * this.r * 1.8, this.pos.y + Math.sin(back + wiggle) * this.r * 1.8,
      tailX, tailY);
    noStroke();
    fill(AgarTheme.alpha(this.color, 0.25));
    circle(this.pos.x, this.pos.y, this.r * 3);
    fill(this.color);
    circle(this.pos.x, this.pos.y, this.r * 1.6);
    pop();
  }
}
