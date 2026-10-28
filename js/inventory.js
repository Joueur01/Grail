// inventory.js — état du joueur (copie LOCALE de ce que dit le serveur) et écran Collection.
//
// ⚠️ Le serveur (Supabase) est la source de vérité. Ce fichier ne fait que :
//   - LIRE le profil, l'inventaire et les ventes du joueur (refreshState) ;
//   - les garder en mémoire pour que l'affichage soit instantané ;
//   - relayer les actions simples (verrou, tenue) vers le serveur, puis relire l'état.
// Il ne calcule rien d'important : pas de tirage, de gain ni de règle de jeu.

import { RARITIES, matchesSearch, getRarity } from "./data.js?v=83";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=83";
import * as api from "./api.js?v=83";

// --- État en mémoire (rempli par refreshState) ---

const state = {
  profile: null,                 // ligne « profiles » du joueur
  cards: new Map(),              // "coloris|rareté" → { colorwayId, rarity, count, locked }
  album: null,                   // { cards: Set("coloris|rareté"), ultimates: Set(modèle) } ; null = migration 0022 absente
  listings: [],                  // mes ventes en cours
  booster: null,                 // dernier get_booster_state() + échéance du minuteur
};
const coinListeners = [];
const reputationListeners = [];
const stateListeners = [];

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
    const [profile, inventory, listings, boosterState, album] = await Promise.all([
      api.getProfile(), api.getInventory(), api.getMyListings(), booster ? api.getBoosterState() : null,
      // Album : sans la migration 0022, la fonction n'existe pas encore (le reste du jeu marche quand même).
      api.getAlbum().catch(() => null),
    ]);
    if (!profile) throw new api.ApiError("Profil introuvable. Reconnecte-toi.");
    const before = state.profile ? state.profile.coins : null;
    const levelBefore = state.profile ? state.profile.rep_level : undefined;
    state.profile = profile;
    state.cards = new Map(inventory.map((r) => [cardKey(r.colorway_id, r.rarity),
      { colorwayId: r.colorway_id, rarity: r.rarity, count: r.count, locked: r.locked }]));
    state.listings = listings;
    state.album = album ? { cards: new Set(album.cards), ultimates: new Set(album.ultimates) } : null;
    if (boosterState) {
      // Le minuteur est calculé à partir d'une échéance : il continue de défiler sans rappeler le serveur.
      const next = boosterState.next_in_seconds;
      state.booster = { ...boosterState, deadline: next === null || next === undefined ? null : Date.now() + next * 1000 };
    }
    if (before !== null && profile.coins !== before) for (const fn of coinListeners) fn(profile.coins);
    // Réputation : on prévient quand le niveau MONTE (animation du bouton profil + notification).
    const reputation = getReputation();
    if (reputation && levelBefore !== undefined && reputation.level > levelBefore) for (const fn of reputationListeners) fn(reputation, levelBefore);
    for (const fn of reputationListeners) fn(reputation, null);
    for (const fn of stateListeners) fn();
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

/**
 * Album (migration 0022) : { available, cards: Set("coloris|rareté"), ultimates: Set(modèle) }.
 * available = false tant que la migration n'est pas exécutée.
 */
export function getAlbumState() {
  return state.album
    ? { available: true, cards: state.album.cards, ultimates: state.album.ultimates }
    : { available: false, cards: new Set(), ultimates: new Set() };
}

/** Clé d'un Ultime dans la tenue et la vitrine : "<modèle>_ultime|ultime". */
export function ultimateCardKey(pieceId) {
  return cardKey(`${pieceId}_ultime`, "ultime");
}

/**
 * Ultimes obtenus, au même format que les cartes de la collection :
 * [{ colorwayId: "<modèle>_ultime", rarity: "ultime", count: 1, locked: true, ultimate: true }].
 * Un Ultime n'est jamais dans l'inventaire : il ne se vend, ne se mise ni ne se défausse
 * (c'est le serveur qui l'impose) ; il se porte et se met en vitrine.
 */
export function getOwnedUltimates() {
  return [...(state.album?.ultimates || [])].map((pieceId) =>
    ({ colorwayId: `${pieceId}_ultime`, rarity: "ultime", count: 1, locked: true, ultimate: true }));
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

/** Appelle fn() après CHAQUE relecture de l'état (sert aux pastilles de notification : stock de boosters…). */
export function onStateChange(fn) {
  stateListeners.push(fn);
}

/** Appelle fn(réputation, ancienNiveau) après chaque relecture : ancienNiveau est le niveau d'avant si le niveau vient de monter, sinon null. */
export function onReputationChange(fn) {
  reputationListeners.push(fn);
}

/**
 * Réputation du joueur (le Flow est devenu une réputation, migration 0021) :
 * { level, flow, next } où flow = Flow accumulé vers le niveau suivant et next = Flow demandé pour l'atteindre.
 * null tant que la migration n'est pas exécutée. Tout vient du serveur : le site ne calcule rien.
 */
export function getReputation() {
  const p = state.profile;
  if (!p || typeof p.rep_level !== "number" || typeof p.rep_next !== "number") return null;
  return { level: p.rep_level, flow: p.flow || 0, next: p.rep_next };
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

/** Avatar choisi (« homme » / « femme ») tel qu'enregistré sur le serveur, ou null (migration 0014 absente). */
export function getAvatarBody() {
  const body = state.profile?.avatar_body;
  return body === "femme" || body === "homme" ? body : null;
}

/** Enregistre le choix de l'avatar sur le serveur (visible par les amis sur la page de profil). */
export async function saveAvatarBody(body) {
  await api.setAvatarBody(body);
  if (state.profile) state.profile.avatar_body = body;
}

/** Carte équipée sur un emplacement ("tete", "haut"…) : { colorwayId, rarity } ou null. */
export function getEquipped(slot) {
  const key = state.profile?.equipped?.[slot];
  const isUltimate = key?.endsWith("|ultime") && state.album?.ultimates.has(key.slice(0, -"_ultime|ultime".length));
  if (!key || !(state.cards.has(key) || isUltimate)) return null; // on ne garde que les cartes réellement possédées
  const [colorwayId, rarity] = key.split("|");
  return { colorwayId, rarity };
}

/** Cette carte est-elle portée (sur n'importe quel emplacement) ? */
export function isCardEquipped(colorwayId, rarity) {
  const key = cardKey(colorwayId, rarity);
  return Object.values(state.profile?.equipped || {}).includes(key);
}

/** Pseudo du joueur (« » tant qu'il n'en a pas choisi), tel que connu du site : sert à l'image de partage. */
export function getPseudo() {
  return state.profile?.pseudo || "";
}

/** Garde le pseudo à jour dans le cache juste après un changement (sans attendre la prochaine relecture). */
export function setCachedPseudo(pseudo) {
  if (state.profile) state.profile.pseudo = pseudo || null;
}

/** Cartes de la vitrine ("coloris|rareté"), telles qu'enregistrées sur le serveur (migration 0015), ou []. */
export function getShowcaseKeys() {
  return Array.isArray(state.profile?.showcase) ? state.profile.showcase : [];
}

// --- Actions simples : le serveur vérifie et écrit, puis on relit l'état ---

/** Verrouille ou déverrouille une carte (tous ses exemplaires). */
export async function setLocked(colorwayId, rarity, locked) {
  await api.setLocked(colorwayId, rarity, locked);
  await refreshState({ booster: false });
}

/** Équipe une carte sur un emplacement, ou vide l'emplacement si card = null. */
export async function equip(slot, card) {
  if (card?.rarity === "ultime") await api.setEquippedUltimate(slot, card.colorwayId.replace(/_ultime$/, ""));
  else await api.setEquipped(slot, card ? card.colorwayId : null, card ? card.rarity : null);
  await refreshState({ booster: false });
}

/**
 * Place une carte dans l'album (DÉFINITIF : elle quitte la collection, le serveur ne la rend jamais).
 * → { colorway_id, rarity, piece_id, have, total, ultimate_unlocked }
 */
export async function addToAlbum(colorwayId, rarity) {
  const result = await api.albumAdd(colorwayId, rarity);
  await refreshState({ booster: false });
  return result;
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
    // Une carte placée dans l'album reste « collectée » : elle compte dans la progression.
    const album = getAlbumState();
    const inAlbumOnly = [...album.cards].filter((k) => !state.cards.has(k)).length;
    summary.textContent = `${owned.length + inAlbumOnly} / ${totalPossible} cartes · ${copies + album.cards.size} au total`;

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
