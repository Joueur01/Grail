// atelier.js — vue « Atelier » de l'onglet Collection.
//
// La Collection montre une carte par COLORIS. Or l'amélioration se fait par
// MODÈLE (tous coloris confondus) : l'Atelier regroupe donc les cartes par
// modèle + rareté, montre où on en est (X / 5), les chances de la roue et la
// rareté visée. Toucher une ligne ouvre la roue avec ces cartes déjà misées.
// Les Légendaires (non améliorables) n'apparaissent pas.

import { RARITIES, UPGRADE_MAX_CARDS, getRarity } from "./data.js?v=23";
import { getOwnedCards } from "./inventory.js?v=23";
import { nextRarity, upgradeChance } from "./upgrade.js?v=23";

/**
 * Regroupe les cartes possédées par modèle + rareté.
 * Renvoie [{ piece, rarity, total, colorways: [{ colorway, count }] }],
 * trié du plus proche de 5 au plus éloigné.
 */
export function atelierRows(catalogue) {
  const groups = new Map(); // "pieceId|rarete" → ligne
  for (const c of getOwnedCards()) {
    const colorway = catalogue.colorwayById.get(c.colorwayId);
    if (!colorway || !nextRarity(c.rarity)) continue; // coloris inconnu ou Légendaire
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
  // Du plus proche de 5 au plus éloigné (au-delà de 5, c'est « prêt » comme à 5),
  // puis la rareté la plus haute, puis l'ordre du catalogue.
  return rows.sort((a, b) =>
    (Math.min(b.total, UPGRADE_MAX_CARDS) - Math.min(a.total, UPGRADE_MAX_CARDS))
    || (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
    || (pieceOrder.get(a.piece.id) - pieceOrder.get(b.piece.id)));
}

/**
 * Branche l'Atelier et renvoie une fonction pour le redessiner.
 * - onRowTap(piece, rarity) : appelé quand on touche une ligne (ouvre la roue)
 */
export function setupAtelier({ catalogue, onRowTap }) {
  const list = document.getElementById("atelier-list");
  const empty = document.getElementById("atelier-empty");

  function render() {
    const rows = atelierRows(catalogue);
    list.replaceChildren(...rows.map((row) => createRow(row)));
    empty.hidden = rows.length > 0;
  }

  /** Une ligne : marque + modèle + rareté, barre X / 5, chances, coloris possédés. */
  function createRow({ piece, rarity, total, colorways }) {
    const target = nextRarity(rarity);
    const count = Math.min(total, UPGRADE_MAX_CARDS); // la roue prend 5 cartes au maximum
    const chance = upgradeChance(count);
    const brand = colorways[0].colorway.brand;

    const el = document.createElement("button");
    el.className = "atelier-row";
    el.dataset.rarity = rarity; // couleur de la rareté actuelle (bordure, étiquette)
    el.dataset.brand = brand.id;
    if (count >= UPGRADE_MAX_CARDS) el.classList.add("ready");
    el.setAttribute("aria-label",
      `${piece.name} ${getRarity(rarity).name} : ${total} sur ${UPGRADE_MAX_CARDS}, ${chance} % vers ${getRarity(target).name}`);

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
    fill.style.width = `${(count / UPGRADE_MAX_CARDS) * 100}%`;
    bar.append(fill);
    progress.append(bar, text("span", "atelier-count",
      total > UPGRADE_MAX_CARDS ? `${total}/${UPGRADE_MAX_CARDS}` : `${count}/${UPGRADE_MAX_CARDS}`));

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

    el.append(head, progress, chips);
    el.addEventListener("click", () => onRowTap?.(piece, rarity));
    return el;
  }

  render();
  return render;
}

/** Sélecteur « Collection / Atelier » en haut de l'onglet Collection. */
export function setupViewSwitch() {
  const tabs = document.querySelectorAll(".view-tab");
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

function text(tag, className, content) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = content;
  return el;
}
