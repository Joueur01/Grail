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

// Rareté « Ultime » (au-dessus de Légendaire) : réservée aux Ultimes de l'album (un par modèle).
// Elle n'est PAS dans RARITIES (ni tirage, ni roue, ni défausse, ni Market : un Ultime n'est jamais
// dans l'inventaire) ; elle sert seulement à afficher ces cartes (tenue, vitrine, album).
export const ULTIME = { id: "ultime", name: "Ultime" };
// Toutes les raretés affichables, de la plus commune à la plus rare (filtres de la tenue et de la vitrine).
export const ALL_RARITIES = [...RARITIES, ULTIME];

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

  const response = await fetch("data/pieces.json?v=92");
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
  // Elle n'est PAS dans `colorways` (elle ne compte pas dans les 300 cartes) mais elle est retrouvable
  // par `colorwayById` : une carte « <modèle>_ultime|ultime » se lit comme les autres.
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
    colorwayById: new Map([...colorways, ...ultimates].map((c) => [c.id, c])),
    ultimates,
    ultimateById: new Map(ultimates.map((u) => [u.id, u])),
  };
  return catalogue;
}

/** Retrouve une rareté par son identifiant (ex. "epique"). */
export function getRarity(id) {
  return ALL_RARITIES.find((r) => r.id === id);
}

/**
 * Position de chaque coloris (et de chaque Ultime, juste après le dernier coloris
 * de son modèle) dans le catalogue, pour des tris stables.
 */
export function catalogueOrderMap(catalogue) {
  const order = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  for (const u of catalogue.ultimates) {
    const last = Math.max(...u.piece.colorways.map((c) => order.get(c.id)));
    order.set(u.id, last + 0.5);
  }
  return order;
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
