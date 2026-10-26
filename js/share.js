// share.js — export de la tenue en PNG et partage.
// À faire (tâche « Partager ma tenue ») :
//   1. dessiner l'avatar agrandi (facteur entier) + noms des pièces et raretés
//      dans un canvas hors écran ;
//   2. canvas.toBlob() → fichier PNG ;
//   3. navigator.share({ files: [...] }) si navigator.canShare le permet,
//      sinon téléchargement via un lien <a download>.

/** Indique si le partage natif de fichiers est disponible sur cet appareil. */
export function canShareFiles() {
  try {
    const test = new File([""], "test.png", { type: "image/png" });
    return Boolean(navigator.canShare && navigator.canShare({ files: [test] }));
  } catch {
    return false;
  }
}
