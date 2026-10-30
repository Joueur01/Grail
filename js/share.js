// share.js — « Partager ma tenue » : LIEN public (principal) ou image PNG (secondaire).
//
// Un seul bouton « Partager ma tenue ».
//  - Téléphone / tablette : menu de partage natif avec l'image PNG + le lien (le lien seul si le
//    partage de fichier n'est pas possible).
//  - Ordinateur : petit menu « Copier le lien » / « Enregistrer en image ».
// Lien : le serveur enregistre une copie de la tenue portée sous un code secret
// (create_outfit_share) ; n'importe qui ouvre `…/?tenue=CODE` sans compte (shared-outfit.js).
// L'URL n'est jamais affichée.
//
// Image :
// L'image (1080 × 1350, format portrait des réseaux), avec la DATE du partage en haut à droite, montre l'avatar EN 3D (Garçon / Fille du
// joueur, vu de trois quarts comme dans le jeu) agrandi ×6 (facteur entier, sans lissage) sur un
// cadre gris sombre, et la liste des pièces avec leur nom, coloris, marque et rareté.
//
// Safari n'ouvre le menu de partage QUE juste après un toucher. L'image est donc
// préparée À L'AVANCE, à chaque changement de tenue, pour être prête au moment
// où l'on touche le bouton (sinon le partage serait refusé).

import { ALL_RARITIES, getRarity } from "./data.js?v=105";
import { SLOTS, readBodyChoice } from "./avatar.js?v=105";
import { getPseudo } from "./inventory.js?v=105";
import { buildModel, renderModel, DEFAULT_YAW } from "./avatar3d.js?v=105";
import { createOutfitShare } from "./api.js?v=105";
import { showToast } from "./wallet.js?v=105";
import { track } from "./analytics.js?v=105";

const IMG_W = 1080;
const IMG_H = 1350;
const PAD = 64;
const SCALE = 6;           // avatar 3D 46 × 88 → 276 × 528 (facteur entier)
const FONT = "Archivo, system-ui, sans-serif";
const SITE_URL = "huntgrail.eu";
const FILE_NAME = "grail-ma-tenue.png";
// Ordre de la liste : de la tête aux pieds, comme la tenue, puis le sac.
const LIST_ORDER = ["tete", "cou", "haut", "veste", "bas", "chaussures", "sac"];

/** « 28 octobre 2026 » : la date du jour de partage (jour de Paris), sans l'heure. */
function todayLabel() {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

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

  // 1. L'avatar en 3D, dessiné en taille réelle (46 × 88) dans un petit canvas, de trois quarts
  //    comme dans le jeu. Il porte le choix Garçon / Fille du joueur.
  const avatar = document.createElement("canvas");
  avatar.width = 46;
  avatar.height = 88;
  const worn = Object.fromEntries(Object.entries(outfit).map(([slot, o]) => [slot, o.colorway]));
  renderModel(avatar, await buildModel(worn, { type: readBodyChoice() }), DEFAULT_YAW);

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
  // La date du partage, en haut à droite (juste la date, pas l'heure)
  ctx.fillStyle = cssColor("--muted", "#8f8d88");
  ctx.font = `400 30px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(todayLabel(), IMG_W - PAD, PAD + 64);
  ctx.textAlign = "left";
  ctx.fillStyle = text;
  const count = Object.keys(outfit).length;
  const best = [...ALL_RARITIES].reverse()
    .map((r) => ({ r, n: Object.values(outfit).filter((o) => o.rarity === r.id).length }))
    .find((x) => x.n > 0 && x.r.id !== "commun");
  ctx.fillStyle = muted;
  ctx.font = `400 30px ${FONT}`;
  const summary = `${count} pièce${count > 1 ? "s" : ""}`
    + (best ? ` · ${best.n} ${best.r.name.toLowerCase()}${best.n > 1 ? "s" : ""}` : "");
  // Le pseudo du joueur en évidence (s'il en a un), puis le résumé ; sinon « Ma tenue ».
  const pseudo = getPseudo();
  if (pseudo) {
    ctx.fillStyle = text;
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(pseudo, PAD, PAD + 114);
    const w = ctx.measureText(pseudo).width;
    ctx.fillStyle = muted;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillText(` · ${summary}`, PAD + w, PAD + 114);
  } else {
    ctx.fillText(`Ma tenue · ${summary}`, PAD, PAD + 112);
  }

  // Cadre gris sombre (comme l'écran Tenue) + avatar 3D agrandi ×6, centré
  const avW = avatar.width * SCALE, avH = avatar.height * SCALE;
  const tileX = PAD, tileY = 236;
  const tileW = avW + 112, tileH = avH + 56; // cadre resserré autour de l'avatar
  const glow = ctx.createRadialGradient(tileX + tileW / 2, tileY + tileH * 0.4, 0, tileX + tileW / 2, tileY + tileH * 0.4, tileH * 0.75);
  glow.addColorStop(0, "#34353c");
  glow.addColorStop(0.6, "#2a2b31");
  glow.addColorStop(1, "#232429");
  ctx.fillStyle = glow;
  roundRect(ctx, tileX, tileY, tileW, tileH, 32);
  ctx.drawImage(avatar, tileX + (tileW - avW) / 2, tileY + (tileH - avH) / 2, avW, avH);

  // Liste des pièces, de la tête aux pieds
  const listX = tileX + tileW + 40;
  const listW = IMG_W - PAD - listX;
  let y = tileY + 8;
  for (const slotId of LIST_ORDER) {
    const slot = SLOTS.find((s) => s.id === slotId);
    const piece = outfit[slot.id];
    if (!piece) continue;
    const { colorway, rarity } = piece;
    const rarityInfo = getRarity(rarity);

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
    if (rarity === "ultime") {
      // Ultime : pastille irisée (même dégradé que la carte)
      const g = ctx.createLinearGradient(listX, 0, listX + pillW, 0);
      ["#5ae6e6", "#78a0ff", "#be78ff", "#ff78d2", "#ffc88c"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = cssColor(`--rarity-${rarity}`, muted);
    }
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

/** Identifie une tenue (emplacement → coloris + rareté), pour savoir si le lien déjà créé est encore valable. */
function outfitKey(outfit) {
  return Object.keys(outfit).sort().map((slot) => `${slot}:${outfit[slot].colorway.id}|${outfit[slot].rarity}`).join(",");
}

/** Adresse publique de la tenue : la page du jeu + ?tenue=CODE. */
function shareUrl(token) {
  return `${location.origin}${location.pathname}?tenue=${token}`;
}

/** Téléphone / tablette (écran tactile) avec menu de partage natif ; sinon : petit menu sur ordinateur. */
const isMobileShare = () => !!navigator.share && window.matchMedia("(pointer: coarse)").matches;

/**
 * Branche le bouton « Partager ma tenue » et renvoie la fonction à appeler
 * à chaque changement de tenue (elle prépare l'image à l'avance).
 */
export function setupShare() {
  const button = document.getElementById("btn-share");
  const menu = document.getElementById("share-menu");
  const status = document.getElementById("share-status");
  let pending = null; // Promise du Blob de la tenue actuelle
  let builtOn = "";   // jour + pseudo pour lesquels l'image a été préparée : si l'un change (minuit, nouveau pseudo), elle est refaite
  const stamp = () => `${todayLabel()}|${getPseudo()}`;
  let version = 0;
  let current = null; // tenue actuelle
  let link = null;    // { key, url } : lien déjà créé pour la tenue actuelle (le partage suivant est instantané)

  function update(outfit) {
    const count = Object.keys(outfit).length;
    current = count ? outfit : null;
    button.disabled = count === 0;
    status.textContent = count === 0 ? "Porte au moins une pièce pour partager ta tenue." : "";
    if (link && (!current || link.key !== outfitKey(current))) link = null;
    if (count === 0) { pending = null; closeMenu(); return; }
    const v = ++version;
    builtOn = stamp();
    pending = buildShareImage(outfit);
    pending.catch((err) => { if (v === version) console.error("Image de partage :", err); });
  }

  /** L'image prête, refaite si la date ou le pseudo ont changé depuis sa préparation. */
  function readyImage() {
    if (current && builtOn !== stamp()) {
      builtOn = stamp();
      pending = buildShareImage(current);
    }
    return pending;
  }

  /** Crée (ou retrouve) le lien de la tenue actuelle : le serveur en garde une copie. */
  async function getLink() {
    const key = outfitKey(current);
    if (!link || link.key !== key) link = { key, url: shareUrl(await createOutfitShare()) };
    return link.url;
  }

  /** Copie dans le presse-papiers ; la promesse du texte est donnée au navigateur pour que Safari accepte la copie. */
  async function copyText(textPromise) {
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        const blob = textPromise.then((t) => new Blob([t], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText(await textPromise);
      }
      return true;
    } catch (err) {
      await textPromise; // une erreur de création du lien est remontée par l'appelant
      return false;
    }
  }

  function closeMenu() { menu.hidden = true; button.setAttribute("aria-expanded", "false"); }
  function openMenu() { menu.hidden = false; button.setAttribute("aria-expanded", "true"); }

  // --- Mobile : menu de partage natif (image + lien ; le lien seul si l'image n'est pas acceptée) ---
  async function shareNative() {
    // Safari n'ouvre le menu de partage que juste après un toucher : si la création du lien l'a fait
    // expirer, le lien est gardé et le 2e toucher partage tout de suite.
    const url = await getLink();
    const text = `Regarde ma tenue sur Grail : ${url}`;
    try {
      const blob = await readyImage();
      const file = new File([blob], FILE_NAME, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Ma tenue Grail", text });
        track("share_native", { file: true });
      } else {
        await navigator.share({ title: "Ma tenue Grail", text: "Regarde ma tenue sur Grail", url });
        track("share_native", { file: false });
      }
    } catch (err) {
      if (err && err.name === "AbortError") return; // menu fermé : rien à faire
      if (err && err.name === "NotAllowedError") { showToast("Lien prêt : touche « Partager ma tenue » une 2e fois."); return; }
      // Image impossible à construire ou refusée : on partage le lien seul.
      await navigator.share({ title: "Ma tenue Grail", text: "Regarde ma tenue sur Grail", url });
    }
  }

  button.addEventListener("click", async () => {
    if (!current) return;
    if (!isMobileShare()) { menu.hidden ? openMenu() : closeMenu(); return; }
    button.disabled = true;
    try {
      await shareNative();
    } catch (err) {
      if (!err || err.name !== "AbortError") showToast(err?.message || "Partage impossible.", { error: true });
    } finally {
      button.disabled = !current;
    }
  });

  // --- Ordinateur : « Copier le lien » / « Enregistrer en image » ---
  document.getElementById("share-copy").addEventListener("click", async () => {
    closeMenu();
    if (!current) return;
    try {
      const ok = await copyText(getLink());
      if (ok) track("share_copy");
      showToast(ok ? "Lien copié." : "Copie impossible : autorise l'accès au presse-papiers.", { error: !ok });
    } catch (err) {
      showToast(err?.message || "Impossible de créer le lien.", { error: true });
    }
  });

  document.getElementById("share-save").addEventListener("click", async () => {
    closeMenu();
    if (!pending) return;
    try {
      download(await readyImage());
      track("share_image");
      showToast("Image enregistrée.");
    } catch {
      showToast("Impossible de créer l'image.", { error: true });
    }
  });

  // Le menu se ferme en touchant ailleurs ou avec Échap.
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !e.target.closest(".share")) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  return update;
}
