// atelier.js — vue « Atelier » de l'onglet Collection.
//
// La Collection montre une carte par COLORIS. Or l'amélioration se fait par
// MODÈLE (tous coloris confondus) : l'Atelier regroupe donc les cartes par
// modèle + rareté, montre où on en est (X / 5), les chances de la roue et la
// rareté visée. Toucher une ligne ouvre la roue avec ces cartes déjà misées.
// Les Légendaires (non améliorables) n'apparaissent pas.

import { RARITIES, getRarity, matchesSearch } from "./data.js?v=51";
import { UPGRADE, DISCARD_VALUES } from "./economy-config.js?v=51";
import { getOwnedCards } from "./inventory.js?v=51";
import { nextRarity, upgradeChance } from "./upgrade.js?v=51";

/**
 * Regroupe les cartes possédées par modèle + rareté.
 * Renvoie [{ piece, rarity, total, colorways: [{ colorway, count }] }],
 * groupé par rareté (la plus haute d'abord), puis du plus proche de 5 au plus éloigné.
 */
export function atelierRows(catalogue, sort = "progress") {
  const groups = new Map(); // "pieceId|rarete" → ligne
  for (const c of getOwnedCards()) {
    const colorway = catalogue.colorwayById.get(c.colorwayId);
    if (!colorway || !nextRarity(c.rarity)) continue; // coloris inconnu ou Légendaire
    if (c.locked) continue; // verrouillée : jamais proposée à l'amélioration
    const key = `${colorway.piece.id}|${c.rarity}`;
    if (!groups.has(key)) groups.set(key, { piece: colorway.piece, rarity: c.rarity, total: 0, colorways: [] });
    const row = groups.get(key);
    row.total += c.count;
    row.colorways.push({ colorway, count: c.count });
  }

  const pieceOrder = new Map(catalogue.pieces.map((p, i) => [p.id, i]));
  const rarityRank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const rows = [...groups.values()];
  for (const row of rows) row.colorways.sort((a, b) => b.count - a.count); // les plus nombreux d'abord
  // Groupées par rareté (la plus haute d'abord, pour les séparateurs), puis du
  // plus proche de 5 au plus éloigné (au-delà de 5, c'est « prêt » comme à 5),
  // puis l'ordre du catalogue.
  // Critère choisi dans le menu « Tri » (la rareté passe toujours en premier).
  const byProgress = (a, b) => Math.min(b.total, UPGRADE.maxCards) - Math.min(a.total, UPGRADE.maxCards);
  const byName = (a, b) => a.piece.name.localeCompare(b.piece.name, "fr");
  const byCatalogue = (a, b) => pieceOrder.get(a.piece.id) - pieceOrder.get(b.piece.id);
  const criteria = { progress: [byProgress, byCatalogue], name: [byName], catalogue: [byCatalogue] }[sort] || [byProgress, byCatalogue];
  return rows.sort((a, b) => (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
    || criteria.reduce((diff, cmp) => diff || cmp(a, b), 0)
    || byCatalogue(a, b));
}

/**
 * Branche l'Atelier et renvoie une fonction pour le redessiner.
 * - onRowTap(piece, rarity) : appelé quand on touche une ligne (ouvre la roue)
 * - onRowDiscard(piece, rarity) : bouton « Défausser » d'une ligne
 * - onDiscardAll() : bouton « Défausser des cartes » en bas de l'Atelier
 */
export function setupAtelier({ catalogue, onRowTap, onRowDiscard, onDiscardAll }) {
  const list = document.getElementById("atelier-list");
  const empty = document.getElementById("atelier-empty");
  const lockedNote = document.getElementById("atelier-locked-note");
  // Texte d'aide : les seuils viennent de la config (rien d'écrit en dur dans le HTML).
  document.getElementById("atelier-intro").textContent =
    `${UPGRADE.maxCards} exemplaires d'un même modèle à la même rareté, tous coloris confondus = amélioration garantie. Moins de ${UPGRADE.maxCards} : tente ta chance à la roue.`;
  const searchInput = document.getElementById("search-atelier");
  const brandSelect = document.getElementById("atelier-brand");
  const categorySelect = document.getElementById("atelier-category");
  const sortSelect = document.getElementById("atelier-sort");

  // Défausse : valeurs lues dans la config, bouton « toute la collection ».
  document.getElementById("discard-values").textContent =
    `Par carte : ${RARITIES.map((r) => `${r.name} ${DISCARD_VALUES[r.id]}`).join(" · ")} pièces.`;
  document.getElementById("btn-discard-all").addEventListener("click", () => onDiscardAll?.());

  // Remplit les menus (même principe que la Collection).
  fillSelect(brandSelect, catalogue.brands);
  fillSelect(categorySelect, [
    { id: "haut", name: "Haut" }, { id: "bas", name: "Bas" },
    { id: "chaussures", name: "Chaussures" }, { id: "accessoire", name: "Accessoire" },
  ]);

  function render() {
    const all = atelierRows(catalogue, sortSelect.value);
    const rows = all.filter(({ piece, rarity, colorways }) => {
      const brand = colorways[0].colorway.brand;
      return matchesSearch(searchInput.value, [piece.name, brand.name, getRarity(rarity).name, ...colorways.map((c) => c.colorway.name)])
        && (!brandSelect.value || brand.id === brandSelect.value)
        && (!categorySelect.value || piece.category === categorySelect.value);
    });
    // Cartes verrouillées (améliorables en théorie) : elles ne comptent pas ici.
    const lockedCopies = getOwnedCards().filter((c) => c.locked && nextRarity(c.rarity)).reduce((n, c) => n + c.count, 0);
    lockedNote.hidden = lockedCopies === 0;
    lockedNote.textContent = `${lockedCopies} carte${lockedCopies > 1 ? "s" : ""} verrouillée${lockedCopies > 1 ? "s" : ""} : non comptée${lockedCopies > 1 ? "s" : ""} ici.`;
    // Un séparateur (nom de la rareté + nombre de modèles) devant chaque groupe.
    const items = [];
    let current = null;
    for (const row of rows) {
      if (row.rarity !== current) {
        current = row.rarity;
        items.push(createDivider(current, rows.filter((r) => r.rarity === current).length));
      }
      items.push(createRow(row));
    }
    list.replaceChildren(...items);
    empty.hidden = rows.length > 0;
    empty.textContent = all.length === 0
      ? "Rien à améliorer pour l'instant. Ouvre des boosters !"
      : "Aucun modèle ne correspond à ta recherche.";
  }

  /** Séparateur de rareté : « ÉPIQUE · 2 » + un filet de la couleur de la rareté. */
  function createDivider(rarity, n) {
    const el = document.createElement("div");
    el.className = "atelier-divider";
    el.dataset.rarity = rarity;
    el.setAttribute("role", "heading");
    el.setAttribute("aria-level", "3");
    el.append(text("span", "atelier-divider-name", getRarity(rarity).name), text("span", "atelier-divider-count", String(n)));
    return el;
  }

  /** Une ligne : marque + modèle + rareté, barre X / 5, chances, coloris possédés. */
  function createRow({ piece, rarity, total, colorways }) {
    const target = nextRarity(rarity);
    const count = Math.min(total, UPGRADE.maxCards); // la roue prend 5 cartes au maximum
    const chance = upgradeChance(count);
    const brand = colorways[0].colorway.brand;

    // La ligne contient deux boutons (la roue, la défausse) : ce n'est donc pas elle le bouton.
    const el = document.createElement("div");
    el.className = "atelier-row";
    const main = document.createElement("button");
    main.className = "atelier-main";
    el.dataset.rarity = rarity; // couleur de la rareté actuelle (bordure, étiquette)
    el.dataset.brand = brand.id;
    if (count >= UPGRADE.maxCards) el.classList.add("ready");
    main.setAttribute("aria-label",
      `${piece.name} ${getRarity(rarity).name} : ${total} sur ${UPGRADE.maxCards}, ${chance} % vers ${getRarity(target).name}`);

    // En-tête : marque, nom du modèle, rareté | chances et rareté visée
    const head = document.createElement("div");
    head.className = "atelier-head";
    const title = document.createElement("div");
    title.className = "atelier-title";
    title.append(
      text("span", "card-brand", brand.name),
      text("span", "atelier-name", piece.name),
      text("span", "rarity-tag", getRarity(rarity).name),
    );
    const odds = document.createElement("div");
    odds.className = "atelier-odds";
    odds.dataset.rarity = target; // la rareté visée garde sa propre couleur
    odds.append(
      text("span", "atelier-chance", `${chance} %`),
      text("span", "atelier-target", `→ ${getRarity(target).name}`),
    );
    head.append(title, odds);

    // Barre de progression X / 5 (couleur de la rareté visée)
    const progress = document.createElement("div");
    progress.className = "atelier-progress";
    progress.dataset.rarity = target;
    const bar = document.createElement("div");
    bar.className = "atelier-bar";
    const fill = document.createElement("div");
    fill.className = "atelier-fill";
    fill.style.width = `${(count / UPGRADE.maxCards) * 100}%`;
    bar.append(fill);
    progress.append(bar, text("span", "atelier-count",
      total > UPGRADE.maxCards ? `${total}/${UPGRADE.maxCards}` : `${count}/${UPGRADE.maxCards}`));

    // Les coloris possédés, avec leur nombre
    const chips = document.createElement("div");
    chips.className = "atelier-chips";
    for (const { colorway, count: n } of colorways) {
      const chip = document.createElement("span");
      chip.className = "atelier-chip";
      const tile = document.createElement("span");
      tile.className = "atelier-chip-tile";
      const img = document.createElement("img");
      img.className = "pixel";
      img.src = colorway.sprite;
      img.width = 32;
      img.height = 32;
      img.alt = "";
      img.loading = "lazy";
      tile.append(img);
      chip.append(tile, text("span", "atelier-chip-name", colorway.name), text("span", "atelier-chip-count", `×${n}`));
      chips.append(chip);
    }

    // Indice cliquable : on voit d'un coup d'œil que la ligne ouvre la roue.
    const cta = document.createElement("span");
    cta.className = "atelier-cta";
    cta.dataset.rarity = target;
    cta.textContent = count >= UPGRADE.maxCards
      ? `Améliorer en ${getRarity(target).name} · garanti`
      : `Tenter la roue · ${chance} %`;
    cta.append(text("span", "atelier-cta-arrow", "›"));

    main.append(head, progress, chips, cta);
    main.addEventListener("click", () => onRowTap?.(piece, rarity));
    const discard = document.createElement("button");
    discard.className = "atelier-discard-btn";
    discard.textContent = "Défausser";
    discard.setAttribute("aria-label", `Défausser des cartes : ${piece.name}, ${getRarity(rarity).name}`);
    discard.addEventListener("click", () => onRowDiscard?.(piece, rarity));
    el.append(main, discard);
    return el;
  }

  for (const el of [brandSelect, categorySelect, sortSelect]) el.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  render();
  return render;
}

/** Sélecteurs de vue en pilules (Collection / Atelier, Acheter / Vendre / Mes ventes) : un par bloc .view-switch. */
export function setupViewSwitch() {
  for (const group of document.querySelectorAll(".view-switch")) {
    const tabs = group.querySelectorAll(".view-tab");
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        for (const t of tabs) {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          document.getElementById(`${t.dataset.view}-view`).hidden = !on;
        }
      });
    }
  }
}

function text(tag, className, content) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = content;
  return el;
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
