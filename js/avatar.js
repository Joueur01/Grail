// avatar.js — écran « Ma tenue » : fiche de tenue.
//
// Les sprites sont des icônes « catalogue » 32 × 32 qui ne se superposent pas
// sur un corps. On affiche donc une silhouette neutre au centre, et une case
// par emplacement autour d'elle (section 7 du CLAUDE.md, option validée).

import { RARITIES } from "./data.js?v=13";
import { getOwnedCards, getEquipped, equip } from "./inventory.js?v=13";
import { createCardFace, createCardShell } from "./cards.js?v=13";

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

// Ordre de dessin des emplacements, du fond vers le premier plan
// (servira si un jour on dessine des versions « portées »).
export const DRAW_ORDER = ["bas", "chaussures", "haut", "veste", "cou", "tete", "sac"];

/** Dessine la silhouette dans le canvas (32 × 48, net, sans lissage). */
export function initAvatar(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawSilhouette(ctx, canvas.width, canvas.height);
  return ctx;
}

// Silhouette neutre et non genrée, en attendant un vrai corps de base (assets/avatar/).
function drawSilhouette(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#4a4a55";
  ctx.fillRect(12, 2, 8, 8);    // tête
  ctx.fillRect(14, 10, 4, 2);   // cou
  ctx.fillRect(10, 12, 12, 15); // torse
  ctx.fillRect(6, 13, 3, 14);   // bras gauche
  ctx.fillRect(23, 13, 3, 14);  // bras droit
  ctx.fillRect(11, 27, 4, 17);  // jambe gauche
  ctx.fillRect(17, 27, 4, 17);  // jambe droite
  ctx.fillRect(10, 44, 5, 2);   // pied gauche
  ctx.fillRect(17, 44, 5, 2);   // pied droit
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

  /** Redessine les 7 cases de la fiche. */
  function render() {
    leftCol.replaceChildren();
    rightCol.replaceChildren();
    let filled = 0;
    for (const slot of SLOTS) {
      const card = getEquipped(slot.id);
      const colorway = card && catalogue.colorwayById.get(card.colorwayId);
      if (colorway) filled++;
      (slot.side === "left" ? leftCol : rightCol).append(createSlotButton(slot, colorway, card));
    }
    summary.textContent = `${filled} / ${SLOTS.length} pièces portées`;
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
