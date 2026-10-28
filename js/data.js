// data.js — catalogue des pièces, raretés et petits outils partagés.
// Les valeurs d'économie (taux, seuils, gains…) sont dans economy-config.js.

// Les 4 raretés (ordre croissant). Les taux de tirage ne sont PAS ici :
// ils sont dans js/economy-config.js (DROP_RATES).
export const RARITIES = [
  { id: "commun",     name: "Commun" },
  { id: "rare",       name: "Rare" },
  { id: "epique",     name: "Épique" },
  { id: "legendaire", name: "Légendaire" },
];

// Catalogue chargé une seule fois, puis gardé en mémoire.
let catalogue = null;

/**
 * Charge data/pieces.json et prépare des index pratiques.
 * Renvoie { brands, pieces, colorways, colorwayById, ultimates, ultimateById }.
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

  // Version « Ultime » de chaque modèle (une seule par pièce, pas par coloris),
  // gagnée avec l'album. Sprite créé par tools/creer_ultimes.py.
  // Elle n'est PAS dans `colorways` : elle ne compte pas dans les 300 cartes.
  const ultimates = raw.pieces.map((piece) => ({
    id: `${piece.id}_ultime`,
    name: "Édition unique",
    sprite: `assets/pieces/${piece.id}_ultime.png`,
    ultimate: true,
    piece,
    brand: brandById.get(piece.brand),
  }));

  catalogue = {
    brands: raw.brands,
    pieces: raw.pieces,
    colorways,
    colorwayById: new Map(colorways.map((c) => [c.id, c])),
    ultimates,
    ultimateById: new Map(ultimates.map((u) => [u.id, u])),
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
