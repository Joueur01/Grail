// inventory.js — collection du joueur, sauvegarde localStorage, écran Collection
// et tenue équipée.
//
// Format de sauvegarde (version 1) :
// {
//   version: 1,
//   cards: { "<colorwayId>|<rarete>": nombreExemplaires, ... },
//   lastFreeBooster: "AAAA-MM-JJ" | null,   // date locale du dernier booster gratuit
//   equipped: { tete: "<colorwayId>|<rarete>", haut: ..., ... },
//   pity: 0   // boosters ouverts d'affilée sans Légendaire (jauge « Légendaire garantie »)
// }
// Si le format change un jour, on crée "grail_save_v2" et on migre depuis v1.

import { RARITIES } from "./data.js?v=20";
import { createCardFace, createCardShell } from "./cards.js?v=20";

const SAVE_KEY = "grail_save_v1";

function emptySave() {
  return { version: 1, cards: {}, lastFreeBooster: null, equipped: {}, pity: 0 };
}

// Sauvegarde en mémoire : c'est elle qu'on lit/modifie, puis on persiste.
let save = emptySave();

/** Lit la sauvegarde. Si rien n'existe ou si le stockage est bloqué, on part à vide. */
export function loadSave() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) {
      const data = JSON.parse(text);
      // On complète avec les valeurs par défaut au cas où un champ manque.
      save = { ...emptySave(), ...data };
    }
  } catch (err) {
    // Navigation privée, stockage plein, JSON corrompu… le jeu continue quand même.
    console.warn("Sauvegarde illisible, on repart de zéro :", err);
    save = emptySave();
  }
  return save;
}

/** Écrit la sauvegarde. Un échec n'empêche pas de jouer (juste pas de persistance). */
export function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (err) {
    console.warn("Impossible d'enregistrer la sauvegarde :", err);
    return false;
  }
}

/** Clé unique d'une carte : un coloris + une rareté. */
export function cardKey(colorwayId, rarityId) {
  return `${colorwayId}|${rarityId}`;
}

/** Ajoute des cartes [{ colorwayId, rarity }] à la collection et sauvegarde. */
export function addCards(cards) {
  for (const { colorwayId, rarity } of cards) {
    const key = cardKey(colorwayId, rarity);
    save.cards[key] = (save.cards[key] || 0) + 1;
  }
  persist();
}

// --- Tenue équipée (une carte par emplacement) ---

/** Carte équipée sur un emplacement ("tete", "haut"…) : { colorwayId, rarity } ou null. */
export function getEquipped(slot) {
  const key = save.equipped[slot];
  // On ne garde que les cartes réellement possédées (sauvegarde abîmée, etc.).
  if (!key || !save.cards[key]) return null;
  const [colorwayId, rarity] = key.split("|");
  return { colorwayId, rarity };
}

/** Équipe une carte sur un emplacement, ou vide l'emplacement si card = null. */
export function equip(slot, card) {
  if (card) save.equipped[slot] = cardKey(card.colorwayId, card.rarity);
  else delete save.equipped[slot];
  persist();
}

// --- Jauge « Légendaire garantie » (pity) ---

/** Nombre de boosters ouverts d'affilée sans Légendaire. */
export function getPity() {
  return Number.isInteger(save.pity) ? save.pity : 0; // sauvegarde ancienne ou abîmée : 0
}

export function setPity(value) {
  save.pity = value;
  persist();
}

// --- Booster gratuit quotidien (remise à zéro à minuit, heure locale) ---

/** Date du jour au format AAAA-MM-JJ, en heure LOCALE (pas UTC). */
function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function canOpenFreeBooster() {
  return save.lastFreeBooster !== todayLocal();
}

export function markFreeBoosterUsed() {
  save.lastFreeBooster = todayLocal();
  persist();
}

// --- Écran Collection ---

/** Liste des cartes possédées : [{ colorwayId, rarity, count }, ...]. */
export function getOwnedCards() {
  return Object.entries(save.cards).map(([key, count]) => {
    const [colorwayId, rarity] = key.split("|");
    return { colorwayId, rarity, count };
  });
}

// Libellés des catégories (les identifiants viennent de pieces.json).
const CATEGORIES = [
  { id: "haut", name: "Haut" },
  { id: "bas", name: "Bas" },
  { id: "chaussures", name: "Chaussures" },
  { id: "accessoire", name: "Accessoire" },
];

/**
 * Branche l'écran Collection et renvoie une fonction pour le redessiner
 * (à appeler après chaque ouverture de booster).
 */
export function setupCollection({ catalogue }) {
  const grid = document.getElementById("collection-grid");
  const summary = document.getElementById("collection-summary");
  const empty = document.getElementById("collection-empty");
  const brandSelect = document.getElementById("filter-brand");
  const categorySelect = document.getElementById("filter-category");
  const raritySelect = document.getElementById("filter-rarity");

  // Remplit les menus de filtres (la 1re option « Marque », « Catégorie »… = tout afficher).
  fillSelect(brandSelect, catalogue.brands);
  fillSelect(categorySelect, CATEGORIES);
  fillSelect(raritySelect, [...RARITIES].reverse()); // Légendaire en premier

  // Position de chaque coloris dans le catalogue, pour un tri stable.
  const catalogueOrder = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  const rarityRank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const totalPossible = catalogue.colorways.length * RARITIES.length; // 75 × 4 = 300

  function render() {
    // On ignore une carte dont le coloris n'existe plus dans le catalogue.
    const owned = getOwnedCards().filter((c) => catalogue.colorwayById.has(c.colorwayId));
    const copies = owned.reduce((sum, c) => sum + c.count, 0);
    summary.textContent = `${owned.length} / ${totalPossible} cartes · ${copies} au total`;

    const visible = owned
      .filter((c) => {
        const colorway = catalogue.colorwayById.get(c.colorwayId);
        return (!brandSelect.value || colorway.brand.id === brandSelect.value)
          && (!categorySelect.value || colorway.piece.category === categorySelect.value)
          && (!raritySelect.value || c.rarity === raritySelect.value);
      })
      // Tri : la plus rare d'abord, puis l'ordre du catalogue (marque, pièce, coloris).
      .sort((a, b) => (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
        || (catalogueOrder.get(a.colorwayId) - catalogueOrder.get(b.colorwayId)));

    grid.replaceChildren(...visible.map((c) => {
      const colorway = catalogue.colorwayById.get(c.colorwayId);
      const card = createCardShell(colorway, c.rarity);
      card.classList.add("owned");
      card.append(createCardFace(colorway, c.rarity));
      if (c.count > 1) {
        const badge = document.createElement("span");
        badge.className = "count-badge";
        badge.textContent = `×${c.count}`;
        card.append(badge);
      }
      return card;
    }));

    empty.hidden = visible.length > 0;
    empty.textContent = owned.length === 0
      ? "Aucune carte pour l'instant. Ouvre un booster !"
      : "Aucune carte ne correspond à ces filtres.";
  }

  for (const select of [brandSelect, categorySelect, raritySelect]) {
    select.addEventListener("change", render);
  }
  render();
  return render;
}

/** Ajoute une <option> par élément { id, name } (après l'option « tout »). */
function fillSelect(select, items) {
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  }
}
