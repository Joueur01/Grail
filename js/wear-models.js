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
// Tous les avatars ont la MÊME mensuration (carrure, taille, bras, jambes, tête) :
// un modèle de pièce sert pour tous, y compris pour les futurs skins. Ils ne
// diffèrent que par les cheveux et le visage (et la teinte de peau).
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

/**
 * Buste et bras COMMUNS à tous les avatars : une seule mensuration, pour que
 * chaque vêtement aille sur tous (et sur les futurs skins).
 */
function commonTorso(skin) {
  return [
    // Buste en t-shirt
    { box: [-8, 8, 44, 57, -5, 5], round: 1, color: TEE },
    { box: [-7, 7, 37, 44, -4, 4], round: 1, color: TEE },
    // Bras : manche courte, puis peau jusqu'à la main
    { box: [-13, -10, 50, 57, -2, 2], color: TEE },
    { box: [10, 13, 50, 57, -2, 2], color: TEE },
    { box: [-13, -10, 34, 50, -2, 2], color: skin },
    { box: [10, 13, 34, 50, -2, 2], color: skin },
  ];
}

/** Avatar homme : cheveux courts avec une mèche sur le front. */
function maleBody(skin = SKIN_TONES.moyenne, hair = [46, 34, 28]) {
  return [
    ...commonBody(skin, hair),
    ...commonTorso(skin),
    // Cheveux courts : dessus, arrière, mèche sur le front
    { box: [-6, 6, 68, 73, -6, 3], color: hair },
    { box: [-5, 5, 73, 74, -5, 3], round: 1, color: hair },
    { box: [-5, 5, 63, 68, -6, -4], color: hair },
    { box: [-5, 5, 70, 72, 4, 5], color: hair },
  ];
}

/** Avatar femme : même corps que l'homme, cheveux mi-longs. */
function femaleBody(skin = SKIN_TONES.moyenne, hair = [34, 26, 24]) {
  return [
    ...commonBody(skin, hair),
    ...commonTorso(skin),
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

  // --- SIGNAL/9 · Gilet « Dossard » (veste sans manches : les bras restent nus) ---
  signal9_gilet_dossard: [
    { type: "box", box: [-10, 10, 34, 58, -6, 6], front: [7, 6, 18, 20], keep: [0, 1, 0, 0], round: 1 },
  ],

  // --- SIGNAL/9 · Short « Course » (bas) ---
  signal9_short_course: [
    { type: "box", box: [-9, 9, 27, 37, -5, 5], front: [5, 8, 22, 7], keep: [1, 0, 0, 0] },
    { type: "box", box: [-8, -1, 18, 27, -4, 4], front: [3, 15, 12, 8], keep: [0, 1, 0, 0] },
    { type: "box", box: [1, 8, 18, 27, -4, 4], front: [17, 15, 12, 8], keep: [0, 1, 0, 0] },
  ],

  // --- SIGNAL/9 · Sacoche « Tournée » (sac, portée en banane devant, sangle autour de la taille) ---
  signal9_sacoche_tournee: [
    { type: "box", box: [-9, 9, 31, 39, 5, 9], front: [3, 16, 26, 9], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [-10, 10, 37, 39, -7, 7], plain: [6, 22], round: 1 },
  ],

  // --- Halvane · Manteau « Atelier » (veste longue, jusqu'aux genoux) ---
  halvane_manteau_atelier: [
    { type: "box", box: [-10, 10, 37, 59, -7, 7], front: [7, 3, 18, 18], round: 1 },
    { type: "box", box: [-9, 9, 17, 37, -6, 6], front: [6, 21, 20, 9], keep: [0, 1, 0, 0] },
    { type: "box", box: [-15, -9, 36, 59, -3, 3], front: [27, 11, 4, 10], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 15, 36, 59, -3, 3], front: [27, 11, 4, 10], keep: [0, 2, 0, 0] },
    { type: "box", box: [-6, 6, 57, 62, -6, 6], plain: [8, 16], round: 1 },
  ],

  // --- Halvane · Col roulé « Fil » (haut) ---
  halvane_col_roule_fil: [
    { type: "box", box: [-9, 9, 34, 58, -6, 6], front: [7, 8, 18, 19], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 35, 58, -3, 3], front: [26, 12, 4, 13], keep: [0, 1, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 35, 58, -3, 3], front: [26, 12, 4, 13], keep: [0, 1, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- Halvane · Chemise « Coupe » (haut) ---
  halvane_chemise_coupe: [
    { type: "box", box: [-9, 9, 35, 58, -6, 6], front: [7, 6, 18, 19], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 35, 58, -3, 3], front: [26, 11, 4, 13], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 35, 58, -3, 3], front: [26, 11, 4, 13], keep: [0, 2, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [10, 7, 12, 3], round: 1 },
  ],

  // --- Halvane · Pantalon « Pli » (bas) ---
  halvane_pantalon_pli: [
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [5, 2, 22, 9], keep: [2, 0, 0, 0] },
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [4, 11, 10, 19], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [18, 11, 10, 19], keep: [0, 2, 0, 0] },
  ],

  // --- Halvane · Mocassins « Héritage » (chaussures, de profil) ---
  halvane_mocassins_heritage: [
    { type: "profile", x: [-7, -1], z0: -5, y0: 0, rect: [3, 10, 26, 11], scale: 0.7 },
    { type: "profile", x: [1, 7], z0: -5, y0: 0, rect: [3, 10, 26, 11], scale: 0.7 },
  ],

  // --- Halvane · Sac « Losange » (sac, tenu à la hanche droite, anse au-dessus) ---
  halvane_sac_losange: [
    { type: "box", box: [8, 18, 26, 36, -1, 6], front: [4, 11, 24, 14], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [10, 12, 36, 41, 1, 3], plain: [9, 9] },
    { type: "box", box: [14, 16, 36, 41, 1, 3], plain: [9, 9] },
    { type: "box", box: [10, 16, 41, 42, 1, 3], plain: [9, 9] },
  ],

  // --- Halvane · Écharpe « Liseré » (cou : tour de cou + deux pans devant) ---
  halvane_echarpe_lisere: [
    { type: "box", box: [-6, 6, 56, 60, -6, 6], front: [7, 4, 16, 7], round: 1 },
    { type: "box", box: [-4, -1, 38, 57, 5, 8], front: [8, 12, 5, 15], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 4, 44, 57, 5, 8], front: [17, 12, 5, 10], keep: [0, 2, 0, 0] },
  ],

  // --- Pigeon Social Club · T-shirt « Roucoule » (haut, manches courtes) ---
  pigeon_social_club_t_shirt_roucoule: [
    { type: "box", box: [-9, 9, 34, 58, -6, 6], front: [6, 6, 20, 20], round: 1 },
    { type: "box", box: [-14, -9, 50, 58, -3, 3], front: [26, 10, 4, 6], keep: [0, 1, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 50, 58, -3, 3], front: [26, 10, 4, 6], keep: [0, 1, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [9, 6, 14, 3], round: 1 },
  ],

  // --- Pigeon Social Club · Short « Ollie » (bas, large) ---
  pigeon_social_club_short_ollie: [
    { type: "box", box: [-9, 9, 27, 37, -5, 5], front: [5, 7, 22, 7], keep: [1, 0, 0, 0] },
    { type: "box", box: [-9, -1, 15, 27, -4, 4], front: [3, 14, 12, 11], keep: [0, 1, 0, 0] },
    { type: "box", box: [1, 9, 15, 27, -4, 4], front: [17, 14, 12, 11], keep: [0, 1, 0, 0] },
  ],

  // --- Pigeon Social Club · Sneakers « Bitume » (chaussures, de profil) ---
  pigeon_social_club_sneakers_bitume: [
    { type: "profile", x: [-7, -1], z0: -5, y0: 0, rect: [3, 9, 26, 13], scale: 0.7 },
    { type: "profile", x: [1, 7], z0: -5, y0: 0, rect: [3, 9, 26, 13], scale: 0.7 },
  ],

  // --- Pigeon Social Club · Casquette « Perchoir » (tête : calotte + visière devant) ---
  pigeon_social_club_casquette_perchoir: [
    { type: "lathe", center: [0, 0], y0: 68, rect: [4, 9, 24, 10], scale: 0.7 },
    { type: "box", box: [-6, 6, 68, 69, 4, 10], plain: [14, 20], round: 1 },
  ],

  // --- Pigeon Social Club · Tote « Miettes » (sac, tenu à la hanche droite) ---
  pigeon_social_club_tote_miettes: [
    { type: "box", box: [8, 20, 20, 34, -1, 6], front: [4, 9, 24, 18], keep: [0, 1, 0, 0] },
    { type: "box", box: [10, 12, 34, 41, 1, 3], plain: [8, 12] },
    { type: "box", box: [16, 18, 34, 41, 1, 3], plain: [8, 12] },
  ],

  // =====================================================================================
  // 2e vague de marques (les sprites ont la même disposition que ceux de la 1re vague :
  // corps au centre, manches sur les côtés, pantalon en deux jambes).
  // =====================================================================================

  // --- Ferrant & Fils · Veste « Contremaître » (veste de chantier, poches plaquées) ---
  ferrant_fils_veste_contremaitre: [
    { type: "box", box: [-10, 10, 33, 59, -7, 7], front: [6, 7, 20, 21], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [-15, -9, 36, 59, -3, 3], front: [26, 12, 4, 14], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 15, 36, 59, -3, 3], front: [26, 12, 4, 14], keep: [0, 2, 0, 0] },
    { type: "box", box: [-5, 5, 57, 62, -5, 5], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- Ferrant & Fils · Chemise « Fabrique » (haut) ---
  ferrant_fils_chemise_fabrique: [
    { type: "box", box: [-9, 9, 35, 58, -6, 6], front: [6, 7, 20, 19], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 35, 58, -3, 3], front: [26, 12, 4, 12], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 35, 58, -3, 3], front: [26, 12, 4, 12], keep: [0, 2, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- Ferrant & Fils · Pantalon « Établi » (bas) ---
  ferrant_fils_pantalon_etabli: [
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [8, 7, 16, 6], keep: [2, 0, 0, 0] },
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [8, 13, 8, 17], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [16, 13, 8, 17], keep: [0, 2, 0, 0] },
  ],

  // --- Ferrant & Fils · Pantalon « Peintre » (bas, un peu plus large) ---
  ferrant_fils_pantalon_peintre: [
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [7, 7, 18, 6], keep: [2, 0, 0, 0] },
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [7, 13, 9, 17], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [16, 13, 9, 17], keep: [0, 2, 0, 0] },
  ],

  // --- Ferrant & Fils · Bottines « Godillot » (chaussures montantes, vues de face : une boîte par pied) ---
  ferrant_fils_bottines_godillot: [
    { type: "box", box: [-8, -1, 0, 9, -5, 7], front: [2, 12, 13, 15], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [1, 8, 0, 9, -5, 7], front: [17, 12, 13, 15], keep: [0, 2, 0, 0], round: 1 },
  ],

  // --- Ferrant & Fils · Bonnet « Docker » (tête ; l'étiquette qui pend n'est pas modélisée) ---
  ferrant_fils_bonnet_docker: [
    { type: "lathe", center: [0, 0], y0: 68, rect: [6, 7, 20, 16], scale: 0.7 },
  ],

  // --- Ferrant & Fils · Sac « Musette » (sac, tenu à la hanche droite) ---
  ferrant_fils_sac_musette: [
    { type: "box", box: [8, 20, 20, 34, -1, 6], front: [7, 10, 18, 16], keep: [0, 1, 0, 0] },
    { type: "box", box: [10, 12, 34, 41, 1, 3], plain: [10, 6] },
    { type: "box", box: [16, 18, 34, 41, 1, 3], plain: [10, 6] },
  ],

  // --- Brume · Polaire « Brouillard » (veste, sangle corail) ---
  brume_polaire_brouillard: [
    { type: "box", box: [-10, 10, 33, 59, -7, 7], front: [6, 7, 20, 21], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [-15, -9, 36, 59, -3, 3], front: [26, 12, 4, 14], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 15, 36, 59, -3, 3], front: [26, 12, 4, 14], keep: [0, 2, 0, 0] },
    { type: "box", box: [-5, 5, 57, 62, -5, 5], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- Brume · Pull « Sentier » (haut) ---
  brume_pull_sentier: [
    { type: "box", box: [-9, 9, 35, 58, -6, 6], front: [6, 7, 20, 19], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 35, 58, -3, 3], front: [26, 12, 4, 12], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 35, 58, -3, 3], front: [26, 12, 4, 12], keep: [0, 2, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [11, 4, 10, 4], round: 1 },
  ],

  // --- Brume · Pantalon « Moraine » (bas) ---
  brume_pantalon_moraine: [
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [8, 7, 16, 6], keep: [2, 0, 0, 0] },
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [8, 13, 8, 17], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [16, 13, 8, 17], keep: [0, 2, 0, 0] },
  ],

  // --- Brume · Short « Source » (bas) ---
  brume_short_source: [
    { type: "box", box: [-9, 9, 27, 37, -5, 5], front: [7, 7, 18, 6], keep: [1, 0, 0, 0] },
    { type: "box", box: [-8, -1, 18, 27, -4, 4], front: [7, 13, 9, 11], keep: [0, 1, 0, 0] },
    { type: "box", box: [1, 8, 18, 27, -4, 4], front: [16, 13, 9, 11], keep: [0, 1, 0, 0] },
  ],

  // --- Brume · Baskets « Cairn » (chaussures basses de marche) ---
  brume_baskets_cairn: [
    { type: "box", box: [-8, -1, 0, 8, -5, 7], front: [2, 14, 13, 13], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [1, 8, 0, 8, -5, 7], front: [17, 14, 13, 13], keep: [0, 2, 0, 0], round: 1 },
  ],

  // --- Brume · Bonnet « Givre » (tête, pompon compris) ---
  brume_bonnet_givre: [
    { type: "lathe", center: [0, 0], y0: 68, rect: [6, 4, 20, 21], scale: 0.7 },
  ],

  // --- Brume · Sac « Lichen » (sac à dos : le sac dans le dos, les sangles devant) ---
  brume_sac_lichen: [
    { type: "box", box: [-8, 8, 34, 54, -13, -7], plain: [10, 12], round: 1 },
    { type: "box", box: [-6, -3, 38, 58, 6, 8], plain: [15, 6] },
    { type: "box", box: [3, 6, 38, 58, 6, 8], plain: [15, 6] },
  ],

  // --- A.S. Faubourg 78 · Veste « Tribune » (veste de club, col et poignets contrastés) ---
  faubourg_78_veste_tribune: [
    { type: "box", box: [-10, 10, 33, 59, -7, 7], front: [6, 7, 20, 20], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [-15, -9, 36, 59, -3, 3], front: [26, 12, 4, 14], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 15, 36, 59, -3, 3], front: [26, 12, 4, 14], keep: [0, 2, 0, 0] },
    { type: "box", box: [-5, 5, 57, 62, -5, 5], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- A.S. Faubourg 78 · Maillot « Domicile » (haut, manches courtes) ---
  faubourg_78_maillot_domicile: [
    { type: "box", box: [-9, 9, 34, 58, -6, 6], front: [6, 6, 20, 21], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 50, 58, -3, 3], front: [26, 8, 4, 8], keep: [0, 1, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 50, 58, -3, 3], front: [26, 8, 4, 8], keep: [0, 1, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- A.S. Faubourg 78 · Pantalon « Entraînement » (bas) ---
  faubourg_78_pantalon_entrainement: [
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [8, 7, 16, 6], keep: [2, 0, 0, 0] },
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [8, 13, 8, 17], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [16, 13, 8, 17], keep: [0, 2, 0, 0] },
  ],

  // --- A.S. Faubourg 78 · Short « Extérieur » (bas) ---
  faubourg_78_short_exterieur: [
    { type: "box", box: [-9, 9, 27, 37, -5, 5], front: [7, 7, 18, 6], keep: [1, 0, 0, 0] },
    { type: "box", box: [-8, -1, 18, 27, -4, 4], front: [7, 13, 9, 11], keep: [0, 1, 0, 0] },
    { type: "box", box: [1, 8, 18, 27, -4, 4], front: [16, 13, 9, 11], keep: [0, 1, 0, 0] },
  ],

  // --- A.S. Faubourg 78 · Baskets « Terrain » (chaussures basses) ---
  faubourg_78_baskets_terrain: [
    { type: "box", box: [-8, -1, 0, 7, -5, 7], front: [2, 16, 13, 11], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [1, 8, 0, 7, -5, 7], front: [17, 16, 13, 11], keep: [0, 2, 0, 0], round: 1 },
  ],

  // --- A.S. Faubourg 78 · Bonnet « Virage » (tête, pompon compris) ---
  faubourg_78_bonnet_virage: [
    { type: "lathe", center: [0, 0], y0: 68, rect: [6, 4, 20, 21], scale: 0.7 },
  ],

  // --- A.S. Faubourg 78 · Écharpe « Kop » (cou : tour de cou + un long pan devant) ---
  faubourg_78_echarpe_kop: [
    { type: "box", box: [-6, 6, 56, 60, -6, 6], front: [6, 5, 20, 6], round: 1 },
    { type: "box", box: [-4, 4, 36, 57, 5, 8], front: [11, 13, 10, 17], keep: [0, 2, 0, 0] },
  ],

  // --- Orbite 2000 · Veste « Satellite » (veste chromée ajustée) ---
  orbite_2000_veste_satellite: [
    { type: "box", box: [-10, 10, 33, 59, -7, 7], front: [6, 7, 20, 19], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [-15, -9, 36, 59, -3, 3], front: [26, 12, 4, 13], keep: [0, 2, 0, 0], flipX: true },
    { type: "box", box: [9, 15, 36, 59, -3, 3], front: [26, 12, 4, 13], keep: [0, 2, 0, 0] },
    { type: "box", box: [-5, 5, 57, 62, -5, 5], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- Orbite 2000 · T-shirt « Flyer » (haut court : le ventre reste nu) ---
  orbite_2000_tshirt_flyer: [
    { type: "box", box: [-9, 9, 40, 58, -6, 6], front: [6, 6, 20, 15], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [-14, -9, 50, 58, -3, 3], front: [26, 8, 4, 8], keep: [0, 1, 0, 0], flipX: true },
    { type: "box", box: [9, 14, 50, 58, -3, 3], front: [26, 8, 4, 8], keep: [0, 1, 0, 0] },
    { type: "box", box: [-4, 4, 57, 60, -4, 4], front: [10, 4, 12, 4], round: 1 },
  ],

  // --- Orbite 2000 · Pantalon « Apesanteur » (bas ajusté) ---
  orbite_2000_pantalon_apesanteur: [
    { type: "box", box: [-9, 9, 26, 37, -5, 5], front: [6, 7, 20, 6], keep: [2, 0, 0, 0] },
    { type: "box", box: [-9, -1, 5, 26, -4, 4], front: [6, 13, 10, 17], keep: [0, 2, 0, 0] },
    { type: "box", box: [1, 9, 5, 26, -4, 4], front: [16, 13, 10, 17], keep: [0, 2, 0, 0] },
  ],

  // --- Orbite 2000 · Short « Hologramme » (bas court) ---
  orbite_2000_short_hologramme: [
    { type: "box", box: [-9, 9, 27, 37, -5, 5], front: [8, 7, 16, 6], keep: [1, 0, 0, 0] },
    { type: "box", box: [-8, -1, 21, 27, -4, 4], front: [8, 13, 8, 8], keep: [0, 1, 0, 0] },
    { type: "box", box: [1, 8, 21, 27, -4, 4], front: [16, 13, 8, 8], keep: [0, 1, 0, 0] },
  ],

  // --- Orbite 2000 · Baskets « Lune » (chaussures montantes) ---
  orbite_2000_baskets_lune: [
    { type: "box", box: [-8, -1, 0, 10, -5, 7], front: [2, 12, 13, 17], keep: [0, 2, 0, 0], round: 1 },
    { type: "box", box: [1, 8, 0, 10, -5, 7], front: [17, 12, 13, 17], keep: [0, 2, 0, 0], round: 1 },
  ],

  // --- Orbite 2000 · Bob « Fréquence » (tête : calotte + large bord) ---
  orbite_2000_bob_frequence: [
    { type: "lathe", center: [0, 0], y0: 68, rect: [2, 7, 28, 17], scale: 0.7 },
  ],

  // --- Orbite 2000 · Sac « Pastille » (petit sac rigide, tenu à la hanche droite, anses au-dessus) ---
  orbite_2000_sac_pastille: [
    { type: "box", box: [8, 18, 26, 36, -1, 6], front: [5, 9, 22, 15], keep: [0, 1, 0, 0], round: 1 },
    { type: "box", box: [10, 12, 36, 41, 1, 3], plain: [12, 5] },
    { type: "box", box: [14, 16, 36, 41, 1, 3], plain: [12, 5] },
    { type: "box", box: [10, 16, 41, 42, 1, 3], plain: [12, 5] },
  ],
};

/** Vrai si la pièce a déjà un modèle 3D. */
export function hasWearModel(pieceId) {
  return Object.hasOwn(WEAR_MODELS, pieceId);
}
