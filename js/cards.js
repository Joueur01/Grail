// cards.js — dessin d'une carte (utilisé par le booster ET par la collection).

import { getRarity } from "./data.js?v=13";

/**
 * Crée la face d'une carte : sprite sur case claire, marque, nom,
 * coloris et étiquette de rareté.
 * - colorway : un coloris du catalogue (avec .piece et .brand)
 * - rarityId : "commun", "rare", "epique" ou "legendaire"
 */
export function createCardFace(colorway, rarityId) {
  const face = document.createElement("div");
  face.className = "card-face";

  const tile = document.createElement("div");
  tile.className = "sprite-tile";
  const img = document.createElement("img");
  img.className = "pixel";
  img.src = colorway.sprite;
  img.width = 32;
  img.height = 32;
  img.alt = "";
  img.loading = "lazy"; // la collection peut afficher beaucoup de cartes
  tile.append(img);

  face.append(
    tile,
    textEl("card-brand", colorway.brand.name),
    textEl("card-name", keepQuotesTogether(colorway.piece.name)),
    textEl("card-colorway", colorway.name),
    textEl("rarity-tag", getRarity(rarityId).name),
  );
  return face;
}

/** Conteneur commun d'une carte : porte la rareté et la marque (couleurs en CSS). */
export function createCardShell(colorway, rarityId) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.rarity = rarityId;
  card.dataset.brand = colorway.brand.id;
  return card;
}

// Espaces insécables autour des guillemets : « Atelier » ne se coupe jamais
// en laissant un » tout seul sur une ligne.
function keepQuotesTogether(text) {
  return text.replace(/« /g, "« ").replace(/ »/g, " »");
}

function textEl(className, text) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}
