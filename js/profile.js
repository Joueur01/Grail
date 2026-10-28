// profile.js — page de profil : la sienne (bouton rond en haut) ET celle d'un ami (écran Amis).
//
// ⚠️ Tout vient du SERVEUR (migration 0014, get_player_profile) : identité, tenue portée,
// statistiques et vitrine (les 3 cartes les plus rares, choisies par le serveur). Ce fichier
// ne calcule rien : il met en page ce que le serveur renvoie. Un ami ne reçoit pas le solde
// de pièces (le serveur renvoie null).

import { RARITIES, getRarity } from "./data.js?v=58";
import { getPlayerProfile } from "./api.js?v=58";
import { SLOTS } from "./avatar.js?v=58";
import { createAvatar3D } from "./avatar3d.js?v=58";
import { createCardFace, createCardShell } from "./cards.js?v=58";

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
 */
export function buildProfileView(data, catalogue, { showName = true, onEditOutfit = null } = {}) {
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

  // --- Vitrine : les 3 cartes les plus rares (choisies par le serveur) ---
  const showcase = el("section", "profile-section");
  showcase.append(el("span", "eyebrow", "Vitrine"));
  const cards = (data.showcase || []).filter((c) => catalogue.colorwayById.has(c.colorway_id));
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
    showcase.append(el("p", "muted", "Pas encore de carte."));
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
      container.replaceChildren(buildProfileView(data, catalogue, { onEditOutfit: () => { location.hash = "#avatar"; } }));
    } catch (err) {
      container.replaceChildren(el("p", "muted profile-error", err.message));
    } finally {
      loading = false;
    }
  }

  window.addEventListener("hashchange", () => { if (location.hash === "#profile") load(); });
  if (location.hash === "#profile") load();
}
