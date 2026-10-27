// gestures.js — reconnaît les gestes du doigt (ou de la souris) sur un élément :
//   - glisser : le doigt se déplace horizontalement d'au moins une part de la
//     largeur de l'élément (threshold) → onSwipe(direction : -1 gauche, +1 droite)
//   - rester appuyé : le doigt reste immobile au moins holdDelay ms → onHoldStart,
//     puis onHoldEnd quand on lâche (ou qu'on se met à glisser)
//   - toucher simple : appui court sans bouger → onTap
// Pendant le geste, onDrag(dx, progression 0→1) permet de faire suivre le doigt ;
// onRelease est appelé si on lâche sans avoir glissé assez loin.

const MOVE_TOLERANCE = 10; // px : en dessous, on considère que le doigt n'a pas bougé

export function attachGesture(el, {
  threshold = 0.35,
  holdDelay = 220,
  onDrag, onSwipe, onRelease, onHoldStart, onHoldEnd, onTap,
} = {}) {
  let start = null;   // { x } au moment de l'appui, null si aucun geste en cours
  let moved = false;
  let holding = false;
  let holdTimer = null;

  function stopHold() {
    clearTimeout(holdTimer);
    if (holding) onHoldEnd?.();
    holding = false;
  }

  function end() {
    stopHold();
    start = null;
  }

  el.addEventListener("pointerdown", (e) => {
    // Empêche le navigateur de sélectionner du texte ou de « faire glisser une
    // image » : sinon il annule le geste au prochain glissement (pointercancel).
    e.preventDefault();
    if (el.dataset.locked === "1") return; // geste bloqué (animation en cours)
    start = { x: e.clientX };
    moved = false;
    holding = false;
    el.setPointerCapture?.(e.pointerId);
    holdTimer = setTimeout(() => {
      if (start && !moved) {
        holding = true;
        onHoldStart?.();
      }
    }, holdDelay);
  });

  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    if (!moved && Math.abs(dx) > MOVE_TOLERANCE) {
      moved = true;
      clearTimeout(holdTimer); // on glisse : pas d'appui long
    }
    if (!moved) return;
    const distance = el.offsetWidth * threshold;
    onDrag?.(dx, Math.min(1, Math.abs(dx) / distance));
    if (Math.abs(dx) >= distance) {
      end();
      onSwipe?.(Math.sign(dx));
    }
  });

  el.addEventListener("pointerup", () => {
    if (!start) return;
    const wasHolding = holding;
    const wasMoved = moved;
    end();
    if (!wasMoved && !wasHolding) onTap?.();
    else onRelease?.();
  });

  // Geste interrompu par le téléphone (appel, notification…) : on annule.
  el.addEventListener("pointercancel", () => {
    if (!start) return;
    end();
    onRelease?.();
  });
}
