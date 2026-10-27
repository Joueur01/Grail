// data.js — catalogue des pièces et constantes de jeu partagées.

// Taux de tirage PROVISOIRES (section 6). C'est le seul endroit à modifier.
// Les poids n'ont pas besoin de faire 100 : le tirage les normalise.
export const RARITIES = [
  { id: "commun",     name: "Commun",     weight: 70 },
  { id: "rare",       name: "Rare",       weight: 22 },
  { id: "epique",     name: "Épique",     weight: 7 },
  { id: "legendaire", name: "Légendaire", weight: 1 },
];

// Nombre de cartes par booster.
export const CARDS_PER_BOOSTER = 3;

// « Pity » : au bout de ce nombre de boosters d'affilée SANS Légendaire,
// le suivant en contient forcément une. Le compteur repart à 0 dès qu'une
// Légendaire sort (forcée ou non). Il est visible sous le paquet.
export const PITY_LEGENDAIRE = 30;

// Amélioration (« roue ») : on mise de 1 à UPGRADE_MAX_CARDS cartes du même
// modèle et de la même rareté ; chaque carte misée donne UPGRADE_CHANCE_PER_CARD %
// de chances d'obtenir le modèle à la rareté au-dessus. Les cartes misées sont
// perdues dans tous les cas (réussite ou échec).
export const UPGRADE_MAX_CARDS = 5;
export const UPGRADE_CHANCE_PER_CARD = 20;

// Défausse — PAS ENCORE CODÉE (le bouton est grisé « Bientôt »).
// Valeur d'une carte défaussée, en monnaie du jeu, selon sa rareté.
// ⚠️ Monnaie virtuelle uniquement, jamais convertible en euros (section 9 du
// CLAUDE.md), et hors périmètre de la bêta : à valider avant de l'activer.
export const DISCARD_VALUES = { commun: 5, rare: 20, epique: 80, legendaire: 400 };

// Catalogue chargé une seule fois, puis gardé en mémoire.
let catalogue = null;

/**
 * Charge data/pieces.json et prépare des index pratiques.
 * Renvoie { brands, pieces, colorways, colorwayById }.
 * `colorways` est la liste « à plat » des 75 coloris, chacun avec
 * une référence vers sa pièce et sa marque (utile pour le tirage).
 */
export async function loadCatalogue() {
  if (catalogue) return catalogue;

  const response = await fetch("data/pieces.json");
  if (!response.ok) throw new Error(`Catalogue introuvable (${response.status})`);
  const raw = await response.json();

  const brandById = new Map(raw.brands.map((b) => [b.id, b]));
  const colorways = [];
  for (const piece of raw.pieces) {
    for (const cw of piece.colorways) {
      colorways.push({ ...cw, piece, brand: brandById.get(piece.brand) });
    }
  }

  catalogue = {
    brands: raw.brands,
    pieces: raw.pieces,
    colorways,
    colorwayById: new Map(colorways.map((c) => [c.id, c])),
  };
  return catalogue;
}

/** Retrouve une rareté par son identifiant (ex. "epique"). */
export function getRarity(id) {
  return RARITIES.find((r) => r.id === id);
}

/** Minuscules sans accents, pour comparer des textes (« Écharpe » = « echarpe »). */
export function normalizeText(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Recherche : true si CHAQUE mot de la requête apparaît dans l'un des textes.
 * Une requête vide correspond à tout.
 */
export function matchesSearch(query, texts) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeText(texts.join(" "));
  return words.every((w) => haystack.includes(w));
}
