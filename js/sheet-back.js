// sheet-back.js — le bouton « retour » du téléphone ferme la fiche ouverte au lieu de changer d'écran.
//
// Toutes les fiches du jeu utilisent les mêmes éléments (#card-sheet, #picker, #starter-kit, #privacy)
// et le plein écran Légendaire (#reveal-overlay). On surveille simplement leur attribut « hidden » :
// - une fiche s'ouvre  → on ajoute une étape dans l'historique (même adresse) ;
// - le joueur fait « retour » → cette étape disparaît : on ferme la fiche (comme le bouton ✕) ;
// - la fiche est fermée autrement (✕, bouton…) → on retire l'étape ajoutée, pour que le « retour »
//   suivant ne soit pas un toucher dans le vide.
// Aucun module de fiche n'a besoin de connaître ce fichier.

const IDS = ["card-sheet", "picker", "starter-kit", "privacy", "reveal-overlay"];
const MARK = "grailSheet"; // repère posé dans l'étape d'historique ajoutée

let pushed = false;        // une étape « fiche ouverte » est en haut de l'historique
let ignorePop = false;     // le prochain « popstate » vient de notre propre history.back()

const sheets = () => IDS.map((id) => document.getElementById(id)).filter(Boolean);
const openSheets = () => sheets().filter((el) => !el.hidden);

/** Ferme une fiche comme le ferait le joueur : bouton ✕ si elle en a un, sinon événement « grail:close ». */
function closeSheet(el) {
  const close = el.querySelector(".picker-close");
  if (close) close.click();
  else el.dispatchEvent(new Event("grail:close"));
}

function sync() {
  const open = openSheets().length > 0;
  if (open && !pushed) {
    history.pushState({ [MARK]: true }, "");
    pushed = true;
  } else if (!open && pushed) {
    pushed = false;
    // On attend la fin du toucher : si ce toucher suivait un lien (#videur…), une nouvelle étape
    // a été ajoutée par-dessus la nôtre ; on n'y touche pas (sinon on annulerait la navigation).
    setTimeout(() => {
      if (history.state?.[MARK] && openSheets().length === 0) {
        ignorePop = true;
        history.back();
      }
    }, 0);
  }
}

export function setupSheetBack() {
  const observer = new MutationObserver(sync);
  for (const el of sheets()) observer.observe(el, { attributes: true, attributeFilter: ["hidden"] });

  window.addEventListener("popstate", () => {
    if (ignorePop) { ignorePop = false; return; }
    if (!pushed) {
      // On retombe sur une ancienne étape « fiche ouverte » restée enfouie (un lien a été suivi depuis la
      // fiche) : elle ne correspond plus à rien, on la saute pour que ce « retour » ne tombe pas dans le vide.
      if (history.state?.[MARK] && openSheets().length === 0) history.back();
      return;
    }
    pushed = false; // l'étape « fiche ouverte » vient d'être retirée par le « retour »
    for (const el of openSheets()) closeSheet(el);
    // Fiche qui refuse de se fermer (roue qui tourne, Légendaire qu'on savoure) : on remet l'étape.
    setTimeout(sync, 0);
  });

  // Navigation vers un autre écran pendant qu'une fiche est ouverte (lien dans la fiche) :
  // notre étape est enfouie sous la nouvelle, on l'oublie, et la fiche de l'écran précédent se ferme.
  window.addEventListener("hashchange", () => {
    if (!pushed || history.state?.[MARK]) return;
    pushed = false;
    for (const el of openSheets()) closeSheet(el);
  });
  sync(); // une fiche déjà ouverte au démarrage (kit de départ)
}
