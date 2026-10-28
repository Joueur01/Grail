// cards.js — dessin d'une carte (utilisé par le booster ET par la collection).

import { getRarity } from "./data.js?v=76";

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

/** Petite pastille « cadenas » posée sur une carte verrouillée. */
export function createLockBadge() {
  const badge = document.createElement("span");
  badge.className = "lock-badge";
  badge.setAttribute("aria-label", "Carte verrouillée");
  // Cadenas dessiné en SVG (pas d'emoji : leur rendu change d'un téléphone à l'autre).
  badge.innerHTML = '<svg viewBox="0 0 12 14" width="10" height="12" aria-hidden="true"><path d="M3 6V4a3 3 0 1 1 6 0v2h1v7H2V6h1zm1.5 0h3V4a1.5 1.5 0 0 0-3 0v2z" fill="currentColor"/></svg>';
  return badge;
}
