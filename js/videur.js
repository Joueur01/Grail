// videur.js — écran « Videur » : 3 portes par jour (Bar, Club, VIP), dress code du jour, deux jauges.
//
// ⚠️ Tout est calculé par le SERVEUR (migration 0012) : dress code du jour, score de style, points de
// rareté, essais, verrous, Flow. Ce fichier affiche ce que le serveur renvoie et envoie deux actions :
//  - videur_preview : aperçu GRATUIT de la tenue portée (ne consomme rien) ;
//  - videur_enter   : se présenter (consomme un essai).
// Aucune règle du Videur n'est codée ici.
//
// Trois niveaux de difficulté (le serveur envoie `mode` pour chaque porte) :
//  - « visible » (Bar)  : règles, aperçu gratuit et jauges, comme un tutoriel ;
//  - « count »  (Club)  : règles CACHÉES ; après chaque essai : « X sur N » + un indice vague ;
//  - « hint »   (VIP)   : règles CACHÉES ; après chaque essai : l'indice vague seulement.
// Pour le Club et le VIP, le serveur n'envoie jamais les règles, les seuils ni le score : il n'y a donc
// ici aucun aperçu, aucune jauge, aucune coche. La règle du jour n'arrive qu'à la fin (`reveal`).

import { getRarity } from "./data.js?v=81";
import { getVideurNight, videurPreview, videurEnter } from "./api.js?v=81";
import { updateVideurBadge } from "./badges.js?v=81";
import { SLOTS, readBodyChoice } from "./avatar.js?v=81";
import { createAvatar3D } from "./avatar3d.js?v=81";
import { refreshState, getEquipped, getReputation } from "./inventory.js?v=81";
import { showToast, reportError } from "./wallet.js?v=81";
import { playSound, vibrate } from "./effects.js?v=81";

/** Couleur d'enseigne de chaque porte (comme les raretés : bleu, violet, or). */
const DOOR_COLOR = { bar: "var(--rarity-rare)", club: "var(--rarity-epique)", vip: "var(--rarity-legendaire)" };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Branche l'écran Videur.
 * - catalogue : résultat de loadCatalogue() (pour dessiner la tenue)
 */
export function setupVideur({ catalogue }) {
  const summary = document.getElementById("videur-summary");
  const errorBox = document.getElementById("videur-error");
  const tabs = document.getElementById("door-tabs");
  const doorBox = document.getElementById("videur-door");
  const sheet = document.getElementById("card-sheet");
  const sheetTitle = document.getElementById("card-sheet-title");
  const sheetBody = document.getElementById("card-sheet-body");

  let night = null;     // dernière réponse de get_videur_night
  let selected = null;  // id de la porte affichée
  let preview = null;   // dernier aperçu de la porte affichée
  let busy = false;
  let version = 0;      // ignore les réponses d'une porte qu'on a quittée entre-temps

  const doorOf = (id) => night.doors.find((d) => d.id === id);

  function showError(err) {
    errorBox.textContent = err.message || String(err);
    errorBox.hidden = false;
  }

  // --- Lecture ---------------------------------------------------------------------

  /** Relit la soirée du jour puis l'aperçu de la porte affichée. */
  async function load({ silent = false } = {}) {
    try {
      night = await getVideurNight();
      updateVideurBadge(night); // la pastille de l'onglet suit les essais du jour
      // Avant la migration 0013, le serveur n'envoie pas de `mode` : toutes les portes sont alors visibles.
      for (const d of night.doors) d.mode = d.mode || "visible";
      errorBox.hidden = true;
      // Porte affichée : celle choisie, sinon la première pas encore passée et ouverte, sinon la dernière.
      if (!selected || !doorOf(selected)) {
        selected = (night.doors.find((d) => !d.passed && !d.locked) || night.doors[night.doors.length - 1]).id;
      }
      renderTabs();
      renderSummary();
      await loadPreview();
    } catch (err) {
      if (!silent) showError(err);
    }
  }

  async function loadPreview() {
    const v = ++version;
    const id = selected;
    // Pas d'aperçu au Club ni au VIP : il révélerait les règles (le serveur le refuse d'ailleurs).
    if (doorOf(id).mode !== "visible") { preview = null; renderDoor(); return; }
    try {
      const p = await videurPreview(id);
      if (v !== version) return;
      preview = p;
      renderDoor();
    } catch (err) {
      if (v === version) showError(err);
    }
  }

  // --- Affichage -------------------------------------------------------------------

  function renderSummary() {
    const days = night.streak;
    const rep = getReputation(); // le Flow est devenu une réputation (migration 0021)
    const streak = `Série : ${days} jour${days > 1 ? "s" : ""}`;
    summary.textContent = rep
      ? `Réputation niv. ${rep.level} · ${rep.flow} / ${rep.next} Flow · ${streak}`
      : `Flow : ${night.flow.toLocaleString("fr-FR")} · ${streak}`;
  }

  function renderTabs() {
    tabs.replaceChildren(...night.doors.map((d) => {
      const b = el("button", "door-tab");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(d.id === selected));
      b.style.setProperty("--door-color", DOOR_COLOR[d.id]);
      b.append(el("span", "door-tab-name", d.name));
      b.append(el("span", "door-tab-state", d.passed ? "✔ Passée" : d.locked ? "🔒 Fermée" : d.tries_left <= 0 ? "Terminée" : `${d.tries_left} essai${d.tries_left > 1 ? "s" : ""}`));
      b.addEventListener("click", () => { selected = d.id; preview = null; renderTabs(); renderDoor(); loadPreview(); });
      return b;
    }));
  }

  /** Une jauge : valeur obtenue, trait du seuil, couleur selon réussite. */
  function gauge(label, value, min, max) {
    const ok = value >= min;
    const wrap = el("div", "gauge");
    const head = el("div", "gauge-head");
    head.append(el("span", "gauge-label", label), el("span", ok ? "gauge-value ok" : "gauge-value", `${value} / ${min}`));
    const bar = el("div", "gauge-bar");
    const fill = el("div", ok ? "gauge-fill ok" : "gauge-fill");
    fill.style.width = `${Math.min(100, (value / max) * 100)}%`;
    const mark = el("div", "gauge-mark");
    mark.style.left = `${Math.min(100, (min / max) * 100)}%`;
    bar.append(fill, mark);
    wrap.append(head, bar);
    return wrap;
  }

  /**
   * Tenue portée en 3D, sur l'avatar du joueur (Garçon / Fille), qu'on fait tourner en glissant.
   * Pièces renvoyées par le serveur : seulement celles encore possédées.
   */
  function outfitCanvas(pieces) {
    const worn = {};
    for (const p of pieces) {
      const colorway = catalogue.colorwayById.get(p.colorway_id);
      if (colorway) worn[p.slot] = colorway;
    }
    const stage = el("div", "videur-stage");
    const canvas = el("canvas", "pixel avatar-3d videur-avatar");
    canvas.width = 46;  // même canvas que l'écran Tenue (recadré sur l'avatar)
    canvas.height = 88;
    canvas.setAttribute("aria-label", "Ta tenue en 3D : glisse pour la faire tourner");
    stage.append(canvas);
    createAvatar3D(canvas).setOutfit(worn, { type: readBodyChoice() }).catch((err) => console.error("Avatar 3D :", err));
    const wrap = el("div", "videur-outfit");
    wrap.append(stage, el("p", "muted videur-outfit-hint", "Glisse pour tourner"));
    return wrap;
  }

  function rulesList(rules) {
    const list = el("ul", "rule-list");
    for (const r of rules) {
      const li = el("li", r.ok === undefined ? "rule" : r.ok ? "rule ok" : "rule no");
      li.append(el("span", "rule-mark", r.ok === undefined ? "•" : r.ok ? "✔" : "✖"), el("span", "rule-label", r.label),
        el("span", "rule-weight", `${r.weight} pts`));
      list.append(li);
    }
    return list;
  }

  /** Tenue portée, lue dans le cache du jeu (pour le Club et le VIP, sans passer par un aperçu). */
  function worn() {
    const pieces = [];
    for (const slot of SLOTS) {
      const card = getEquipped(slot.id);
      if (card) pieces.push({ slot: slot.id, colorway_id: card.colorwayId, rarity: card.rarity });
    }
    return pieces;
  }

  /** Une ligne de carrés par essai, SANS rien révéler des règles : 🟩 entré · 🟨 presque (Club) · ⬛ loin. */
  function squares(door) {
    return door.attempts.map((a) => {
      if (a.passed) return "🟩";
      if (door.mode === "count" && a.matched >= Math.ceil(a.total / 2)) return "🟨";
      return "⬛";
    }).join("");
  }

  /** Texte à partager : le nom de la porte, le nombre d'essais et les carrés (jamais les critères). */
  async function shareResult(door) {
    const won = door.attempts.some((a) => a.passed);
    const date = new Date(night.day).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" });
    const text = `Grail · Videur · ${door.name} ${date}\n${won ? door.attempts.length : "X"}/${door.tries}\n${squares(door)}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      showToast("Résultat copié.");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      showToast("Impossible de copier le résultat.", { error: true });
    }
  }

  /** Porte à règles cachées : essais, indices reçus, règle du jour une fois la porte terminée. */
  function renderHiddenDoor(door) {
    const nodes = [];
    const sign = el("div", "door-sign");
    sign.style.setProperty("--door-color", DOOR_COLOR[door.id]);
    sign.append(el("span", "door-sign-door", door.name), el("span", "door-sign-venue", door.venue));
    nodes.push(sign, el("p", "muted door-intro", door.intro));

    nodes.push(el("h3", "videur-h", "Ta tenue"));
    const pieces = worn();
    if (pieces.length) nodes.push(outfitCanvas(pieces));
    else nodes.push(el("p", "muted videur-empty", "Tu ne portes rien. Compose une tenue, puis présente-toi."));
    const change = el("a", "btn videur-change", "Changer ma tenue");
    change.href = "#avatar";
    nodes.push(change);

    // Ce que le videur t'a dit aujourd'hui (aucun détail au-delà de ce que le serveur donne).
    if (door.attempts.length) {
      nodes.push(el("h3", "videur-h", "Ce que le videur t'a dit"));
      const list = el("ul", "rule-list");
      door.attempts.forEach((a, i) => {
        const li = el("li", a.passed ? "rule ok" : "rule");
        const left = door.mode === "count" && !a.passed ? `${a.matched} sur ${a.total}` : a.passed ? "Entré" : "Refusé";
        li.append(el("span", "rule-mark", `#${i + 1}`), el("span", "rule-label", a.passed ? "Entrée accordée." : `« ${a.hint} »`), el("span", "rule-weight", left));
        list.append(li);
      });
      nodes.push(list);
    }

    const finished = door.passed || door.tries_left <= 0;
    if (finished && door.reveal) {
      nodes.push(el("h3", "videur-h", "La règle du jour"));
      const list = el("ul", "rule-list");
      for (const label of door.reveal) {
        const li = el("li", "rule");
        li.append(el("span", "rule-mark", "•"), el("span", "rule-label", label));
        list.append(li);
      }
      nodes.push(list);
    }
    if (door.attempts.length && finished) {
      const share = el("button", "btn videur-change", "Partager mon résultat");
      share.type = "button";
      share.addEventListener("click", () => shareResult(door));
      nodes.push(share);
    }

    const enter = el("button", "btn btn-primary videur-enter");
    enter.type = "button";
    if (door.passed) enter.textContent = "Tu es déjà entré ici aujourd'hui";
    else if (door.locked) enter.textContent = "Porte fermée : passe d'abord la précédente";
    else if (door.tries_left <= 0) enter.textContent = "Plus d'essai aujourd'hui";
    else if (!pieces.length) enter.textContent = "Porte au moins une pièce";
    else enter.textContent = `Se présenter · ${door.tries_left} essai${door.tries_left > 1 ? "s" : ""} · +${door.flow} Flow`;
    enter.disabled = door.passed || door.locked || door.tries_left <= 0 || !pieces.length || busy;
    enter.addEventListener("click", () => enterDoor(door));
    nodes.push(enter);
    if (!finished) nodes.push(el("p", "muted videur-note", "Pas d'aperçu ici : c'est à toi de deviner. La règle du jour se révèle à la fin."));
    doorBox.replaceChildren(...nodes);
  }

  function renderDoor() {
    const door = doorOf(selected);
    if (!door) return;
    if (door.mode !== "visible") { renderHiddenDoor(door); return; }
    const nodes = [];

    // Enseigne : nom de la porte et du lieu du jour, avec la couleur de la porte.
    const sign = el("div", "door-sign");
    sign.style.setProperty("--door-color", DOOR_COLOR[door.id]);
    sign.append(el("span", "door-sign-door", door.name), el("span", "door-sign-venue", door.venue));
    nodes.push(sign, el("p", "muted door-intro", door.intro));

    // Dress code : règles + ✔/✖ de la tenue actuelle (aperçu).
    nodes.push(el("h3", "videur-h", "Dress code"));
    nodes.push(rulesList(preview ? preview.rules : door.rules));

    if (!preview) {
      nodes.push(el("p", "muted", "Évaluation de ta tenue…"));
    } else {
      nodes.push(el("h3", "videur-h", "Ta tenue"));
      if (preview.pieces.length) nodes.push(outfitCanvas(preview.pieces));
      else nodes.push(el("p", "muted videur-empty", "Tu ne portes rien (ou plus rien : une carte vendue ne compte plus)."));
      const maxRarity = Math.max(door.min_rarity * 1.5, preview.rarity_points, 1);
      nodes.push(gauge("Style", preview.style, door.min_style, 100));
      nodes.push(gauge("Rareté", preview.rarity_points, door.min_rarity, maxRarity));
      const change = el("a", "btn videur-change", "Changer ma tenue");
      change.href = "#avatar";
      nodes.push(change);
    }

    // Bouton « Se présenter » : l'état (verrouillée, déjà passée, plus d'essai) vient du serveur.
    const enter = el("button", "btn btn-primary videur-enter");
    enter.type = "button";
    if (door.passed) enter.textContent = "Tu es déjà entré ici aujourd'hui";
    else if (door.locked) enter.textContent = "Porte fermée : passe d'abord la précédente";
    else if (door.tries_left <= 0) enter.textContent = "Plus d'essai aujourd'hui";
    else if (preview && !preview.pieces.length) enter.textContent = "Porte au moins une pièce";
    else enter.textContent = `Se présenter · ${door.tries_left} essai${door.tries_left > 1 ? "s" : ""} · +${door.flow} Flow`;
    enter.disabled = door.passed || door.locked || door.tries_left <= 0 || !preview || !preview.pieces.length || busy;
    enter.addEventListener("click", () => enterDoor(door));
    nodes.push(enter);
    nodes.push(el("p", "muted videur-note", "L'aperçu est gratuit et illimité. Seul « Se présenter » consomme un essai."));
    doorBox.replaceChildren(...nodes);
  }

  // --- Se présenter ------------------------------------------------------------------

  async function enterDoor(door) {
    if (busy) return;
    busy = true;
    renderDoor();
    try {
      const result = await videurEnter(door.id); // le serveur décide
      playSound(result.passed ? "door_ok" : "door_no");
      vibrate(result.passed ? [40, 40, 80] : 120);
      showVerdict(door, result);
      await load({ silent: true });
      // Le Flow est dans l'écran Videur ; les pièces n'ont pas bougé.
    } catch (err) {
      reportError(err);
      await load({ silent: true });
    } finally {
      busy = false;
      if (night) renderDoor();
    }
  }

  /** Fiche du verdict : « ENTRÉE » ou « REFUSÉ », réplique du videur, détail du score. */
  function showVerdict(door, r) {
    sheetTitle.textContent = door.name;
    if (door.mode !== "visible") { showHiddenVerdict(door, r); return; }
    const verdict = el("div", r.passed ? "verdict pass" : "verdict fail");
    verdict.append(el("p", "verdict-word", r.passed ? "ENTRÉE" : "REFUSÉ"));
    if (r.line) verdict.append(el("p", "verdict-line", `« ${r.line} »`));
    const nodes = [verdict];

    nodes.push(gauge("Style", r.style, r.min_style, 100));
    nodes.push(gauge("Rareté", r.rarity_points, r.min_rarity, Math.max(r.min_rarity * 1.5, r.rarity_points, 1)));
    if (!r.passed) {
      const why = !r.style_ok && !r.rarity_ok ? "Il te manque du style et de la rareté."
        : !r.style_ok ? "Il te manque du style : relis le dress code." : "Il te manque de la rareté : porte des pièces plus rares.";
      nodes.push(el("p", "sheet-text verdict-why", why));
    }
    nodes.push(rulesList(r.rules));

    if (r.passed) {
      const gain = el("p", "sheet-subtitle verdict-gain", `+${r.flow_gained} Flow`);
      nodes.push(gain);
      if (r.streak_bonus > 0) nodes.push(el("p", "muted sheet-text", `dont +${r.streak_bonus} de bonus de série (${r.streak} jours d'affilée)`));
    } else {
      nodes.push(el("p", "muted sheet-text", r.tries_left > 0
        ? `Il te reste ${r.tries_left} essai${r.tries_left > 1 ? "s" : ""} pour cette porte aujourd'hui.`
        : "Plus d'essai pour cette porte aujourd'hui. Reviens demain."));
    }
    const close = el("button", "btn btn-primary", "OK");
    close.addEventListener("click", () => { sheet.hidden = true; });
    nodes.push(close);
    sheetBody.replaceChildren(...nodes);
    sheet.hidden = false;
  }

  /** Verdict d'une porte cachée : entrée / refusé, indice, « X sur N » (Club), règle du jour à la fin. */
  function showHiddenVerdict(door, r) {
    const verdict = el("div", r.passed ? "verdict pass" : "verdict fail");
    verdict.append(el("p", "verdict-word", r.passed ? "ENTRÉE" : "REFUSÉ"));
    if (r.line) verdict.append(el("p", "verdict-line", `« ${r.line} »`));
    const nodes = [verdict];
    if (r.mode === "count" && !r.passed) nodes.push(el("p", "sheet-subtitle verdict-count", `${r.matched} critère${r.matched > 1 ? "s" : ""} sur ${r.total}`));
    if (r.passed) {
      nodes.push(el("p", "sheet-subtitle verdict-gain", `+${r.flow_gained} Flow`));
    } else {
      nodes.push(el("p", "muted sheet-text", r.tries_left > 0
        ? `Il te reste ${r.tries_left} essai${r.tries_left > 1 ? "s" : ""}. Change ta tenue d'après l'indice.`
        : "Plus d'essai pour cette porte aujourd'hui. Reviens demain."));
    }
    if (r.reveal) {
      nodes.push(el("h3", "videur-h", "La règle du jour"));
      const list = el("ul", "rule-list");
      for (const label of r.reveal) {
        const li = el("li", "rule");
        li.append(el("span", "rule-mark", "•"), el("span", "rule-label", label));
        list.append(li);
      }
      nodes.push(list);
    }
    const close = el("button", "btn btn-primary", "OK");
    close.addEventListener("click", () => { sheet.hidden = true; });
    nodes.push(close);
    sheetBody.replaceChildren(...nodes);
    sheet.hidden = false;
  }

  // --- Mise à jour -------------------------------------------------------------------

  // La tenue peut changer sur l'écran Tenue : on relit en revenant ici ou sur l'onglet.
  window.addEventListener("hashchange", () => { if (location.hash === "#videur") refreshAndLoad(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && location.hash === "#videur") refreshAndLoad(); });

  async function refreshAndLoad() {
    try { await refreshState({ booster: false }); } catch { /* l'aperçu relit tout sur le serveur de toute façon */ }
    load({ silent: true });
  }

  load({ silent: true });
}
