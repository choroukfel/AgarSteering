// Relations entre la masse, la taille et les limites de locomotion.
// Comme dans Agar.io : plus une cellule est lourde, plus elle est grande et lente.
const CellMass = {
  radius(mass) {
    return 4 * Math.sqrt(mass);
  },

  // vitesse maximale décroissante avec la masse, avec un plancher
  maxSpeed(mass) {
    return Math.max(1.4, 9 * Math.pow(mass, -0.25));
  },

  // force maximale proportionnelle à la vitesse : les grosses cellules tournent moins vite
  maxForce(mass) {
    return CellMass.maxSpeed(mass) * 0.12;
  },

  // seuil inclusif : 1.25 × la masse de la proie suffit
  canEat(eaterMass, preyMass, ratio = 1.25) {
    return eaterMass >= ratio * preyMass;
  },

  // la proie est avalée quand son centre est bien recouvert par le mangeur
  covers(eater, prey) {
    return eater.pos.dist(prey.pos) <= eater.r - prey.r * 0.4;
  },
};
