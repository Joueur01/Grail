// shared-outfit.js — page PUBLIQUE d'une tenue partagée par lien (visible sans compte).
//
// Le serveur renvoie une copie de la tenue (get_shared_outfit, appelable sans être connecté) :
// on la dessine « à plat », comme sur l'écran Tenue, avec la liste des pièces et leur rareté.
// Aucun pseudo ni autre information du joueur n'est montré.

import { loadCatalogue, getRarity } from "./data.js?v=56";
import { getSharedOutfit } from "./api.js?v=56";
import { SLOTS, initAvatar, drawAvatar } from "./avatar.js?v=56";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
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

    const canvas = el("canvas", "pixel public-canvas");
    initAvatar(canvas);
    drawAvatar(canvas, worn).catch(() => {});
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
    body.replaceChildren(canvas, list);
  } catch (err) {
    body.replaceChildren(el("p", "muted", err?.message || "Impossible d'afficher cette tenue."));
  }
}
