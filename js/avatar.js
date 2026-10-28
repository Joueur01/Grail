// avatar.js — écran « Ma tenue » : la tenue « à plat » + les 7 cases autour.
//
// Les sprites sont des icônes « catalogue » 32 × 32, pas des calques à porter.
// Au centre, on montre donc la tenue « à plat », comme une photo de fit posée
// au sol : les pièces portées sont empilées de haut en bas (tête, haut/veste,
// bas, chaussures) avec un petit espace, et l'écharpe et le sac sont posés à côté.
// Les sprites sont utilisés TELS QUELS, à leur taille réelle (×1 dans le canvas).

import { RARITIES } from "./data.js?v=49";
import { getOwnedCards, getEquipped, equip } from "./inventory.js?v=49";
import { reportError } from "./wallet.js?v=49";
import { createCardFace, createCardShell } from "./cards.js?v=49";
import { createAvatar3D } from "./avatar3d.js?v=49";
import { hasWearModel } from "./wear-models.js?v=49";

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

// --- La tenue à plat (mesures en pixels « logiques » du canvas) ---
const FLAT_W = 64;
const FLAT_H = 96;
const MARGIN = 2;     // marge en haut et en bas du canvas
const GAP = 2;        // espace entre deux pièces de la pile…
const MAX_OVERLAP = 4; // …qui devient un chevauchement si la tenue est trop haute
const SIDE_SHIFT = 8; // avec écharpe ou sac, la pile se décale à gauche pour leur faire de la place

/** Prépare le canvas (64 × 96, net, sans lissage). */
export function initAvatar(canvas) {
  canvas.width = FLAT_W;
  canvas.height = FLAT_H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return ctx;
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

/** Dessine la zone utile d'un sprite à (x, y). */
function drawPiece(ctx, { img, box }, x, y) {
  ctx.drawImage(img, box.x, box.y, box.w, box.h, x, y, box.w, box.h);
}

// Numéro du dernier dessin demandé, PAR canvas : évite qu'un ancien dessin
// (images plus lentes) écrase le plus récent. Un compteur par canvas, car
// l'écran et l'image partagée dessinent chacun dans le leur.
const drawTokens = new WeakMap();

/**
 * Dessine la tenue à plat dans le canvas.
 * - pieces : { emplacement: coloris du catalogue } pour les pièces portées
 * Renvoie le nombre de pièces dessinées.
 */
export async function drawAvatar(canvas, pieces) {
  const token = (drawTokens.get(canvas) || 0) + 1;
  drawTokens.set(canvas, token);
  const loaded = {};
  for (const slot of Object.keys(pieces)) loaded[slot] = await loadSprite(pieces[slot].sprite);
  if (token !== drawTokens.get(canvas)) return 0; // un dessin plus récent a été demandé entre-temps

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, FLAT_W, FLAT_H);

  // 1. La pile centrale, de haut en bas. Le haut et la veste occupent la même
  //    « marche » : la veste est posée par-dessus le haut.
  const rows = [];
  if (loaded.tete) rows.push([loaded.tete]);
  const torso = [loaded.haut, loaded.veste].filter(Boolean);
  if (torso.length) rows.push(torso);
  if (loaded.bas) rows.push([loaded.bas]);
  if (loaded.chaussures) rows.push([loaded.chaussures]);

  // 2. Ce qui est posé à côté (à droite) : l'écharpe, puis le sac.
  const side = [loaded.cou, loaded.sac].filter(Boolean);

  // Hauteur d'une marche = celle de sa pièce la plus haute.
  const rowHeight = (row) => Math.max(...row.map((sprite) => sprite.box.h));
  const sum = rows.reduce((total, row) => total + rowHeight(row), 0);
  // Espace entre les marches : GAP si ça tient, sinon on resserre (jusqu'à se chevaucher).
  const gaps = Math.max(rows.length - 1, 1);
  const spacing = Math.max(-MAX_OVERLAP, Math.min(GAP, Math.floor((FLAT_H - 2 * MARGIN - sum) / gaps)));
  const total = sum + spacing * (rows.length - 1);
  const centerX = side.length ? FLAT_W / 2 - SIDE_SHIFT : FLAT_W / 2;
  let y = Math.max(0, Math.floor((FLAT_H - total) / 2)); // pile centrée verticalement

  for (const row of rows) {
    // Chaque pièce est centrée horizontalement, calée en haut de sa marche.
    for (const sprite of row) drawPiece(ctx, sprite, Math.round(centerX - sprite.box.w / 2), y);
    y += rowHeight(row) + spacing;
  }

  // Les pièces posées à côté : collées au bord droit, empilées, centrées en hauteur
  // (un peu plus bas que le milieu, au niveau du haut et du bas de la tenue).
  const sideTotal = side.reduce((t, sprite) => t + sprite.box.h, 0) + GAP * (side.length - 1);
  let sy = Math.max(0, Math.floor((FLAT_H - sideTotal) / 2) + 4);
  for (const sprite of side) {
    drawPiece(ctx, sprite, FLAT_W - sprite.box.w, sy);
    sy += sprite.box.h + GAP;
  }
  return Object.keys(loaded).length;
}

/**
 * Branche la fiche de tenue et renvoie une fonction pour la redessiner.
 * - catalogue : résultat de loadCatalogue()
 * - onChange : appelé avec la tenue { emplacement: { colorway, rarity } }
 *   à chaque changement (sert à préparer l'image à partager)
 */
export function setupOutfit({ catalogue, onChange }) {
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
  const hint = document.getElementById("outfit-hint");
  // Avatar 3D : seules les pièces qui ont déjà un modèle 3D sont portées dessus,
  // les autres sont listées sous l'avatar (« Pas encore en 3D : … »).
  const avatar3d = createAvatar3D(document.getElementById("avatar-3d"));
  const note3d = document.getElementById("outfit-3d-note");

  /** Redessine les 7 cases de la fiche et la tenue à plat. */
  function render() {
    leftCol.replaceChildren();
    rightCol.replaceChildren();
    const worn = {};   // emplacement → coloris porté (pour le dessin)
    const outfit = {}; // emplacement → { colorway, rarity } (pour l'image partagée)
    for (const slot of SLOTS) {
      const card = getEquipped(slot.id);
      const colorway = card && catalogue.colorwayById.get(card.colorwayId);
      if (colorway) {
        worn[slot.id] = colorway;
        outfit[slot.id] = { colorway, rarity: card.rarity };
      }
      (slot.side === "left" ? leftCol : rightCol).append(createSlotButton(slot, colorway, card));
    }
    const count = Object.keys(worn).length;
    summary.textContent = `${count} / ${SLOTS.length} pièces portées`;
    hint.hidden = count > 0; // invitation affichée tant que rien n'est porté
    drawAvatar(canvas, worn).catch((err) => console.error("Tenue :", err));
    avatar3d.setOutfit(worn).catch((err) => console.error("Avatar 3D :", err));
    const flatOnly = Object.values(worn).filter((c) => !hasWearModel(c.piece.id));
    note3d.hidden = flatOnly.length === 0;
    note3d.textContent = `Pas encore en 3D : ${flatOnly.map((c) => c.piece.name).join(", ")}`;
    onChange?.(outfit);
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
      btn.addEventListener("click", async () => {
        closePicker();
        await changeSlot(slot.id, c);
      });
      return btn;
    }));

    pickerEmpty.hidden = choices.length > 0;
    removeBtn.hidden = !equipped;
    picker.hidden = false;
  }

  /** Change la tenue : le SERVEUR vérifie (carte possédée, bon emplacement) puis on relit et on redessine. */
  async function changeSlot(slotId, card) {
    try {
      await equip(slotId, card);
    } catch (err) {
      reportError(err);
    }
    render();
  }

  function closePicker() {
    picker.hidden = true;
    currentSlot = null;
  }

  removeBtn.addEventListener("click", async () => {
    const slotId = currentSlot?.id;
    closePicker();
    if (slotId) await changeSlot(slotId, null);
  });
  document.getElementById("picker-close").addEventListener("click", closePicker);
  // Toucher le fond sombre (en dehors du panneau) ferme aussi.
  picker.addEventListener("click", (e) => { if (e.target === picker) closePicker(); });

  render();
  return render;
}
