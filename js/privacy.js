// privacy.js — politique de confidentialité : texte, affichage dans un panneau plein écran, et liens.
//
// Le panneau marche PARTOUT, sans compte : écran de connexion, page publique d'une tenue partagée, profil.
// Tout élément portant l'attribut `data-privacy` l'ouvre (clic géré ici, une seule fois, sur le document).
// Le texte décrit ce que fait réellement le jeu (voir CLAUDE.md, sections 13, 15 et 17) : si le jeu change
// (nouvelle donnée collectée, nouveau prestataire…), mettre ce fichier à jour.

import { PRIVACY } from "./privacy-config.js?v=99";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Sections du texte : { title, paras: [texte], items: [texte] }. */
function sections() {
  const editor = PRIVACY.editor || "l'éditeur de Grail";
  return [
    {
      title: "En bref",
      items: [
        "Grail est un jeu gratuit. Il n'y a ni publicité, ni vente de tes données, ni argent réel.",
        "On garde ton e-mail et ton mot de passe (chiffré) pour te connecter, et ce que tu fais dans le jeu : tes cartes, tes pièces, ta tenue, tes amis.",
        "Seul ton pseudo est visible par d'autres : par tes amis, et sur la page d'une tenue que tu choisis de partager.",
        "Tu peux supprimer ton compte à tout moment depuis ton profil : tout est effacé immédiatement et définitivement.",
      ],
    },
    {
      title: "Qui est responsable ?",
      paras: [
        `${editor} est responsable du traitement de tes données personnelles pour ce jeu.`,
        ...(PRIVACY.contact ? [`Pour toute question ou pour exercer tes droits : ${PRIVACY.contact}.`] : []),
      ],
    },
    {
      title: "Les données que nous traitons",
      items: [
        "Ton compte : adresse e-mail et mot de passe. Le mot de passe est transformé par notre prestataire de connexion : nous ne pouvons pas le lire.",
        "Ton pseudo, si tu en choisis un (3 à 16 caractères, il doit respecter les règles du jeu).",
        "Ta progression : cartes, album, pièces, boosters, tenue et tenues enregistrées, vitrine, avatar choisi (Garçon / Fille), réputation, résultats au Videur, ventes et achats au Market.",
        "Tes amis : les demandes envoyées et reçues, et la liste de tes amis.",
        "Les tenues que tu partages par lien : une copie de ta tenue, ton avatar, ton pseudo et la date du partage.",
        "Des statistiques d'usage, sans contenu personnel : type d'appareil (iPhone, Android, ordinateur), taille d'écran arrondie, langue, fuseau horaire, site d'où tu viens, écrans visités, temps passé dans le jeu, actions comme changer de tenue ou partager, erreurs techniques. Elles sont rattachées à un identifiant de joueur, jamais à ton e-mail ni à ton pseudo. Aucune adresse IP n'est enregistrée par le jeu.",
      ],
    },
    {
      title: "Pourquoi et sur quelle base",
      items: [
        "Faire fonctionner ton compte et le jeu (connexion, cartes, Market, amis, Videur, partage) : c'est nécessaire pour te fournir le service.",
        "Mesurer si le jeu est utilisé et le corriger (statistiques d'usage) : c'est notre intérêt légitime à améliorer un jeu gratuit. Rien n'est envoyé si ton navigateur demande « Ne pas me suivre » (Do Not Track).",
        "Assurer la sécurité et éviter les abus (règles appliquées par le serveur, limites, pseudos filtrés).",
      ],
    },
    {
      title: "Qui voit quoi",
      items: [
        "Tes amis acceptés voient ton profil : pseudo, avatar et tenue, vitrine, progression, réputation. Ils ne voient jamais ton solde de pièces ni ton e-mail.",
        "Une personne qui reçoit le lien d'une tenue que tu partages voit cette tenue, ton avatar, ton pseudo et la date du partage, sans avoir de compte. Le lien est secret : ne le partage qu'avec qui tu veux.",
        "Au Market, les autres joueurs ne voient jamais qui vend ou qui achète.",
        "Nous ne vendons, ne louons et ne cédons tes données à personne.",
      ],
    },
    {
      title: "Prestataires et services tiers",
      paras: ["Pour fonctionner, le jeu s'appuie sur ces services, qui reçoivent des données techniques (dont ton adresse IP) quand ton navigateur les contacte :"],
      items: [
        "Supabase : connexion, base de données et fonctions du jeu. C'est là que sont stockées toutes les données listées plus haut, sur des serveurs situés dans l'Union européenne.",
        "GitHub Pages : hébergement du site (les pages et les images du jeu).",
        "Google Fonts : la police de caractères Archivo.",
        "jsDelivr : le fichier qui permet au site de parler à Supabase.",
        "Resend : envoi des e-mails du jeu (confirmation de ton compte, réinitialisation de ton mot de passe). Il reçoit ton adresse e-mail et le contenu de ces messages ; les e-mails sont envoyés depuis l'Union européenne (Irlande).",
        "GitHub Pages, Google Fonts et jsDelivr peuvent traiter les données techniques de ta visite (dont ton adresse IP), et Resend ton adresse e-mail, hors de l'Union européenne ; ils encadrent ces transferts dans leurs propres conditions (par exemple par des clauses contractuelles types). Tes données de jeu, elles, restent chez Supabase dans l'Union européenne.",
      ],
    },
    {
      title: "Combien de temps",
      items: [
        "Tes données sont conservées tant que ton compte existe.",
        "Quand tu supprimes ton compte, tes données sont effacées tout de suite : compte, progression, amis, ventes, liens de tenue partagés (ils cessent de fonctionner) et statistiques liées à toi.",
        "Les sauvegardes techniques de notre prestataire peuvent garder une trace pendant un court délai avant d'être renouvelées.",
      ],
    },
    {
      title: "Tes droits",
      items: [
        "Supprimer ton compte et tes données : depuis ton profil, bouton « Supprimer mon compte ». C'est immédiat.",
        "Modifier ton pseudo : depuis l'écran Amis (un changement tous les 30 jours).",
        "Accéder à tes données, les faire corriger, en demander une copie, t'opposer à leur traitement ou en demander la limitation" + (PRIVACY.contact ? ` : écris à ${PRIVACY.contact}.` : " : contacte l'éditeur du jeu."),
        "Si tu penses que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).",
      ],
    },
    {
      title: "Cookies et stockage sur ton appareil",
      items: [
        "Pas de cookies publicitaires, pas de traceurs de régie publicitaire.",
        "Ton navigateur garde ta session de connexion (pour que tu n'aies pas à te reconnecter à chaque fois) et quelques préférences (par exemple Garçon / Fille). Ils sont nécessaires au fonctionnement du jeu.",
        "Se déconnecter ou supprimer son compte efface cette session.",
      ],
    },
    {
      title: "Âge minimum",
      paras: ["Grail s'adresse aux personnes de 16 ans et plus. Si tu as moins de 16 ans, demande l'accord d'un parent ou d'un responsable légal avant de créer un compte."],
    },
    {
      title: "Sécurité",
      paras: ["Les échanges avec le jeu sont chiffrés (HTTPS). Les règles du jeu sont appliquées par le serveur, et personne ne peut lire les données d'un autre joueur depuis le site. Aucune sécurité n'est parfaite : choisis un mot de passe long et unique."],
    },
    {
      title: "Changements",
      paras: [`Cette politique peut évoluer avec le jeu. La date de dernière mise à jour est indiquée ci-dessous ; en cas de changement important, nous te prévenons dans le jeu.`],
    },
  ];
}

/** Construit le texte dans le panneau (une seule fois). */
function build(body) {
  body.append(el("p", "muted privacy-date", `Dernière mise à jour : ${PRIVACY.updated}`));
  for (const s of sections()) {
    const block = el("section", "privacy-section");
    block.append(el("h4", "privacy-title", s.title));
    for (const p of s.paras || []) block.append(el("p", "privacy-text", p));
    if (s.items?.length) {
      const ul = el("ul", "privacy-list");
      for (const item of s.items) ul.append(el("li", "", item));
      block.append(ul);
    }
    body.append(block);
  }
}

/** Branche le panneau et tous les liens `data-privacy`. À appeler une seule fois, au démarrage de la page. */
export function setupPrivacy() {
  const panel = document.getElementById("privacy");
  const body = document.getElementById("privacy-body");
  let built = false;

  function open() {
    if (!built) { build(body); built = true; }
    panel.hidden = false;
    body.scrollTop = 0;
  }
  function close() { panel.hidden = true; }

  document.addEventListener("click", (e) => {
    const link = e.target.closest?.("[data-privacy]");
    if (link) { e.preventDefault(); open(); }
  });
  document.getElementById("privacy-close").addEventListener("click", close);
  panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });
}
