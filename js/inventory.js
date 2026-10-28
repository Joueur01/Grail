// inventory.js — état du joueur (copie LOCALE de ce que dit le serveur) et écran Collection.
//
// ⚠️ Le serveur (Supabase) est la source de vérité. Ce fichier ne fait que :
//   - LIRE le profil, l'inventaire et les ventes du joueur (refreshState) ;
//   - les garder en mémoire pour que l'affichage soit instantané ;
//   - relayer les actions simples (verrou, tenue) vers le serveur, puis relire l'état.
// Il ne calcule rien d'important : pas de tirage, de gain ni de règle de jeu.

import { RARITIES, matchesSearch, getRarity } from "./data.js?v=51";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=51";
import * as api from "./api.js?v=51";

// --- État en mémoire (rempli par refreshState) ---

const state = {
  profile: null,                 // ligne « profiles » du joueur
  cards: new Map(),              // "coloris|rareté" → { colorwayId, rarity, count, locked }
  listings: [],                  // mes ventes en cours
  booster: null,                 // dernier get_booster_state() + échéance du minuteur
};
const coinListeners = [];

/** Clé unique d'une carte : un coloris + une rareté. */
export function cardKey(colorwayId, rarityId) {
  return `${colorwayId}|${rarityId}`;
}

/** L'ancienne sauvegarde du navigateur n'est plus utilisée : on la supprime. */
export function clearLocalSave() {
  try {
    localStorage.removeItem("grail_save_v1");
  } catch {
    // stockage indisponible : sans importance
  }
}

let queue = Promise.resolve();

/**
 * Relit le profil, l'inventaire, mes ventes (et l'état des boosters) depuis le serveur.
 * Les appels s'enchaînent : une relecture demandée après une action voit toujours cette action.
 * - booster : false pour sauter get_booster_state (si on n'a pas besoin du stock)
 */
export function refreshState({ booster = true } = {}) {
  const run = async () => {
    const [profile, inventory, listings, boosterState] = await Promise.all([
      api.getProfile(), api.getInventory(), api.getMyListings(), booster ? api.getBoosterState() : null,
    ]);
    if (!profile) throw new api.ApiError("Profil introuvable. Reconnecte-toi.");
    const before = state.profile ? state.profile.coins : null;
    state.profile = profile;
    state.cards = new Map(inventory.map((r) => [cardKey(r.colorway_id, r.rarity),
      { colorwayId: r.colorway_id, rarity: r.rarity, count: r.count, locked: r.locked }]));
    state.listings = listings;
    if (boosterState) {
      // Le minuteur est calculé à partir d'une échéance : il continue de défiler sans rappeler le serveur.
      const next = boosterState.next_in_seconds;
      state.booster = { ...boosterState, deadline: next === null || next === undefined ? null : Date.now() + next * 1000 };
    }
    if (before !== null && profile.coins !== before) for (const fn of coinListeners) fn(profile.coins);
  };
  const result = queue.then(run);
  queue = result.catch(() => {}); // une erreur ne bloque pas les relectures suivantes
  return result;
}

// --- Lectures (instantanées : elles lisent la copie en mémoire) ---

/** Liste des cartes possédées : [{ colorwayId, rarity, count, locked }, ...]. */
export function getOwnedCards() {
  return [...state.cards.values()].map((c) => ({ ...c }));
}

/** Nombre d'exemplaires possédés d'une carte (0 si aucun). */
export function countCard(colorwayId, rarity) {
  return state.cards.get(cardKey(colorwayId, rarity))?.count || 0;
}

export function isLocked(colorwayId, rarity) {
  return state.cards.get(cardKey(colorwayId, rarity))?.locked === true;
}

/** Solde de pièces. */
export function getCoins() {
  return state.profile?.coins ?? 0;
}

/** Appelle fn(solde) quand le solde change après une relecture (sert à l'animation du solde). */
export function onCoinsChange(fn) {
  coinListeners.push(fn);
}

/** Boosters : { stock, max, nextInMs, signature, untilSignature, canOpen } (nextInMs = null : stock plein). */
export function getBoosterState() {
  const b = state.booster;
  if (!b) return { stock: 0, max: 0, nextInMs: null, signature: false, untilSignature: 0, canOpen: false };
  return {
    stock: b.stock,
    max: b.max_stock,
    nextInMs: b.deadline === null ? null : Math.max(0, b.deadline - Date.now()),
    signature: b.signature_next,
    untilSignature: b.until_signature,
    canOpen: b.stock > 0,
  };
}

export function getPity() {
  return state.profile?.pity_legendary ?? 0;
}

export function getPityEpic() {
  return state.profile?.pity_epic ?? 0;
}

export function isTutorialDone() {
  return state.profile?.tutorial_done === true;
}

/** Mes ventes en cours : [{ id, colorway_id, rarity, price, created_at }]. */
export function getMyListings() {
  return state.listings.map((l) => ({ ...l }));
}

/** Carte équipée sur un emplacement ("tete", "haut"…) : { colorwayId, rarity } ou null. */
export function getEquipped(slot) {
  const key = state.profile?.equipped?.[slot];
  if (!key || !state.cards.has(key)) return null; // on ne garde que les cartes réellement possédées
  const [colorwayId, rarity] = key.split("|");
  return { colorwayId, rarity };
}

// --- Actions simples : le serveur vérifie et écrit, puis on relit l'état ---

/** Verrouille ou déverrouille une carte (tous ses exemplaires). */
export async function setLocked(colorwayId, rarity, locked) {
  await api.setLocked(colorwayId, rarity, locked);
  await refreshState({ booster: false });
}

/** Équipe une carte sur un emplacement, ou vide l'emplacement si card = null. */
export async function equip(slot, card) {
  await api.setEquipped(slot, card ? card.colorwayId : null, card ? card.rarity : null);
  await refreshState({ booster: false });
}

/** Le tuto du 1er booster est terminé. */
export async function markTutorialDone() {
  await api.setTutorialDone();
  if (state.profile) state.profile.tutorial_done = true;
}

// --- Écran Collection ---

// Libellés des catégories (les identifiants viennent de pieces.json).
const CATEGORIES = [
  { id: "haut", name: "Haut" },
  { id: "bas", name: "Bas" },
  { id: "chaussures", name: "Chaussures" },
  { id: "accessoire", name: "Accessoire" },
];

/**
 * Branche l'écran Collection et renvoie une fonction pour le redessiner
 * (à appeler après chaque ouverture de booster ou amélioration).
 * - onCardTap : appelé avec { colorwayId, rarity, count } quand on touche une carte
 * - selection : mode « Sélectionner » (discard.js) ; en mode actif, toucher une carte la sélectionne
 */
export function setupCollection({ catalogue, onCardTap, selection }) {
  const grid = document.getElementById("collection-grid");
  const summary = document.getElementById("collection-summary");
  const empty = document.getElementById("collection-empty");
  const searchInput = document.getElementById("search-collection");
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
        return matchesSearch(searchInput.value, [colorway.piece.name, colorway.name, colorway.brand.name, getRarity(c.rarity).name])
          && (!brandSelect.value || colorway.brand.id === brandSelect.value)
          && (!categorySelect.value || colorway.piece.category === categorySelect.value)
          && (!raritySelect.value || c.rarity === raritySelect.value);
      })
      // Tri : la plus rare d'abord, puis l'ordre du catalogue (marque, pièce, coloris).
      .sort((a, b) => (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
        || (catalogueOrder.get(a.colorwayId) - catalogueOrder.get(b.colorwayId)));

    selection?.update(visible); // le mode « Sélectionner » a besoin de savoir ce qui est affiché
    const selecting = selection?.active === true;
    // En mode sélection, on garde la position de défilement quand la grille est redessinée.
    const scroller = grid.closest("main");
    const keepScroll = scroller ? scroller.scrollTop : 0;

    grid.replaceChildren(...visible.map((c) => {
      const colorway = catalogue.colorwayById.get(c.colorwayId);
      const card = createCardShell(colorway, c.rarity);
      card.classList.add("owned");
      card.append(createCardFace(colorway, c.rarity));
      if (c.locked) card.append(createLockBadge());
      if (c.count > 1) {
        const badge = document.createElement("span");
        badge.className = "count-badge";
        badge.textContent = `×${c.count}`;
        card.append(badge);
      }
      card.setAttribute("role", "button");
      if (selecting) {
        // Mode « Sélectionner » : toucher choisit la carte (les verrouillées sont protégées).
        // La carte est mise à jour SUR PLACE (sans redessiner la grille) : la page ne saute pas.
        if (c.locked) {
          card.classList.add("used");
          card.setAttribute("aria-label", `${colorway.piece.name}, ${colorway.name} : verrouillée, protégée de la défausse`);
        } else {
          card.classList.add("tappable");
          card.setAttribute("aria-label", `${colorway.piece.name}, ${colorway.name} : sélectionner`);
          const paint = () => {
            const n = selection.pickedCount(c);
            card.classList.toggle("picked", n > 0);
            card.setAttribute("aria-pressed", String(n > 0));
            card.querySelector(".pick-badge")?.remove();
            if (n > 0) {
              const pick = document.createElement("span");
              pick.className = "pick-badge";
              pick.textContent = c.count > 1 ? `${n}/${c.count}` : "✓";
              card.append(pick);
            }
          };
          paint();
          card.addEventListener("click", () => {
            selection.toggle(c);
            paint();
            selection.update(visible); // barre du bas : total à jour
          });
        }
        return card;
      }
      // Toucher une carte ouvre sa fiche (améliorer, défausser…).
      card.classList.add("tappable");
      card.setAttribute("aria-label", `${colorway.piece.name}, ${colorway.name} : ouvrir la fiche`);
      card.addEventListener("click", () => onCardTap?.(c));
      return card;
    }));

    if (scroller && selecting) scroller.scrollTop = keepScroll;

    empty.hidden = visible.length > 0;
    empty.textContent = owned.length === 0
      ? "Aucune carte pour l'instant. Ouvre un booster !"
      : "Aucune carte ne correspond à ta recherche.";
  }

  for (const select of [brandSelect, categorySelect, raritySelect]) {
    select.addEventListener("change", render);
  }
  searchInput.addEventListener("input", render);
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
