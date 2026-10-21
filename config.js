// Paramètres de la partie. Une fonction renvoie un objet neuf pour que
// l'interface et les tests puissent le modifier sans effet de bord.
function createAgarConfig() {
  return {
    world: { width: 3000, height: 3000, wallMargin: 80 },
    counts: { food: 700, poison: 35, viruses: 12, bots: 14, plankton: 45 },
    player: {
      startMass: 12,
      minSplitMass: 36,
      maxCells: 16,
      minEjectMass: 35,
      ejectCost: 16,
    },
    cell: {
      // une cellule mange une autre si elle est au moins 25 % plus lourde
      eatRatio: 1.25,
      // les grosses cellules perdent un peu de masse chaque seconde
      decayThreshold: 60,
      decayRate: 0.004,
      // délai avant de pouvoir refusionner après un split
      mergeDelayBase: 6,
      mergeDelayPerMass: 0.015,
      splitSpeed: 18,
      splitDuration: 0.6,
    },
    eject: { mass: 12, speed: 16, duration: 0.5, ownerCooldown: 0.6 },
    virus: { mass: 100, feedsToShoot: 7, popRatio: 1.15, shootSpeed: 14, shootDuration: 0.8, maxPieces: 8 },
    poison: { massFactor: 0.85 },
    bot: { minStartMass: 12, maxStartMass: 40 },
    flee: { maxDuration: 3, regenRate: 0.25, sprintSpeed: 1.35, sprintForce: 2 },
    // decay : à chaque ajout, les scores déjà mémorisés sont multipliés par ce facteur ;
    // seedFitness : score donné au meilleur cerveau pré-entraîné à l'amorçage, pour que
    // les bots de la partie puissent rapidement entrer dans le réservoir
    evolution: { mutationRate: 0.1, poolSize: 12, decay: 0.97, seedFitness: 150 },
    // part des bots pilotés par un réseau de neurones (NeuralBotCell), appliquée aux naissances ;
    // usePretrained amorce leur réservoir avec les cerveaux de brainPretrained.js
    neural: { share: 0.5, usePretrained: true },
    plankton: { mass: 2, fleeRadius: 110 },
    // Accélération progressive : les limites de vitesse et de force de toutes les entités
    // mobiles sont multipliées par 1 + ratePerMinute × minutes de la manche, plafonné à max.
    // La manche repart de zéro à chaque nouvelle vie du joueur ou changement de mode.
    tempo: { ratePerMinute: 0.05, max: 1.5 },
    // combinaison des forces des bots : 'weighted' (somme pondérée) ou 'priority'
    // (allocation par priorités de Reynolds, budget = maxForce × budget)
    composition: { mode: 'weighted', budget: 3 },
    // courants (flow field following) : poids pour le plancton et pour les bots qui errent
    flow: { enabled: true, resolution: 150, plankton: 0.7, wander: 0.6 },
    // évitement de collision entre cellules qui ne peuvent pas se manger (unaligned collision avoidance)
    collision: { horizon: 45, margin: 6, weight: 2.5 },
    // bruit du joueur (touche C ou micro) : rayon d'audition = base + volume × perVolume
    noise: { baseRadius: 450, perVolume: 900, duration: 3, cooldown: 3 },
    // gardes du corps du plus gros bot (offset pursuit, interpose)
    escort: { count: 2, massRatio: 0.35, minMass: 14, guardRadius: 450, respawnDelay: 12,
      slots: [{ x: -70, y: -60 }, { x: -70, y: 60 }] },
    snake: { mass: 140, segments: 14, spacing: 22, huntRadius: 260, leash: 320, respawnDelay: 15 },
  };
}
