// shared-outfit.js — page PUBLIQUE d'une tenue partagée par lien (visible sans compte).
//
// Le serveur renvoie une copie de la tenue (get_shared_outfit, appelable sans être connecté) :
// l'avatar 3D (Garçon / Fille du joueur au moment du partage, migration 0019) porte la tenue et se
// fait tourner en glissant, comme partout dans le jeu. Dessous : la date du partage et la liste des
// pièces avec leur rareté. Le pseudo de la personne qui partage est affiché (décision du développeur,
// migration 0020) ; aucune autre information du joueur n'est montrée.

import { loadCatalogue, getRarity } from "./data.js?v=96";
import { getSharedOutfit } from "./api.js?v=96";
import { SLOTS } from "./avatar.js?v=96";
import { createAvatar3D } from "./avatar3d.js?v=96";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** « 28 octobre 2026 » : juste la date (jour de Paris), sans l'heure. */
function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

/** Affiche la tenue partagée dans #public-outfit (le jeu et la connexion restent cachés). */
export async function showSharedOutfit(token, { signedIn = false } = {}) {
  document.body.dataset.auth = "public";
  document.getElementById("public-outfit").hidden = false;
  document.getElementById("public-cta").textContent = signedIn ? "Retour au jeu" : "Jouer à Grail";
  const body = document.getElementById("public-body");

  try {
    const [catalogue, shared] = await Promise.all([loadCatalogue(), getSharedOutfit(token)]);

    // Les pièces portées, dans l'ordre des emplacements (tête → pieds).
    const worn = {};
    const lines = [];
    for (const slot of SLOTS) {
      const key = shared.equipped?.[slot.id];
      if (!key) continue;
      const [colorwayId, rarity] = key.split("|");
      const colorway = catalogue.colorwayById.get(colorwayId);
      if (!colorway) continue;
      worn[slot.id] = colorway;
      lines.push({ slot, colorway, rarity });
    }
    if (!lines.length) throw new Error("Cette tenue est vide.");

    // Avatar 3D sur fond gris sombre (même canvas 46 × 88 que dans le jeu). Sans la migration 0019,
    // le serveur ne renvoie pas l'avatar : on montre le Garçon.
    const stage = el("div", "public-stage");
    const canvas = el("canvas", "pixel avatar-3d public-avatar");
    canvas.width = 46;
    canvas.height = 88;
    canvas.setAttribute("aria-label", "Tenue en 3D : glisse pour la faire tourner");
    stage.append(canvas);
    createAvatar3D(canvas).setOutfit(worn, { type: shared.avatar_body === "femme" ? "femme" : "homme" })
      .catch((err) => console.error("Avatar 3D :", err));
    const meta = el("div", "public-meta");
    // Le pseudo de la personne qui a partagé (migration 0020) ; rien tant que le serveur ne le renvoie pas.
    if (shared.pseudo) meta.append(el("p", "public-pseudo", shared.pseudo));
    meta.append(el("p", "muted public-hint", "Glisse pour tourner"));
    const date = formatDate(shared.created_at);
    if (date) meta.append(el("p", "public-date", `Partagée le ${date}`));
    const list = el("div", "atelier-list");
    for (const { slot, colorway, rarity } of lines) {
      const row = el("div", "market-row");
      row.dataset.rarity = rarity;
      const tile = el("span", "atelier-chip-tile");
      const img = el("img", "pixel");
      img.src = colorway.sprite;
      img.width = 32;
      img.height = 32;
      img.alt = "";
      tile.append(img);
      const info = el("div", "market-row-info");
      info.append(el("span", "market-row-name", colorway.piece.name),
        el("span", "market-row-sub", `${slot.name} · ${colorway.name} · ${getRarity(rarity).name}`));
      row.append(tile, info);
      list.append(row);
    }
    body.replaceChildren(stage, meta, list);
  } catch (err) {
    body.replaceChildren(el("p", "muted", err?.message || "Impossible d'afficher cette tenue."));
  }
}
