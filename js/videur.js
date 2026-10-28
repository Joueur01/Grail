// videur.js — écran « Videur » : 3 portes par jour (Bar, Club, VIP), dress code du jour, deux jauges.
//
// ⚠️ Tout est calculé par le SERVEUR (migration 0012) : dress code du jour, score de style, points de
// rareté, essais, verrous, Flow. Ce fichier affiche ce que le serveur renvoie et envoie deux actions :
//  - videur_preview : aperçu GRATUIT de la tenue portée (ne consomme rien) ;
//  - videur_enter   : se présenter (consomme un essai).
// Aucune règle du Videur n'est codée ici.

import { getRarity } from "./data.js?v=45";
import { getVideurNight, videurPreview, videurEnter } from "./api.js?v=45";
import { SLOTS, initAvatar, drawAvatar } from "./avatar.js?v=45";
import { refreshState } from "./inventory.js?v=45";
import { showToast, reportError } from "./wallet.js?v=45";
import { playSound, vibrate } from "./effects.js?v=45";

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
    summary.textContent = `Flow : ${night.flow.toLocaleString("fr-FR")} · Série : ${days} jour${days > 1 ? "s" : ""}`;
  }

  function renderTabs() {
    tabs.replaceChildren(...night.doors.map((d) => {
      const b = el("button", "door-tab");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(d.id === selected));
      b.style.setProperty("--door-color", DOOR_COLOR[d.id]);
      b.append(el("span", "door-tab-name", d.name));
      b.append(el("span", "door-tab-state", d.passed ? "✔ Passée" : d.locked ? "🔒 Fermée" : `${d.tries_left} essai${d.tries_left > 1 ? "s" : ""}`));
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

  /** Tenue portée « à plat » (pièces renvoyées par le serveur : seulement celles encore possédées). */
  function outfitCanvas(pieces) {
    const worn = {};
    for (const p of pieces) {
      const colorway = catalogue.colorwayById.get(p.colorway_id);
      if (colorway) worn[p.slot] = colorway;
    }
    const canvas = el("canvas", "pixel videur-canvas");
    initAvatar(canvas);
    drawAvatar(canvas, worn).catch(() => {});
    return canvas;
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

  function renderDoor() {
    const door = doorOf(selected);
    if (!door) return;
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
