// avatar.js — écran « Ma tenue » : le bonhomme habillé + les 7 cases autour.
//
// Les vêtements sont dessinés TELS QUELS (mêmes sprites 32 × 32 que dans la
// collection) sur un bonhomme « mannequin » de 64 × 96 pixels. Chaque pièce est
// placée selon sa zone réellement dessinée : le bas du bonnet sur la tête, le
// haut du vêtement au cou, le haut du pantalon à la taille, les chaussures au sol…

import { RARITIES } from "./data.js?v=14";
import { getOwnedCards, getEquipped, equip } from "./inventory.js?v=14";
import { createCardFace, createCardShell } from "./cards.js?v=14";

// Les 7 emplacements, avec leur colonne sur la fiche.
// Les identifiants correspondent au champ "slot" de pieces.json.
export const SLOTS = [
  { id: "tete", name: "Tête", side: "left" },
  { id: "cou", name: "Cou", side: "left" },
  { id: "haut", name: "Haut", side: "left" },
  { id: "veste", name: "Veste", side: "left" },
  { id: "sac", name: "Sac", side: "right" },
  { id: "bas", name: "Bas", side: "right" },
  { id: "chaussures", name: "Chaussures", side: "right" },
];

// Ordre de dessin des emplacements, du fond vers le premier plan.
export const DRAW_ORDER = ["bas", "chaussures", "haut", "veste", "cou", "tete", "sac"];

// --- Le bonhomme (toutes les mesures sont en pixels « logiques ») ---
const AVATAR_W = 64;
const AVATAR_H = 96;
const CX = 26;        // axe du corps (décalé à gauche : le sac pend à droite)
const HEAD_TOP = 4;   // haut de la tête
const NECK = 21;      // les hauts et vestes commencent ici
const WAIST = 43;     // les bas commencent ici
const GROUND = 91;    // le dessous des chaussures touche ici
const SKIN = "#7a746c";    // gris « mannequin », neutre et non genré
const OUTLINE = "#141414"; // contour noir, comme les sprites

/** Prépare le canvas (64 × 96, net, sans lissage) et dessine le bonhomme sans vêtements. */
export function initAvatar(canvas) {
  canvas.width = AVATAR_W;
  canvas.height = AVATAR_H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawBody(ctx, false);
  return ctx;
}

/** Rectangle avec un contour noir d'1 pixel (x1, y1 inclus). */
function block(ctx, x0, y0, x1, y1) {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  ctx.fillStyle = SKIN;
  ctx.fillRect(x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1);
}

/**
 * Dessine le corps. covered = true quand un haut ou une veste est porté :
 * on ne dessine alors ni le torse ni les bras (sinon ils dépassent autour
 * du vêtement), seulement les mains.
 */
function drawBody(ctx, covered) {
  ctx.clearRect(0, 0, AVATAR_W, AVATAR_H);
  block(ctx, CX - 7, HEAD_TOP, CX + 6, HEAD_TOP + 15);          // tête 14 × 16
  for (const [x, y] of [[CX - 7, HEAD_TOP], [CX + 6, HEAD_TOP], [CX - 7, HEAD_TOP + 15], [CX + 6, HEAD_TOP + 15]]) {
    ctx.clearRect(x, y, 1, 1);                                   // coins arrondis
  }
  block(ctx, CX - 2, 18, CX + 1, 23);                            // cou
  if (!covered) {
    block(ctx, CX - 9, 22, CX + 8, 46);                          // torse
    block(ctx, CX - 14, 23, CX - 9, 46);                         // bras gauche
    block(ctx, CX + 8, 23, CX + 13, 46);                         // bras droit
  }
  block(ctx, CX - 15, 45, CX - 10, 49);                          // main gauche
  block(ctx, CX + 9, 45, CX + 14, 49);                           // main droite
  block(ctx, CX - 8, 45, CX - 1, 86);                            // jambe gauche
  block(ctx, CX, 45, CX + 7, 86);                                // jambe droite
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(CX - 4, 11, 1, 1);                                // yeux : 2 pixels
  ctx.fillRect(CX + 2, 11, 1, 1);
}

// --- Chargement des sprites + calcul de leur zone dessinée (mise en cache) ---
const spriteCache = new Map();

/** Charge un sprite et calcule sa zone non transparente { x, y, w, h }. */
function loadSprite(src) {
  if (!spriteCache.has(src)) {
    spriteCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const cctx = c.getContext("2d");
        cctx.drawImage(img, 0, 0);
        const { data } = cctx.getImageData(0, 0, c.width, c.height);
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (data[(y * c.width + x) * 4 + 3] > 0) {
              x0 = Math.min(x0, x); x1 = Math.max(x1, x);
              y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
          }
        }
        resolve({ img, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
      };
      img.onerror = reject;
      img.src = src;
    }));
  }
  return spriteCache.get(src);
}

/** Position (coin haut-gauche de la zone dessinée) d'une pièce selon son emplacement. */
function anchor(slot, box) {
  switch (slot) {
    case "tete": return { x: CX - Math.floor(box.w / 2), y: HEAD_TOP + 9 - box.h }; // couvre le haut de la tête
    case "haut":
    case "veste": return { x: CX - Math.floor(box.w / 2), y: NECK };
    case "cou": return { x: CX - Math.floor(box.w / 2), y: NECK - 2 };
    case "bas": return { x: CX - Math.floor(box.w / 2), y: WAIST };
    case "chaussures": return { x: CX - Math.floor(box.w / 2), y: GROUND - box.h };
    case "sac": return { x: AVATAR_W - box.w, y: 46 - Math.floor(box.h / 2) };     // pend à la main droite
  }
}

/** Dessine la zone utile d'un sprite à (x, y) ; flip = retourné horizontalement. */
function drawPiece(ctx, { img, box }, x, y, flip = false) {
  if (flip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, box.x, box.y, box.w, box.h, -x - box.w, y, box.w, box.h);
    ctx.restore();
  } else {
    ctx.drawImage(img, box.x, box.y, box.w, box.h, x, y, box.w, box.h);
  }
}

let drawToken = 0; // évite qu'un ancien dessin (images plus lentes) écrase le plus récent

/**
 * Dessine le bonhomme habillé.
 * - pieces : { emplacement: coloris du catalogue } pour les pièces portées
 */
export async function drawAvatar(canvas, pieces) {
  const token = ++drawToken;
  const loaded = {};
  for (const slot of DRAW_ORDER) {
    if (pieces[slot]) loaded[slot] = await loadSprite(pieces[slot].sprite);
  }
  if (token !== drawToken) return; // un dessin plus récent a été demandé entre-temps

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawBody(ctx, Boolean(loaded.haut || loaded.veste));
  for (const slot of DRAW_ORDER) {
    const sprite = loaded[slot];
    if (!sprite) continue;
    const { x, y } = anchor(slot, sprite.box);
    if (slot === "chaussures") {
      // Une paire : la chaussure gauche retournée, la droite normale, un peu décalées.
      drawPiece(ctx, sprite, x - 6, y, true);
      drawPiece(ctx, sprite, x + 6, y);
    } else {
      drawPiece(ctx, sprite, x, y);
    }
  }
}

/**
 * Branche la fiche de tenue et renvoie une fonction pour la redessiner.
 * - catalogue : résultat de loadCatalogue()
 */
export function setupOutfit({ catalogue }) {
  const leftCol = document.getElementById("outfit-left");
  const rightCol = document.getElementById("outfit-right");
  const summary = document.getElementById("outfit-summary");

  // Panneau de choix (s'ouvre par le bas)
  const picker = document.getElementById("picker");
  const pickerTitle = document.getElementById("picker-title");
  const pickerGrid = document.getElementById("picker-grid");
  const pickerEmpty = document.getElementById("picker-empty");
  const removeBtn = document.getElementById("picker-remove");
  let currentSlot = null;

  const rarityRank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const catalogueOrder = new Map(catalogue.colorways.map((c, i) => [c.id, i]));

  const canvas = document.getElementById("avatar-canvas");

  /** Redessine les 7 cases de la fiche et le bonhomme habillé. */
  function render() {
    leftCol.replaceChildren();
    rightCol.replaceChildren();
    const worn = {}; // emplacement → coloris porté
    for (const slot of SLOTS) {
      const card = getEquipped(slot.id);
      const colorway = card && catalogue.colorwayById.get(card.colorwayId);
      if (colorway) worn[slot.id] = colorway;
      (slot.side === "left" ? leftCol : rightCol).append(createSlotButton(slot, colorway, card));
    }
    summary.textContent = `${Object.keys(worn).length} / ${SLOTS.length} pièces portées`;
    drawAvatar(canvas, worn).catch((err) => console.error("Avatar :", err));
  }

  /** Une case de la fiche : l'icône équipée (ou vide) + le nom de l'emplacement. */
  function createSlotButton(slot, colorway, card) {
    const btn = document.createElement("button");
    btn.className = "slot";
    btn.setAttribute("aria-label", colorway
      ? `${slot.name} : ${colorway.piece.name}, ${colorway.name}`
      : `${slot.name} : vide`);
    if (colorway) btn.dataset.rarity = card.rarity;

    const tile = document.createElement("span");
    tile.className = "slot-tile";
    if (colorway) {
      const img = document.createElement("img");
      img.className = "pixel";
      img.src = colorway.sprite;
      img.width = 32;
      img.height = 32;
      img.alt = "";
      tile.append(img);
    } else {
      tile.textContent = "+";
    }

    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = slot.name;

    btn.append(tile, label);
    btn.addEventListener("click", () => openPicker(slot));
    return btn;
  }

  /** Ouvre le panneau avec les cartes possédées pour cet emplacement. */
  function openPicker(slot) {
    currentSlot = slot;
    pickerTitle.textContent = slot.name;
    const equipped = getEquipped(slot.id);

    const choices = getOwnedCards()
      .filter((c) => catalogue.colorwayById.get(c.colorwayId)?.piece.slot === slot.id)
      // La plus rare d'abord, puis l'ordre du catalogue.
      .sort((a, b) => (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
        || (catalogueOrder.get(a.colorwayId) - catalogueOrder.get(b.colorwayId)));

    pickerGrid.replaceChildren(...choices.map((c) => {
      const colorway = catalogue.colorwayById.get(c.colorwayId);
      // Chaque carte est un bouton : la toucher l'équipe.
      const btn = document.createElement("button");
      btn.className = "picker-choice";
      const card = createCardShell(colorway, c.rarity);
      card.classList.add("owned");
      if (equipped && equipped.colorwayId === c.colorwayId && equipped.rarity === c.rarity) {
        card.classList.add("equipped");
      }
      card.append(createCardFace(colorway, c.rarity));
      btn.append(card);
      btn.addEventListener("click", () => {
        equip(slot.id, c);
        closePicker();
        render();
      });
      return btn;
    }));

    pickerEmpty.hidden = choices.length > 0;
    removeBtn.hidden = !equipped;
    picker.hidden = false;
  }

  function closePicker() {
    picker.hidden = true;
    currentSlot = null;
  }

  removeBtn.addEventListener("click", () => {
    if (currentSlot) equip(currentSlot.id, null);
    closePicker();
    render();
  });
  document.getElementById("picker-close").addEventListener("click", closePicker);
  // Toucher le fond sombre (en dehors du panneau) ferme aussi.
  picker.addEventListener("click", (e) => { if (e.target === picker) closePicker(); });

  render();
  return render;
}
