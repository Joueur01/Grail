// market.js — Market entre joueurs (écran Acheter / Vendre / Mes ventes).
//
// ⚠️ Le Market est géré par le SERVEUR : prix fixes, limite de 10 ventes, cartes verrouillées
// non vendables, paiement du vendeur à l'achat… Ce fichier affiche les offres reçues
// (catalogue du Marché : nombre d'offres, meilleur prix, dernières ventes ; toutes les offres d'une carte ;
// jamais l'identité d'un vendeur : voir market-browse.js) et envoie les actions (market_list / market_cancel / market_buy / market_ack_sales).
// Aucune règle du Market n'est calculée ici ; les messages d'erreur viennent du serveur.

import { RARITIES, getRarity, matchesSearch } from "./data.js?v=91";
import { MARKET, saleTax, saleNet } from "./economy-config.js?v=91";
import { getOwnedCards, getCoins, getMyListings, refreshState } from "./inventory.js?v=91";
import { getBestOffers, getMarketShop, getMarketCatalog, getMarketCardOffers, marketList, marketCancel, marketBuy, marketAckSales, marketHistory } from "./api.js?v=91";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=91";
import { createMarketBrowse } from "./market-browse.js?v=91";
import { playSound, vibrate } from "./effects.js?v=91";
import { flyCoins, showToast, reportError } from "./wallet.js?v=91";

const CATEGORIES = [
  { id: "haut", name: "Haut" },
  { id: "bas", name: "Bas" },
  { id: "chaussures", name: "Chaussures" },
  { id: "accessoire", name: "Accessoire" },
];

/**
 * Branche l'écran Market. Renvoie { render } pour le redessiner quand la collection change.
 * - onChange : appelé quand la collection ou les pièces ont changé (pour tout redessiner)
 */
export function setupMarket({ catalogue, onChange }) {
  const sheet = document.getElementById("card-sheet");
  const title = document.getElementById("card-sheet-title");
  const body = document.getElementById("card-sheet-body");
  const summary = document.getElementById("market-summary");

  const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const order = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  let offers = []; // meilleures offres reçues du serveur : { id, colorwayId, rarity, price, mine, shop }
  let shop = null; // Boutique Grail (migration 0027) : { name, deadline } ou null (coupée / pas encore activée)
  const shopBanner = document.getElementById("market-shop-banner");
  const shopName = () => shop?.name || "Boutique Grail";

  /** « 5 h 12 » / « 42 min » : décompte jusqu'à la prochaine sélection (échéance donnée par le serveur). */
  function shopCountdown() {
    const min = Math.max(1, Math.ceil((shop.deadline - Date.now()) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
  }

  function renderShopBanner() {
    shopBanner.hidden = !shop;
    if (shop) shopBanner.textContent = `${shop.name} · Nouvelle sélection dans ${shopCountdown()}`;
  }

  /** Demande l'état de la boutique : le SERVEUR renouvelle la sélection s'il est l'heure, puis donne le décompte. */
  async function loadShop() {
    try {
      const s = await getMarketShop();
      shop = s?.enabled ? { name: s.name, deadline: Date.now() + s.next_in_seconds * 1000 } : null;
    } catch {
      shop = null; // migration 0027 pas encore exécutée : pas de boutique, le reste du Market marche comme avant
    }
    renderShopBanner();
  }

  // Le décompte se met à jour chaque minute ; à zéro, on redemande la nouvelle sélection au serveur.
  setInterval(() => {
    if (!shop) return;
    if (Date.now() >= shop.deadline) loadOffers();
    else renderShopBanner();
  }, 30000);

  // --- Offres : UNE seule par carte (la moins chère), choisie par le serveur ------------

  /** Offre affichée pour une carte, ou undefined. */
  const offerFor = (colorwayId, rarity) => offers.find((o) => o.colorwayId === colorwayId && o.rarity === rarity);

  /** Relit les offres du serveur et redessine. */
  async function loadOffers() {
    try {
      await loadShop(); // avant de lire les offres : la sélection du jour est renouvelée par le serveur au besoin
      // Meilleures offres (pour la fiche « Vendre ») + catalogue du Marché (nombre d'offres, dernières ventes).
      // Sans la migration 0028, le catalogue est absent : le Marché retombe sur les seules meilleures offres.
      const [best, catalog] = await Promise.all([getBestOffers(), getMarketCatalog().catch(() => null)]);
      offers = best.map((o) => ({
        id: o.id, colorwayId: o.colorway_id, rarity: o.rarity, price: o.price, mine: o.is_mine, shop: !!o.is_shop,
      }));
      browse.setData(catalog, offers);
      renderBuy();
    } catch (err) {
      reportError(err);
    }
  }

  /** Relit tout (collection, pièces, ventes, offres) après une action, et prévient le reste du jeu. */
  async function reloadAll() {
    try {
      await refreshState({ booster: false });
    } catch (err) {
      reportError(err);
    }
    await loadOffers();
    renderSell();
    renderMine();
    renderSummary();
    loadHistory();
    onChange?.();
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

  // --- 1. Acheter : catalogue (modèle → coloris et rareté → offres), voir market-browse.js ----------

  const browse = createMarketBrowse({
    catalogue,
    root: document.getElementById("market-browse"),
    ui: { coinText, button, bigCard, shopName, confirmBuy, cancelOffer, openSell },
    loadCardOffers: getMarketCardOffers,
  });
  const renderBuy = () => browse.render();

  /** Achète l'offre : le serveur vérifie le solde et le prix affiché (« Le prix a changé »). */
  async function confirmBuy(offer) {
    let bought;
    try {
      bought = await marketBuy(offer.id, offer.price);
    } catch (err) {
      reportError(err);       // « Le prix a changé », « Offre indisponible », « Il te manque N pièces »…
      close();
      await reloadAll();      // on repart d'offres et d'un solde à jour
      return;
    }
    playSound(bought.rarity);
    vibrate([30]);
    await reloadAll();
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    actions.append(button("Super", { primary: true, onClick: close }));
    const card = bigCard(bought.colorway_id, bought.rarity);
    card.classList.add("upgrade-win");
    open("Acheté !", para(`−${bought.price} pièces · la carte est dans ta collection.`, "sheet-subtitle"), card, actions);
  }

  /** Retire une de mes ventes : la carte revient dans la collection. */
  async function cancelOffer(id) {
    try {
      await marketCancel(id);
      showToast("Offre retirée : la carte revient dans ta collection.");
    } catch (err) {
      reportError(err);
    }
    close();
    await reloadAll();
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
    // Offre la moins chère du market pour cette carte (peut être la mienne), ou null s'il n'y en a pas.
    const best = offerFor(colorwayId, rarity);
    const other = best ? best.price : null;
    const advised = other ?? MARKET.referencePrice[rarity]; // prix de référence : affichage seulement
    let price = advised;
    const used = getMyListings().length;
    const full = used >= MARKET.maxListings;

    const info = para(other === null
      ? `Personne ne vend cette carte pour l'instant. Prix conseillé : ${advised} pièces.`
      : `Offre la moins chère du market : ${other} pièces${best.mine ? " (c'est la tienne)" : ""}.`);

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

    const taxNote = para("", "muted sheet-text");
    const limit = para(`Ventes en cours : ${used} / ${MARKET.maxListings}`, "muted sheet-text");
    const confirm = button("", { primary: true });
    confirm.addEventListener("click", () => sell());

    const valid = () => Number.isInteger(price) && price >= MARKET.minPrice && price <= MARKET.maxPrice;
    function clamp(n) { return Math.min(MARKET.maxPrice, Math.max(MARKET.minPrice, n)); }
    function refreshButton() {
      refreshTax();
      confirm.disabled = full || !valid();
      confirm.textContent = full ? `Limite de ${MARKET.maxListings} ventes atteinte`
        : !valid() ? `Prix entre ${MARKET.minPrice} et ${MARKET.maxPrice}`
          : `Mettre en vente · ${price} pièces`;
    }
    function render() {
      input.value = String(price);
      refreshButton();
    }
    // Taxe annoncée (affichage seulement : le serveur applique la vraie règle).
    function refreshTax() {
      taxNote.textContent = valid()
        ? `Taxe de ${MARKET.saleTaxPercent} % : tu recevras ${saleNet(price)} pièces (−${saleTax(price)}).`
        : `Taxe de ${MARKET.saleTaxPercent} % sur chaque vente, payée par le vendeur.`;
    }

    /** Envoie la mise en vente : le serveur vérifie le prix, la limite et le verrou, et retire la carte. */
    async function sell() {
      if (full || !valid() || confirm.disabled && confirm.dataset.busy) return;
      confirm.dataset.busy = "1";
      confirm.disabled = true; // pas de double envoi
      try {
        await marketList(colorwayId, rarity, price);
      } catch (err) {
        reportError(err); // « Limite de 10 ventes atteinte », « Carte verrouillée », « Prix invalide »…
        close();
        await reloadAll();
        return;
      }
      playSound("flip");
      vibrate([20]);
      close();
      showToast(`En vente : ${colorway.piece.name} · ${price} pièces (tu recevras ${saleNet(price)})`);
      await reloadAll();
    }

    open("Vendre", bigCard(colorwayId, rarity), info, row, quick, taxNote, limit, confirm);
    render();
  }

  // --- 3. Mes ventes ----------------------------------------------------------------

  const mineList = document.getElementById("market-mine-list");
  const mineEmpty = document.getElementById("market-mine-empty");

  function renderMine() {
    const listings = getMyListings()
      .map((l) => ({ id: l.id, colorwayId: l.colorway_id, rarity: l.rarity, price: l.price, listedAt: l.created_at }))
      .sort((a, b) => String(b.listedAt).localeCompare(String(a.listedAt)));
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
      remove.addEventListener("click", () => cancelOffer(l.id));
      row.append(tile, info, price, remove);
      return row;
    }));
    mineEmpty.hidden = listings.length > 0;
  }

  // --- 4. Historique : mes achats et mes ventes (lus sur le serveur) -----------------

  const historyList = document.getElementById("market-history-list");
  const historyEmpty = document.getElementById("market-history-empty");
  const historyTotals = document.getElementById("market-history-totals");
  const historyMore = document.getElementById("market-history-more");
  let history = []; // lignes reçues, du plus récent au plus ancien

  const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function historyRow(t) {
    const colorway = catalogue.colorwayById.get(t.colorway_id);
    if (!colorway) return null;
    const bought = t.kind === "market_buy";
    const row = document.createElement("div");
    row.className = "market-row";
    row.dataset.rarity = t.rarity;
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
    sub.className = "market-row-sub history-sub";
    sub.textContent = `${bought ? "Acheté" : "Vendu"}${t.shop ? ` · ${shopName()}` : ""} · ${colorway.name} · ${getRarity(t.rarity).name} · ${dateFmt.format(new Date(t.created_at))}`;
    info.append(name, sub);
    const amount = coinText(t.coins);
    amount.classList.add("market-row-price", bought ? "history-out" : "history-in");
    amount.prepend(document.createTextNode(bought ? "−" : "+"));
    row.append(tile, info, amount);
    return row;
  }

  function renderHistory() {
    historyList.replaceChildren(...history.map(historyRow).filter(Boolean));
    historyEmpty.hidden = history.length > 0;
  }

  /** Relit l'historique (les plus récentes lignes) ; « Voir plus » ajoute les plus anciennes. */
  async function loadHistory({ more = false } = {}) {
    try {
      const data = await marketHistory(more && history.length ? history[history.length - 1].id : null);
      history = more ? history.concat(data.items) : data.items;
      historyTotals.textContent = `Dépensé : ${data.total_spent.toLocaleString("fr-FR")} pièces · Gagné : ${data.total_earned.toLocaleString("fr-FR")} pièces`;
      historyTotals.hidden = false;
      historyMore.hidden = !data.has_more;
      renderHistory();
    } catch (err) {
      reportError(err);
    }
  }

  historyMore.addEventListener("click", () => loadHistory({ more: true }));
  document.querySelector('.view-tab[data-view="market-history"]').addEventListener("click", () => loadHistory());

  // --- Ensemble ---------------------------------------------------------------------

  function renderSummary() {
    const n = getMyListings().length;
    summary.textContent = `Ventes en cours : ${n} / ${MARKET.maxListings}`;
  }

  /** Demande au serveur les ventes terminées que je n'ai pas encore vues : notification « Vendu ! ». */
  async function ackSales() {
    let sold;
    try {
      sold = await marketAckSales();
    } catch (err) {
      console.warn("Market :", err);
      return;
    }
    if (!sold.length) return;
    // Pièces réellement reçues = prix − taxe (le serveur les a déjà versées).
    const total = sold.reduce((sum, x) => sum + (x.received ?? x.price), 0);
    const first = catalogue.colorwayById.get(sold[0].colorway_id);
    // Les pièces sont déjà versées par le serveur (au moment de l'achat) : on relit le solde.
    await reloadAll();
    showToast(sold.length === 1
      ? `Vendu : ${first.piece.name} · +${total} pièces`
      : `${sold.length} cartes vendues · +${total} pièces`);
    playSound("coin"); // pas de vibration ici : la vente peut arriver sans que le joueur touche l'écran
    flyCoins(summary, total);
  }

  /** À l'arrivée sur l'écran Market (et régulièrement) : offres à jour + ventes terminées. */
  async function sync() {
    await loadOffers();
    await ackSales();
  }

  for (const el of [sellSearch, sellRarity, sellType]) el.addEventListener(el === sellSearch ? "input" : "change", renderSell);

  renderBuy();
  renderSell();
  renderMine();
  renderSummary();
  sync();
  // Les offres des autres joueurs changent : on les relit quand on revient sur l'écran Market,
  // au retour sur l'onglet du navigateur et toutes les 30 secondes tant qu'il est affiché.
  window.addEventListener("hashchange", () => { if (location.hash === "#market") sync(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden && location.hash === "#market") sync(); }, 30000);

  /** Redessine les vues quand la collection a changé ailleurs (booster, défausse…). */
  return { render: () => { renderBuy(); renderSell(); renderMine(); renderSummary(); } };
}
