// market.js — Market entre joueurs (SIMULATION locale : il n'y a pas encore de serveur).
//
// Règles :
//   - prix FIXES, pas d'enchères ;
//   - pour une même carte (coloris + rareté), on ne montre que l'offre la MOINS CHÈRE :
//     le nombre d'offres n'est jamais affiché ;
//   - un joueur peut avoir 10 ventes en même temps (MARKET.maxListings) ;
//   - une carte verrouillée ne peut pas être vendue.
// En attendant le serveur, les offres des « autres joueurs » sont générées par le jeu
// (graine fixe) et les acheteurs de tes ventes sont simulés. Les valeurs sont dans
// economy-config.js (MARKET).

import { RARITIES, getRarity, matchesSearch } from "./data.js?v=34";
import { MARKET } from "./economy-config.js?v=34";
import { getOwnedCards, getCoins, getMyListings, getSoldOffers, listCard, cancelListing, buyOffer, settleSales, cardKey } from "./inventory.js?v=34";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=34";
import { playSound, vibrate } from "./effects.js?v=34";
import { flyCoins, showToast } from "./wallet.js?v=34";

const CATEGORIES = [
  { id: "haut", name: "Haut" },
  { id: "bas", name: "Bas" },
  { id: "chaussures", name: "Chaussures" },
  { id: "accessoire", name: "Accessoire" },
];

// --- Offres simulées des autres joueurs -------------------------------------------

/** Petit générateur aléatoire à graine : mêmes offres à chaque lancement. */
function seededRandom(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Toutes les offres simulées : [{ id, colorwayId, rarity, price }]. */
function mockOffers(catalogue) {
  const rng = seededRandom(MARKET.mockSeed);
  const [lo, hi] = MARKET.mockPriceSpread;
  const offers = [];
  for (const colorway of catalogue.colorways) {
    for (const r of RARITIES) {
      if (rng() >= (MARKET.mockCoverage[r.id] || 0)) continue;
      const n = 1 + Math.floor(rng() * MARKET.mockOffersMax);
      for (let i = 0; i < n; i++) {
        const price = Math.max(MARKET.minPrice, Math.round(MARKET.referencePrice[r.id] * (lo + rng() * (hi - lo))));
        offers.push({ id: `m:${cardKey(colorway.id, r.id)}:${i}`, colorwayId: colorway.id, rarity: r.id, price, mine: false });
      }
    }
  }
  return offers;
}

/** Chance (0 → 1) que ta vente soit « achetée », selon ton prix par rapport au prix de référence. */
function saleChance(rarity, price) {
  const ratio = price / MARKET.referencePrice[rarity];
  return MARKET.simSaleChance.find(([max]) => ratio <= max)[1];
}

export function setupMarket({ catalogue, onChange }) {
  const sheet = document.getElementById("card-sheet");
  const title = document.getElementById("card-sheet-title");
  const body = document.getElementById("card-sheet-body");
  const summary = document.getElementById("market-summary");

  const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const order = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  const mocks = mockOffers(catalogue);

  // --- Offres visibles : UNE seule par carte, la moins chère ---------------------

  /** Map clé de carte → offre la moins chère { id, colorwayId, rarity, price, mine }. */
  function bestOffers() {
    const sold = getSoldOffers();
    const best = new Map();
    const consider = (offer) => {
      const key = cardKey(offer.colorwayId, offer.rarity);
      const current = best.get(key);
      // À prix égal, une offre d'un autre joueur passe avant la tienne (tu peux l'acheter).
      if (!current || offer.price < current.price || (offer.price === current.price && current.mine && !offer.mine)) best.set(key, offer);
    };
    for (const o of mocks) if (!sold.has(o.id)) consider(o);
    for (const l of getMyListings()) consider({ id: l.id, colorwayId: l.colorwayId, rarity: l.rarity, price: l.price, mine: true });
    return best;
  }

  /** Meilleur prix pour une carte, sans compter mes propres ventes (null s'il n'y en a pas). */
  function bestOtherPrice(colorwayId, rarity) {
    const sold = getSoldOffers();
    const prices = mocks.filter((o) => o.colorwayId === colorwayId && o.rarity === rarity && !sold.has(o.id)).map((o) => o.price);
    return prices.length ? Math.min(...prices) : null;
  }

  // --- Petits éléments d'interface -----------------------------------------------

  function coinText(amount) {
    const el = document.createElement("span");
    el.className = "coin-text";
    const dot = document.createElement("span");
    dot.className = "coin-dot";
    el.append(dot, document.createTextNode(amount.toLocaleString("fr-FR")));
    return el;
  }

  function para(text, className = "muted sheet-text") {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    return p;
  }

  function button(text, { primary = false, disabled = false, onClick } = {}) {
    const b = document.createElement("button");
    b.className = primary ? "btn btn-primary" : "btn";
    b.textContent = text;
    b.disabled = disabled;
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function bigCard(colorwayId, rarity) {
    const colorway = catalogue.colorwayById.get(colorwayId);
    const el = createCardShell(colorway, rarity);
    el.classList.add("owned", "sheet-card");
    el.append(createCardFace(colorway, rarity));
    return el;
  }

  function open(heading, ...nodes) {
    title.textContent = heading;
    body.replaceChildren(...nodes);
    sheet.hidden = false;
  }

  function close() { sheet.hidden = true; }

  /** Carte d'une grille du market (avec une pastille facultative : prix, ×N…). */
  function gridCard(colorwayId, rarity, onTap, label) {
    const colorway = catalogue.colorwayById.get(colorwayId);
    const el = createCardShell(colorway, rarity);
    el.classList.add("owned", "tappable");
    el.append(createCardFace(colorway, rarity));
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${colorway.piece.name}, ${colorway.name}, ${getRarity(rarity).name} : ${label}`);
    if (onTap) el.addEventListener("click", onTap);
    return el;
  }

  // --- 1. Acheter -------------------------------------------------------------------

  const buyGrid = document.getElementById("market-grid");
  const buyEmpty = document.getElementById("market-empty");
  const buySearch = document.getElementById("search-market");
  const buyRarity = document.getElementById("market-rarity");
  const buyType = document.getElementById("market-type");
  const buySort = document.getElementById("market-sort");

  for (const [select, items] of [[buyRarity, [...RARITIES].reverse()], [buyType, CATEGORIES]]) {
    for (const item of items) select.append(new Option(item.name, item.id));
  }

  function renderBuy() {
    const sorters = {
      price: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      rarity: (a, b) => (rank.get(b.rarity) - rank.get(a.rarity)) || (a.price - b.price),
      catalogue: (a, b) => order.get(a.colorwayId) - order.get(b.colorwayId),
    };
    const offers = [...bestOffers().values()]
      .filter((o) => {
        const cw = catalogue.colorwayById.get(o.colorwayId);
        return cw
          && matchesSearch(buySearch.value, [cw.piece.name, cw.name, cw.brand.name, getRarity(o.rarity).name])
          && (!buyRarity.value || o.rarity === buyRarity.value)
          && (!buyType.value || cw.piece.category === buyType.value);
      })
      .sort((a, b) => (sorters[buySort.value] || sorters.price)(a, b) || (order.get(a.colorwayId) - order.get(b.colorwayId)));

    buyGrid.replaceChildren(...offers.map((o) => {
      const el = gridCard(o.colorwayId, o.rarity, () => openOffer(o), `${o.price} pièces${o.mine ? ", ton offre" : ""}`);
      const badge = document.createElement("span");
      badge.className = o.mine ? "price-badge mine" : "price-badge";
      badge.append(coinText(o.price));
      el.append(badge);
      if (o.mine) {
        const mine = document.createElement("span");
        mine.className = "mine-badge";
        mine.textContent = "Ton offre";
        el.append(mine);
      }
      return el;
    }));
    buyEmpty.hidden = offers.length > 0;
  }

  /** Fiche d'une offre : acheter, ou retirer si c'est la mienne. */
  function openOffer(offer) {
    const colorway = catalogue.colorwayById.get(offer.colorwayId);
    const owned = getOwnedCards().find((c) => c.colorwayId === offer.colorwayId && c.rarity === offer.rarity);
    const price = document.createElement("p");
    price.className = "market-price";
    price.append(coinText(offer.price));
    const actions = document.createElement("div");
    actions.className = "sheet-actions";

    if (offer.mine) {
      actions.append(
        button("Retirer mon offre", { primary: true, onClick: () => { cancelListing(offer.id); refresh(); close(); showToast("Offre retirée : la carte revient dans ta collection."); } }),
      );
      open(colorway.piece.name, bigCard(offer.colorwayId, offer.rarity), price, para("C'est ton offre : c'est la moins chère du market pour cette carte."), actions);
      return;
    }
    const missing = offer.price - getCoins();
    actions.append(button(missing > 0 ? `Il te manque ${missing} pièces` : `Acheter · ${offer.price} pièces`, {
      primary: true,
      disabled: missing > 0,
      onClick: () => confirmBuy(offer),
    }));
    open(colorway.piece.name, bigCard(offer.colorwayId, offer.rarity), price,
      para(`Ton solde : ${getCoins().toLocaleString("fr-FR")} pièces${owned ? ` · tu en as déjà ${owned.count}` : " · nouvelle carte pour toi"}`),
      actions);
  }

  function confirmBuy(offer) {
    if (!buyOffer(offer)) { openOffer(offer); return; } // solde insuffisant ou offre déjà partie
    playSound(offer.rarity);
    vibrate([30]);
    refresh();
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    actions.append(button("Super", { primary: true, onClick: close }));
    const card = bigCard(offer.colorwayId, offer.rarity);
    card.classList.add("upgrade-win");
    open("Acheté !", para(`−${offer.price} pièces · la carte est dans ta collection.`, "sheet-subtitle"), card, actions);
  }

  // --- 2. Vendre --------------------------------------------------------------------

  const sellGrid = document.getElementById("sell-grid");
  const sellEmpty = document.getElementById("sell-empty");
  const sellSearch = document.getElementById("search-sell");
  const sellRarity = document.getElementById("sell-rarity");
  const sellType = document.getElementById("sell-type");
  for (const [select, items] of [[sellRarity, [...RARITIES].reverse()], [sellType, CATEGORIES]]) {
    for (const item of items) select.append(new Option(item.name, item.id));
  }

  function renderSell() {
    const cards = getOwnedCards()
      .filter((c) => {
        const cw = catalogue.colorwayById.get(c.colorwayId);
        return cw
          && matchesSearch(sellSearch.value, [cw.piece.name, cw.name, cw.brand.name, getRarity(c.rarity).name])
          && (!sellRarity.value || c.rarity === sellRarity.value)
          && (!sellType.value || cw.piece.category === sellType.value);
      })
      .sort((a, b) => (rank.get(b.rarity) - rank.get(a.rarity)) || (order.get(a.colorwayId) - order.get(b.colorwayId)));

    sellGrid.replaceChildren(...cards.map((c) => {
      const el = gridCard(c.colorwayId, c.rarity, c.locked ? null : () => openSell(c), c.locked ? "verrouillée, impossible à vendre" : "mettre en vente");
      if (c.locked) {
        el.classList.add("used");
        el.append(createLockBadge());
      }
      if (c.count > 1) {
        const badge = document.createElement("span");
        badge.className = "count-badge";
        badge.textContent = `×${c.count}`;
        el.append(badge);
      }
      return el;
    }));
    sellEmpty.hidden = cards.length > 0;
    sellEmpty.textContent = getOwnedCards().length === 0
      ? "Tu n'as encore aucune carte à vendre. Ouvre un booster !"
      : "Aucune carte ne correspond à ta recherche.";
  }

  /** Fiche de mise en vente : prix fixe, meilleure offre actuelle, limite. */
  function openSell(card) {
    const { colorwayId, rarity } = card;
    const colorway = catalogue.colorwayById.get(colorwayId);
    const other = bestOtherPrice(colorwayId, rarity);
    const advised = other ?? MARKET.referencePrice[rarity];
    let price = advised;
    const used = getMyListings().length;
    const full = used >= MARKET.maxListings;

    const info = para(other === null
      ? `Personne ne vend cette carte pour l'instant. Prix conseillé : ${advised} pièces.`
      : `Offre la moins chère du market : ${other} pièces.`);

    // Prix : − / champ / +
    const input = document.createElement("input");
    input.className = "price-input";
    input.type = "number";
    input.inputMode = "numeric";
    input.min = String(MARKET.minPrice);
    input.max = String(MARKET.maxPrice);
    input.setAttribute("aria-label", "Prix en pièces");
    const step = () => Math.max(1, Math.round(price * 0.1));
    const minus = button("−", { onClick: () => { price = clamp(price - step()); render(); } });
    const plus = button("+", { onClick: () => { price = clamp(price + step()); render(); } });
    minus.classList.add("price-step");
    plus.classList.add("price-step");
    minus.setAttribute("aria-label", "Baisser le prix");
    plus.setAttribute("aria-label", "Monter le prix");
    const row = document.createElement("div");
    row.className = "price-row";
    row.append(minus, input, plus);
    input.addEventListener("input", () => {
      const n = parseInt(input.value, 10);
      price = Number.isInteger(n) ? n : 0;
      refreshButton();
    });

    const quick = document.createElement("div");
    quick.className = "price-quick";
    quick.append(button(`Prix conseillé · ${advised}`, { onClick: () => { price = advised; render(); } }));
    if (other !== null && other > MARKET.minPrice) {
      quick.append(button(`Moins cher · ${other - 1}`, { onClick: () => { price = other - 1; render(); } }));
    }

    const limit = para(`Ventes en cours : ${used} / ${MARKET.maxListings}`, "muted sheet-text");
    const confirm = button("", { primary: true });
    confirm.addEventListener("click", () => sell());

    const valid = () => Number.isInteger(price) && price >= MARKET.minPrice && price <= MARKET.maxPrice;
    function clamp(n) { return Math.min(MARKET.maxPrice, Math.max(MARKET.minPrice, n)); }
    function refreshButton() {
      confirm.disabled = full || !valid();
      confirm.textContent = full ? `Limite de ${MARKET.maxListings} ventes atteinte`
        : !valid() ? `Prix entre ${MARKET.minPrice} et ${MARKET.maxPrice}`
          : `Mettre en vente · ${price} pièces`;
    }
    function render() {
      input.value = String(price);
      refreshButton();
    }

    function sell() {
      if (full || !valid()) return;
      // Simulation : cette vente sera-t-elle « achetée » ? Et quand ? (décidé une fois pour toutes ici)
      const [min, max] = MARKET.simSaleDelayMs;
      const sellAt = Math.random() < saleChance(rarity, price) ? Date.now() + min + Math.random() * (max - min) : null;
      if (!listCard(colorwayId, rarity, price, sellAt)) { close(); refresh(); return; }
      playSound("flip");
      vibrate([20]);
      close();
      refresh();
      showToast(`En vente : ${colorway.piece.name} · ${price} pièces`);
    }

    open("Vendre", bigCard(colorwayId, rarity), info, row, quick, limit, confirm);
    render();
  }

  // --- 3. Mes ventes ----------------------------------------------------------------

  const mineList = document.getElementById("market-mine-list");
  const mineEmpty = document.getElementById("market-mine-empty");

  function renderMine() {
    const listings = getMyListings().sort((a, b) => b.listedAt - a.listedAt);
    mineList.replaceChildren(...listings.map((l) => {
      const colorway = catalogue.colorwayById.get(l.colorwayId);
      const row = document.createElement("div");
      row.className = "market-row";
      row.dataset.rarity = l.rarity;
      const tile = document.createElement("span");
      tile.className = "atelier-chip-tile";
      const img = document.createElement("img");
      img.className = "pixel";
      img.src = colorway.sprite;
      img.width = 32;
      img.height = 32;
      img.alt = "";
      tile.append(img);
      const info = document.createElement("div");
      info.className = "market-row-info";
      const name = document.createElement("span");
      name.className = "market-row-name";
      name.textContent = colorway.piece.name;
      const sub = document.createElement("span");
      sub.className = "market-row-sub";
      sub.textContent = `${colorway.name} · ${getRarity(l.rarity).name}`;
      info.append(name, sub);
      const price = coinText(l.price);
      price.classList.add("market-row-price");
      const remove = document.createElement("button");
      remove.className = "market-row-remove";
      remove.textContent = "Retirer";
      remove.setAttribute("aria-label", `Retirer l'offre : ${colorway.piece.name}`);
      remove.addEventListener("click", () => { cancelListing(l.id); refresh(); });
      row.append(tile, info, price, remove);
      return row;
    }));
    mineEmpty.hidden = listings.length > 0;
  }

  // --- Ensemble ---------------------------------------------------------------------

  function renderSummary() {
    const n = getMyListings().length;
    summary.textContent = `Ventes en cours : ${n} / ${MARKET.maxListings}`;
  }

  /** Redessine les trois vues et prévient le reste du jeu (collection, Atelier, tenue). */
  function refresh() {
    renderBuy();
    renderSell();
    renderMine();
    renderSummary();
    onChange?.();
  }

  /** Encaisse les ventes simulées arrivées à échéance. */
  function settle() {
    const sold = settleSales(Date.now());
    if (!sold.length) return;
    const total = sold.reduce((sum, s) => sum + s.price, 0);
    refresh();
    const first = catalogue.colorwayById.get(sold[0].colorwayId);
    showToast(sold.length === 1
      ? `Vendu : ${first.piece.name} · +${total} pièces`
      : `${sold.length} cartes vendues · +${total} pièces`);
    playSound("coin"); // pas de vibration ici : la vente peut arriver sans que le joueur touche l'écran
    flyCoins(summary, total);
  }

  for (const el of [buySearch, buyRarity, buyType, buySort]) el.addEventListener(el === buySearch ? "input" : "change", renderBuy);
  for (const el of [sellSearch, sellRarity, sellType]) el.addEventListener(el === sellSearch ? "input" : "change", renderSell);

  refresh();
  settle();
  setInterval(settle, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) settle(); });

  /** Redessine les vues quand la collection a changé ailleurs (booster, défausse…). */
  return { render: () => { renderBuy(); renderSell(); renderMine(); renderSummary(); } };
}
