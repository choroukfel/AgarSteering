// Règles de scène (hors steering) : qui mange qui. Ces fonctions ne calculent
// aucune force ; elles décident des repas, que le monde applique ensuite.
const GameRules = {
  // Granulés (nourriture et poison) : avalés au contact (distance <= rayon de la cellule).
  // Modifie `pellets` et renvoie la liste des repas.
  eatPellets(cells, pellets) {
    const eaten = [];
    for (let i = pellets.length - 1; i >= 0; i--) {
      const pellet = pellets[i];
      const eater = cells.find(cell => cell.pos.dist(pellet.pos) <= cell.r);
      if (eater) {
        eater.setMass(pellet.effectOn(eater.mass));
        pellets.splice(i, 1);
        eaten.push({ eater, pellet });
      }
    }
    return eaten;
  },

  // Même règle qu'eatPellets, mais chaque cellule ne teste que les granulés des cases
  // voisines (grille spatiale) : le granulé va au premier mangeur de `cells` qui le recouvre.
  eatPelletsNear(cells, pellets, grid) {
    const eaten = [];
    const taken = new Set();
    for (const cell of cells) {
      for (const pellet of grid.query(cell.pos, cell.r)) {
        if (taken.has(pellet) || cell.pos.dist(pellet.pos) > cell.r) continue;
        taken.add(pellet);
        cell.setMass(pellet.effectOn(cell.mass));
        eaten.push({ eater: cell, pellet });
      }
    }
    if (taken.size) {
      const kept = pellets.filter(pellet => !taken.has(pellet));
      pellets.length = 0;
      pellets.push(...kept);
    }
    return eaten;
  },

  // Une cellule en mange une autre si elle n'est pas de la même équipe,
  // est assez lourde (seuil inclusif) et recouvre le centre de la proie.
  canEat(eater, prey, ratio) {
    if (eater === prey) return false;
    if (eater.team !== null && eater.team === prey.team) return false;
    if (typeof prey.canBeEatenBy === 'function' && !prey.canBeEatenBy(eater)) return false;
    return CellMass.canEat(eater.mass, prey.mass, ratio) && CellMass.covers(eater, prey);
  },

  // Repas [{ eater, prey }] sans modifier les collections. Chaque proie est
  // mangée au plus une fois, par le plus gros mangeur possible ; une cellule
  // déjà mangée ne peut plus manger.
  findMeals(eaters, preys, ratio) {
    const meals = [];
    const eaten = new Set();
    const bySize = [...eaters].sort((a, b) => b.mass - a.mass);
    for (const prey of preys) {
      if (eaten.has(prey)) continue;
      const eater = bySize.find(candidate => !eaten.has(candidate) && GameRules.canEat(candidate, prey, ratio));
      if (eater) {
        meals.push({ eater, prey });
        eaten.add(prey);
      }
    }
    return meals;
  },

  // Une cellule assez grosse qui recouvre un virus le fait exploser.
  popsVirus(cell, virus, popRatio) {
    return cell.mass >= virus.mass * popRatio && CellMass.covers(cell, virus);
  },
};
