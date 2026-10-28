// economy-config.js — valeurs de l'économie, pour l'AFFICHAGE UNIQUEMENT.
//
// ⚠️ La source de vérité est le SERVEUR (table economy_config de Supabase). Ces valeurs
// ne servent qu'à afficher (jauges, chance annoncée, prix conseillé, textes d'aide) : le
// front ne tire rien, ne calcule aucun gain et ne vérifie aucune règle. Si le serveur change
// une valeur, la mettre à jour ici aussi pour que l'affichage reste juste.
// Pas d'import ici : que des valeurs.

// Taux de drop (en %, par carte) : affichage de la rareté minimale de la carte Signature.
export const DROP_RATES = {
  standard: { commun: 82, rare: 14, epique: 3.5, legendaire: 0.5 },
  signatureLast: { commun: 0, rare: 75, epique: 20, legendaire: 5 },
};

export const BOOSTER = {
  cardsPerPack: 3,        // cartes par booster (texte « 3e carte Rare ou mieux »)
  refillHours: 6,         // 1 booster gratuit généré toutes les 6 h (page « Règles du jeu »)
  maxStock: 3,            // stock maximum
  signatureEvery: 4,      // 1 booster gratuit sur 4 est un Booster Signature
};

// Bonus de connexion quotidien (page « Règles du jeu » ; le serveur verse le vrai montant).
export const DAILY_BONUS = { coins: 20 };

// Réputation (le Flow devenu niveaux) : le niveau n → n+1 coûte costStep × (n + 1) Flow.
export const REPUTATION = { costStep: 50 };

// Vitrine du profil : nombre maximum de cartes (le serveur renvoie le vrai maximum).
export const SHOWCASE = { max: 3 };

// Videur : essais par jour et Flow gagné par porte (affichage seulement). Les règles, les seuils et les
// critères du Club et du VIP sont SECRETS : ils ne sont JAMAIS dans le code du site (CLAUDE.md, section 16).
export const VIDEUR_INFO = {
  doors: [
    { id: "bar", name: "Bar", tries: 3, flow: 5, boosters: 1 },
    { id: "club", name: "Club", tries: 5, flow: 12, boosters: 1 },
    { id: "vip", name: "VIP", tries: 5, flow: 25, boosters: 2 },
  ],
  streakBonusCap: 5,
};

// Pity : seuils des jauges sous le paquet.
export const PITY = {
  legendary: { softStart: 40, guaranteedAt: 60 },
  epic: { guaranteedAfter: 16 },
};

// Roue : mise et chance ANNONCÉES avant de lancer (le tirage réel est fait par le serveur).
export const UPGRADE = {
  minCards: 1,
  maxCards: 5,
  chancePerCard: 20,
  maxChance: 100,
};

// Défausse : gain annoncé par carte (le serveur verse le gain réel).
export const DISCARD_VALUES = { commun: 3, rare: 15, epique: 60, legendaire: 200 };
// Confort d'interface (pas une règle de jeu) : 2e toucher de confirmation à partir de cette rareté.
export const DISCARD_CONFIRM_FROM = "epique";
// Confort d'interface : « Doublons » garde ce nombre d'exemplaires de chaque carte.
export const DISCARD_KEEP = 1;

// Market : limites annoncées et prix de référence (prix conseillé). Le serveur applique les vraies règles.
export const MARKET = {
  maxListings: 10,
  minPrice: 1,
  maxPrice: 99999,
  referencePrice: { commun: 8, rare: 40, epique: 160, legendaire: 600 },
  saleTaxPercent: 5, // taxe sur chaque vente, payée par le vendeur (le serveur applique la vraie règle)
};

/** Taxe affichée pour un prix de vente (arrondie à l'entier supérieur, comme le serveur) et pièces reçues. */
export const saleTax = (price) => Math.min(price, Math.ceil((price * MARKET.saleTaxPercent) / 100));
export const saleNet = (price) => price - saleTax(price);

// Amis : délai entre deux changements de pseudo (affichage ; le serveur applique la vraie règle).
export const FRIENDS = {
  pseudoChangeDays: 30,
};
