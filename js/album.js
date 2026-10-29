// album.js — vue « Album » de l'écran Collection : une vraie collection, case par case.
//
// ⚠️ Le serveur est la source de vérité (migration 0022). Ce fichier affiche l'album lu sur le serveur
// et appelle `album_add` ; il ne décide de rien (ni de l'obtention d'un Ultime, ni des règles).
// Règles (section 6 bis du CLAUDE.md) :
//   - l'album commence vide ; on y place les cartes qu'on veut, UNE SEULE par case
//     (une case = un coloris + une rareté) ;
//   - c'est DÉFINITIF : la carte quitte la collection et n'est plus utilisable ;
//   - un modèle complet (tous ses coloris × toutes ses raretés) donne son ULTIME : une carte unique
//     (rareté « Ultime »), ni vendable ni échangeable, mais qui se porte et se met en vitrine.

import { RARITIES, getRarity, matchesSearch } from "./data.js?v=89";
import {
  getAlbumState, addToAlbum, countCard, isLocked, getShowcaseKeys, isCardEquipped, equip, cardKey,
} from "./inventory.js?v=89";
import { createCardFace, createCardShell } from "./cards.js?v=89";
import { reportError, showToast } from "./wallet.js?v=89";
import { playSound, vibrate, burst } from "./effects.js?v=89";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Image d'un sprite (pixel art : toujours agrandie par un facteur entier, voir style.css). */
function sprite(src) {
  const img = el("img", "pixel");
  img.src = src;
  img.width = 32;
  img.height = 32;
  img.alt = "";
  img.loading = "lazy";
  return img;
}

/**
 * Branche la vue Album et renvoie une fonction pour la redessiner.
 * - catalogue : résultat de loadCatalogue()
 * - onChange : appelé quand la collection a changé (une carte est partie dans l'album)
 */
export function setupAlbum({ catalogue, onChange }) {
  const list = document.getElementById("album-list");
  const intro = document.getElementById("album-intro");
  const unavailable = document.getElementById("album-unavailable");
  const searchInput = document.getElementById("search-album");
  const brandSelect = document.getElementById("album-brand");
  const sortSelect = document.getElementById("album-sort");
  const sheet = document.getElementById("card-sheet");
  const sheetTitle = document.getElementById("card-sheet-title");
  const sheetBody = document.getElementById("card-sheet-body");
  const open = new Set(); // modèles dépliés (gardés quand la liste est redessinée)
  const ultimateOf = new Map(catalogue.ultimates.map((u) => [u.piece.id, u]));
  const catalogueOrder = new Map(catalogue.pieces.map((p, i) => [p.id, i]));

  for (const brand of catalogue.brands) {
    const option = document.createElement("option");
    option.value = brand.id;
    option.textContent = brand.name;
    brandSelect.append(option);
  }

  /** Cases d'un modèle : un coloris × chaque rareté. */
  const slotsOf = (piece) => piece.colorways.flatMap((cw) => RARITIES.map((r) => ({ cw, rarity: r.id, key: cardKey(cw.id, r.id) })));

  function render() {
    const album = getAlbumState();
    unavailable.hidden = album.available;
    intro.hidden = !album.available;
    if (!album.available) { list.replaceChildren(); return; }

    // Cartes possédées qu'on pourrait placer (info d'affichage).
    let placeable = 0;
    for (const piece of catalogue.pieces) {
      for (const s of slotsOf(piece)) if (!album.cards.has(s.key) && countCard(s.cw.id, s.rarity) > 0) placeable++;
    }
    const total = catalogue.colorways.length * RARITIES.length; // 75 × 4 = 300
    intro.textContent = `${album.cards.size} / ${total} cases remplies · ${album.ultimates.size} / ${catalogue.pieces.length} Ultimes`
      + (placeable ? ` · ${placeable} carte${placeable > 1 ? "s" : ""} à placer` : "");

    const rows = catalogue.pieces
      .map((piece) => {
        const slots = slotsOf(piece);
        const have = slots.filter((s) => album.cards.has(s.key)).length;
        return { piece, slots, have, total: slots.length, brand: catalogue.brands.find((b) => b.id === piece.brand) };
      })
      .filter(({ piece, brand }) => matchesSearch(searchInput.value, [piece.name, brand.name, ...piece.colorways.map((c) => c.name)])
        && (!brandSelect.value || piece.brand === brandSelect.value))
      .sort((a, b) => {
        if (sortSelect.value === "name") return a.piece.name.localeCompare(b.piece.name, "fr");
        if (sortSelect.value === "catalogue") return catalogueOrder.get(a.piece.id) - catalogueOrder.get(b.piece.id);
        // Progrès : le plus avancé d'abord (puis l'ordre du catalogue)
        return (b.have / b.total - a.have / a.total) || (catalogueOrder.get(a.piece.id) - catalogueOrder.get(b.piece.id));
      });

    const scroller = list.closest("main");
    const keepScroll = scroller ? scroller.scrollTop : 0;
    list.replaceChildren(...rows.map((row) => pieceBlock(row, album)));
    if (scroller) scroller.scrollTop = keepScroll;
  }

  /** Un modèle : en-tête (Ultime à débloquer, progression) et, une fois déplié, ses cases. */
  function pieceBlock({ piece, slots, have, total, brand }, album) {
    const ultimate = ultimateOf.get(piece.id);
    const unlocked = album.ultimates.has(piece.id);
    const block = el("section", "album-piece");
    block.dataset.brand = piece.brand;
    block.classList.toggle("complete", unlocked);

    const head = el("button", "album-head");
    head.type = "button";
    head.setAttribute("aria-expanded", String(open.has(piece.id)));
    head.setAttribute("aria-label", `${piece.name}, ${have} sur ${total}${unlocked ? ", Ultime obtenu" : ""}`);
    const tile = el("span", "album-ult");
    tile.classList.toggle("locked", !unlocked);
    tile.append(sprite(ultimate.sprite));
    const titles = el("span", "album-title");
    titles.append(el("span", "card-brand", brand.name), el("span", "album-name", piece.name));
    const progress = el("span", "album-progress");
    const bar = el("span", "stat-bar");
    const fill = el("span", "stat-bar-fill");
    fill.style.width = `${(have / total) * 100}%`;
    bar.append(fill);
    progress.append(bar, el("span", "album-count", unlocked ? "Ultime obtenu" : `${have} / ${total}`));
    titles.append(progress);
    head.append(tile, titles, el("span", "album-chevron", "›"));
    block.append(head);

    const body = el("div", "album-body");
    body.hidden = !open.has(piece.id);
    head.addEventListener("click", () => {
      const now = body.hidden;
      body.hidden = !now;
      head.setAttribute("aria-expanded", String(now));
      if (now) open.add(piece.id); else open.delete(piece.id);
    });

    // Bandeau Ultime : à gagner, ou obtenu (on peut le porter tout de suite).
    const banner = el("div", "album-banner");
    if (unlocked) {
      banner.append(el("p", "album-banner-text", "Tu as l'Ultime de ce modèle : unique, il ne se vend pas et ne s'échange pas. Porte-le ou mets-le en vitrine."));
      const wear = el("button", "btn btn-primary", "Porter l'Ultime");
      wear.type = "button";
      wear.addEventListener("click", () => wearUltimate(ultimate));
      banner.append(wear);
    } else {
      banner.append(el("p", "album-banner-text",
        `Remplis les ${total} cases (${piece.colorways.length} coloris × ${RARITIES.length} raretés) pour obtenir l'Ultime de ce modèle.`));
    }
    body.append(banner);

    for (const cw of piece.colorways) {
      const line = el("div", "album-colorway");
      line.append(el("span", "album-colorway-name", cw.name));
      const cells = el("div", "album-cells");
      for (const r of RARITIES) cells.append(cell({ ...cw, piece, brand }, r.id, album));
      line.append(cells);
      body.append(line);
    }
    block.append(body);
    return block;
  }

  /** Une case : remplie (dans l'album), à placer (carte possédée) ou vide. */
  function cell(colorway, rarity, album) {
    const key = cardKey(colorway.id, rarity);
    const filled = album.cards.has(key);
    const owned = countCard(colorway.id, rarity) > 0;
    const btn = el("button", "album-cell");
    btn.type = "button";
    btn.dataset.rarity = rarity;
    const state = filled ? "filled" : owned ? "placeable" : "empty";
    btn.classList.add(state);
    const tile = el("span", "album-cell-tile");
    tile.append(sprite(colorway.sprite));
    btn.append(tile, el("span", "album-cell-label", getRarity(rarity).name));
    const label = `${colorway.name}, ${getRarity(rarity).name}`;
    btn.setAttribute("aria-label", `${label} : ${filled ? "dans l'album" : owned ? "à placer dans l'album" : "tu ne l'as pas encore"}`);
    if (filled) btn.append(el("span", "album-mark", "✓"));
    else if (owned) btn.append(el("span", "album-mark plus", "+"));
    btn.addEventListener("click", () => {
      if (filled) showToast("Cette carte est déjà dans ton album.");
      else if (!owned) showToast("Tu n'as pas encore cette carte.");
      else openConfirm(colorway, rarity);
    });
    return btn;
  }

  // --- Fiche de confirmation : l'ajout est définitif ---

  function openConfirm(colorway, rarity) {
    const album = getAlbumState();
    const key = cardKey(colorway.id, rarity);
    const slots = slotsOf(colorway.piece);
    const have = slots.filter((s) => album.cards.has(s.key)).length;
    const count = countCard(colorway.id, rarity);
    sheetTitle.textContent = "Dans l'album";

    const card = createCardShell(colorway, rarity);
    card.classList.add("sheet-card");
    card.append(createCardFace(colorway, rarity));

    const notes = [];
    notes.push(`${colorway.piece.name} : ${have} / ${slots.length} → ${have + 1} / ${slots.length} cases.`);
    if (have + 1 === slots.length) notes.push("C'est la dernière case : tu obtiens l'Ultime de ce modèle !");
    if (count === 1 && isLocked(colorway.id, rarity)) notes.push("Cette carte est verrouillée : le verrou disparaît avec elle.");
    if (count === 1 && isCardEquipped(colorway.id, rarity)) notes.push("Elle quittera ta tenue.");
    if (count === 1 && getShowcaseKeys().includes(key)) notes.push("Elle quittera ta vitrine.");
    if (count > 1) notes.push(`Il te restera ${count - 1} exemplaire${count > 2 ? "s" : ""} dans ta collection.`);

    const warn = el("p", "sheet-text album-warning",
      "Définitif : une carte placée dans l'album ne peut jamais en être retirée. Elle quitte ta collection et ne peut plus être portée, vendue, misée ni défaussée.");
    const actions = el("div", "sheet-actions");
    const confirm = el("button", "btn btn-primary", "Placer dans l'album");
    confirm.type = "button";
    const cancel = el("button", "btn", "Annuler");
    cancel.type = "button";
    cancel.addEventListener("click", () => { sheet.hidden = true; });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      cancel.disabled = true;
      try {
        const result = await addToAlbum(colorway.id, rarity);
        onChange?.();
        if (result.ultimate_unlocked) celebrate(result.piece_id);
        else {
          sheet.hidden = true;
          showToast(`Ajoutée à l'album · ${result.have} / ${result.total}`);
          playSound("flip");
        }
      } catch (err) {
        reportError(err);
        confirm.disabled = false;
        cancel.disabled = false;
      }
    });
    actions.append(confirm, cancel);
    sheetBody.replaceChildren(card, ...notes.map((n) => el("p", "sheet-subtitle", n)), warn, actions);
    sheet.hidden = false;
  }

  // --- Un Ultime est obtenu ---

  function celebrate(pieceId) {
    const ultimate = ultimateOf.get(pieceId);
    sheetTitle.textContent = "Ultime obtenu !";
    const card = createCardShell(ultimate, "ultime");
    card.classList.add("sheet-card", "upgrade-win");
    card.append(createCardFace(ultimate, "ultime"));
    const actions = el("div", "sheet-actions");
    const wear = el("button", "btn btn-primary", "Le porter maintenant");
    wear.type = "button";
    wear.addEventListener("click", async () => { sheet.hidden = true; await wearUltimate(ultimate); });
    const later = el("button", "btn", "Plus tard");
    later.type = "button";
    later.addEventListener("click", () => { sheet.hidden = true; });
    actions.append(wear, later);
    sheetBody.replaceChildren(
      el("p", "sheet-subtitle", `${ultimate.piece.name} est complet dans ton album.`),
      card,
      el("p", "sheet-text", "Ton Ultime est unique : il se porte et se met en vitrine, mais ne se vend pas et ne s'échange pas."),
      actions);
    sheet.hidden = false;
    setTimeout(() => {
      const box = card.getBoundingClientRect();
      for (const [i, color] of ["#5ae6e6", "#be78ff", "#ff78d2"].entries()) {
        setTimeout(() => burst(box.left + box.width / 2, box.top + box.height / 2, color, 28, 190), i * 180);
      }
    }, 80);
    playSound("ultime");
    vibrate([60, 40, 60, 40, 120]);
  }

  /** Porte l'Ultime à son emplacement (le serveur vérifie qu'on le possède). */
  async function wearUltimate(ultimate) {
    try {
      await equip(ultimate.piece.slot, { colorwayId: ultimate.id, rarity: "ultime" });
      onChange?.();
      showToast(`${ultimate.piece.name} (Ultime) est porté.`);
    } catch (err) {
      reportError(err);
    }
  }

  for (const input of [searchInput, brandSelect, sortSelect]) input.addEventListener("input", render);
  render();
  return render;
}
