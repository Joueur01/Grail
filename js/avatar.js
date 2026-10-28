// avatar.js — écran « Ma tenue » : la tenue « à plat » + les 7 cases autour.
//
// Les sprites sont des icônes « catalogue » 32 × 32, pas des calques à porter.
// Au centre, on montre donc la tenue « à plat », comme une photo de fit posée
// au sol : les pièces portées sont empilées de haut en bas (tête, haut/veste,
// bas, chaussures) avec un petit espace, et l'écharpe et le sac sont posés à côté.
// Les sprites sont utilisés TELS QUELS, à leur taille réelle (×1 dans le canvas).

import { RARITIES, matchesSearch, getRarity } from "./data.js?v=70";
import { getOwnedCards, getEquipped, equip, getAvatarBody, saveAvatarBody } from "./inventory.js?v=70";
import { reportError } from "./wallet.js?v=70";
import { createCardFace, createCardShell } from "./cards.js?v=70";
import { createAvatar3D } from "./avatar3d.js?v=70";
import { hasWearModel } from "./wear-models.js?v=70";

// Les 7 emplacements.
// Les identifiants correspondent au champ "slot" de pieces.json. L'ordre de cette liste
// sert aux listes « tête → pieds » (image partagée, profil d'un ami…) : ne pas la changer.
export const SLOTS = [
  { id: "tete", name: "Tête" },
  { id: "cou", name: "Cou" },
  { id: "haut", name: "Haut" },
  { id: "veste", name: "Veste" },
  { id: "sac", name: "Sac" },
  { id: "bas", name: "Bas" },
  { id: "chaussures", name: "Chaussures" },
];

// Place des cases autour de l'avatar, de haut en bas (ordre voulu par le développeur).
const OUTFIT_LAYOUT = {
  left: ["tete", "haut", "bas", "chaussures"],
  right: ["cou", "veste", "sac"],
};

// --- La tenue à plat (mesures en pixels « logiques » du canvas) ---
const FLAT_W = 64;
const FLAT_H = 96;
const MARGIN = 2;     // marge en haut et en bas du canvas
const GAP = 2;        // espace entre deux pièces de la pile…
const MAX_OVERLAP = 4; // …qui devient un chevauchement si la tenue est trop haute
const SIDE_SHIFT = 8; // avec écharpe ou sac, la pile se décale à gauche pour leur faire de la place

// Réglage « Garçon / Fille » : enregistré sur le SERVEUR (migration 0014, visible par les amis).
// Le navigateur en garde une copie, utilisée seulement si le serveur ne connaît pas encore ce réglage.
const BODY_KEY = "grail_avatar_body";
/** Avatar choisi (Garçon / Fille) : celui du serveur, sinon la copie du navigateur. Sert aussi au Videur. */
export function readBodyChoice() {
  const fromServer = getAvatarBody();
  if (fromServer) return fromServer;
  try {
    return localStorage.getItem(BODY_KEY) === "femme" ? "femme" : "homme";
  } catch {
    return "homme"; // stockage indisponible : sans importance
  }
}
function saveBodyChoice(type) {
  try {
    localStorage.setItem(BODY_KEY, type);
  } catch {
    // stockage indisponible : sans importance
  }
}

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
  const pickerCount = document.getElementById("picker-count");
  const searchInput = document.getElementById("picker-search");
  const brandSelect = document.getElementById("picker-brand");
  const raritySelect = document.getElementById("picker-rarity");
  const sortSelect = document.getElementById("picker-sort");
  let currentSlot = null;

  const rarityRank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const catalogueOrder = new Map(catalogue.colorways.map((c, i) => [c.id, i]));

  // Menus de filtres du panneau (la 1re option « Marque », « Rareté » = tout afficher).
  fillSelect(brandSelect, catalogue.brands);
  fillSelect(raritySelect, [...RARITIES].reverse()); // Légendaire en premier

  const canvas = document.getElementById("avatar-canvas");
  const hint = document.getElementById("outfit-hint");
  // Avatar 3D : seules les pièces qui ont déjà un modèle 3D sont portées dessus,
  // les autres sont listées sous l'avatar (« Pas encore en 3D : … »).
  const avatar3d = createAvatar3D(document.getElementById("avatar-3d"));
  const note3d = document.getElementById("outfit-3d-note");
  // Vue 3D : cadre gris sombre + outils (Garçon / Fille…) ; vue « à plat » : cadre clair (les contours noirs des sprites).
  const frame = document.querySelector(".outfit-body");
  const tools3d = document.getElementById("outfit-3d-tools");
  const viewTabs = document.querySelectorAll(".outfit-switch .view-tab");
  const syncView = (is3d) => {
    frame.classList.toggle("is-3d", is3d);
    tools3d.hidden = !is3d;
  };
  // On lit la vue choisie sur l'onglet touché (l'état des onglets est mis à jour par un autre code, après celui-ci).
  for (const tab of viewTabs) tab.addEventListener("click", () => syncView(tab.dataset.view === "avatar3d"));
  syncView(true); // la vue 3D est affichée au départ
  // Garçon / Fille : enregistré sur le serveur (les amis voient le bon avatar sur ton profil).
  let bodyType = readBodyChoice();
  const bodyButtons = document.querySelectorAll(".body-tab");
  for (const btn of bodyButtons) {
    btn.addEventListener("click", () => {
      bodyType = btn.dataset.body;
      saveBodyChoice(bodyType);
      render();
      // Si la migration 0014 n'est pas encore exécutée, le choix reste seulement dans ce navigateur.
      saveAvatarBody(bodyType).catch((err) => console.warn("Avatar :", err.message));
    });
  }

  /** Redessine les 7 cases de la fiche et la tenue à plat. */
  function render() {
    leftCol.replaceChildren();
    rightCol.replaceChildren();
    const worn = {};   // emplacement → coloris porté (pour le dessin)
    const outfit = {}; // emplacement → { colorway, rarity } (pour l'image partagée)
    const slotButtons = new Map(); // emplacement → bouton de la case
    for (const slot of SLOTS) {
      const card = getEquipped(slot.id);
      const colorway = card && catalogue.colorwayById.get(card.colorwayId);
      if (colorway) {
        worn[slot.id] = colorway;
        outfit[slot.id] = { colorway, rarity: card.rarity };
      }
      slotButtons.set(slot.id, createSlotButton(slot, colorway, card));
    }
    // Les cases sont posées dans l'ordre de OUTFIT_LAYOUT, pas dans celui de SLOTS.
    leftCol.append(...OUTFIT_LAYOUT.left.map((id) => slotButtons.get(id)));
    rightCol.append(...OUTFIT_LAYOUT.right.map((id) => slotButtons.get(id)));
    const count = Object.keys(worn).length;
    summary.textContent = `${count} / ${SLOTS.length} pièces portées`;
    hint.hidden = count > 0; // invitation affichée tant que rien n'est porté
    drawAvatar(canvas, worn).catch((err) => console.error("Tenue :", err));
    for (const btn of bodyButtons) btn.setAttribute("aria-pressed", String(btn.dataset.body === bodyType));
    avatar3d.setOutfit(worn, { type: bodyType }).catch((err) => console.error("Avatar 3D :", err));
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

  /** Ouvre le panneau avec les cartes possédées pour cet emplacement (filtres remis à zéro). */
  function openPicker(slot) {
    currentSlot = slot;
    pickerTitle.textContent = slot.name;
    searchInput.value = "";
    brandSelect.value = "";
    raritySelect.value = "";
    sortSelect.value = "rarity";
    picker.hidden = false;
    renderPicker();
    pickerGrid.parentElement.scrollTop = 0;
  }

  /** Dessine la liste : la pièce PORTÉE d'abord (si elle correspond aux filtres), puis le reste trié. */
  function renderPicker() {
    const slot = currentSlot;
    if (!slot) return;
    const equipped = getEquipped(slot.id);
    const isWorn = (c) => equipped && equipped.colorwayId === c.colorwayId && equipped.rarity === c.rarity;

    const all = getOwnedCards()
      .filter((c) => catalogue.colorwayById.get(c.colorwayId)?.piece.slot === slot.id);
    const byRarity = (a, b) => (rarityRank.get(b.rarity) - rarityRank.get(a.rarity))
      || (catalogueOrder.get(a.colorwayId) - catalogueOrder.get(b.colorwayId));
    const byName = (a, b) => {
      const ca = catalogue.colorwayById.get(a.colorwayId), cb = catalogue.colorwayById.get(b.colorwayId);
      return ca.piece.name.localeCompare(cb.piece.name, "fr") || ca.name.localeCompare(cb.name, "fr") || byRarity(a, b);
    };
    const byCatalogue = (a, b) => (catalogueOrder.get(a.colorwayId) - catalogueOrder.get(b.colorwayId))
      || (rarityRank.get(b.rarity) - rarityRank.get(a.rarity));
    const sorter = { rarity: byRarity, name: byName, catalogue: byCatalogue }[sortSelect.value] || byRarity;

    const choices = all
      .filter((c) => {
        const colorway = catalogue.colorwayById.get(c.colorwayId);
        return matchesSearch(searchInput.value, [colorway.piece.name, colorway.name, colorway.brand.name, getRarity(c.rarity).name])
          && (!brandSelect.value || colorway.brand.id === brandSelect.value)
          && (!raritySelect.value || c.rarity === raritySelect.value);
      })
      // La pièce portée passe toujours en premier ; le tri choisi s'applique au reste.
      .sort((a, b) => (isWorn(b) - isWorn(a)) || sorter(a, b));

    pickerGrid.replaceChildren(...choices.map((c) => {
      const colorway = catalogue.colorwayById.get(c.colorwayId);
      const worn = isWorn(c);
      // Chaque carte est un bouton : la toucher l'équipe ; toucher la pièce portée la retire.
      const btn = document.createElement("button");
      btn.className = "picker-choice";
      btn.setAttribute("aria-pressed", String(!!worn));
      btn.setAttribute("aria-label", `${colorway.piece.name}, ${colorway.name}, ${getRarity(c.rarity).name}`
        + (worn ? " : portée, toucher pour la retirer" : ""));
      const card = createCardShell(colorway, c.rarity);
      card.classList.add("owned");
      card.append(createCardFace(colorway, c.rarity));
      if (worn) {
        card.classList.add("equipped");
        const tag = document.createElement("span");
        tag.className = "worn-tag";
        tag.textContent = "✓ Portée";
        card.append(tag);
      }
      btn.append(card);
      btn.addEventListener("click", async () => {
        closePicker();
        await changeSlot(slot.id, worn ? null : c);
      });
      return btn;
    }));

    const shown = choices.length;
    pickerCount.textContent = all.length
      ? `${shown} / ${all.length} pièce${all.length > 1 ? "s" : ""}${equipped ? " · touche la pièce portée pour la retirer" : ""}`
      : "";
    pickerEmpty.hidden = shown > 0;
    pickerEmpty.textContent = all.length
      ? "Aucune pièce ne correspond à ta recherche."
      : "Tu n'as pas encore de pièce pour cet emplacement. Ouvre des boosters !";
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

  // Filtres : la liste se redessine à chaque frappe ou changement de menu.
  for (const el of [searchInput, brandSelect, raritySelect, sortSelect]) el.addEventListener("input", renderPicker);
  document.getElementById("picker-close").addEventListener("click", closePicker);
  // Toucher le fond sombre (en dehors du panneau) ferme aussi.
  picker.addEventListener("click", (e) => { if (e.target === picker) closePicker(); });

  render();
  return render;
}

/** Ajoute une <option> par élément { id, name } (après l'option « tout »). */
function fillSelect(select, items) {
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  }
}
