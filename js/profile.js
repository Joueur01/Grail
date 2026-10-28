// profile.js — page de profil : la sienne (bouton rond en haut) ET celle d'un ami (écran Amis).
//
// ⚠️ Tout vient du SERVEUR (migrations 0014 et 0015, get_player_profile) : identité, tenue
// portée, statistiques et vitrine. La VITRINE est choisie par le joueur (vide au départ,
// jusqu'à showcase_max cartes, 3 par défaut, dans l'ordre voulu) et enregistrée par set_showcase, qui vérifie
// que chaque carte est possédée. Ce fichier ne calcule rien : il met en page ce que le serveur
// renvoie. Un ami ne reçoit pas le solde de pièces (le serveur renvoie null).

import { RARITIES, getRarity, matchesSearch } from "./data.js?v=65";
import { getPlayerProfile, setShowcase } from "./api.js?v=65";
import { getOwnedCards } from "./inventory.js?v=65";
import { showToast, reportError } from "./wallet.js?v=65";
import { SLOTS } from "./avatar.js?v=65";
import { createAvatar3D } from "./avatar3d.js?v=65";
import { createCardFace, createCardShell } from "./cards.js?v=65";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** « octobre 2026 » à partir d'une date du serveur. */
function monthYear(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Une case de statistique : grand nombre + libellé (+ petite barre de progression si demandée). */
function statTile(label, value, { progress = null, sub = "" } = {}) {
  const tile = el("div", "stat-tile");
  tile.append(el("span", "stat-value", value), el("span", "stat-label", label));
  if (sub) tile.append(el("span", "stat-sub", sub));
  if (progress !== null) {
    const bar = el("span", "stat-bar");
    const fill = el("span", "stat-bar-fill");
    fill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
    bar.append(fill);
    tile.append(bar);
  }
  return tile;
}

/**
 * Construit la page de profil à partir de la réponse du serveur.
 * - data : réponse de get_player_profile
 * - catalogue : résultat de loadCatalogue()
 * - showName : false dans le panneau d'un ami (son pseudo est déjà le titre)
 * - onEditOutfit : bouton « Modifier ma tenue » (profil personnel seulement)
 * - onEditShowcase : bouton « Ajouter des cartes / Modifier la vitrine » (profil personnel seulement)
 */
export function buildProfileView(data, catalogue, { showName = true, onEditOutfit = null, onEditShowcase = null } = {}) {
  const root = el("div", "profile");

  // --- Identité ---
  const head = el("div", "profile-head");
  if (showName) {
    head.append(el("span", "eyebrow", data.is_self ? "Mon profil" : "Profil"));
    head.append(el("h2", "screen-title profile-name", data.pseudo || "Sans pseudo"));
  }
  const since = monthYear(data.member_since);
  if (since) head.append(el("p", "muted", `Membre depuis ${since}`));
  if (data.is_self && !data.pseudo) {
    const link = el("a", "profile-link-inline", "Choisir mon pseudo ›");
    link.href = "#friends";
    head.append(link);
  }
  root.append(head);

  // --- Avatar 3D avec la tenue portée (même rendu que l'écran Tenue) ---
  const worn = {};
  for (const slot of SLOTS) {
    const key = data.equipped?.[slot.id];
    if (!key) continue;
    const colorway = catalogue.colorwayById.get(key.split("|")[0]);
    if (colorway) worn[slot.id] = colorway;
  }
  const stage = el("div", "profile-stage");
  const canvas = el("canvas", "pixel avatar-3d profile-avatar");
  canvas.width = 46;
  canvas.height = 88;
  canvas.setAttribute("aria-label", "Avatar en 3D : glisse pour le faire tourner");
  stage.append(canvas);
  root.append(stage);
  createAvatar3D(canvas).setOutfit(worn, { type: data.avatar_body === "femme" ? "femme" : "homme" })
    .catch((err) => console.error("Avatar 3D :", err));
  const wornCount = Object.keys(worn).length;
  const under = el("div", "profile-under");
  under.append(el("p", "muted profile-hint", wornCount
    ? `${wornCount} pièce${wornCount > 1 ? "s" : ""} portée${wornCount > 1 ? "s" : ""} · glisse pour tourner`
    : "Aucune pièce portée"));
  if (onEditOutfit) {
    const edit = el("button", "btn profile-edit", "Modifier ma tenue");
    edit.addEventListener("click", onEditOutfit);
    under.append(edit);
  }
  root.append(under);

  // --- Vitrine : les cartes CHOISIES par le joueur (vide au départ) ---
  const showcase = el("section", "profile-section");
  const cards = (data.showcase || []).filter((c) => catalogue.colorwayById.has(c.colorway_id));
  // showcase_max n'existe qu'avec la migration 0015 : sans elle, pas de choix possible.
  const canEdit = onEditShowcase && data.showcase_max !== undefined;
  const headRow = el("div", "profile-section-head");
  headRow.append(el("span", "eyebrow", canEdit ? `Vitrine · ${cards.length} / ${data.showcase_max}` : "Vitrine"));
  showcase.append(headRow);
  if (cards.length) {
    const grid = el("div", "profile-showcase");
    for (const c of cards) {
      const colorway = catalogue.colorwayById.get(c.colorway_id);
      const card = createCardShell(colorway, c.rarity);
      card.classList.add("owned");
      card.append(createCardFace(colorway, c.rarity));
      grid.append(card);
    }
    showcase.append(grid);
  } else {
    showcase.append(el("p", "muted showcase-empty", data.is_self
      ? "Ta vitrine est vide. Choisis les cartes que tu veux montrer à tes amis."
      : "Vitrine vide pour l'instant."));
  }
  if (canEdit) {
    const edit = el("button", "btn profile-edit", cards.length ? "Modifier la vitrine" : "Ajouter des cartes");
    edit.addEventListener("click", () => onEditShowcase(cards.map((c) => `${c.colorway_id}|${c.rarity}`), data.showcase_max));
    const row = el("div", "profile-under");
    row.append(edit);
    showcase.append(row);
  }
  root.append(showcase);

  // --- Statistiques ---
  const stats = el("section", "profile-section");
  stats.append(el("span", "eyebrow", "Statistiques"));
  const grid = el("div", "stat-grid");
  const total = data.cards_total || 300;
  grid.append(
    statTile("Collection", `${data.cards_owned} / ${total}`, { progress: data.cards_owned / total, sub: `${data.copies} exemplaires` }),
    statTile("Boosters ouverts", String(data.boosters_opened ?? 0)),
    statTile("Série au Videur", `${data.videur_streak ?? 0} j`),
    statTile("Flow", String(data.flow ?? 0)),
    statTile("Amis", String(data.friends ?? 0)),
  );
  // Le solde n'est renvoyé qu'au joueur lui-même.
  if (data.coins !== null && data.coins !== undefined) grid.append(statTile("Pièces", String(data.coins)));
  stats.append(grid);

  // Détail par rareté : une pastille colorée par rareté (de la plus rare à la plus commune)
  const chips = el("div", "rarity-chips");
  for (const r of [...RARITIES].reverse()) {
    const chip = el("span", "rarity-chip");
    chip.dataset.rarity = r.id;
    chip.append(el("b", "", String(data.by_rarity?.[r.id] ?? 0)), document.createTextNode(` ${getRarity(r.id).name}`));
    chips.append(chip);
  }
  stats.append(chips);
  root.append(stats);
  return root;
}

/**
 * Branche l'écran « Mon profil » (#profile). Il est relu sur le serveur à chaque affichage.
 * - catalogue : résultat de loadCatalogue()
 */
export function setupProfile({ catalogue }) {
  const container = document.getElementById("profile-body");
  let loading = false;

  async function load() {
    if (loading) return;
    loading = true;
    if (!container.firstChild) container.replaceChildren(el("p", "muted", "Chargement…"));
    try {
      const data = await getPlayerProfile();
      container.replaceChildren(buildProfileView(data, catalogue, {
        onEditOutfit: () => { location.hash = "#avatar"; },
        onEditShowcase: (current, max) => openShowcaseEditor({ catalogue, current, max, onSaved: load }),
      }));
    } catch (err) {
      container.replaceChildren(el("p", "muted profile-error", err.message));
    } finally {
      loading = false;
    }
  }

  window.addEventListener("hashchange", () => { if (location.hash === "#profile") load(); });
  if (location.hash === "#profile") load();
}

/**
 * Éditeur de la vitrine, dans le panneau du bas (#card-sheet) : en haut les cases de la vitrine
 * (dans l'ordre, toucher une case retire la carte), en dessous toutes ses cartes avec recherche
 * et filtres (toucher une carte l'ajoute ou la retire). « Enregistrer » envoie la liste au serveur.
 * - current : cartes déjà en vitrine ("coloris|rareté", dans l'ordre)
 * - max : nombre maximum de cartes (réglage du serveur)
 */
function openShowcaseEditor({ catalogue, current, max, onSaved }) {
  const sheet = document.getElementById("card-sheet");
  const title = document.getElementById("card-sheet-title");
  const body = document.getElementById("card-sheet-body");
  const rarityRank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const catalogueOrder = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  let picked = [...current]; // sélection en cours, dans l'ordre d'ajout

  title.textContent = "Ma vitrine";
  const intro = el("p", "muted showcase-intro", "");
  const slots = el("div", "showcase-slots");
  slots.style.gridTemplateColumns = `repeat(${max}, minmax(0, 1fr))`;
  slots.classList.toggle("few", max <= 4); // peu de cases : elles sont grandes, sprite ×2

  // Recherche et filtres (mêmes règles que la Collection)
  const filters = el("div", "filters picker-filters showcase-filters");
  const search = el("input", "search");
  search.type = "search";
  search.placeholder = "Rechercher…";
  search.setAttribute("aria-label", "Rechercher une carte");
  search.autocomplete = "off";
  const brand = el("select");
  brand.setAttribute("aria-label", "Filtrer par marque");
  brand.append(new Option("Marque", ""), ...catalogue.brands.map((b) => new Option(b.name, b.id)));
  const rarity = el("select");
  rarity.setAttribute("aria-label", "Filtrer par rareté");
  rarity.append(new Option("Rareté", ""), ...[...RARITIES].reverse().map((r) => new Option(r.name, r.id)));
  filters.append(search, brand, rarity);

  const grid = el("div", "card-grid showcase-grid");
  const empty = el("p", "muted picker-empty", "");
  const save = el("button", "btn btn-primary", "Enregistrer");
  const clear = el("button", "btn", "Tout retirer");
  const actions = el("div", "showcase-actions");
  actions.append(save, clear);

  const keyOf = (c) => `${c.colorwayId}|${c.rarity}`;

  /** Cases du haut : la vitrine dans l'ordre, puis des cases vides jusqu'au maximum. */
  function renderSlots() {
    intro.textContent = `${picked.length} / ${max} cartes · touche une carte pour l'ajouter ou la retirer`;
    slots.replaceChildren(...Array.from({ length: max }, (_, i) => {
      const key = picked[i];
      const cell = el("button", "showcase-slot");
      cell.type = "button";
      if (!key) {
        cell.disabled = true;
        cell.setAttribute("aria-label", "Case vide");
        return cell;
      }
      const [colorwayId, r] = key.split("|");
      const colorway = catalogue.colorwayById.get(colorwayId);
      cell.dataset.rarity = r;
      cell.setAttribute("aria-label", `Retirer ${colorway?.piece.name || ""} de la vitrine`);
      if (colorway) {
        const img = el("img", "pixel");
        img.src = colorway.sprite;
        img.width = 32;
        img.height = 32;
        img.alt = "";
        cell.append(img);
      }
      cell.append(el("span", "showcase-slot-num", String(i + 1)));
      cell.addEventListener("click", () => { picked = picked.filter((k) => k !== key); update(); });
      return cell;
    }));
    clear.disabled = picked.length === 0;
  }

  /** Grille des cartes possédées (la plus rare d'abord), filtrée. */
  function renderGrid() {
    const owned = getOwnedCards().filter((c) => catalogue.colorwayById.has(c.colorwayId));
    const visible = owned
      .filter((c) => {
        const colorway = catalogue.colorwayById.get(c.colorwayId);
        return matchesSearch(search.value, [colorway.piece.name, colorway.name, colorway.brand.name, getRarity(c.rarity).name])
          && (!brand.value || colorway.brand.id === brand.value)
          && (!rarity.value || c.rarity === rarity.value);
      })
      .sort((a, b) => (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
        || (catalogueOrder.get(a.colorwayId) - catalogueOrder.get(b.colorwayId)));
    // On garde la position de défilement du panneau quand la liste est redessinée (filtres).
    const scroller = sheet.querySelector(".picker-sheet");
    const keepScroll = scroller.scrollTop;
    grid.replaceChildren(...visible.map((c) => {
      const colorway = catalogue.colorwayById.get(c.colorwayId);
      const key = keyOf(c);
      const btn = el("button", "picker-choice");
      btn.type = "button";
      btn.dataset.key = key;
      const card = createCardShell(colorway, c.rarity);
      card.classList.add("owned");
      card.append(createCardFace(colorway, c.rarity));
      btn.append(card);
      btn.addEventListener("click", () => {
        if (picked.includes(key)) picked = picked.filter((k) => k !== key);
        else if (picked.length >= max) { showToast(`${max} cartes maximum dans la vitrine.`); return; }
        else picked = [...picked, key];
        // Pas de reconstruction de la liste : on met juste à jour les marques sur place
        // (sinon Safari remonte tout en haut du panneau à chaque toucher).
        update();
      });
      return btn;
    }));
    markPicked();
    scroller.scrollTop = keepScroll;
    empty.hidden = visible.length > 0;
    empty.textContent = owned.length ? "Aucune carte ne correspond à ta recherche." : "Tu n'as pas encore de carte. Ouvre des boosters !";
  }

  /** Contour blanc + numéro d'ordre sur les cartes choisies, sans redessiner la liste. */
  function markPicked() {
    for (const btn of grid.children) {
      const pos = picked.indexOf(btn.dataset.key);
      const card = btn.firstElementChild;
      btn.setAttribute("aria-pressed", String(pos >= 0));
      card.classList.toggle("in-showcase", pos >= 0);
      card.querySelector(".showcase-order")?.remove();
      if (pos >= 0) card.append(el("span", "showcase-order", String(pos + 1)));
    }
  }

  /** Après un ajout / retrait : cases du haut + marques sur la liste (la liste reste en place). */
  function update() {
    renderSlots();
    markPicked();
  }

  function render() {
    renderSlots();
    renderGrid();
  }

  for (const input of [search, brand, rarity]) input.addEventListener("input", renderGrid);
  clear.addEventListener("click", () => { picked = []; update(); });
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      await setShowcase(picked);
      sheet.hidden = true;
      showToast(picked.length ? "Vitrine enregistrée." : "Vitrine vidée.");
      onSaved();
    } catch (err) {
      reportError(err);
    } finally {
      save.disabled = false;
    }
  });

  body.replaceChildren(intro, slots, actions, filters, empty, grid);
  render();
  sheet.hidden = false;
}
