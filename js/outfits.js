// outfits.js — tenues enregistrées (migration 0036) : « Tenue 1 », « Tenue 2 », « Tenue 3 ».
//
// Le joueur enregistre la tenue qu'il porte dans un emplacement, puis la remet en un toucher (par exemple après
// le Videur, qui oblige à changer de tenue). Tout est fait par le SERVEUR : il copie la tenue portée, et en la
// remettant il saute les cartes qui ne sont plus possédées (vendues, misées, défaussées…). Ce fichier affiche
// la liste et appelle les fonctions ; il ne décide de rien.
//
// Deux affichages :
//  - setupSavedOutfits : section « Mes tenues » de l'écran Tenue (enregistrer, porter, remplacer, supprimer) ;
//  - quickOutfits      : petite rangée « Remettre une tenue » de l'écran Videur (porter seulement).

import { getSavedOutfits, saveOutfit, wearSavedOutfit, deleteSavedOutfit } from "./api.js?v=97";
import { refreshState, getEquipped } from "./inventory.js?v=97";
import { SLOTS } from "./avatar.js?v=97";
import { showToast, reportError } from "./wallet.js?v=97";

let data = null;            // dernière réponse du serveur ({ max, outfits }), ou { disabled: true } sans la migration
let loading = null;         // lecture en cours (une seule à la fois)
const renders = new Set();  // affichages à redessiner quand la liste change
const wornListeners = new Set(); // à prévenir quand une tenue a été remise (écran Tenue, Videur)

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Relit les tenues sur le serveur puis redessine tous les affichages. */
function load() {
  loading ??= getSavedOutfits()
    .then((d) => { data = d; })
    .catch((err) => {
      // Migration 0036 pas encore exécutée : la section reste cachée, le reste du jeu marche.
      if (/pas encore activée/.test(err.message)) data = { disabled: true };
      else console.warn("Tenues :", err.message);
    })
    .finally(() => { loading = null; redraw(); });
  return loading;
}

function setData(d) {
  data = d;
  redraw();
}

function redraw() {
  for (const fn of renders) fn();
}

/** Tenue portée (cartes possédées) sous forme « emplacement:coloris|rareté » triée, pour comparer. */
function currentKey() {
  return SLOTS.map((s) => {
    const card = getEquipped(s.id);
    return card ? `${s.id}:${card.colorwayId}|${card.rarity}` : null;
  }).filter(Boolean).sort().join(",");
}

/** Même clé pour une tenue enregistrée (seulement les cartes encore possédées : c'est ce qui serait porté). */
function savedKey(outfit) {
  return outfit.pieces.filter((p) => p.owned).map((p) => `${p.slot}:${p.card}`).sort().join(",");
}

const filled = () => (data?.outfits || []).filter((o) => !o.empty);

/** Remet une tenue : le serveur change la tenue portée, puis on relit l'état du jeu. */
async function wear(outfit) {
  const result = await wearSavedOutfit(outfit.slot);
  await refreshState();
  const lost = result.missing
    ? ` · ${result.missing} pièce${result.missing > 1 ? "s ne sont" : " n'est"} plus dans ta collection`
    : "";
  showToast(`Tenue ${outfit.slot} portée${lost}.`);
  for (const fn of wornListeners) fn();
  redraw();
}

/** Rangée de mini sprites d'une tenue (tête → pieds), les cartes plus possédées estompées. */
function spriteRow(catalogue, outfit) {
  const row = el("div", "saved-outfit-sprites");
  const order = new Map(SLOTS.map((s, i) => [s.id, i]));
  const pieces = [...outfit.pieces].sort((a, b) => (order.get(a.slot) ?? 9) - (order.get(b.slot) ?? 9));
  for (const p of pieces) {
    const [colorwayId, rarity] = p.card.split("|");
    const colorway = catalogue.colorwayById.get(colorwayId);
    if (!colorway) continue;
    const box = el("span", p.owned ? "friend-card" : "friend-card is-missing");
    box.style.setProperty("--rarity-color", `var(--rarity-${rarity})`);
    const img = el("img", "pixel");
    img.src = colorway.sprite;
    img.alt = p.owned ? colorway.piece.name : `${colorway.piece.name} (plus dans ta collection)`;
    box.append(img);
    row.append(box);
  }
  return row;
}

/**
 * Section « Mes tenues » de l'écran Tenue.
 * - container : élément où dessiner
 * - onWorn : appelé après avoir remis une tenue (pour redessiner l'avatar)
 * Renvoie render() : à appeler quand la tenue portée change (pour la mention « Portée »).
 */
export function setupSavedOutfits({ catalogue, container, onWorn }) {
  if (onWorn) wornListeners.add(onWorn);
  let busy = false;
  let armed = null; // bouton qui attend un 2e toucher (« Remplacer ? », « Supprimer ? »)

  /** Bouton qui demande un 2e toucher avant d'agir (remplacer, supprimer). */
  function confirmButton(label, armedLabel, action) {
    const b = el("button", "btn saved-outfit-btn", label);
    b.type = "button";
    b.addEventListener("click", () => {
      if (armed !== b) {
        if (armed) render(); // un autre bouton était armé : on le remet à zéro
        armed = b;
        b.textContent = armedLabel;
        b.classList.add("armed");
        return;
      }
      armed = null;
      run(action);
    });
    return b;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    render();
    try {
      await action();
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    armed = null;
    container.hidden = !data || data.disabled;
    if (container.hidden) return;
    const now = currentKey();
    const nodes = [
      el("h3", "saved-outfits-title", "Mes tenues"),
      el("p", "muted saved-outfits-intro", "Enregistre ta tenue pour la remettre en un toucher, par exemple après le Videur."),
    ];
    for (const outfit of data.outfits) {
      const item = el("div", "saved-outfit");
      const head = el("div", "saved-outfit-head");
      head.append(el("span", "saved-outfit-name", `Tenue ${outfit.slot}`));
      const actions = el("div", "saved-outfit-actions");
      if (outfit.empty) {
        head.append(el("span", "muted saved-outfit-state", "Vide"));
        const save = el("button", "btn saved-outfit-btn", "Enregistrer ma tenue ici");
        save.type = "button";
        save.disabled = busy || !now;
        save.addEventListener("click", () => run(async () => {
          setData(await saveOutfit(outfit.slot));
          showToast(`Tenue ${outfit.slot} enregistrée.`);
        }));
        actions.append(save);
        item.append(head, actions);
      } else {
        const isWorn = savedKey(outfit) === now;
        head.append(el("span", isWorn ? "saved-outfit-state is-worn" : "saved-outfit-state", isWorn ? "✓ Portée" : ""));
        const missing = outfit.pieces.filter((p) => !p.owned).length;
        const wearBtn = el("button", "btn btn-primary saved-outfit-btn", isWorn ? "Portée" : "Porter");
        wearBtn.type = "button";
        wearBtn.disabled = busy || isWorn || missing === outfit.pieces.length;
        wearBtn.addEventListener("click", () => run(() => wear(outfit)));
        const replace = confirmButton("Remplacer", "Remplacer ?", async () => {
          setData(await saveOutfit(outfit.slot));
          showToast(`Tenue ${outfit.slot} remplacée par ta tenue actuelle.`);
        });
        replace.disabled = busy || !now || isWorn;
        const remove = confirmButton("✕", "Supprimer ?", async () => {
          setData(await deleteSavedOutfit(outfit.slot));
          showToast(`Tenue ${outfit.slot} supprimée.`);
        });
        remove.classList.add("saved-outfit-remove");
        remove.setAttribute("aria-label", `Supprimer la tenue ${outfit.slot}`);
        remove.disabled = busy;
        head.append(remove); // en haut à droite : les deux boutons du bas tiennent sur une ligne à 320 px
        actions.append(wearBtn, replace);
        item.append(head, spriteRow(catalogue, outfit));
        if (missing) item.append(el("p", "muted saved-outfit-missing",
          `${missing} pièce${missing > 1 ? "s ne sont" : " n'est"} plus dans ta collection.`));
        item.append(actions);
      }
      nodes.push(item);
    }
    container.replaceChildren(...nodes);
  }

  renders.add(render);
  if (!data) load();
  render();
  return render;
}

/**
 * Rangée « Remettre une tenue » (écran Videur) : un bouton par tenue enregistrée.
 * - onWorn : appelé après avoir remis une tenue (pour relire l'aperçu du Videur)
 * Renvoie un élément à créer UNE fois et à remettre dans la page à chaque affichage ; il se redessine tout seul
 * quand la liste change, et box.refresh() le redessine quand la tenue portée change.
 */
export function quickOutfits({ onWorn }) {
  const box = el("div", "quick-outfits");
  let busy = false;

  function render() {
    const list = filled();
    box.hidden = !data || data.disabled;
    if (box.hidden) return;
    if (!list.length) {
      box.replaceChildren(el("p", "muted videur-note", "Astuce : enregistre ta tenue dans l'écran Tenue pour la remettre après le Videur."));
      return;
    }
    const now = currentKey();
    const row = el("div", "quick-outfits-row");
    for (const outfit of list) {
      const isWorn = savedKey(outfit) === now;
      const b = el("button", isWorn ? "quick-outfit is-worn" : "quick-outfit", isWorn ? `✓ Tenue ${outfit.slot}` : `Tenue ${outfit.slot}`);
      b.type = "button";
      b.disabled = busy || isWorn;
      b.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        render();
        try {
          await wear(outfit);
          onWorn?.();
        } catch (err) {
          reportError(err);
        } finally {
          busy = false;
          render();
        }
      });
      row.append(b);
    }
    box.replaceChildren(el("p", "quick-outfits-title", "Remettre une tenue enregistrée"), row);
  }

  renders.add(render);
  if (!data) load();
  render();
  box.refresh = render;
  return box;
}
