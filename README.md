# Agar Steering : un jeu inspiré d'Agar.io

Ouvrir `index.html` dans un navigateur, ou servir ce dossier avec un serveur HTTP local (voir *Mise en ligne*).

Au démarrage, un menu s'affiche devant une partie entre bots : choisissez un pseudo et une couleur, puis **Jouer** ou **Observer l'IA**. Le pseudo et la couleur sont mémorisés dans le navigateur. Mangez la nourriture et les cellules plus petites que vous, évitez les plus grosses. Chaque entité du jeu est pilotée uniquement par des steering behaviors (Reynolds, GDC 1999). Le jeu reprend toutes les techniques vues dans les exemples 1 à 10 du dépôt.

## Commandes

| Action | Commande |
|---|---|
| Diriger | souris (la cellule suit le pointeur avec **arrive**) |
| Split | **Espace** : chaque cellule assez lourde (≥ 36) se coupe en deux vers le pointeur |
| Éjecter de la masse | **W** (maintenir pour éjecter en continu) |
| Faire du bruit | **C** (ou un clap au micro) : les proies proches fuient, les prédateurs viennent enquêter |
| Micro (facultatif) | case *Micro* des réglages : clap = bruit, double clap = split, cri = grand bruit |
| Debug | **D** ou la case *Debug* (synchronisées) |
| Rejouer | **R** ou le bouton *Rejouer* de l'écran de fin |
| Menu | **Échap** ou le bouton ☰ (la cellule freine sur place tant que le menu est ouvert) |
| Mode spectateur | *Observer l'IA* ; un clic sur un bot le fait suivre par la caméra |
| Tactile | le doigt dirige ; boutons **W** (maintenir), **Split** et **Bruit** en bas à gauche ; réglages défilables ; mise en page adaptée en portrait et en paysage |

Les touches ne sont pas interceptées quand un contrôle (champ, curseur, menu, bouton) a le focus.

Le bouton ⚙ ouvre les réglages. Les curseurs y règlent pendant la partie le nombre de bots, de granulés et de plancton, le taux de mutation, la part de bots neuronaux 🧠, l'accélération progressive et la durée maximale de fuite. On y choisit aussi la **combinaison des forces** (somme pondérée ou priorités de Reynolds), les **courants**, les **effets sonores** et le **micro**. Les instances existantes sont conservées.

## Les techniques et où les voir

| Technique (exemple d'origine) | Dans le jeu | Fichier |
|---|---|---|
| **Seek / Flee** (1-Seek) | les bots broutent la nourriture ; poison attractif ou répulsif selon l'ADN | `vehicle.js` (`seek`) et `behaviors/composition.js` (`fleeFrom`) |
| **Pursue / Evade** (2-PursueEvade) | les bots chassent les proies et fuient les menaces en anticipant leur position future | `behaviors/pursuit.js` |
| **Poursuite parfaite** (2-PursueEvade_correction) | le serpent calcule le point d'interception exact | `behaviors/pursuit.js` (`interceptPoint`) |
| **Arrive** (3-Arrival) | votre cellule ralentit sur le curseur ; un bot en fuite rejoint un virus refuge | `behaviors/arrive.js` |
| **Arrive avec décalage, serpent** (3-Arrival_correction) | chaque anneau du serpent suit le précédent à distance fixe | `SnakeSegment.js` |
| **Freinage** (vitesse désirée nulle) | la masse éjectée et les virus tirés glissent puis s'arrêtent | `behaviors/arrive.js` (`brakeForce`) |
| **Wander** (4-Wander) | bots sans objectif et plancton : direction qui varie en continu | `behaviors/wander.js` |
| **Projection scalaire** (5-1) | projection bornée sur un segment | `behaviors/pathFollowing.js` (`projectOnSegment`) |
| **Path following** (5-2, 5-3) | le serpent patrouille sur le chemin jaune pointillé ; il ne chasse que dans sa « laisse » autour du chemin | `behaviors/pathFollowing.js`, `SnakeHead.js` |
| **Obstacle avoidance** (6) | les cellules assez grosses pour exploser contournent les virus (points *ahead* et *ahead/2*) | `behaviors/avoidance.js` |
| **Boundaries** (3, 6, 7) | tout le monde reste dans l'arène (réflexion « billard », coins compris) | `behaviors/boundaries.js` |
| **Boids : séparation, alignement, cohésion** (7) | bancs de plancton ; séparation puis cohésion entre vos cellules après un split | `behaviors/flocking.js`, `PlanktonBoid.js`, `PlayerCell.js` |
| **Évolution : ADN, fitness, mutation** (8) | les poids des comportements et les rayons de perception de chaque bot sont des gènes ; le poison exerce une pression de sélection | `genetics.js`, `BotCell.js` |
| **Algorithme génétique : sélection et croisement** (10) | un bot mangé laisse son ADN dans un réservoir ; son remplaçant naît d'un croisement par roulette puis d'une mutation | `genetics.js` (`GenePool`) |
| **Fuite avec endurance** (1-Seek, scénario 2) | détection ≠ distance de sécurité, sprint temporaire, épuisement, réarmement seulement en sécurité | `escape.js`, `BotCell.js` |
| **Réseau de neurones + neuroévolution** (9, 9b) | les bots 🧠 choisissent le poids de chaque comportement avec un réseau 16 → 8 → 6 dont les poids évoluent par croisement et mutation | `brain.js`, `neuralDNA.js`, `NeuralBotCell.js` |
| **Capteurs à rayons** (9, 9b) | trois rayons (devant, 45° à gauche et à droite) mesurent le premier danger — mur, virus explosif, prédateur — et nourrissent le réseau des bots 🧠 | `raySensor.js`, `NeuralBotCell.js` |
| **Unaligned collision avoidance** (Reynolds) | deux cellules qui ne peuvent pas se manger calculent l'instant de leur plus courte distance et s'écartent latéralement avant de se percuter | `behaviors/collisionAvoidance.js` |
| **Flow field following** (Reynolds) | des courants (flèches en fond) entraînent le plancton et les bots qui errent | `behaviors/flowField.js` |
| **Offset pursuit + interpose** (Reynolds, Buckland) | deux gardes du corps escortent le plus gros bot à une place décalée, puis se placent entre lui et le prédateur qui le vise | `behaviors/escort.js`, `EscortCell.js` |
| **Composition par priorités** (Reynolds) | en alternative à la somme pondérée : le budget de force est rempli dans l'ordre murs → virus → collisions → fuite → … | `behaviors/composition.js` (`applyPrioritizedForces`) |
| **Perception auditive** | un bruit (touche C, micro) est perçu dans un rayon qui grandit avec le volume : les proies s'en éloignent, les prédateurs viennent voir | `noiseEvent.js`, `BotCell.applyHearing`, `PlanktonBoid.js` |
| **Grille spatiale** (Reynolds, bin-lattice) | la perception et les repas n'examinent que les cases voisines : la simulation va 2 à 2,6 fois plus vite | `spatialGrid.js`, `behaviors/perception.js` |
| **Accélération progressive** | les limites de vitesse et de force augmentent avec la durée de la manche (× 1,5 au plus) | `world.js` (`tempo`), `Cell.js` |

Les mécaniques d'Agar.io sont des règles de scène appliquées après le steering :

- **Repas** : il faut être au moins 25 % plus lourd (seuil inclusif) et recouvrir le centre de la proie.
- **Masse et vitesse** : la vitesse maximale diminue avec la masse. Au-dessus de 60, la masse fond lentement.
- **Split** : impulsion temporaire (limites de vitesse relevées puis restaurées exactement), puis un délai avant de pouvoir refusionner.
- **Virus** : une cellule au moins 15 % plus lourde qu'un virus explose en le recouvrant. Une cellule plus légère peut s'y cacher. Nourri 7 fois, un virus en tire un nouveau.
- **Serpent** : sa masse est fixe. Une cellule de masse ≥ 175 peut le manger ; il réapparaît après 15 s.

Le panneau *Techniques en action* montre en direct combien de bots fuient, chassent, broutent, errent ou sont épuisés, l'état du serpent, le nombre de naissances, la génération maximale, les gènes du meilleur bot, ainsi que le nombre de bots neuronaux et leur masse moyenne comparée à celle des bots à règles.

## Architecture

Le découpage suit Reynolds : **sélection de l'action → steering → locomotion**.

- `world.js` orchestre chaque image. Il appelle d'abord `think()` (perception et décision), puis `steer()` (calcul des forces, `applyForce`), puis une seule fois `update()` hérité de `Vehicle`, puis les horloges `tick(dt)` et enfin les règles de scène (repas, virus, fusions, réapparitions).
- `behaviors/*.js` contient des fonctions indépendantes qui **renvoient une force** limitée à `maxForce`. Chacune construit une vitesse désirée de norme `maxSpeed`, puis calcule `steering = désirée - actuelle`. La plupart réutilisent `vehicle.seek()`.
- Les entités composent ces forces par **somme pondérée** (`applyWeightedForces`) ou, au choix, par **priorités** (`applyPrioritizedForces`). Les forces appliquées sont gardées dans `lastForces` pour le debug, qui ne recalcule rien.
- Il y a un fichier par entité, et toutes héritent de `Vehicle` : `Cell.js` (base massique), `PlayerCell.js`, `BotCell.js`, `NeuralBotCell.js`, `EscortCell.js`, `Virus.js`, `EjectedMass.js`, `SnakeHead.js`, `SnakeSegment.js`, `PlanktonBoid.js`, `Food.js`, `Poison.js` et `EffectParticle.js` (éclats qui ralentissent par une traînée de Reynolds). Les granulés sont immobiles mais restent des `Vehicle`.
- Données de perception, pas des entités : `spatialGrid.js` (grille), `raySensor.js` (capteurs), `noiseEvent.js` (bruit), `FlowField` (courants), `escape.js` (état de fuite). Interface et rendu : `audio.js` (sons spatialisés), `clapDetector.js` et `microphone.js` (micro facultatif), `camera.js` (dont le tremblement d'écran).
- `theme.js` porte le style visuel « microscope bioluminescent » : palette néon, membranes ondulantes, noyaux qui suivent la vitesse, spores lumineuses, virus en cristaux hexagonaux, réseau de points hexagonal et vignettage d'oculaire. Ce rendu n'influence jamais le steering. `ui.js` (pseudo, durées, notifications) et `hud.js` gèrent l'apparence et l'interface. L'écran de fin affiche les statistiques de la vie : masse maximale, temps de survie, cellules et nourriture mangées.
- Le reste n'est pas une entité du monde : `PatrolPath.js` est une donnée géométrique, peinte sur le fond par `render.js`. `playerController.js` regroupe vos cellules et traduit vos commandes. `rules.js` décide des repas. `camera.js`, `render.js`, `hud.js` et `controls.js` ne font que de l'affichage et de l'interface.
- `vehicle.js` est la copie **inchangée** de `1-Seek/vehicle.js`.

Deux points de conception :

- **Fuite.** Le `flee()` hérité vaut `-seek()`. Il devient nul quand l'agent fonce déjà vers la menace à vitesse maximale. `fleeFrom()` construit la vraie vitesse désirée opposée (Reynolds) en réutilisant `seek()` vers le point symétrique de la menace.
- **Murs.** Les murs de l'arène sont aussi une règle de scène explicite (`World.keepInside`) : le centre d'une entité ne peut pas sortir de l'arène. Le comportement `boundaries` écarte normalement les entités bien avant.

### Fuite des bots (`escape.js`)

- La fuite démarre quand la menace la plus proche est à une distance ≤ *détection* (rayon du gène + rayon du bot).
- Pendant la fuite, la distance réelle est mesurée même hors du cercle de détection. La sortie a lieu à une distance ≥ *détection + marge de sécurité*.
- Une endurance pleine dure exactement *Fuite max* secondes. Pendant la fuite, le bot sprinte (vitesse × 1,35, force × 2).
- À la sortie ou à l'épuisement, les limites normales sont restaurées exactement.
- Après un épuisement, le bot ne peut fuir de nouveau qu'une fois toutes les menaces à la distance de sécurité. L'endurance se régénère en état normal.
- Changer de mode réinitialise la fuite de tous les bots sans recréer la population.

## Tests

Depuis ce dossier, avec Node.js 18 ou plus, sans dépendance à installer :

```sh
node --test tests/*.test.mjs
```

**121 tests** exécutent le vrai `vehicle.js` et tous les modules du jeu dans un contexte `vm`, avec un adaptateur `p5.Vector` minimal et un aléatoire injecté (`seededRng`). Ils couvrent :

- chaque comportement : valeurs, sens, limite `maxForce`, cas proches et éloignés, seuils inclusifs ;
- la composition pondérée ;
- la fuite : seuils, prédateur le plus proche, durée exacte, endurance, restauration des limites, réarmement ;
- les décisions des bots ;
- le réseau de neurones : propagation exacte, sorties bornées, croisement, mutation, JSON ; l'ADN neuronal dans `GenePool` ; les bots neuronaux (entrées bornées, choix de la décision, forces pondérées limitées, prudence avant détection, fuite réglementée prioritaire, épuisement) ; la part de bots neuronaux dans le monde et les cerveaux pré-entraînés ; l'oubli progressif du réservoir, la remise à l'échelle des cerveaux pré-entraînés et le plafond du bonus de survie ;
- l'accélération progressive : formule et plafond, remise à 1 à chaque manche, limites × tempo pour chaque type d'entité, sprint de fuite combiné au tempo puis restauration exacte, curseur ;
- la grille spatiale (mêmes résultats que la recherche exhaustive, pour la perception et pour les repas), l'évitement de collision (instant de plus courte distance, écart latéral, cas divergents et lointains), les courants, la composition par priorités (budget, troncature, ordre), offset pursuit et interpose, les gardes du corps (roi, équipe, interposition, réapparition), l'audition (enquête, effroi, fuite prioritaire, bot neuronal), le son spatialisé, les éclats, le tremblement de la caméra et le micro (clap, double clap) ;
- l'ADN : croisement, mutation, roulette ;
- le split, l'éjection, l'explosion et la fusion ;
- les virus, le serpent et le plancton ;
- l'intégration unique par image, une simulation de 900 images sans NaN, le changement de mode, les contrôles et la caméra (zoom adapté à la taille de l'écran) ;
- l'interface : nuances de couleur, pseudo, durées, notifications, préférences (y compris un stockage bloqué), statistiques de fin de partie.

Le jeu a aussi été validé avec le vrai p5.js 1.7 dans Chrome headless, en 1400 × 900 puis en téléphone tactile émulé (390 × 844 portrait, 844 × 390 paysage). Les vérifications : menu, pseudo et couleur, arrive vers le pointeur, touches D, Espace, W, C et Échap, debug ignoré dans un curseur, réglages (dont priorités, courants, son), notification, écran de fin et Rejouer, mode spectateur, gardes du corps, capteurs à rayons, boutons tactiles, aucune erreur JavaScript.

## Accélération progressive

Plus une manche dure, plus le jeu va vite : les limites de vitesse et de force (`maxSpeed`, `maxForce`) de toutes les entités mobiles (cellules, bots, serpent et ses anneaux, plancton, virus, masse éjectée) sont multipliées par un **tempo** = 1 + 5 % par minute de manche, plafonné à × 1,5 (atteint après 10 min). La manche repart de 1 à chaque nouvelle vie du joueur et à chaque changement de mode.

- C'est une **limite temporaire**, comme le sprint de fuite : le monde fournit le tempo (`World.tempo()`), chaque entité recalcule ses limites (`setTempo`). Les forces restent celles des comportements, rien n'est déplacé directement. Pour une cellule, les limites normales deviennent masse × tempo ; à la sortie d'une fuite, ce sont exactement elles qui sont restaurées.
- La vitesse courante est affichée en haut (« vitesse × 1,24 ») ; le curseur *Accélération* des réglages règle la hausse par minute (0 la désactive).
- Paramètres : `config.tempo = { ratePerMinute: 0.05, max: 1.5 }`.

## Mise en ligne

Le dossier est un site statique, sans étape de compilation : tous les chemins sont relatifs, p5.js est fourni dans `libraries/` et l'icône est intégrée à la page. Il suffit de publier le dossier `11-AgarioSteering` tel quel :

- **GitHub Pages** : pousser le dépôt et activer Pages sur la branche. Le jeu est servi à `…/11-AgarioSteering/`.
- **Netlify** ou **Vercel** : déposer le dossier, ou le choisir comme répertoire de publication, sans commande de build.
- **En local** : `npx serve .` ou `python -m http.server` depuis ce dossier.

La police Ubuntu est chargée depuis Google Fonts ; hors ligne, le jeu utilise la police système. Le dossier `tests/` peut être publié aussi, aucune page ne le référence.

## Bots neuronaux 🧠 (exemples 9 et 9b)

La moitié des bots (réglable) est pilotée par un **réseau de neurones**. Le réseau ne déplace rien lui-même : il remplace seulement la **sélection de l'action**. Les trois niveaux de Reynolds restent séparés :

1. **Perception → réseau** (`NeuralBotCell.think`) : 16 entrées normalisées — proximité de la nourriture, de la proie et de son rapport de masse, du prédateur visible, de son rapport de masse et de sa vitesse de rapprochement, du poison, d'un virus refuge, endurance, masse, épuisement, danger autour de la proie et autour de la nourriture, et trois **capteurs à rayons** (devant, 45° à gauche et à droite, exemple 9). Couche cachée de 8 neurones (tanh), 6 sorties (sigmoïde).
2. **Steering** (`NeuralBotCell.steer`) : chaque sortie est le poids d'un comportement existant — `seek` nourriture, `pursue` proie, `wander`, `evade` prédateur, répulsion du poison, `arrive` refuge — composés par `applyWeightedForces`, plus l'évitement des virus et les murs.
3. **Locomotion** : `Vehicle.update()`, une fois par image, inchangée.

La **fuite réglementée** (`escape.js` : détection, distance de sécurité, endurance, épuisement, réarmement) reste prioritaire : quand elle se déclenche, c'est `BotCell.steer` qui pilote. Le réseau peut en revanche apprendre à éviter un prédateur *avant* qu'il entre dans le cercle de détection.

**Apprentissage par neuroévolution** (pas de rétropropagation) : `NeuralDNA` contient les gènes habituels et les poids du réseau. Un bot neuronal mangé dépose son ADN et sa fitness dans un réservoir séparé (`World.neuralPool`) ; son remplaçant naît d'un croisement uniforme de deux parents puis d'une mutation. Les deux populations (règles / neuronale) évoluent sans se mélanger, ce qui permet de les comparer.

- **Fitness** = masse maximale + 0,5 × âge, avec un âge plafonné à 5 min (`BotCell.AGE_CAP`) : au-delà, seule la masse compte, pour récompenser la compétence plutôt que le simple fait d'avoir duré.
- **Oubli progressif** : à chaque ajout, les scores déjà mémorisés sont multipliés par 0,97 (`evolution.decay`). Un record ancien finit par céder sa place, et le réservoir suit les performances récentes au lieu de se figer.
- **Amorçage** : `brainPretrained.js` remplit le réservoir au démarrage, ses scores ramenés à l'échelle d'une partie (meilleur = 150, `evolution.seedFitness`). Sans cela, les scores d'entraînement, bien plus élevés, empêchaient tout bot de la partie d'entrer dans le réservoir : l'évolution en partie était figée.

**Entraînement en îles** (`tools/train-brain.mjs`) : à chaque époque, plusieurs mondes indépendants tournent en parallèle (un par cœur), sur des graines différentes, avec le vrai `World`. En fin d'époque, les meilleurs ADN de toutes les îles sont fusionnés et servent de départ à l'époque suivante. Chaque époque est une nouvelle manche : l'accélération progressive repart de 1, si bien que les cerveaux apprennent à toutes les vitesses.

```sh
node tools/train-brain.mjs --islands=6 --epochs=8 --minutes=10
```

**Évaluation honnête** (`tools/evaluate-brain.mjs`) : sur des parties jamais vues à l'entraînement, elle compare les bots neuronaux **entraînés**, **aléatoires** et **entraînés figés à leurs poids moyens** (ablation : le bot ne réagit plus à ce qu'il perçoit), toujours face aux mêmes bots à règles, et écrit moyenne ± écart-type dans [`EVALUATION.md`](EVALUATION.md).

```sh
node tools/evaluate-brain.mjs --seeds=6 --minutes=8
```

Résultats (6 parties de 8 min, graines 9001 à 9006, moyenne ± écart-type ; réseau 16 → 8 → 6 avec capteurs à rayons ; cerveaux issus de 6 îles × 8 époques × 10 min, soit 11 générations) :

| Cerveaux des bots 🧠 | Bots 🧠 mangés | Bots à règles mangés | Masse finale 🧠 | Masse finale règles |
|---|---|---|---|---|
| aléatoires (sans pré-entraînement) | 39,3 ± 17,1 | 50,3 ± 11,6 | 233 ± 68 | 339 ± 110 |
| entraînés | **29,3 ± 8,0** | 73,2 ± 8,8 | **445 ± 96** | 191 ± 65 |
| entraînés figés à leurs poids moyens | 25,3 ± 4,7 | 72,8 ± 10,0 | 412 ± 142 | 226 ± 123 |

**Ce que ces chiffres montrent, honnêtement** :

- **L'entraînement est nettement utile** : avec des cerveaux entraînés, les bots 🧠 finissent presque deux fois plus gros (445 contre 233), se font moins manger et mangent davantage de bots à règles. Avec des cerveaux aléatoires, ils sont même dépassés en masse par les bots à règles.
- **Ce qui a été appris, c'est surtout une stratégie moyenne**, pas des décisions qui changent selon la situation : figés à leurs poids moyens, les mêmes bots font aussi bien (écarts dans le bruit des mesures). Cette stratégie est très prudente — évitement maximal d'un prédateur visible, avant même sa détection (`evade` 2,98 sur 3,5) —, avec une forte répulsion du poison (2,08), une chasse soutenue (1,96) et peu d'errance (0,68).
- Les entrées plus riches (danger autour d'une proie, capteurs à rayons) n'ont pas suffi à rendre la réaction au cas par cas significativement meilleure : avec 11 générations, l'évolution a d'abord trouvé les bons réglages moyens.
- **Limites** : 6 parties seulement, écarts-types importants, évolution en partie active pendant la mesure (comme dans le jeu).

En debug (**D**), des barres au-dessus de chaque bot neuronal affichent ses six poids, avec la couleur de la force correspondante, et ses trois capteurs à rayons sont tracés (vert : libre, rouge : danger touché). Tout est lu dans `brainWeights` et dans la dernière mesure des capteurs, sans recalcul.
