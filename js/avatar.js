// avatar.js — rendu de l'avatar dans un canvas.
//
// Le gabarit définitif n'est pas encore fixé (section 7 du CLAUDE.md).
// Pour l'instant on prépare seulement le canvas et l'ordre de dessin.

// Ordre de dessin des emplacements, du fond vers le premier plan.
export const DRAW_ORDER = ["bas", "chaussures", "haut", "veste", "cou", "tete", "sac"];

/** Prépare le canvas pour du pixel art net (aucun lissage). */
export function initAvatar(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawPlaceholder(ctx, canvas.width, canvas.height);
  return ctx;
}

// Silhouette provisoire en attendant le vrai corps de base (assets/avatar/).
function drawPlaceholder(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#4a4a55";
  ctx.fillRect(13, 3, 6, 6);   // tête
  ctx.fillRect(11, 10, 10, 10); // torse
  ctx.fillRect(8, 10, 2, 9);    // bras gauche
  ctx.fillRect(22, 10, 2, 9);   // bras droit
  ctx.fillRect(12, 20, 3, 9);   // jambe gauche
  ctx.fillRect(17, 20, 3, 9);   // jambe droite
}
