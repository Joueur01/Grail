// economy-config.js — TOUTES les valeurs chiffrées de l'économie du jeu.
//
// C'est le seul fichier à modifier pour équilibrer le jeu : aucune autre partie
// du code ne doit écrire de taux, de seuil, de coût ou de gain en dur.
// Pas d'import ici : que des valeurs, faciles à relire et à changer.
//
// ⚠️ Monnaie virtuelle uniquement, jamais convertible en euros (CLAUDE.md, section 9).

// --- Taux de drop (PROVISOIRES) -------------------------------------------------
// Poids relatifs : ils n'ont pas besoin de faire 100, le tirage les normalise.
export const DROP_WEIGHTS = {
  commun: 70,
  rare: 22,
  epique: 7,
  legendaire: 1,
};

// --- Boosters ---------------------------------------------------------------------
export const BOOSTER = {
  // ⚠️ PÉRIODE DE TEST : true = boosters illimités pour tout le monde.
  // À REMETTRE À false AVANT D'ENVOYER LE LIEN AUX AMIS.
  unlimited: true,
  cardsPerPack: 3,        // cartes par booster
  // Stock gratuit : nombre de boosters offerts par jour. Le stock se remplit
  // à minuit, heure locale du téléphone (c'est le « minuteur » du jeu).
  freePerDay: 1,
  // Garantie : si les autres cartes sont toutes plus communes que cette rareté,
  // la dernière carte du booster est au moins de cette rareté (« jamais 3 Communes »).
  lastCardMinRarity: "rare",
};

// --- Pity « Légendaire garantie » ---------------------------------------------------
export const PITY = {
  legendaryEvery: 30,     // le Nᵉ booster d'affilée sans Légendaire en contient une
  almostThreshold: 5,     // la jauge brille sur les N derniers boosters
};

// --- Amélioration (roue) ----------------------------------------------------------
// Coût = les cartes misées (perdues dans tous les cas) ; aucune pièce n'est demandée.
export const UPGRADE = {
  minCards: 1,            // mise minimale
  maxCards: 5,            // mise maximale (= seuil de réussite garantie)
  chancePerCard: 20,      // % de chances par carte misée
  maxChance: 100,         // plafond de la chance, en %
};

// --- Défausse — PAS ENCORE CODÉE ----------------------------------------------------
// Gain en pièces pour une carte défaussée, selon sa rareté.
export const DISCARD_VALUES = { commun: 5, rare: 20, epique: 80, legendaire: 400 };

// --- Monnaie du jeu (« pièces ») ----------------------------------------------------
export const COINS = {
  startBalance: 0,          // solde d'un nouveau joueur
  dailyLoginBonus: 20,      // pièces offertes à la 1re visite de chaque jour calendaire
  dailyBonusTimeZone: "Europe/Paris", // le changement de jour se fait à minuit à Paris
};
