// economy-config.js — TOUTES les valeurs chiffrées de l'économie du jeu.
//
// C'est le seul fichier à modifier pour équilibrer le jeu : aucune autre partie
// du code ne doit écrire de taux, de seuil, de coût ou de gain en dur.
// Pas d'import ici : que des valeurs, faciles à relire et à changer.
//
// ⚠️ Monnaie virtuelle uniquement, jamais convertible en euros (CLAUDE.md, section 9).

// --- Taux de drop (en %, par carte) ----------------------------------------------
// Chaque table doit faire 100. La simulation (tools/simulation.html) vérifie
// les taux réellement obtenus.
export const DROP_RATES = {
  // Booster standard (ses 3 cartes) ET cartes 1-2 d'un booster Signature.
  standard: { commun: 82, rare: 14, epique: 3.5, legendaire: 0.5 },
  // Carte 3 d'un booster Signature (jamais Commune), toujours montrée en dernier.
  signatureLast: { commun: 0, rare: 75, epique: 20, legendaire: 5 },
};

// --- Boosters ---------------------------------------------------------------------
export const BOOSTER = {
  // ⚠️ PÉRIODE DE TEST : true = quand le stock est vide, on peut quand même ouvrir
  // (booster « test », compté comme gratuit). À REMETTRE À false AVANT D'ENVOYER
  // LE LIEN AUX AMIS.
  unlimited: true,
  cardsPerPack: 3,        // cartes par booster
  // Stock gratuit : 1 booster est généré toutes les refillHours heures, jusqu'à
  // maxStock. Le calcul se fait sur l'heure réelle : le site peut être fermé.
  refillHours: 6,
  maxStock: 3,
  startStock: 3,          // stock d'un nouveau joueur
  signatureEvery: 4,      // 1 booster GRATUIT sur 4 est un booster Signature
};

// --- Pity (compteurs de boosters d'affilée sans la rareté) --------------------------
// Les compteurs comptent TOUS les boosters (gratuits, Signature) et
// repartent à 0 dès que la rareté (ou mieux, pour l'Épique) sort.
export const PITY = {
  legendary: {
    softStart: 40,        // après 40 boosters sans Légendaire, le taux monte…
    softStep: 1,          // …de +1 point par carte à chaque booster de plus (41e : +1, 42e : +2…)
    guaranteedAt: 60,     // le 60e booster d'affilée sans Légendaire en contient une
  },
  epic: {
    guaranteedAfter: 16,  // après 16 boosters sans Épique ou mieux, le suivant en contient une
  },
};

// --- Amélioration (roue) ----------------------------------------------------------
// Coût = les cartes misées (perdues dans tous les cas) ; aucune pièce n'est demandée.
export const UPGRADE = {
  minCards: 1,            // mise minimale
  maxCards: 5,            // mise maximale (= seuil de réussite garantie)
  chancePerCard: 20,      // % de chances par carte misée
  maxChance: 100,         // plafond de la chance, en %
};

// --- Défausse -----------------------------------------------------------------------
// Pièces gagnées pour chaque carte défaussée, selon sa rareté.
export const DISCARD_VALUES = { commun: 3, rare: 15, epique: 60, legendaire: 200 };
// À partir de cette rareté, la défausse demande une confirmation en plus (2e toucher).
export const DISCARD_CONFIRM_FROM = "epique";
// « Garder les doublons » : nombre d'exemplaires gardés de chaque carte.
export const DISCARD_KEEP = 1;

// --- Monnaie du jeu (« pièces ») ----------------------------------------------------
export const COINS = {
  startBalance: 0,          // solde d'un nouveau joueur
  dailyLoginBonus: 20,      // pièces offertes à la 1re visite de chaque jour calendaire
  dailyBonusTimeZone: "Europe/Paris", // le changement de jour se fait à minuit à Paris
};
