// inventory.js — collection du joueur, sauvegarde localStorage, écran Collection
// et tenue équipée.
//
// Format de sauvegarde (version 1) :
// {
//   version: 1,
//   cards: { "<colorwayId>|<rarete>": nombreExemplaires, ... },
//   equipped: { tete: "<colorwayId>|<rarete>", haut: ..., ... },
//   locked: { "<colorwayId>|<rarete>": true },  // cartes verrouillées (jamais proposées à l'amélioration)
//   boosterStock: 3,       // boosters gratuits en stock (0 → BOOSTER.maxStock)
//   stockUpdatedAt: 1730000000000, // début de la recharge en cours (ms, heure réelle)
//   freeOpened: 0,         // boosters gratuits ouverts depuis le début (compteur Signature)
//   coins: 0,              // solde de pièces (entier ≥ 0)
//   lastDailyBonus: "AAAA-MM-JJ" | null,  // dernier jour (heure de Paris) du bonus de connexion
//   market: { listings: [...], sold: {...}, nextId: 1 },  // ventes du joueur + offres simulées déjà achetées
//   pity: 0,      // boosters ouverts d'affilée sans Légendaire (jauge « Légendaire garantie »)
//   pityEpic: 0,  // boosters ouverts d'affilée sans Épique ou mieux
//   tutorialDone: false  // true après le 1er booster (tuto « glisse, ne touche pas »)
// }
// Si le format change un jour, on crée "grail_save_v2" et on migre depuis v1.

import { RARITIES, matchesSearch, getRarity } from "./data.js?v=34";
import { BOOSTER, COINS, DISCARD_VALUES, MARKET } from "./economy-config.js?v=34";
import { refillStock, msUntilNextBooster, isSignatureNext, freeUntilSignature } from "./distribution.js?v=34";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=34";

const SAVE_KEY = "grail_save_v1";

function emptySave() {
  return { version: 1, cards: {}, equipped: {}, locked: {},
    boosterStock: BOOSTER.startStock, stockUpdatedAt: null, freeOpened: 0,
    market: { listings: [], sold: {}, nextId: 1 }, coins: COINS.startBalance, lastDailyBonus: null, pity: 0, pityEpic: 0, tutorialDone: false };
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
      // Ancien système (1 booster par jour) : remplacé par le stock qui se recharge.
      delete save.lastFreeBooster;
      delete save.freeBoostersUsed;
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

/** Retire des cartes (une par élément) SANS sauvegarder : les fonctions publiques s'en chargent. */
function takeAway(cards) {
  for (const { colorwayId, rarity } of cards) {
    const key = cardKey(colorwayId, rarity);
    if (!save.cards[key]) continue;
    save.cards[key] -= 1;
    if (save.cards[key] <= 0) {
      delete save.cards[key];
      delete save.locked[key]; // plus d'exemplaire : le verrou disparaît aussi
      for (const [slot, worn] of Object.entries(save.equipped)) {
        if (worn === key) delete save.equipped[slot];
      }
    }
  }
}

/**
 * Retire des cartes de la collection (une par élément de la liste).
 * Si le dernier exemplaire d'une carte portée disparaît, elle quitte la tenue.
 */
export function removeCards(cards) {
  takeAway(cards);
  persist();
}

/**
 * Défausse des cartes [{ colorwayId, rarity }, …] (une par élément) contre des pièces
 * (DISCARD_VALUES). Tout ou rien : renvoie le nombre de pièces gagnées, ou null si
 * une carte est verrouillée, absente, ou demandée en trop d'exemplaires.
 * Cartes et pièces sont enregistrées ensemble, en une seule sauvegarde.
 */
export function discardCards(cards) {
  if (!cards.length) return null;
  const wanted = {};
  let coins = 0;
  for (const { colorwayId, rarity } of cards) {
    const key = cardKey(colorwayId, rarity);
    wanted[key] = (wanted[key] || 0) + 1;
    if (save.locked?.[key] === true || (save.cards[key] || 0) < wanted[key]) return null;
    coins += DISCARD_VALUES[rarity] || 0;
  }
  takeAway(cards);
  changeCoins(coins); // enregistre les cartes retirées en même temps que le solde
  return coins;
}

/** Nombre d'exemplaires possédés d'une carte (0 si aucun). */
export function countCard(colorwayId, rarity) {
  return save.cards[cardKey(colorwayId, rarity)] || 0;
}

// --- Verrouillage : une carte verrouillée n'est jamais proposée à l'amélioration ---

/** true si la carte (tous ses exemplaires) est verrouillée. */
export function isLocked(colorwayId, rarity) {
  return save.locked?.[cardKey(colorwayId, rarity)] === true;
}

/** Verrouille ou déverrouille une carte, et sauvegarde. */
export function setLocked(colorwayId, rarity, locked) {
  save.locked = save.locked || {};
  const key = cardKey(colorwayId, rarity);
  if (locked) save.locked[key] = true;
  else delete save.locked[key];
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

/** Nombre de boosters ouverts d'affilée sans Épique ou mieux. */
export function getPityEpic() {
  return Number.isInteger(save.pityEpic) ? save.pityEpic : 0;
}

/** Enregistre les deux compteurs de pity après un booster. */
export function setPity(legendary, epic) {
  save.pity = legendary;
  save.pityEpic = epic;
  persist();
}

// --- Tutoriel du 1er booster ---

/** true si le joueur a déjà terminé un booster (le tuto ne s'affiche plus). */
export function isTutorialDone() {
  return save.tutorialDone === true;
}

export function setTutorialDone() {
  save.tutorialDone = true;
  persist();
}

// --- Boosters : stock gratuit qui se recharge, Signature ---
// Les règles (calcul du stock, Signature) sont dans distribution.js ; ici on ne
// fait que lire et écrire la sauvegarde.

/** Stock gratuit mis à jour à l'heure réelle (et sauvegardé s'il a changé). */
function currentStock(now) {
  const next = refillStock({ stock: save.boosterStock, updatedAt: save.stockUpdatedAt }, now);
  if (next.stock !== save.boosterStock || next.updatedAt !== save.stockUpdatedAt) {
    save.boosterStock = next.stock;
    save.stockUpdatedAt = next.updatedAt;
    persist();
  }
  return next;
}

function freeOpenedCount() {
  return Number.isInteger(save.freeOpened) && save.freeOpened > 0 ? save.freeOpened : 0;
}

/**
 * État des boosters à l'instant `now` :
 * { stock, max, nextInMs, source, signature, untilSignature }
 * - source : booster qui serait ouvert maintenant — "free" (stock), "test"
 *   (stock vide mais mode test) ou null (rien à ouvrir)
 * - signature : true si ce booster-là est un Signature
 * - untilSignature : boosters GRATUITS avant le prochain Signature (1 = le prochain)
 */
export function getBoosterState(now = Date.now(), testMode = false) {
  const stock = currentStock(now);
  const source = stock.stock > 0 ? "free" : testMode ? "test" : null;
  return {
    stock: stock.stock,
    max: BOOSTER.maxStock,
    nextInMs: msUntilNextBooster(stock, now),
    source,
    signature: source !== null && isSignatureNext(freeOpenedCount()),
    untilSignature: freeUntilSignature(freeOpenedCount()),
  };
}

/**
 * Prend le booster à ouvrir dans le stock gratuit (ou le booster « test »).
 * Renvoie { source, signature } ou null s'il n'y a rien à ouvrir.
 */
export function takeBooster(now = Date.now(), testMode = false) {
  const state = getBoosterState(now, testMode);
  if (!state.source) return null;
  if (state.source === "free") {
    // Stock plein : le minuteur était arrêté, il démarre maintenant.
    if (save.boosterStock >= BOOSTER.maxStock) save.stockUpdatedAt = now;
    save.boosterStock -= 1;
  }
  save.freeOpened = freeOpenedCount() + 1;
  persist();
  return { source: state.source, signature: state.signature };
}

// --- Market (simulation locale : pas de serveur) ---

function marketState() {
  if (!save.market || typeof save.market !== "object") save.market = {};
  const m = save.market;
  if (!Array.isArray(m.listings)) m.listings = [];
  if (!m.sold || typeof m.sold !== "object") m.sold = {};
  if (!Number.isInteger(m.nextId)) m.nextId = 1;
  return m;
}

/** Mes ventes en cours : [{ id, colorwayId, rarity, price, listedAt, sellAt }]. */
export function getMyListings() {
  return marketState().listings.map((l) => ({ ...l }));
}

/** Identifiants des offres simulées déjà achetées. */
export function getSoldOffers() {
  return new Set(Object.keys(marketState().sold));
}

/**
 * Met une carte en vente (1 exemplaire, prix fixe). La carte quitte la collection
 * jusqu'à la vente ou jusqu'au retrait. Renvoie la vente créée, ou null si c'est
 * refusé : prix invalide, limite atteinte, carte absente ou verrouillée.
 */
export function listCard(colorwayId, rarity, price, sellAt = null) {
  const m = marketState();
  const key = cardKey(colorwayId, rarity);
  if (!Number.isInteger(price) || price < MARKET.minPrice || price > MARKET.maxPrice) return null;
  if (m.listings.length >= MARKET.maxListings) return null;
  if (!save.cards[key] || save.locked?.[key] === true) return null;
  takeAway([{ colorwayId, rarity }]);
  const listing = { id: `p${m.nextId++}`, colorwayId, rarity, price, listedAt: Date.now(), sellAt };
  m.listings.push(listing);
  persist();
  return listing;
}

/** Retire une vente : la carte revient dans la collection. */
export function cancelListing(id) {
  const m = marketState();
  const i = m.listings.findIndex((l) => l.id === id);
  if (i < 0) return false;
  const [l] = m.listings.splice(i, 1);
  const key = cardKey(l.colorwayId, l.rarity);
  save.cards[key] = (save.cards[key] || 0) + 1;
  persist();
  return true;
}

/**
 * Achète une offre simulée { id, colorwayId, rarity, price }. Refuse (false) si le
 * solde est insuffisant. Carte, offre vendue et pièces sont enregistrées ensemble.
 */
export function buyOffer({ id, colorwayId, rarity, price }) {
  const m = marketState();
  const key = cardKey(colorwayId, rarity);
  if (m.sold[id]) return false;
  const before = save.cards[key];
  save.cards[key] = (before || 0) + 1;
  m.sold[id] = true;
  if (changeCoins(-price)) return true; // enregistre tout en même temps que le solde
  if (before) save.cards[key] = before; else delete save.cards[key];
  delete m.sold[id];
  return false;
}

/**
 * Encaisse les ventes dont l'heure est passée (acheteurs simulés).
 * Renvoie [{ colorwayId, rarity, price }] des cartes vendues.
 */
export function settleSales(now = Date.now()) {
  const m = marketState();
  const done = m.listings.filter((l) => l.sellAt && l.sellAt <= now);
  if (!done.length) return [];
  m.listings = m.listings.filter((l) => !done.includes(l));
  changeCoins(done.reduce((sum, l) => sum + l.price, 0)); // enregistre aussi le retrait des ventes
  return done.map(({ colorwayId, rarity, price }) => ({ colorwayId, rarity, price }));
}

// --- Pièces (monnaie du jeu) ---

const coinListeners = [];

/** Solde actuel (toujours un entier ≥ 0, même si la sauvegarde est abîmée). */
export function getCoins() {
  return Number.isInteger(save.coins) && save.coins > 0 ? save.coins : 0;
}

/** Appelle fn(solde) à chaque changement du solde (sert à l'affichage). */
export function onCoinsChange(fn) {
  coinListeners.push(fn);
}

/**
 * LA fonction centrale pour ajouter (delta > 0) ou retirer (delta < 0) des pièces.
 * Refuse un delta qui n'est pas un entier, et tout retrait qui ferait passer le
 * solde sous 0 : dans ces cas rien ne change et elle renvoie false.
 */
export function changeCoins(delta) {
  if (!Number.isInteger(delta)) return false;
  const next = getCoins() + delta;
  if (next < 0) return false;
  save.coins = next;
  persist();
  for (const fn of coinListeners) fn(next);
  return true;
}

/** Dernier jour (AAAA-MM-JJ, heure de Paris) où le bonus de connexion a été pris. */
export function getLastDailyBonus() {
  return save.lastDailyBonus || null;
}

/** Enregistre le jour du bonus ET verse les pièces en une seule sauvegarde. */
export function claimDailyBonus(day, amount) {
  save.lastDailyBonus = day;
  return changeCoins(amount);
}

// --- Écran Collection ---

/** Liste des cartes possédées : [{ colorwayId, rarity, count, locked }, ...]. */
export function getOwnedCards() {
  return Object.entries(save.cards).map(([key, count]) => {
    const [colorwayId, rarity] = key.split("|");
    return { colorwayId, rarity, count, locked: save.locked?.[key] === true };
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
