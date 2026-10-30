// videur-tour.js — écran « Videur » en TOUR DE NIVEAUX (migration 0032) : niveau N = Bar N → Club N → VIP N.
//
// ⚠️ Tout est décidé par le SERVEUR : la règle de chaque porte (propre à chaque joueur), le seuil de rareté,
// les essais, le blocage jusqu'au lendemain, la limite de niveaux par jour, les boosters. Ce fichier affiche ce
// que renvoie get_videur_tower et envoie deux actions :
//  - videur_tower_preview : aperçu GRATUIT de la tenue (seulement en mode « visible » : tous les niveaux depuis la 0034) ;
//  - videur_tower_enter   : se présenter à la porte en cours (consomme un essai).
// Modes (envoyés par le serveur pour la porte en cours ; depuis la migration 0034, toujours « visible »,
// les modes cachés restent gérés au cas où ils seraient remis dans economy_config) :
//  - « visible » : règles en clair, coches ✔/✖ de l'aperçu ;
//  - « count »   : règles CACHÉES ; après chaque essai, « X critères sur N » + un indice ;
//  - « hint »    : règles CACHÉES ; après chaque essai, l'indice seulement.
// En mode caché, le serveur n'envoie jamais les règles ni les seuils : il n'y a ici aucune règle, aucun seuil.

import { getVideurTower, videurTowerPreview, videurTowerEnter } from "./api.js?v=102";
import { updateVideurBadge } from "./badges.js?v=102";
import { SLOTS, readBodyChoice } from "./avatar.js?v=102";
import { createAvatar3D } from "./avatar3d.js?v=102";
import { refreshState, getEquipped } from "./inventory.js?v=102";
import { showToast, reportError } from "./wallet.js?v=102";
import { playSound, vibrate } from "./effects.js?v=102";
import { quickOutfits } from "./outfits.js?v=102";

/** Couleur d'enseigne de chaque porte (comme les raretés : bleu, violet, or). */
const DOOR_COLOR = { bar: "var(--rarity-rare)", club: "var(--rarity-epique)", vip: "var(--rarity-legendaire)" };

/** Phrase d'introduction selon le mode de la porte (aucune règle : seulement ce que le joueur va voir). */
const MODE_INTRO = {
  visible: "Les règles sont écrites en clair. L'aperçu de ta tenue est gratuit.",
  count: "Règles cachées. Après chaque essai, le videur te dit combien de critères tu respectes et te donne un indice.",
  hint: "Règles cachées. Après chaque essai, le videur ne lâche qu'un indice.",
};

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Pluriel simple (« niveau » → « niveaux », sinon un « s »). */
const plural = (n, word) => `${n} ${word}${n > 1 ? (word.endsWith("eau") ? "x" : "s") : ""}`;

/**
 * Branche l'écran Videur en mode « tour ».
 * - catalogue : résultat de loadCatalogue() (pour dessiner la tenue)
 * - first : première réponse de get_videur_tower (déjà lue par videur.js pour choisir le mode)
 */
export function setupTower({ catalogue, first }) {
  const summary = document.getElementById("videur-summary");
  const errorBox = document.getElementById("videur-error");
  const steps = document.getElementById("door-tabs");
  const doorBox = document.getElementById("videur-door");
  const sheet = document.getElementById("card-sheet");
  const sheetTitle = document.getElementById("card-sheet-title");
  const sheetBody = document.getElementById("card-sheet-body");
  steps.setAttribute("role", "list");
  steps.setAttribute("aria-label", "Portes du niveau");

  let tower = first;    // dernière réponse de get_videur_tower
  let preview = null;   // dernier aperçu (mode visible)
  let busy = false;
  let version = 0;      // ignore un aperçu arrivé après une nouvelle lecture
  // Tenues enregistrées (migration 0036) : en remettre une relit la tour et l'aperçu.
  const savedOutfits = quickOutfits({ onWorn: () => load({ silent: true }) });

  function showError(err) {
    errorBox.textContent = err.message || String(err);
    errorBox.hidden = false;
  }

  // --- Lecture ---------------------------------------------------------------------

  async function load({ silent = false } = {}) {
    try {
      tower = await getVideurTower();
      errorBox.hidden = true;
      render();
      await loadPreview();
    } catch (err) {
      if (!silent) showError(err);
    }
  }

  async function loadPreview() {
    const v = ++version;
    preview = null;
    if (tower.status !== "play" || tower.door.mode !== "visible") return;
    try {
      const p = await videurTowerPreview();
      if (v !== version) return;
      preview = p;
      renderDoor();
    } catch (err) {
      if (v === version) showError(err);
    }
  }

  // --- Affichage -------------------------------------------------------------------

  function render() {
    updateVideurBadge(tower);
    renderSummary();
    renderSteps();
    renderDoor();
  }

  /** Trois tuiles bien visibles : niveau en cours, niveaux validés aujourd'hui (et restants), série. */
  function renderSummary() {
    const days = tower.streak || 0;
    const left = Math.max(tower.max_per_day - tower.today_cleared, 0);
    // Une tuile : petite étiquette, grand chiffre, précision dessous (des <span> : on est dans un <p>).
    const tile = (label, value, sub, extra = "") => {
      const t = el("span", `videur-stat ${extra}`.trim());
      t.append(el("span", "videur-stat-label", label), el("span", "videur-stat-value", value), el("span", "videur-stat-sub", sub));
      return t;
    };
    summary.className = "videur-stats";
    summary.replaceChildren(
      tile("Niveau", String(tower.level), "en cours", "is-level"),
      tile("Aujourd'hui", `${tower.today_cleared} / ${tower.max_per_day}`,
        left > 0 ? `${left} restant${left > 1 ? "s" : ""}` : "Reviens demain", left > 0 ? "" : "is-done"),
      tile("Série", String(days), days > 1 ? "jours d'affilée" : "jour", days > 0 ? "is-streak" : ""),
    );
  }

  /** Les 3 portes du niveau en cours : passée, en cours, fermée (simple repère, pas des boutons). */
  function renderSteps() {
    steps.replaceChildren(...tower.doors.map((d) => {
      const item = el("div", "door-tab door-step");
      item.setAttribute("role", "listitem");
      if (d.state === "current") item.setAttribute("aria-current", "step");
      item.dataset.state = d.state;
      item.style.setProperty("--door-color", DOOR_COLOR[d.id]);
      item.append(el("span", "door-tab-name", d.name),
        el("span", "door-tab-state", d.state === "passed" ? "✔ Passée" : d.state === "current" ? "En cours" : "🔒 Ensuite"));
      return item;
    }));
  }

  /** Tenue portée en 3D (pièces encore possédées), qu'on fait tourner en glissant. */
  function outfitCanvas(pieces) {
    const worn = {};
    for (const p of pieces) {
      const colorway = catalogue.colorwayById.get(p.colorway_id);
      if (colorway) worn[p.slot] = colorway;
    }
    const stage = el("div", "videur-stage");
    const canvas = el("canvas", "pixel avatar-3d videur-avatar");
    canvas.width = 46;
    canvas.height = 88;
    canvas.setAttribute("aria-label", "Ta tenue en 3D : glisse pour la faire tourner");
    stage.append(canvas);
    createAvatar3D(canvas).setOutfit(worn, { type: readBodyChoice() }).catch((err) => console.error("Avatar 3D :", err));
    const wrap = el("div", "videur-outfit");
    wrap.append(stage, el("p", "muted videur-outfit-hint", "Glisse pour tourner"));
    return wrap;
  }

  /** Tenue portée, lue dans le cache du jeu (le serveur refait le calcul à chaque essai). */
  function worn() {
    const pieces = [];
    for (const slot of SLOTS) {
      const card = getEquipped(slot.id);
      if (card) pieces.push({ slot: slot.id, colorway_id: card.colorwayId, rarity: card.rarity });
    }
    return pieces;
  }

  /** Liste de règles : avec coches si `ok` est connu (aperçu, verdict), sinon simples puces. */
  function rulesList(rules) {
    const list = el("ul", "rule-list");
    for (const r of rules) {
      const li = el("li", r.ok === undefined ? "rule" : r.ok ? "rule ok" : "rule no");
      li.append(el("span", "rule-mark", r.ok === undefined ? "•" : r.ok ? "✔" : "✖"), el("span", "rule-label", r.label));
      list.append(li);
    }
    return list;
  }

  /** Récompense annoncée sur le bouton : boosters gagnés en passant cette porte (selon le serveur : depuis la
   *  migration 0035, le booster du niveau, annoncé au VIP seulement). */
  function rewardText(door) {
    return door.boosters ? ` · +${plural(door.boosters, "booster")}` : "";
  }

  function renderDoor() {
    const door = tower.door;
    const nodes = [];

    // Enseigne : la porte et le niveau.
    const sign = el("div", "door-sign");
    sign.style.setProperty("--door-color", DOOR_COLOR[door.id]);
    sign.append(el("span", "door-sign-door", door.name), el("span", "door-sign-venue", `Niveau ${tower.level}`));
    nodes.push(sign, el("p", "muted door-intro", MODE_INTRO[door.mode] || MODE_INTRO.count));

    // Statut du jour : limite atteinte ou porte bloquée.
    if (tower.status === "limit") {
      nodes.push(el("p", "videur-banner", `Tu as validé ${plural(tower.max_per_day, "niveau")} aujourd'hui. Reviens demain pour la suite.`));
    } else if (tower.status === "blocked") {
      nodes.push(el("p", "videur-banner", "Plus d'essai à cette porte : le niveau reprend demain, avec une nouvelle règle."));
    }

    // Mode visible : le dress code, avec les coches de l'aperçu gratuit.
    if (door.mode === "visible" && door.rules && tower.status === "play") {
      nodes.push(el("h3", "videur-h", "Dress code"));
      nodes.push(rulesList(preview ? preview.rules : door.rules));
      if (preview) nodes.push(el("p", "muted videur-note", `${preview.matched} critère${preview.matched > 1 ? "s" : ""} sur ${preview.total} avec ta tenue actuelle`));
    }

    // La tenue.
    nodes.push(el("h3", "videur-h", "Ta tenue"));
    const pieces = preview ? preview.pieces : worn();
    if (pieces.length) nodes.push(outfitCanvas(pieces));
    else nodes.push(el("p", "muted videur-empty", "Tu ne portes rien. Compose une tenue, puis présente-toi."));
    const change = el("a", "btn videur-change", "Changer ma tenue");
    change.href = "#avatar";
    nodes.push(change);
    savedOutfits.refresh(); // « ✓ Tenue N » si la tenue portée est une tenue enregistrée
    nodes.push(savedOutfits);

    // Ce que le videur t'a dit aujourd'hui à cette porte (mode caché).
    if (door.mode !== "visible" && door.attempts.length) {
      nodes.push(el("h3", "videur-h", "Ce que le videur t'a dit"));
      const list = el("ul", "rule-list");
      door.attempts.forEach((a, i) => {
        const li = el("li", a.passed ? "rule ok" : "rule");
        const right = a.passed ? "Entré" : typeof a.matched === "number" ? `${a.matched} sur ${a.total}` : "Refusé";
        li.append(el("span", "rule-mark", `#${i + 1}`), el("span", "rule-label", a.passed ? "Entrée accordée." : `« ${a.hint} »`), el("span", "rule-weight", right));
        list.append(li);
      });
      nodes.push(list);
    }

    // Porte bloquée : la règle est révélée.
    if (door.reveal) {
      nodes.push(el("h3", "videur-h", "La règle de cette porte"));
      nodes.push(rulesList(door.reveal.map((label) => ({ label }))));
      if (door.mode !== "visible" && door.attempts.length) nodes.push(shareButton(door.attempts, false));
    }

    // Bouton « Se présenter » : l'état vient du serveur.
    const enter = el("button", "btn btn-primary videur-enter");
    enter.type = "button";
    if (tower.status === "limit") enter.textContent = "Reviens demain";
    else if (tower.status === "blocked") enter.textContent = "Plus d'essai aujourd'hui";
    else if (!pieces.length) enter.textContent = "Porte au moins une pièce";
    else enter.textContent = `Se présenter · ${plural(door.tries_left, "essai")}${rewardText(door)}`;
    enter.disabled = tower.status !== "play" || !pieces.length || busy;
    enter.addEventListener("click", enterDoor);
    nodes.push(enter);

    // Booster du niveau (migration 0035) et booster de palier (tous les 5 niveaux), en une phrase quand les deux
    // tombent sur ce niveau. Le bouton du VIP affiche déjà le booster du niveau.
    const bonusHere = tower.level_bonus_boosters > 0 && tower.next_bonus_level === tower.level;
    if (tower.level_boosters > 0 && !door.boosters && tower.status === "play") {
      const bonus = bonusHere ? ` et +${plural(tower.level_bonus_boosters, "booster")} bonus` : "";
      nodes.push(el("p", "muted videur-note", `Valide le niveau (Bar, Club puis VIP) pour gagner +${plural(tower.level_boosters, "booster")}${bonus}.`));
    }
    // Prochain booster de palier (tous les 5 niveaux), s'il n'est pas déjà annoncé au-dessus.
    if (tower.level_bonus_boosters > 0 && !(bonusHere && tower.level_boosters > 0 && !door.boosters && tower.status === "play")) {
      const left = tower.next_bonus_level - tower.level;
      nodes.push(el("p", "muted videur-note", left === 0
        ? `Valide ce niveau pour gagner +${plural(tower.level_bonus_boosters, "booster")} bonus.`
        : `+${plural(tower.level_bonus_boosters, "booster")} bonus au niveau ${tower.next_bonus_level} (encore ${plural(left + 1, "niveau")} à valider).`));
    }
    if (door.mode === "visible" && tower.status === "play") nodes.push(el("p", "muted videur-note", "L'aperçu est gratuit et illimité. Seul « Se présenter » consomme un essai."));
    doorBox.replaceChildren(...nodes);
  }

  // --- Partage sans spoiler -----------------------------------------------------------

  /** 🟩 entré · 🟨 presque (au moins la moitié des critères, si le serveur donne le compte) · ⬛ loin. */
  function squares(attempts) {
    return attempts.map((a) => (a.passed ? "🟩" : typeof a.matched === "number" && a.matched >= Math.ceil(a.total / 2) ? "🟨" : "⬛")).join("");
  }

  /** Bouton « Partager mon résultat » : niveau, porte, essais et carrés ; jamais les critères. */
  function shareButton(attempts, won, { level = tower.level, doorName = tower.door.name, tries = tower.door.tries } = {}) {
    const b = el("button", "btn videur-change", "Partager mon résultat");
    b.type = "button";
    b.addEventListener("click", async () => {
      const date = new Date(tower.day).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" });
      const text = `Grail · Videur · Niveau ${level} · ${doorName} ${date}\n${won ? attempts.length : "X"}/${tries}\n${squares(attempts)}\n${location.origin}${location.pathname}`;
      try {
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) { await navigator.share({ text }); return; }
        await navigator.clipboard.writeText(text);
        showToast("Résultat copié.");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        showToast("Impossible de copier le résultat.", { error: true });
      }
    });
    return b;
  }

  // --- Se présenter ------------------------------------------------------------------

  async function enterDoor() {
    if (busy) return;
    busy = true;
    const before = { level: tower.level, door: tower.door };
    renderDoor();
    try {
      const result = await videurTowerEnter(); // le serveur décide
      playSound(result.passed ? "door_ok" : "door_no");
      vibrate(result.passed ? [40, 40, 80] : 120);
      showVerdict(before, result);
      // Profil (niveau, anneau du bouton profil) et boosters offerts : relus sur le serveur.
      try { await refreshState(); } catch { /* sans importance : l'écran relit la tour juste après */ }
      await load({ silent: true });
    } catch (err) {
      reportError(err);
      await load({ silent: true });
    } finally {
      busy = false;
      if (tower) renderDoor();
    }
  }

  /** Fiche du verdict : ENTRÉE / REFUSÉ, réplique ou indice, détail selon le mode, gains, règle à la fin. */
  function showVerdict(before, r) {
    const door = before.door;
    sheetTitle.textContent = `${door.name} · Niveau ${before.level}`;
    const verdict = el("div", r.passed ? "verdict pass" : "verdict fail");
    verdict.append(el("p", "verdict-word", r.passed ? "ENTRÉE" : "REFUSÉ"));
    if (r.line) verdict.append(el("p", "verdict-line", `« ${r.line} »`));
    const nodes = [verdict];

    if (!r.passed && typeof r.matched === "number") {
      nodes.push(el("p", "sheet-subtitle verdict-count", `${r.matched} critère${r.matched > 1 ? "s" : ""} sur ${r.total}`));
    }
    if (r.rules) nodes.push(rulesList(r.rules)); // mode visible : le détail ✔/✖

    if (r.passed) {
      const gains = [];
      if (r.boosters_gained) gains.push(`+${plural(r.boosters_gained, "booster")}`);
      if (r.level_bonus) gains.push(`+${plural(r.level_bonus, "booster")} bonus`);
      if (gains.length) nodes.push(el("p", "sheet-subtitle verdict-gain", gains.join(" · ")));
      if (r.level_cleared) {
        nodes.push(el("p", "sheet-text verdict-level", `Niveau ${before.level} validé ! Niveau ${before.level + 1} débloqué.`));
        if (r.today_cleared >= r.max_per_day) nodes.push(el("p", "muted sheet-text", `${plural(r.max_per_day, "niveau")} validés aujourd'hui : la suite demain.`));
      } else {
        nodes.push(el("p", "muted sheet-text", "Porte suivante débloquée."));
      }
    } else {
      nodes.push(el("p", "muted sheet-text", r.tries_left > 0
        ? `Il te reste ${plural(r.tries_left, "essai")}. ${door.mode === "visible" ? "Corrige ce qui manque." : "Change ta tenue d'après l'indice."}`
        : "Plus d'essai : ce niveau reprend demain, avec une nouvelle règle."));
    }
    if (r.reveal) {
      nodes.push(el("h3", "videur-h", "La règle de cette porte"));
      nodes.push(rulesList(r.reveal.map((label) => ({ label }))));
    }
    // Partage (mode caché, porte terminée) : essais d'avant + celui-ci.
    if (door.mode !== "visible" && (r.passed || r.tries_left <= 0)) {
      const attempts = [...door.attempts, { passed: r.passed, matched: r.matched, total: r.total }];
      nodes.push(shareButton(attempts, r.passed, { level: before.level, doorName: door.name, tries: door.tries }));
    }
    const close = el("button", "btn btn-primary", "OK");
    close.addEventListener("click", () => { sheet.hidden = true; });
    nodes.push(close);
    sheetBody.replaceChildren(...nodes);
    sheet.hidden = false;
  }

  // --- Mise à jour -------------------------------------------------------------------

  // La tenue peut changer sur l'écran Tenue, et le jour peut changer : on relit en revenant ici.
  window.addEventListener("hashchange", () => { if (location.hash === "#videur") refreshAndLoad(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && location.hash === "#videur") refreshAndLoad(); });

  async function refreshAndLoad() {
    try { await refreshState({ booster: false }); } catch { /* la tour est relue sur le serveur de toute façon */ }
    load({ silent: true });
  }

  render();
  loadPreview();
}
