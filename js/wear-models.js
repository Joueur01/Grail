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

// --- Les corps de base : un avatar homme et un avatar femme ---
// Les deux ont les MÊMES articulations (hauteur des épaules, des hanches, de la
// tête…) et restent à l'intérieur des mêmes vêtements : un modèle de pièce sert
// pour les deux. Ils diffèrent par la carrure, la taille, les cheveux et le visage.
// Sans vêtement porté, l'avatar a une tenue de base (t-shirt, short, chaussettes).
export const BODY_COLOR = [178, 172, 162];
export const SKIN_TONES = {
  claire: [236, 196, 164],
  moyenne: [204, 146, 106],
  foncee: [126, 84, 58],
};
const TEE = [232, 228, 218];
const SHORTS = [56, 58, 66];
const SOCKS = [232, 228, 218];
const EYES = [30, 26, 26];

/** Pièces communes aux deux corps (jambes, cou, tête et visage). */
function commonBody(skin, hair) {
  const mouth = skin.map((c) => Math.round(c * 0.78));
  return [
    // Pieds (chaussettes), jambes (peau, puis short), bassin (short)
    { box: [-6, -1, 0, 4, -3, 5], color: SOCKS },
    { box: [1, 6, 0, 4, -3, 5], color: SOCKS },
    { box: [-6, -1, 4, 18, -3, 3], color: skin },
    { box: [1, 6, 4, 18, -3, 3], color: skin },
    { box: [-6, -1, 18, 27, -3, 3], color: SHORTS },
    { box: [1, 6, 18, 27, -3, 3], color: SHORTS },
    { box: [-7, 7, 27, 37, -4, 4], color: SHORTS },
    // Cou, tête, oreilles
    { box: [-2, 2, 57, 60, -2, 2], color: skin },
    { box: [-5, 5, 60, 72, -5, 5], round: 1, color: skin },
    { box: [-6, -5, 64, 67, -1, 1], color: skin },
    { box: [5, 6, 64, 67, -1, 1], color: skin },
    // Visage : yeux, sourcils, nez (en relief), bouche
    { box: [-3, -2, 65, 67, 4, 5], color: EYES },
    { box: [2, 3, 65, 67, 4, 5], color: EYES },
    { box: [-1, 1, 63, 65, 5, 6], color: skin },
    { box: [-1, 1, 62, 63, 4, 5], color: mouth },
    { box: [-4, -1, 68, 69, 4, 5], color: hair },
    { box: [1, 4, 68, 69, 4, 5], color: hair },
  ];
}

/** Avatar homme : épaules larges, cheveux courts. */
function maleBody(skin = SKIN_TONES.moyenne, hair = [46, 34, 28]) {
  return [
    ...commonBody(skin, hair),
    // Buste en t-shirt : épaules larges, taille à peine plus étroite
    { box: [-8, 8, 44, 57, -5, 5], round: 1, color: TEE },
    { box: [-7, 7, 37, 44, -4, 4], round: 1, color: TEE },
    // Bras : manche courte, puis peau jusqu'à la main
    { box: [-13, -10, 50, 57, -2, 2], color: TEE },
    { box: [10, 13, 50, 57, -2, 2], color: TEE },
    { box: [-13, -10, 34, 50, -2, 2], color: skin },
    { box: [10, 13, 34, 50, -2, 2], color: skin },
    // Cheveux courts : dessus, arrière, mèche sur le front
    { box: [-6, 6, 68, 73, -6, 3], color: hair },
    { box: [-5, 5, 73, 74, -5, 3], round: 1, color: hair },
    { box: [-5, 5, 63, 68, -6, -4], color: hair },
    { box: [-5, 5, 70, 72, 4, 5], color: hair },
  ];
}

/** Avatar femme : épaules plus étroites, taille marquée, cheveux mi-longs. */
function femaleBody(skin = SKIN_TONES.moyenne, hair = [34, 26, 24]) {
  return [
    ...commonBody(skin, hair),
    // Buste en t-shirt : épaules plus étroites, taille marquée
    { box: [-7, 7, 46, 57, -5, 5], round: 1, color: TEE },
    { box: [-6, 6, 37, 46, -4, 4], round: 1, color: TEE },
    // Bras, un peu plus près du corps
    { box: [-12, -9, 50, 57, -2, 2], color: TEE },
    { box: [9, 12, 50, 57, -2, 2], color: TEE },
    { box: [-12, -9, 34, 50, -2, 2], color: skin },
    { box: [9, 12, 34, 50, -2, 2], color: skin },
    // Cheveux mi-longs : masse jusqu'aux épaules, mèches qui encadrent le visage
    { box: [-6, 6, 58, 73, -7, 1], color: hair },
    { box: [-5, 5, 73, 74, -5, 3], round: 1, color: hair },
    { box: [-6, 6, 68, 73, 1, 4], color: hair },
    { box: [-6, -4, 59, 68, 1, 4], color: hair },
    { box: [4, 6, 59, 68, 1, 4], color: hair },
    { box: [-5, 2, 70, 72, 4, 5], color: hair },
  ];
}

/** Le corps choisi : "homme" ou "femme", avec une teinte de peau (SKIN_TONES). */
export function getBody(type = "homme", skin = "moyenne") {
  const tone = SKIN_TONES[skin] || SKIN_TONES.moyenne;
  return type === "femme" ? femaleBody(tone) : maleBody(tone);
}

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
    { type: "lathe", center: [0, 0], y0: 68, rect: [6, 8, 20, 15], scale: 0.7 },
  ],
};

/** Vrai si la pièce a déjà un modèle 3D. */
export function hasWearModel(pieceId) {
  return Object.hasOwn(WEAR_MODELS, pieceId);
}
