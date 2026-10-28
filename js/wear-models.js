// wear-models.js — les vêtements « portés » en 3D (voxels), un modèle par PIÈCE.
//
// Un modèle décrit la FORME de la pièce sur le corps (des blocs de voxels) et
// où lire ses couleurs dans le sprite 32 × 32 de la carte. Comme tous les
// coloris d'une pièce ont exactement le même dessin, un seul modèle sert pour
// tous ses coloris : les couleurs viennent toujours du sprite du coloris porté.
//
// Repère (en voxels) : x de gauche à droite VU DE FACE, y vers le haut (0 = sol),
// z vers l'avant (le personnage regarde vers +z). Intervalles [début, fin[.
//
// Types de blocs :
//   - box     : pavé [x0,x1[ × [y0,y1[ × [z0,z1[. Sa face avant reçoit la zone
//               `front` du sprite [x, y, largeur, hauteur] ; le dos et les côtés
//               reçoivent la couleur dominante de chaque ligne (sans logo).
//               keep = [haut, bas, gauche, droite] : nombre de pixels du bord du
//               sprite copiés tels quels (ourlets, poignets) ; seul le milieu est
//               étiré ou resserré. flipX : sprite retourné (manche gauche).
//               round : coins verticaux arrondis (1 voxel retiré).
//               plain : couleur unie partout, celle du pixel [x, y] du sprite.
//   hiddenBy : bloc caché quand une pièce occupe cet emplacement (ex. la capuche
//              du hoodie disparaît sous une veste, qui a la sienne).
//   - lathe   : volume « tourné » (bonnet, casquette) : chaque ligne du sprite
//               donne une tranche horizontale arrondie, de la largeur de la ligne.
//   - profile : silhouette de profil extrudée (chaussures, dessinées de profil).
//
// Ajouter une pièce = ajouter une entrée ici (identifiant de la pièce dans pieces.json).

// Le corps de base : un mannequin neutre, non genré, sans visage.
export const BODY_COLOR = [178, 172, 162];
export const BODY = [
  // Pieds
  { box: [-6, -1, 0, 4, -3, 5] },
  { box: [1, 6, 0, 4, -3, 5] },
  // Jambes
  { box: [-6, -1, 4, 27, -3, 3] },
  { box: [1, 6, 4, 27, -3, 3] },
  // Bassin, buste
  { box: [-7, 7, 27, 37, -4, 4] },
  { box: [-8, 8, 37, 57, -5, 5], round: 1 },
  // Bras (avec la main en bas)
  { box: [-13, -10, 34, 57, -2, 2] },
  { box: [10, 13, 34, 57, -2, 2] },
  // Cou, tête
  { box: [-2, 2, 57, 60, -2, 2] },
  { box: [-5, 5, 60, 72, -5, 5], round: 1 },
];

// Ordre de dessin : une pièce dessinée plus tard recouvre les précédentes.
// Les chaussures passent sous le bas (le pantalon tombe sur la chaussure).
export const DRAW_ORDER = ["chaussures", "bas", "haut", "veste", "cou", "tete", "sac"];

export const WEAR_MODELS = {
  // --- SIGNAL/9 · Shell « Relais » (veste) ---
  signal9_shell_relais: [
    // Corps de la veste (zip + bande orange en diagonale), ourlet gardé tel quel
    { type: "box", box: [-10, 10, 33, 59, -7, 7], front: [7, 9, 18, 19], keep: [0, 2, 0, 0], round: 1 },
    // Manches : la manche droite du sprite, retournée pour le bras gauche ; poignet orange
    { type: "box", box: [-15, -9, 36, 59, -3, 3], front: [26, 13, 4, 13], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 15, 36, 59, -3, 3], front: [26, 13, 4, 13], keep: [0, 2, 0, 0] },
    // Col montant autour du cou (intérieur sombre de la capuche vu de face)
    { type: "box", box: [-5, 5, 57, 62, -5, 5], front: [10, 4, 12, 5], round: 1 },
    // Capuche rabattue dans le dos
    { type: "box", box: [-6, 6, 50, 63, -9, -6], plain: [12, 4], round: 1 },
  ],

  // --- Pigeon Social Club · Hoodie « Dalle » (haut) ---
  pigeon_social_club_hoodie_dalle: [
    // Le pigeon et le haut du torse copiés à l'échelle 1, la poche ventrale étirée
    { type: "box", box: [-9, 9, 34, 58, -6, 6], front: [7, 9, 18, 18], keep: [11, 2, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 35, 58, -3, 3], front: [26, 12, 4, 13], keep: [0, 1, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 35, 58, -3, 3], front: [26, 12, 4, 13], keep: [0, 1, 0, 0] },
    { type: "box", box: [-5, 5, 57, 61, -4, 4], front: [10, 5, 12, 4], round: 1, hiddenBy: "veste" },
    { type: "box", box: [-6, 6, 51, 62, -8, -5], plain: [12, 6], round: 1, hiddenBy: "veste" },
  ],

  // --- SIGNAL/9 · Cargo « Béton » (bas) ---
  signal9_cargo_beton: [
    // Hanches + ceinture (passant orange)
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [4, 4, 24, 8], keep: [2, 0, 0, 0] },
    // Jambes : poches cargo, ourlet gardé tel quel
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [4, 12, 10, 16], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [17, 12, 10, 16], keep: [0, 2, 0, 0] },
  ],

  // --- SIGNAL/9 · Montantes « Trame » (chaussures, dessinées de profil) ---
  signal9_montantes_trame: [
    { type: "profile", x: [-7, -1], z0: -5, y0: 0, rect: [4, 5, 25, 21], scale: 0.7 },
    { type: "profile", x: [1, 7], z0: -5, y0: 0, rect: [4, 5, 25, 21], scale: 0.7 },
  ],

  // --- SIGNAL/9 · Bonnet « Nuit » (tête) ---
  signal9_bonnet_nuit: [
    { type: "lathe", center: [0, 0], y0: 65, rect: [6, 8, 20, 15], scale: 0.7 },
  ],
};

/** Vrai si la pièce a déjà un modèle 3D. */
export function hasWearModel(pieceId) {
  return Object.hasOwn(WEAR_MODELS, pieceId);
}
