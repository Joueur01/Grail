// market-browse.js — Marché « Bazaar » : on navigue dans le catalogue au lieu d'une liste d'offres.
//
//   Entrée   : grille des 48 MODÈLES (nombre d'offres sur chaque tuile) OU liste de TOUTES les cartes, avec une
//              recherche et des filtres à plat (marque, rareté, emplacement, disponibilité, « que je n'ai pas »).
//   Modèle   : les coloris en pastilles ; une fois un coloris choisi, ses 4 raretés côte à côte (meilleur prix,
//              nombre d'offres, « aucune offre »).
//   Carte    : toutes les offres (Boutique Grail ou joueur), meilleur prix, dernière vente, achat direct,
//              mise en vente si je la possède.
// Au plus 3 touchers de l'entrée à l'achat : modèle → rareté (un coloris est déjà choisi) → « Acheter ».
//
// ⚠️ Rien n'est calculé ici : les nombres d'offres, les prix et les ventes viennent du SERVEUR
// (market_catalog, market_card_offers). Ce fichier trie, filtre et affiche. L'identité des vendeurs n'est
// jamais connue : seulement « Boutique Grail », « joueur » ou « ton offre ».
// La navigation passe par l'ancre de l'URL (#market/m/<modèle>/<coloris>, #market/c/<coloris>/<rareté>) :
// le bouton « retour » du téléphone fonctionne.

import { RARITIES, getRarity, matchesSearch } from "./data.js?v=104";
import { SLOTS } from "./avatar.js?v=104";
import { getOwnedCards, getCoins } from "./inventory.js?v=104";

const PAGE = 60; // lignes ajoutées à chaque « Voir plus » (vue « Cartes »)
const EMPTY = Object.freeze({ offers: 0, best: null, mine: 0, shop: false, last: null, lastAt: null, recent: 0 });
const SORTS = [
  { id: "", name: "Marque" },
  { id: "price", name: "Prix ↑" },
  { id: "priceDesc", name: "Prix ↓" },
  { id: "offers", name: "Nombre d'offres" },
  { id: "rarity", name: "Rareté" },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param catalogue  le catalogue du jeu (data.js)
 * @param root       l'élément #market-browse
 * @param ui         aides de market.js : coinText, button, bigCard, shopName(), confirmBuy(offre), cancelOffer(id), openSell(carte)
 * @param loadCardOffers  (coloris, rareté) → { total, offers: [{ id, price, shop, mine }] } (appel serveur)
 */
export function createMarketBrowse({ catalogue, root, ui, loadCardOffers }) {
  const { coinText, button, bigCard, shopName, confirmBuy, cancelOffer, openSell } = ui;
  const key = (cw, rarity) => `${cw}|${rarity}`;
  const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const order = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  const pieceOrder = new Map(catalogue.pieces.map((p, i) => [p.id, i]));
  // Toutes les cartes du jeu : chaque coloris dans chaque rareté, même sans offre.
  const ALL = catalogue.colorways.flatMap((cw) => RARITIES.map((r) => ({ cw, rarity: r.id })));

  let stats = new Map();        // « coloris|rareté » → { offers, best, mine, shop, last, lastAt, recent }
  let bestById = new Map();     // repli (migration 0028 pas faite) : meilleure offre de chaque carte
  let ready = false;            // faux tant que le serveur n'a pas répondu (sinon toutes les cartes diraient « aucune offre »)
  let degraded = false;         // vrai tant que le serveur ne sait pas compter les offres
  let recentDays = 7;
  const filters = { q: "", brand: "", rarity: "", slot: "", avail: "", notOwned: false, sort: "" };
  let mode = "models";          // « models » : grille des modèles · « cards » : toutes les cartes
  let filtersOpen = false;
  let shown = PAGE;
  let cardFrom = "model";       // d'où on arrive sur une carte, pour le bouton « retour »
  let entryScroll = 0;
  let lastView = "entry";
  let token = 0;                // annule les réponses serveur arrivées trop tard

  const statOf = (cw, rarity) => stats.get(key(cw, rarity)) || EMPTY;
  const scroller = () => document.querySelector("main"); // c'est <main> qui défile, pas la fenêtre

  // ------------------------------------------------------------------ données

  /** Reçoit le catalogue du serveur (ou null si la fonction n'existe pas encore) et les meilleures offres. */
  function setData(catalog, bestOffers) {
    ready = true;
    stats = new Map();
    bestById = new Map();
    for (const o of bestOffers) bestById.set(key(o.colorwayId, o.rarity), o);
    if (catalog?.cards) {
      degraded = false;
      recentDays = catalog.recent_days ?? 7;
      for (const x of catalog.cards) {
        stats.set(key(x.c, x.r), { offers: x.offers, best: x.best, mine: x.mine, shop: x.shop, last: x.last, lastAt: x.last_at, recent: x.recent });
      }
    } else {
      degraded = true; // on ne sait que la meilleure offre : pas de nombre d'offres fiable
      for (const o of bestOffers) stats.set(key(o.colorwayId, o.rarity), { ...EMPTY, offers: 1, best: o.price, mine: o.mine ? 1 : 0, shop: o.shop });
    }
  }

  const owned = () => new Map(getOwnedCards().map((c) => [key(c.colorwayId, c.rarity), c]));
  const offersText = (st) => st.offers === 0 ? "aucune offre" : degraded ? "offre disponible" : `${st.offers} offre${st.offers > 1 ? "s" : ""}`;

  // ------------------------------------------------------------------ navigation

  function route() {
    const p = location.hash.replace(/^#/, "").split("/"); // market / m / <modèle> / <coloris>  ou  market / c / <coloris> / <rareté>
    if (p[0] !== "market") return { view: "entry" };
    if (p[1] === "m" && catalogue.pieces.some((x) => x.id === p[2])) return { view: "model", pieceId: p[2], cw: p[3] };
    if (p[1] === "c" && catalogue.colorwayById.has(p[2]) && RARITIES.some((r) => r.id === p[3])) return { view: "card", cw: p[2], rarity: p[3] };
    return { view: "entry" };
  }

  function go(hash) {
    if (lastView === "entry") entryScroll = scroller().scrollTop;
    location.hash = hash;
  }

  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#market")) render(); });

  // ------------------------------------------------------------------ éléments permanents de l'entrée

  const head = el("div", "mb-head");
  const searchBar = el("div", "filters mb-search-bar");
  const search = el("input", "search");
  search.type = "search";
  search.placeholder = "Rechercher une carte ou un modèle";
  search.setAttribute("aria-label", "Rechercher dans le Marché");
  search.autocomplete = "off";
  search.enterKeyHint = "search";
  searchBar.append(search);

  const toolbar = el("div", "mb-toolbar");
  const modeSwitch = el("div", "view-switch mb-modes");
  modeSwitch.setAttribute("role", "tablist");
  const modeTabs = {};
  for (const [id, label] of [["models", "Modèles"], ["cards", "Cartes"]]) {
    const b = el("button", "view-tab", label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => { mode = id; shown = PAGE; renderEntry(); });
    modeTabs[id] = b;
    modeSwitch.append(b);
  }
  const filterToggle = el("button", "select-toggle mb-filter-toggle");
  filterToggle.type = "button";
  filterToggle.addEventListener("click", () => { filtersOpen = !filtersOpen; renderPanel(); });
  toolbar.append(modeSwitch, filterToggle);

  const panel = el("div", "filters mb-panel");
  const select = (label, items) => {
    const s = el("select");
    s.setAttribute("aria-label", label);
    s.append(new Option(label, ""));
    for (const it of items) s.append(new Option(it.name, it.id));
    return s;
  };
  const brandSel = select("Marque", catalogue.brands.map((b) => ({ id: b.id, name: b.name })));
  const raritySel = select("Rareté", [...RARITIES].reverse());
  const slotSel = select("Emplacement", SLOTS);
  const availSel = select("Disponibilité", [{ id: "yes", name: "Avec offres" }, { id: "no", name: "Sans offre" }]);
  const sortSel = el("select");
  sortSel.setAttribute("aria-label", "Trier");
  for (const s of SORTS) sortSel.append(new Option(s.id ? `Tri : ${s.name}` : "Tri : Marque", s.id));
  const notOwnedBtn = el("button", "select-toggle", "Que je n'ai pas");
  notOwnedBtn.type = "button";
  notOwnedBtn.setAttribute("aria-pressed", "false");
  const resetBtn = el("button", "btn mb-reset", "Réinitialiser les filtres");
  resetBtn.type = "button";
  panel.append(brandSel, raritySel, slotSel, availSel, sortSel, notOwnedBtn, resetBtn);

  const content = el("div", "mb-content");
  root.append(head, content);
  head.append(searchBar, toolbar, panel);

  const activeCount = () => [filters.brand, filters.rarity, filters.slot, filters.avail, filters.notOwned, filters.sort].filter(Boolean).length;

  /** Chercher une carte précise ou filtrer par rareté / disponibilité / « que je n'ai pas » : on passe à la liste des cartes. */
  const needsCards = () => filters.q.trim() || filters.rarity || filters.avail || filters.notOwned;

  function onFilter() {
    filters.q = search.value;
    filters.brand = brandSel.value;
    filters.rarity = raritySel.value;
    filters.slot = slotSel.value;
    filters.avail = availSel.value;
    filters.sort = sortSel.value;
    if (mode === "models" && needsCards()) mode = "cards";
    shown = PAGE;
    renderEntry();
  }
  search.addEventListener("input", onFilter);
  for (const s of [brandSel, raritySel, slotSel, availSel, sortSel]) s.addEventListener("change", onFilter);
  notOwnedBtn.addEventListener("click", () => {
    filters.notOwned = !filters.notOwned;
    notOwnedBtn.setAttribute("aria-pressed", String(filters.notOwned));
    onFilter();
  });
  resetBtn.addEventListener("click", () => {
    search.value = "";
    for (const s of [brandSel, raritySel, slotSel, availSel, sortSel]) s.value = "";
    filters.notOwned = false;
    notOwnedBtn.setAttribute("aria-pressed", "false");
    onFilter();
  });

  function renderPanel() {
    panel.hidden = !filtersOpen;
    const n = activeCount();
    filterToggle.textContent = n ? `Filtres · ${n}` : "Filtres";
    filterToggle.setAttribute("aria-expanded", String(filtersOpen));
    filterToggle.setAttribute("aria-pressed", String(n > 0));
    resetBtn.hidden = n === 0 && !search.value;
  }

  // ------------------------------------------------------------------ filtres et tris

  function matches({ cw, rarity }, ownedMap) {
    const st = statOf(cw.id, rarity);
    return matchesSearch(filters.q, [cw.piece.name, cw.name, cw.brand.name, getRarity(rarity).name])
      && (!filters.brand || cw.brand.id === filters.brand)
      && (!filters.rarity || rarity === filters.rarity)
      && (!filters.slot || cw.piece.slot === filters.slot)
      && (filters.avail !== "yes" || st.offers > 0)
      && (filters.avail !== "no" || st.offers === 0)
      && (!filters.notOwned || !ownedMap.has(key(cw.id, rarity)));
  }

  /** Comparateur de cartes (vue « Cartes »). Les cartes sans offre passent après celles qui en ont. */
  function cardSorter() {
    const byOrder = (a, b) => (order.get(a.cw.id) - order.get(b.cw.id)) || (rank.get(a.rarity) - rank.get(b.rarity));
    const num = (v, desc) => (v === null ? Infinity : desc ? -v : v);
    switch (filters.sort) {
      case "price": return (a, b) => (num(statOf(a.cw.id, a.rarity).best) - num(statOf(b.cw.id, b.rarity).best)) || byOrder(a, b);
      case "priceDesc": return (a, b) => (num(statOf(a.cw.id, a.rarity).best, true) - num(statOf(b.cw.id, b.rarity).best, true)) || byOrder(a, b);
      case "offers": return (a, b) => (statOf(b.cw.id, b.rarity).offers - statOf(a.cw.id, a.rarity).offers) || byOrder(a, b);
      case "rarity": return (a, b) => (rank.get(b.rarity) - rank.get(a.rarity)) || byOrder(a, b);
      default: return byOrder;
    }
  }

  /** Une ligne par modèle (parmi les cartes qui passent les filtres) : total d'offres, meilleur et plus haut prix. */
  function modelRows(cards) {
    const by = new Map();
    for (const { cw, rarity } of cards) {
      const p = cw.piece;
      let m = by.get(p.id);
      if (!m) by.set(p.id, m = { piece: p, brand: cw.brand, offers: 0, best: null, top: null, maxRank: -1 });
      const st = statOf(cw.id, rarity);
      m.offers += st.offers;
      if (st.best !== null) {
        m.best = m.best === null ? st.best : Math.min(m.best, st.best);
        m.top = m.top === null ? st.best : Math.max(m.top, st.best);
        m.maxRank = Math.max(m.maxRank, rank.get(rarity));
      }
    }
    const rows = [...by.values()];
    const num = (v, desc) => (v === null ? Infinity : desc ? -v : v);
    const byOrder = (a, b) => pieceOrder.get(a.piece.id) - pieceOrder.get(b.piece.id);
    const sorters = {
      price: (a, b) => (num(a.best) - num(b.best)) || byOrder(a, b),
      priceDesc: (a, b) => (num(a.top, true) - num(b.top, true)) || byOrder(a, b),
      offers: (a, b) => (b.offers - a.offers) || byOrder(a, b),
      rarity: (a, b) => (b.maxRank - a.maxRank) || byOrder(a, b),
    };
    return rows.sort(sorters[filters.sort] || byOrder);
  }

  // ------------------------------------------------------------------ vue 1 : entrée

  function spriteTile(sprite, className = "mb-sprite") {
    const tile = el("span", className);
    const img = el("img", "pixel");
    img.src = sprite;
    img.width = 32;
    img.height = 32;
    img.alt = "";
    tile.append(img);
    return tile;
  }

  function availability(offers, best, extraClass = "") {
    const line = el("span", `mb-avail ${extraClass}`.trim());
    if (offers === 0 && best === null) { line.classList.add("none"); line.textContent = "aucune offre"; return line; }
    line.append(document.createTextNode(`${degraded ? "" : `${offers} offre${offers > 1 ? "s" : ""} · `}dès `), coinText(best));
    return line;
  }

  function modelTile(m) {
    const tile = el("button", "mb-tile");
    tile.type = "button";
    tile.dataset.piece = m.piece.id;
    tile.append(spriteTile(m.piece.colorways[0].sprite, "mb-tile-art"));
    const brand = el("span", "mb-tile-brand", m.brand.name);
    brand.style.color = `var(--brand-${m.brand.id}, var(--muted))`;
    tile.append(brand, el("span", "mb-tile-name", m.piece.name), availability(m.offers, m.best));
    tile.setAttribute("aria-label", `${m.piece.name}, ${m.brand.name} : ${m.offers === 0 ? "aucune offre" : degraded ? "offres disponibles" : `${m.offers} offre${m.offers > 1 ? "s" : ""}`}`);
    tile.addEventListener("click", () => go(`#market/m/${m.piece.id}`));
    return tile;
  }

  function cardRow({ cw, rarity }, ownedMap) {
    const st = statOf(cw.id, rarity);
    const row = el("button", "mb-row");
    row.type = "button";
    row.dataset.rarity = rarity;
    row.append(spriteTile(cw.sprite, "atelier-chip-tile"));
    const info = el("span", "mb-row-info");
    info.append(el("span", "mb-row-name", cw.piece.name), el("span", "mb-row-sub", `${cw.brand.name} · ${cw.name}`));
    const own = ownedMap.get(key(cw.id, rarity));
    if (own) info.append(el("span", "mb-own", `Tu en as ${own.count}`));
    const side = el("span", "mb-row-side");
    const chip = el("span", "rules-chip", getRarity(rarity).name);
    chip.dataset.rarity = rarity;
    side.append(chip, availability(st.offers, st.best));
    row.append(info, side);
    row.setAttribute("aria-label", `${cw.piece.name}, ${cw.name}, ${getRarity(rarity).name} : ${offersText(st)}`);
    row.addEventListener("click", () => { cardFrom = "entry"; go(`#market/c/${cw.id}/${rarity}`); });
    return row;
  }

  function renderEntry() {
    head.hidden = false;
    modeTabs.models.setAttribute("aria-selected", String(mode === "models"));
    modeTabs.cards.setAttribute("aria-selected", String(mode === "cards"));
    renderPanel();
    const ownedMap = owned();
    const matching = ALL.filter((c) => matches(c, ownedMap));
    const nodes = [];
    if (degraded) nodes.push(el("p", "muted mb-note", "Nombre d'offres bientôt disponible : le serveur doit être mis à jour."));

    if (mode === "models") {
      const rows = modelRows(matching);
      nodes.push(el("p", "muted mb-count", `${rows.length} modèle${rows.length > 1 ? "s" : ""}`));
      if (rows.length === 0) nodes.push(el("p", "muted collection-empty", "Aucun modèle ne correspond à ta recherche."));
      const grid = el("div", "mb-tiles");
      grid.append(...rows.map(modelTile));
      nodes.push(grid);
    } else {
      const list = matching.slice().sort(cardSorter());
      nodes.push(el("p", "muted mb-count", `${list.length.toLocaleString("fr-FR")} carte${list.length > 1 ? "s" : ""}`));
      if (list.length === 0) nodes.push(el("p", "muted collection-empty", "Aucune carte ne correspond à ta recherche."));
      const rows = el("div", "mb-rows");
      rows.append(...list.slice(0, shown).map((c) => cardRow(c, ownedMap)));
      nodes.push(rows);
      if (list.length > shown) {
        const more = button(`Voir plus (${list.length - shown} restantes)`, { onClick: () => { shown += PAGE; renderEntry(); } });
        more.classList.add("mb-more");
        nodes.push(more);
      }
    }
    content.replaceChildren(...nodes);
  }

  // ------------------------------------------------------------------ vue 2 : page d'un modèle

  function backButton(label, hash) {
    const b = el("button", "mb-back", `‹ ${label}`);
    b.type = "button";
    b.addEventListener("click", () => { location.hash = hash; });
    return b;
  }

  function renderModel({ pieceId, cw: wantedCw }) {
    head.hidden = true;
    const piece = catalogue.pieces.find((p) => p.id === pieceId);
    const brand = catalogue.brands.find((b) => b.id === piece.brand);
    const colorways = piece.colorways.map((c) => catalogue.colorwayById.get(c.id));
    const ownedMap = owned();
    const offersOf = (cw) => RARITIES.reduce((n, r) => n + statOf(cw.id, r.id).offers, 0);
    // Coloris choisi : celui de l'adresse, sinon le premier qui a des offres, sinon le premier.
    const selected = colorways.find((c) => c.id === wantedCw) || colorways.find((c) => offersOf(c) > 0) || colorways[0];

    const nodes = [backButton("Modèles", "#market")];
    const title = el("div", "mb-title");
    const b = el("span", "mb-tile-brand", brand.name);
    b.style.color = `var(--brand-${brand.id}, var(--muted))`;
    title.append(b, el("h3", "mb-h", piece.name));
    nodes.push(title);

    nodes.push(el("p", "mb-step", "1 · Choisis un coloris"));
    const chips = el("div", "mb-chips");
    for (const cw of colorways) {
      const chip = el("button", "mb-chip");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(cw.id === selected.id));
      chip.setAttribute("aria-label", `${cw.name}${offersOf(cw) ? `, ${degraded ? "offres disponibles" : `${offersOf(cw)} offre${offersOf(cw) > 1 ? "s" : ""}`}` : ", aucune offre"}`);
      chip.append(spriteTile(cw.sprite, "mb-chip-art"));
      if (offersOf(cw) > 0) chip.append(el("span", "mb-chip-n", degraded ? "•" : String(offersOf(cw))));
      chip.addEventListener("click", () => {
        history.replaceState(null, "", `#market/m/${piece.id}/${cw.id}`);
        render();
      });
      chips.append(chip);
    }
    nodes.push(chips);
    nodes.push(el("p", "mb-cw-name", selected.name));

    nodes.push(el("p", "mb-step", "2 · Choisis une rareté"));
    const rars = el("div", "mb-rars");
    for (const r of RARITIES) {
      const st = statOf(selected.id, r.id);
      const cell = el("button", "mb-rar");
      cell.type = "button";
      cell.dataset.rarity = r.id;
      const chip = el("span", "rules-chip", r.name);
      chip.dataset.rarity = r.id;
      const price = el("span", "mb-rar-price");
      if (st.best === null) price.textContent = "—"; else price.append(coinText(st.best));
      const count = el("span", st.offers ? "mb-rar-count" : "mb-rar-count none", st.offers === 0 ? "aucune offre" : degraded ? "offre" : `${st.offers} offre${st.offers > 1 ? "s" : ""}`);
      cell.append(chip, price, count);
      if (ownedMap.has(key(selected.id, r.id))) cell.append(el("span", "mb-own", "Tu l'as"));
      cell.setAttribute("aria-label", `${r.name} : ${offersText(st)}${st.best !== null ? `, dès ${st.best} pièces` : ""}`);
      cell.addEventListener("click", () => { cardFrom = "model"; go(`#market/c/${selected.id}/${r.id}`); });
      rars.append(cell);
    }
    nodes.push(rars);
    content.replaceChildren(...nodes);
  }

  // ------------------------------------------------------------------ vue 3 : page d'une carte

  function offerRow(o, cwId, rarity) {
    const row = el("div", "mb-offer");
    const tag = el("span", o.mine ? "mb-tag mine" : o.shop ? "mb-tag shop" : "mb-tag", o.mine ? "Ton offre" : o.shop ? shopName() : "Joueur");
    row.append(tag, coinText(o.price));
    if (o.mine) {
      row.append(button("Retirer", { onClick: () => cancelOffer(o.id) }));
    } else {
      const missing = o.price - getCoins();
      row.append(button(missing > 0 ? `Il te manque ${missing}` : "Acheter", {
        primary: missing <= 0,
        disabled: missing > 0,
        onClick: () => confirmBuy({ id: o.id, price: o.price, colorwayId: cwId, rarity, shop: o.shop }),
      }));
    }
    return row;
  }

  function renderCard({ cw: cwId, rarity }) {
    head.hidden = true;
    const cw = catalogue.colorwayById.get(cwId);
    const st = statOf(cwId, rarity);
    const own = owned().get(key(cwId, rarity));
    const mine = ++token;

    const modelHash = `#market/m/${cw.piece.id}/${cwId}`;
    const nodes = [cardFrom === "entry" ? backButton("Catalogue", "#market") : backButton(cw.piece.name, modelHash)];
    const wrap = el("div", "mb-card-big");
    wrap.append(bigCard(cwId, rarity));
    nodes.push(wrap);

    const facts = el("div", "mb-facts");
    const best = el("p", "mb-fact");
    best.append(el("span", "mb-fact-k", "Meilleur prix"));
    if (st.best === null) best.append(el("span", "mb-fact-v muted", "aucune offre"));
    else best.append(coinText(st.best), el("span", "mb-fact-sub", degraded ? "" : `${st.offers} exemplaire${st.offers > 1 ? "s" : ""} disponible${st.offers > 1 ? "s" : ""}`));
    const last = el("p", "mb-fact");
    last.append(el("span", "mb-fact-k", "Dernière vente"));
    if (st.last === null) last.append(el("span", "mb-fact-v muted", degraded ? "—" : "jamais vendue"));
    else last.append(coinText(st.last), el("span", "mb-fact-sub", st.recent > 0 ? `${st.recent} vente${st.recent > 1 ? "s" : ""} ces ${recentDays} derniers jours` : `aucune vente ces ${recentDays} derniers jours`));
    const ownLine = el("p", "mb-fact");
    ownLine.append(el("span", "mb-fact-k", "Dans ta collection"));
    ownLine.append(el("span", own ? "mb-fact-v" : "mb-fact-v mb-new", own ? `tu en as ${own.count}` : "Nouveau pour toi"));
    facts.append(best, last, ownLine);
    nodes.push(facts);

    nodes.push(el("h4", "mb-sub", "Offres"));
    const list = el("div", "mb-offers");
    list.append(el("p", "muted mb-note", "Chargement…"));
    nodes.push(list);

    const actions = el("div", "sheet-actions mb-actions");
    if (own) {
      actions.append(own.locked
        ? button("Carte verrouillée : impossible à vendre", { disabled: true })
        : button("Vendre cette carte", { onClick: () => openSell(own) }));
    }
    nodes.push(actions);
    content.replaceChildren(...nodes);

    // Les offres viennent du serveur (jamais d'identité de vendeur).
    (async () => {
      let data;
      try {
        data = degraded
          ? { total: st.best === null ? 0 : 1, offers: bestById.has(key(cwId, rarity)) ? [{ id: bestById.get(key(cwId, rarity)).id, price: st.best, shop: st.shop, mine: st.mine > 0 }] : [] }
          : await loadCardOffers(cwId, rarity);
      } catch {
        data = null;
      }
      if (mine !== token) return; // la page a changé entre-temps
      if (!data) { list.replaceChildren(el("p", "muted mb-note", "Impossible de charger les offres. Réessaie dans un instant.")); return; }
      if (data.offers.length === 0) { list.replaceChildren(el("p", "muted mb-note", "Aucune offre pour l'instant. Reviens plus tard, ou mets cette carte en vente si tu l'as.")); return; }
      list.replaceChildren(...data.offers.map((o) => offerRow(o, cwId, rarity)));
      if (data.total > data.offers.length) list.append(el("p", "muted mb-note", `Les ${data.offers.length} moins chères sur ${data.total} offres.`));
    })();
  }

  // ------------------------------------------------------------------ affichage

  function render() {
    const r = route();
    const previous = lastView;
    lastView = r.view;
    if (!ready) {
      head.hidden = r.view !== "entry";
      content.replaceChildren(el("p", "muted mb-note", "Chargement du Marché…"));
      return;
    }
    if (r.view === "model") renderModel(r);
    else if (r.view === "card") renderCard(r);
    else renderEntry();
    if (previous !== r.view) {
      // On change de page : en haut pour un modèle ou une carte ; en revenant à l'entrée, on retrouve sa place.
      const main = scroller();
      if (r.view === "entry") requestAnimationFrame(() => main.scrollTo(0, entryScroll));
      else main.scrollTo(0, Math.max(0, root.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 8)); // le haut de la page (titre, onglets) laisse la place au catalogue
    }
  }

  return { setData, render };
}
