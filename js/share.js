// share.js — « Partager ma tenue » : image PNG de la tenue + partage natif.
//
// L'image (1080 × 1350, format portrait des réseaux) montre la tenue à plat
// agrandie ×6 (facteur entier, sans lissage) et la liste des pièces avec leur
// nom, coloris, marque et rareté.
//
// Safari n'ouvre le menu de partage QUE juste après un toucher. L'image est donc
// préparée À L'AVANCE, à chaque changement de tenue, pour être prête au moment
// où l'on touche le bouton (sinon le partage serait refusé).

import { RARITIES } from "./data.js?v=26";
import { SLOTS, drawAvatar } from "./avatar.js?v=26";

const IMG_W = 1080;
const IMG_H = 1350;
const PAD = 64;
const SCALE = 6;           // tenue à plat 64 × 96 → 384 × 576
const FONT = "Archivo, system-ui, sans-serif";
const SITE_URL = "joueur01.github.io/Grail";
const FILE_NAME = "grail-ma-tenue.png";
// Ordre de la liste : de la tête aux pieds, comme la tenue, puis le sac.
const LIST_ORDER = ["tete", "cou", "haut", "veste", "bas", "chaussures", "sac"];

/** Lit une couleur définie dans style.css (:root), pour garder une seule source. */
function cssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Rectangle aux coins arrondis (rempli). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** Coupe un texte avec « … » s'il dépasse la largeur donnée. */
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > maxWidth) text = text.slice(0, -1);
  return text + "…";
}

/** S'assure que la police Archivo est chargée avant de dessiner du texte. */
async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load(`900 64px ${FONT}`),
      document.fonts.load(`700 30px ${FONT}`),
      document.fonts.load(`400 24px ${FONT}`),
    ]);
  } catch {
    // Pas grave : le navigateur utilisera une police système.
  }
}

/**
 * Dessine l'image de partage et la renvoie sous forme de Blob PNG.
 * - outfit : { emplacement: { colorway, rarity } } (pièces portées)
 */
export async function buildShareImage(outfit) {
  await loadFonts();

  // 1. La tenue à plat, dessinée en taille réelle dans un petit canvas.
  const flat = document.createElement("canvas");
  flat.width = 64;
  flat.height = 96;
  const worn = Object.fromEntries(Object.entries(outfit).map(([slot, o]) => [slot, o.colorway]));
  await drawAvatar(flat, worn);

  // 2. L'image finale.
  const canvas = document.createElement("canvas");
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false; // pixel art net
  const text = cssColor("--text", "#f2f1ee");
  const muted = cssColor("--muted", "#8f8d88");

  ctx.fillStyle = cssColor("--bg", "#0f0f11");
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // En-tête : logo + résumé (« 5 pièces · 1 légendaire »)
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = text;
  ctx.font = `900 72px ${FONT}`;
  ctx.fillText("GRAIL", PAD, PAD + 64);
  const count = Object.keys(outfit).length;
  const best = [...RARITIES].reverse()
    .map((r) => ({ r, n: Object.values(outfit).filter((o) => o.rarity === r.id).length }))
    .find((x) => x.n > 0 && x.r.id !== "commun");
  ctx.fillStyle = muted;
  ctx.font = `400 30px ${FONT}`;
  const summary = `Ma tenue · ${count} pièce${count > 1 ? "s" : ""}`
    + (best ? ` · ${best.n} ${best.r.name.toLowerCase()}${best.n > 1 ? "s" : ""}` : "");
  ctx.fillText(summary, PAD, PAD + 112);

  // Vitrine claire + tenue agrandie ×6
  const tileX = PAD, tileY = 236, tilePad = 32;
  const tileW = 64 * SCALE + tilePad * 2, tileH = 96 * SCALE + tilePad * 2;
  ctx.fillStyle = "#cccac4";
  roundRect(ctx, tileX, tileY, tileW, tileH, 32);
  ctx.drawImage(flat, tileX + tilePad, tileY + tilePad, 64 * SCALE, 96 * SCALE);

  // Liste des pièces, de la tête aux pieds
  const listX = tileX + tileW + 40;
  const listW = IMG_W - PAD - listX;
  let y = tileY + 8;
  for (const slotId of LIST_ORDER) {
    const slot = SLOTS.find((s) => s.id === slotId);
    const piece = outfit[slot.id];
    if (!piece) continue;
    const { colorway, rarity } = piece;
    const rarityInfo = RARITIES.find((r) => r.id === rarity);

    ctx.fillStyle = muted;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(slot.name.toUpperCase(), listX, y + 20);

    ctx.fillStyle = text;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(fitText(ctx, colorway.piece.name, listW), listX, y + 54);

    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = cssColor(`--brand-${colorway.brand.id}`, muted);
    const brand = colorway.brand.name;
    ctx.fillText(brand, listX, y + 84);
    const brandW = ctx.measureText(brand + "  ").width;
    ctx.fillStyle = muted;
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText(fitText(ctx, colorway.name, listW - brandW), listX + brandW, y + 84);

    // Pastille de rareté
    ctx.font = `800 18px ${FONT}`;
    const label = rarityInfo.name.toUpperCase();
    const pillW = ctx.measureText(label).width + 28;
    ctx.fillStyle = cssColor(`--rarity-${rarity}`, muted);
    roundRect(ctx, listX, y + 98, pillW, 32, 16);
    ctx.fillStyle = "#0f0f11";
    ctx.fillText(label, listX + 14, y + 121);

    y += 152;
  }

  // Pied de page : invitation à jouer
  ctx.fillStyle = text;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText("Compose ta tenue sur Grail", PAD, IMG_H - PAD - 40);
  ctx.fillStyle = muted;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText(SITE_URL, PAD, IMG_H - PAD);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG impossible"))), "image/png");
  });
}

/** Télécharge le fichier (repli quand le partage natif n'existe pas, ex. sur PC). */
function download(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Branche le bouton « Partager ma tenue » et renvoie la fonction à appeler
 * à chaque changement de tenue (elle prépare l'image à l'avance).
 */
export function setupShare() {
  const button = document.getElementById("btn-share");
  const status = document.getElementById("share-status");
  let pending = null; // Promise du Blob de la tenue actuelle
  let version = 0;

  function update(outfit) {
    const count = Object.keys(outfit).length;
    button.disabled = count === 0;
    status.textContent = count === 0 ? "Porte au moins une pièce pour partager ta tenue." : "";
    if (count === 0) { pending = null; return; }
    const v = ++version;
    pending = buildShareImage(outfit);
    pending.catch((err) => { if (v === version) console.error("Image de partage :", err); });
  }

  button.addEventListener("click", async () => {
    if (!pending) return;
    try {
      const blob = await pending;
      const file = new File([blob], FILE_NAME, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Ma tenue Grail" });
      } else {
        download(blob);
        status.textContent = "Image téléchargée.";
      }
    } catch (err) {
      // L'utilisateur a fermé le menu de partage : rien à faire.
      if (err && err.name === "AbortError") return;
      // Autre souci (partage refusé, etc.) : on propose le téléchargement.
      console.error("Partage :", err);
      try {
        download(await pending);
        status.textContent = "Partage indisponible : image téléchargée.";
      } catch {
        status.textContent = "Impossible de créer l'image.";
      }
    }
  });

  return update;
}
