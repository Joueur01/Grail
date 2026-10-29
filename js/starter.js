// starter.js — kit de départ : à la première ouverture du jeu, le joueur choisit UNE marque et reçoit 4 pièces
// Communes de cette marque (une tenue complète, 4 points de rareté pour passer le Bar) + des boosters offerts.
//
// Le serveur décide de tout (migration 0030) : quelles marques sont proposées, quels coloris sont donnés, une
// seule fois par compte. Le site affiche le choix, appelle claim_starter_kit, puis équipe les pièces reçues
// sur les emplacements encore VIDES (set_equipped, validé par le serveur) : la tenue d'un joueur qui en a déjà
// une n'est jamais écrasée. Sans la migration 0030, rien ne s'affiche (la fonction n'existe pas encore).

import * as api from "./api.js?v=91";
import { refreshState, getEquipped } from "./inventory.js?v=91";
import { reportError } from "./wallet.js?v=91";
import { playSound, vibrate } from "./effects.js?v=91";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Prépare le kit de départ. Renvoie { check } : à appeler une fois le jeu chargé. */
export function setupStarterKit({ catalogue, onClaimed }) {
  const panel = document.getElementById("starter-kit");
  const body = document.getElementById("starter-kit-body");
  const title = document.getElementById("starter-kit-title");

  const close = () => { panel.hidden = true; };
  document.getElementById("starter-kit-close").addEventListener("click", close);
  panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });

  /** Un sprite sur sa case claire (les contours noirs demandent un fond clair). */
  function sprite(src) {
    const tile = el("span", "kit-sprite");
    const img = el("img", "pixel");
    img.src = src;
    img.width = 64;
    img.height = 64;
    img.alt = "";
    tile.append(img);
    return tile;
  }

  /** Étape 1 : choisir sa marque. */
  function showChoice(state) {
    title.textContent = "Ton kit de départ";
    const n = state.boosters;
    const intro = el("p", "sheet-text", `Choisis ta première marque : tu reçois une tenue complète (4 pièces Communes) et ${plural(n, "booster")} offert${n > 1 ? "s" : ""}.`);
    const grid = el("div", "kit-brands");
    const confirm = el("button", "btn btn-primary", "Choisis une marque");
    const footer = el("div", "kit-footer"); // reste collé en bas pendant qu'on fait défiler les marques
    footer.append(confirm);
    confirm.disabled = true;
    let chosen = null;

    for (const brand of catalogue.brands.filter((b) => state.brands.includes(b.id))) {
      const flagship = catalogue.pieces.find((p) => p.brand === brand.id && p.flagship) || catalogue.pieces.find((p) => p.brand === brand.id);
      const tile = el("button", "kit-brand");
      tile.type = "button";
      tile.style.setProperty("--kit-color", `var(--brand-${brand.id}, var(--text))`);
      tile.setAttribute("aria-pressed", "false");
      tile.append(sprite(flagship.colorways[0].sprite), el("span", "kit-brand-name", brand.name), el("span", "kit-brand-style", brand.style));
      tile.addEventListener("click", () => {
        chosen = brand;
        for (const t of grid.children) t.setAttribute("aria-pressed", String(t === tile));
        confirm.disabled = false;
        confirm.textContent = `Choisir ${brand.name}`;
        playSound("tick");
      });
      grid.append(tile);
    }

    confirm.addEventListener("click", async () => {
      if (!chosen || confirm.disabled) return;
      confirm.disabled = true;
      confirm.textContent = "Un instant…";
      try {
        const result = await api.claimStarterKit(chosen.id);
        // On équipe seulement les emplacements vides (la tenue existante n'est jamais écrasée).
        for (const card of result.cards) {
          if (getEquipped(card.slot)) continue;
          try { await api.setEquipped(card.slot, card.colorway_id, card.rarity); } catch (err) { console.warn("Kit : tenue", err); }
        }
        await refreshState();
        onClaimed?.();
        playSound("coin");
        vibrate([20, 40, 20]);
        showReceived(result);
      } catch (err) {
        reportError(err);
        confirm.disabled = false;
        confirm.textContent = `Choisir ${chosen.name}`;
      }
    });

    body.replaceChildren(intro, grid, footer);
  }

  /** Étape 2 : ce qui a été reçu. */
  function showReceived(result) {
    title.textContent = "Kit reçu !";
    const row = el("div", "kit-received");
    for (const card of result.cards) {
      const colorway = catalogue.colorwayById.get(card.colorway_id);
      const item = el("div", "kit-item");
      item.append(sprite(colorway.sprite), el("span", "kit-item-name", colorway.piece.name));
      row.append(item);
    }
    const n = result.boosters;
    const text = el("p", "sheet-text", `+${plural(n, "booster")} offert${n > 1 ? "s" : ""}. Tes pièces sont portées sur les emplacements libres : tu peux passer le Bar du Videur dès maintenant.`);
    const open = el("button", "btn btn-primary", "Ouvrir mes boosters");
    open.addEventListener("click", () => { close(); location.hash = "#booster"; });
    const bar = el("button", "btn", "Passer le Bar");
    bar.addEventListener("click", () => { close(); location.hash = "#videur"; });
    const actions = el("div", "sheet-actions");
    actions.append(open, bar);
    body.replaceChildren(row, text, actions);
  }

  /** Demande au serveur si le kit est à récupérer ; si oui, ouvre le choix. Jamais bloquant. */
  async function check() {
    try {
      const state = await api.getStarterKit();
      if (!state || state.claimed || !state.brands?.length) return;
      showChoice(state);
      panel.hidden = false;
      body.scrollTop = 0;
    } catch (err) {
      console.warn("Kit de départ :", err?.message || err); // migration 0030 absente, hors ligne… : sans importance
    }
  }

  return { check };
}
