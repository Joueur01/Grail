# CLAUDE.md — Grail

Ce fichier donne à Claude Code tout le contexte du projet. Lis-le en entier avant chaque tâche.
Réponds et commente en **français**. L'interface du jeu est en français.
**État du projet, à faire, décisions en attente et pièges connus : section 19** (mise à jour le 29 octobre 2026).

---

## 1. Le projet en une phrase

Un jeu web de **tenues à collectionner** : on ouvre des boosters de vêtements en pixel art, on les collectionne selon leur rareté, on les porte sur un avatar, et on partage sa tenue avec ses amis.

Inspiration : WikiMasters (boosters quotidiens, collection, rareté), mais avec des vêtements streetwear de **marques fictives**.

## 2. Public et angle

- Cible : jeunes adultes, **16-25 ans**, public mixte, avec une priorité pour **attirer les garçons** (angle streetwear, culture du resell).
- On se démarque des jeux d'habillage visant surtout les filles et les enfants. Le ton doit rester sobre, « street », jamais enfantin ni trop illustré.
- Le cœur du jeu n'est pas seulement la collection : ce sont **les tenues créées par les joueurs**. Le plaisir vient de combiner une tenue **stylée** et une tenue **rare**.

## 3. Objectif actuel : la bêta (semaine du 26 octobre au 1er novembre 2026)

**Critère de réussite :** dimanche 1er novembre, **3 amis** ont ouvert un booster et partagé une tenue depuis leur téléphone.

Contraintes de la bêta :
- **Budget : tout reste gratuit** : site sur GitHub Pages, back end sur Supabase (offre gratuite), e-mails par Resend (offre gratuite), DNS chez Namecheap. **Aucun serveur payant n'est prévu pour l'instant** (les serveurs Hetzner de la section 12 ne sont pas utilisés). Aucune API payante.
- **Le jeu a des comptes et un back end Supabase** (voir section 13). **Le serveur est la source de vérité** : le front affiche ce que le serveur renvoie et ne contient **aucune logique de jeu** (tirages, gains, chances, règles du Market). Il n'y a plus de sauvegarde locale du joueur : tout est sur le serveur.
- Hébergement du site : **GitHub Pages** (site statique, branche `main`, racine du dépôt). **Adresse du jeu : `https://huntgrail.eu`** (nom de domaine acheté chez Namecheap ; fichier `CNAME` à la racine du dépôt ; DNS : 4 enregistrements A `@` vers les adresses de GitHub Pages `185.199.108.153` à `.111.153`, et un CNAME `www` vers `joueur01.github.io` ; `www` redirige vers le domaine nu ; HTTPS par certificat Let's Encrypt géré par GitHub). L'ancienne adresse `joueur01.github.io/Grail` redirige vers le nouveau domaine. Le navigateur garde la session par adresse : un changement d'adresse oblige à se reconnecter une fois. Le domaine pourra plus tard pointer vers le serveur Hetzner (section 12) en changeant les enregistrements A.
- **Mobile d'abord** : le test se fait sur téléphone. Tout doit marcher au doigt, en portrait, sur un écran de ~375 px de large.
- Le développeur y passe 1 à 2 h par jour. Chaque tâche doit produire **quelque chose de visible qui marche**.

### Fonctionnalités de la bêta, dans l'ordre

1. **Booster** : un bouton « Ouvrir un booster » qui ouvre un booster de 3 cartes **tiré par le serveur** selon les taux de rareté (section 6), avec une petite animation de révélation carte par carte. ✅ Fait.
2. **Inventaire** : la collection du joueur, sauvegardée **sur le serveur**, avec filtres simples (marque, catégorie, rareté) et le nombre d'exemplaires de chaque carte. ✅ Fait : progression « X / N » (N = nombre de cartes du catalogue : 700 avec les 7 marques), filtres Marque / Type / Rareté (menus natifs, collés en haut), grille triée de la plus rare à la plus commune, badge « ×N » pour les doublons.
3. **Avatar** : un personnage en pixel art sur lequel on équipe une pièce par emplacement (section 7). ✅ Fait pour la bêta (fiche de tenue, tenue « à plat »).
4. **Partager ma tenue** : **un seul bouton**, qui partage le **lien public** de la tenue avec l'image PNG (section 13 bis). Image : exporter l'avatar habillé en **image PNG** (canvas → PNG), avec le nom des pièces et leur rareté, puis partage natif (`navigator.share` avec fichier si disponible, sinon téléchargement). ✅ Fait : PNG 1080 × 1350 (**avatar 3D** Garçon / Fille de trois quarts ×6 sur cadre gris sombre + liste tête → pieds : nom, marque, coloris, rareté + adresse du jeu), **préparé à l'avance** à chaque changement de tenue (Safari n'ouvre le partage que juste après un toucher), repli téléchargement ; bouton désactivé tant que rien n'est porté.
5. **Mise en ligne** sur GitHub Pages et test sur iPhone/Android.

### Hors périmètre de la bêta (ne pas coder pour l'instant)

Échanges directs entre joueurs, achats en argent réel, abonnement, comptes via réseaux sociaux, votes, défis de style, contenu créé librement par les joueurs (textes, images), notifications. (La 3D de l'avatar a été lancée à la demande du développeur : section 7 bis.)

Ces fonctionnalités viendront plus tard **seulement si le test est positif**. Le code peut rester simple et ne pas les anticiper.

## 4. Stack technique

- **HTML, CSS et JavaScript « vanilla »**, sans framework ni étape de build (pas de npm, pas de bundler). Le site doit fonctionner en ouvrant simplement les fichiers via GitHub Pages.
- Modules ES (`<script type="module">`) autorisés.
- Pixel art : toujours afficher les sprites agrandis par un **facteur entier** (×4, ×6, ×8…) avec `image-rendering: pixelated` (canvas : `imageSmoothingEnabled = false`). Jamais de flou ni de redimensionnement non entier.
- Taille des sprites dans les cartes : choisie selon la **largeur réelle de la carte** (container queries `@container`), jamais selon la largeur de l'écran, pour qu'un sprite ne dépasse jamais de sa carte. Avant chaque mise en ligne, vérifier les écrans de 320 px (petit téléphone) à 1920 px (PC), iPad portrait et paysage compris.
- Pas de dépendance externe sauf nécessité réelle ; si besoin, une police Google Fonts au maximum.
- **Supabase** : `supabase-js` est chargé en module ES depuis le CDN jsdelivr, **version figée** (`@2.45.4`, dans `js/api.js`) ; pas de build. Le seul fichier qui parle au serveur est `js/api.js`. Clé **anon** (publique) dans `js/supabase-config.js` ; **jamais de clé `service_role`** ni de clé secrète dans le dépôt. L'ancienne sauvegarde `grail_save_v1` n'existe plus (supprimée du navigateur au démarrage).

### Arborescence visée

```
/
├── index.html
├── style.css
├── CNAME            # domaine du site : huntgrail.eu (GitHub Pages)
├── favicon.ico      # logo de l'onglet / de Google (16, 32, 48 px ; tools/creer_logo.py)
├── manifest.webmanifest  # nom et icônes pour l'écran d'accueil Android
├── js/
│   ├── main.js        # navigation entre écrans
│   ├── api.js         # SEUL contact avec le serveur : connexion, lectures, une fonction par action
│   ├── supabase-config.js # adresse du projet + clé anon (publique)
│   ├── data.js        # chargement du catalogue, raretés, recherche
│   ├── economy-config.js  # valeurs de l'économie, pour l'AFFICHAGE seulement (le serveur décide)
│   ├── wallet.js      # solde de pièces (en-tête), bonus quotidien, notification
│   ├── rules.js       # page « Règles du jeu » : taux de drop et spécificités du jeu, en sections repliables
│   ├── reputation.js  # réputation : anneau de progression + niveau autour du bouton profil, notification de niveau
│   ├── booster.js     # écran Booster : stock, minuteur, déchirure, révélation
│   ├── effects.js     # sons synthétisés, vibrations, particules
│   ├── gestures.js    # gestes : glisser, rester appuyé, toucher
│   ├── inventory.js   # état du joueur lu sur le serveur (cache) + écran Collection
│   ├── cards.js       # dessin d'une carte (partagé booster / collection)
│   ├── upgrade.js     # fiche d'une carte + amélioration par la roue
│   ├── discard.js     # défausse : sélection de plusieurs cartes contre des pièces
│   ├── atelier.js     # vue « Atelier » : progression par modèle + rareté
│   ├── album.js       # vue « Album » : une case par coloris et par rareté, définitif ; Ultime à la clé
│   ├── market.js      # Market entre joueurs (offres et actions via le serveur) : Vendre, Mes ventes, Historique, achat
│   ├── market-browse.js  # Marché « Bazaar » : catalogue modèles → coloris + rareté → offres (onglet Acheter)
│   ├── friends.js     # écran Amis : pseudo, demandes, liste, profil d'un ami (via le serveur)
│   ├── profile.js     # page de profil (la sienne : bouton rond en haut ; celle d'un ami) : identité, avatar 3D, vitrine, statistiques
│   ├── avatar.js      # écran Tenue : cases, tenue « à plat » (canvas), bascule 3D / À plat
│   ├── avatar3d.js    # avatar 3D en voxels : construction, rendu (un rayon par pixel), glisser pour tourner
│   ├── wear-models.js # modèles 3D « portés » : corps de base + un modèle par pièce
│   ├── videur.js      # écran Videur : portes, dress code du jour, jauges, verdict (via le serveur)
│   ├── analytics.js   # mesure d'usage anonyme (rétention) : événements groupés → track_events
│   ├── badges.js      # pastilles de notification de la barre du bas (boosters, Videur)
│   ├── privacy.js     # politique de confidentialité : texte + panneau ouvert par tout élément `data-privacy`
│   ├── privacy-config.js  # éditeur et contact affichés dans la politique (à remplir par le développeur)
│   ├── account.js     # suppression de son compte (bouton en bas du profil)
│   ├── starter.js     # kit de départ : choix d'une marque à la première ouverture (4 pièces Communes + boosters offerts)
│   ├── share.js       # partage de la tenue : lien public (principal) + export PNG (option)
│   └── shared-outfit.js  # page publique d'une tenue partagée (?tenue=CODE), sans compte
├── data/
│   └── pieces.json    # catalogue des pièces et coloris
├── assets/
│   ├── pieces/        # un PNG 32×32 par coloris, fond transparent
│   ├── brand/         # logo : icon.svg, icon-<N>.png, logo-email.png, og-image.png (section 18)
│   ├── ui/            # booster.png, accueil-avatar.png (avatar 3D de l'écran d'accueil)
│   └── avatar/        # corps de base et éventuels calques « portés »
├── visuels/           # référence, ne pas servir au jeu
│   ├── sources/       # planches PNG d'origine fournies (une par marque)
│   ├── pieces/        # un SVG 32×32 par coloris
│   └── *_coloris_apercu.svg  # planches reconstruites en SVG
├── supabase/
│   ├── migrations/       # 0001 à 0004 : PAS dans le dépôt (voir la section 19)
│   │   ├── 0005_amis.sql  # amis (à exécuter dans le SQL Editor de Supabase)
│   │   ├── 0006_pseudo_30_jours.sql  # un changement de pseudo tous les 30 jours
│   │   ├── 0007_pseudos_interdits.sql  # mots interdits dans les pseudos
│   │   ├── 0008_tenue_partagee.sql  # lien public vers une tenue
│   │   ├── 0009_historique_market.sql  # historique achats / ventes du Market
│   │   ├── 0010_retention_stats.sql  # mesure de rétention + vues de statistiques
│   │   ├── 0011_taxe_vente.sql  # taxe de 5 % sur les ventes du Market
│   │   ├── 0012_videur.sql  # Videur V1 : portes, dress codes, Flow
│   │   ├── 0013_videur_regles_cachees.sql  # Videur V2 : Club et VIP à règles cachées
│   │   ├── 0014_profil.sql  # page de profil + choix Garçon / Fille enregistré sur le serveur
│   │   ├── 0015_vitrine.sql  # vitrine choisie par le joueur (vide au départ)
│   │   ├── 0016_vitrine_3_cartes.sql  # vitrine limitée à 3 cartes
│   │   ├── 0017_apercu_amis.sql  # aperçu (avatar + vitrine) de chaque ami dans la liste
│   │   ├── 0018_carte_utilisee_liberee.sql  # une carte portée / en vitrine qui quitte la collection en est retirée
│   │   ├── 0019_partage_3d.sql  # tenue partagée : avatar Garçon / Fille enregistré avec le lien + date du dernier partage
│   │   ├── 0020_pseudo_sur_le_lien.sql  # le pseudo de la personne qui partage s'affiche sur la page du lien
│   │   ├── 0021_reputation.sql  # le Flow devient une réputation (niveaux)
│   │   ├── 0022_album.sql  # album (cartes placées pour de bon) et items Ultimes
│   │   ├── 0023_nouvelles_marques.sql  # 4 nouvelles marques : 28 pièces, 100 coloris (catalogue du serveur)
│   │   ├── 0024_videur_nouvelles_marques.sql  # Videur : dress codes du Bar et énigmes du Club / VIP pour les 4 nouvelles marques
│   │   ├── 0025_suppression_compte.sql  # delete_my_account : suppression définitive de son compte et de ses données
│   │   ├── 0026_videur_boosters.sql  # le Videur donne des boosters (Bar 1, Club 1, VIP 2) : colonne bonus_stock hors plafond
│   │   ├── 0027_boutique.sql  # Boutique Grail (vendeur système du Market) + 50 pièces au tout premier bonus
│   │   ├── 0028_market_catalogue.sql  # Marché catalogue : market_catalog (offres, meilleur prix, dernières ventes par carte) et market_card_offers
│   │   ├── 0029_droits_ecriture.sql  # audit des droits : retire les droits d'écriture de market_best_offers et l'accès anon à handle_new_user
│   │   └── 0030_kit_depart.sql  # kit de départ : starter_kit_state, claim_starter_kit (4 Communes d'une marque au choix + 2 boosters offerts)
│   └── email-templates/   # e-mails de Supabase en français, avec le logo (à coller dans Supabase, section 18)
├── tools/
│   ├── extraire_sprites.py   # découpe les planches → PNG + SVG (Python + Pillow)
│   ├── creer_ultimes.py      # crée les sprites « Ultime » (album) depuis les coloris (48)
│   ├── ajouter_marques.py    # 2e vague : extrait les sprites des 4 nouvelles marques + catalogue + migration 0023
│   ├── modele_0023.sql       # modèle de la migration 0023
│   ├── creer_logo.py         # dessine le logo (graal 16 × 16) → favicon.ico + assets/brand/
│   ├── creer_apercu_og.js    # dessine l'image d'aperçu des liens (1200 × 630) : assets/brand/og-image.png (Playwright)
│   └── ecrire_enigmes_0024.py  # écrit la migration 0024 (dress codes et énigmes des nouvelles marques, vérifiées réalisables)
└── CLAUDE.md
```

## 5. Le catalogue

### Règles générales

- **48 pièces** réparties sur **7 marques fictives**, déclinées en **175 coloris** au total (1re vague : 26 + 26 + 23 ; 2e vague : 4 marques × 25). Le catalogue compte donc **700 cartes** (175 × 4 raretés). Tous les nombres « 75 » et « 300 » écrits plus bas décrivent la 1re vague ; le site lit toujours le catalogue (`data/pieces.json`).
- Chaque pièce appartient à une catégorie : **Haut, Bas, Chaussures, Accessoire**.
- **Un coloris = un sprite unique.** Il n'existe pas de version visuelle selon la rareté : la rareté ne se voit pas sur le vêtement lui-même.
- Chaque coloris existe dans les **4 raretés**. Une « carte » = un coloris + une rareté.
- Pas d'état d'usure ni de système d'état.
- Tous les vêtements sont en **pixel art 32 × 32**, fond transparent, vus de face (chaussures de profil).
- Les planches de référence sont dans `visuels/` : `signal9_coloris_apercu.svg`, `halvane_coloris_apercu.svg`, `pigeon_social_club_coloris_apercu.svg` (chaque sprite y est dessiné en `<rect>` à l'échelle ×5 dans une case de 160 px). Les 75 sprites sont **extraits** : `assets/pieces/<colorway_id>.png` (servis au jeu) et `visuels/pieces/<colorway_id>.svg`. Ils viennent des planches PNG de `visuels/sources/` (×5, cases de 160 px, lignes classées de la pièce la plus à la moins demandée) via `python3 tools/extraire_sprites.py`. Pour modifier un sprite : remplacer la planche source, puis relancer le script.
- Les contours des sprites sont noirs : sur l'interface sombre, toujours poser le sprite sur une case claire (gris chaud type `#cccac4`), jamais directement sur le fond noir.

### Format de `data/pieces.json`

```json
{
  "version": 1,
  "brands": [
    { "id": "signal9", "name": "SIGNAL/9", "style": "Techwear utilitaire" }
  ],
  "pieces": [
    {
      "id": "signal9_shell_relais",
      "brand": "signal9",
      "name": "Shell « Relais »",
      "category": "haut",
      "slot": "veste",
      "flagship": true,
      "description": "Coupe-vent noir oversize à capuche…",
      "colorways": [
        { "id": "signal9_shell_relais_noir_orange", "name": "Noir / Orange signal", "sprite": "assets/pieces/signal9_shell_relais_noir_orange.png" }
      ]
    }
  ]
}
```

Identifiants : minuscules, sans accents, mots séparés par `_`. Une carte possédée s'identifie par `colorwayId + rareté`.

### SIGNAL/9 — techwear utilitaire (7 pièces, 26 coloris)

Fondée par Iko, ancien coursier à vélo ; le « 9 » est son numéro de dossard.
Palette : noir, anthracite, gris béton + accents orange signal. Signature : bande orange réfléchissante (1-2 px) + petit « 9 » barré.

| Pièce | Catégorie | Coloris |
| --- | --- | --- |
| Shell « Relais » (pièce phare) | Haut | Noir / Orange signal · Olive / Orange signal · Noir / Jaune balise · Gris béton / Orange signal · Marine nuit / Rouge balise · Glacier / Orange signal |
| Gilet « Dossard » | Haut | Noir / Orange signal · Olive / Orange signal · Noir / Jaune balise |
| Cargo « Béton » | Bas | Gris béton / Orange signal · Noir / Orange signal · Olive / Jaune balise · Sable / Orange signal |
| Short « Course » | Bas | Noir / Orange signal · Noir / Jaune balise |
| Montantes « Trame » | Chaussures | Noir / Orange signal · Noir / Jaune balise · Olive / Orange signal · Sable / Orange signal · Triple noir |
| Sacoche « Tournée » | Accessoire | Noir / Orange signal · Noir / Jaune balise · Olive / Orange signal |
| Bonnet « Nuit » | Accessoire | Noir / Orange signal · Olive / Orange signal · Orange / Noir |

### Halvane — luxe minimaliste (7 pièces, 26 coloris)

Ancien atelier de tailleur parisien repris par le petit-fils, qui en fait du streetwear haut de gamme sans jamais crier son logo.
Palette : crème, noir profond, camel + liseré doré (argent sur les coloris froids). Signature : monogramme « H » dans un losange + liseré doré d'1 px.

| Pièce | Catégorie | Coloris |
| --- | --- | --- |
| Manteau « Atelier » (pièce phare) | Haut | Camel / Or · Noir / Crème / Or · Gris flanelle / Argent · Marine / Or · Chocolat / Or · Crème / Or |
| Col roulé « Fil » | Haut | Crème / Or · Noir / Or · Gris flanelle / Argent |
| Chemise « Coupe » | Haut | Noir / Or · Crème / Or · Marine / Argent |
| Pantalon « Pli » | Bas | Crème / Or · Gris flanelle / Argent |
| Mocassins « Héritage » | Chaussures | Noir / Or · Chocolat / Or · Bordeaux / Or · Noir / Argent |
| Sac « Losange » | Accessoire | Camel / Or · Noir / Or · Chocolat / Or · Bordeaux / Or · Crème / Or |
| Écharpe « Liseré » | Accessoire | Noir / Or · Camel / Or · Bordeaux / Or |

### Pigeon Social Club — skate / DIY (6 pièces, 23 coloris)

Crew de skateurs d'une dalle de gare ; premiers t-shirts imprimés à la main dans une cave. Le pigeon est la mascotte : moche, partout, adoré.
Palette : vert bouteille, moutarde, rouge brique, crème, bleu / rose / noir délavés. Signature : un sprite de pigeon de 5 à 8 px, qui garde toujours ses couleurs.

| Pièce | Catégorie | Coloris |
| --- | --- | --- |
| Hoodie « Dalle » (pièce phare) | Haut | Vert bouteille · Moutarde · Brique · Bleu délavé · Rose délavé · Noir délavé |
| T-shirt « Roucoule » | Haut | Moutarde · Crème · Bleu délavé |
| Short « Ollie » | Bas | Brique · Vert bouteille · Noir délavé |
| Sneakers « Bitume » | Chaussures | Crème / Brique · Crème / Vert bouteille · Crème / Bleu délavé · Crème / Rose délavé · Noir délavé / Crème |
| Casquette « Perchoir » | Accessoire | Vert bouteille / Moutarde · Moutarde / Vert bouteille · Bleu délavé / Crème · Noir délavé / Brique |
| Tote « Miettes » | Accessoire | Crème / Vert bouteille · Noir délavé / Moutarde |

### Items « Ultime » (album : voir la section 6 bis ; design validé)

- **Un Ultime par modèle** (48 au total avec les 7 marques ; 20 pour la 1re vague, pas un par coloris) : récompense de l'album (avoir le modèle dans tous ses coloris et toutes ses raretés). Rareté au-dessus de Légendaire, ni vendable ni échangeable, mais portable et en vitrine.
- **Sprite** : `assets/pieces/<piece_id>_ultime.png`, créé par `python3 tools/creer_ultimes.py` à partir des coloris : même silhouette et même contour que la pièce ; corps **noir obsidienne** avec un **reflet nacré en diagonale** ; les accents (bande orange, liserés dorés…) deviennent **holographiques** (cyan → violet → rose → or pâle) ; seul le **pigeon** garde ses couleurs. Design validé par le développeur.
- **Catalogue** : `loadCatalogue()` renvoie aussi `ultimates` / `ultimateById` (id `<piece_id>_ultime`, `ultimate: true`). Ils ne sont **pas** dans `colorways` (ne comptent pas dans les 300 cartes).
- **3D** : un Ultime se porte comme un coloris (`buildModel`). `js/avatar3d.js` recalcule ses couleurs selon la position des voxels (`ultimateFilter`) : reflets nacrés en bandes sur toutes les faces (dos et côtés compris) et accents irisés qui changent quand l'avatar tourne ; les couleurs du 1er coloris (contour, pigeon) sont gardées. Vérifié : les 20 Ultimes se construisent et se dessinent sur les deux corps.
- **Carte** : bordure et étiquette « ULTIME » irisées, léger halo violet, case du sprite nacrée (`.card[data-rarity="ultime"]` dans `style.css` ; ligne sous le nom : « Édition unique »).

### 2e vague : 4 nouvelles marques (migration 0023, `tools/ajouter_marques.py`)

Chacune a **7 pièces et 25 coloris** (veste 6 · haut 5 · bas 4 · bas 3 · chaussures 3 · tête 2 · sac ou cou 2). Les planches d'origine (×4, cases de 128 px) sont dans `visuels/sources/<marque>_planche.png` ; `python3 tools/ajouter_marques.py` en extrait les 100 sprites (`assets/pieces/`, `visuels/pieces/`), ajoute marques, pièces et coloris à `data/pieces.json` et écrit la migration `0023_nouvelles_marques.sql` (à partir de `tools/modele_0023.sql`). Les 28 modèles 3D sont dans `js/wear-models.js` ; les 28 Ultimes ont été générés par `tools/creer_ultimes.py`. Aucune marque réelle (section 9).

**Ferrant & Fils** (`ferrant_fils`) : workwear. Entreprise familiale de bleus de travail fondée à Roubaix en 1926 pour habiller les ouvriers des filatures ; les petits-enfants ont ressorti les patrons d'archives et font des vêtements qui durent vingt ans, en refusant de les rendre « cool ». Robuste, coupes droites, poches plaquées, toile épaisse. Palette : bleu denim (indigo), écru, gris charbon, touche de rouille. Signature : pointillé de couture blanc d'1 px et petite étiquette carrée « F&F » sur la hanche.

| Pièce | Emplacement | Coloris |
| --- | --- | --- |
| Veste « Contremaître » (pièce phare) | Veste | Bleu denim · Noir délavé · Kaki · Rouille · Écru · Vert forêt |
| Chemise « Fabrique » | Haut | Écru · Bleu ciel délavé · Kaki clair · Rouille · Charbon |
| Pantalon « Établi » | Bas | Bleu denim · Noir délavé · Kaki · Écru |
| Pantalon « Peintre » | Bas | Écru taché · Gris clair · Kaki clair |
| Bottines « Godillot » | Chaussures | Brun rouille · Noir · Sable |
| Bonnet « Docker » | Tête | Charbon · Marine |
| Sac « Musette » | Sac | Écru · Kaki clair |

**Brume** (`brume`) : outdoor. Deux randonneurs du Jura qui trouvaient le matériel de montagne laid et hors de prix ; premiers sacs cousus dans un garage, le nom vient du brouillard de leur première sortie. Coupes techniques mais douces, polaires, sangles, volumes arrondis. Palette : sauge, bleu brume, gris pierre, accent corail. Signature : petit triangle « sommet » de 3 px et sangle corail.

| Pièce | Emplacement | Coloris |
| --- | --- | --- |
| Polaire « Brouillard » (pièce phare) | Veste | Sauge · Bleu brume · Pierre · Nuit · Crème · Ocre |
| Pull « Sentier » | Haut | Bleu brume · Sauge · Pierre sombre · Corail clair · Nuit |
| Pantalon « Moraine » | Bas | Pierre / Corail · Olive / Crème · Nuit / Corail · Sable / Nuit |
| Short « Source » | Bas | Sauge / Corail · Bleu brume / Corail · Sable / Nuit |
| Baskets « Cairn » | Chaussures | Pierre / Corail · Sauge · Nuit |
| Bonnet « Givre » | Tête | Bleu brume / Corail · Corail / Crème |
| Sac « Lichen » (sac à dos) | Sac | Sauge · Nuit |

**A.S. Faubourg 78** (`faubourg_78`) : sportswear rétro. Club de foot amateur d'un faubourg industriel dont les supporters fabriquaient leurs propres écharpes ; sa boutique de maillots d'archives est devenue une marque qui ressort les anciennes tenues de terrasse. Maillots, survêts, cols et poignets contrastés, flocage numéroté. Palette : rouge cerise, blanc cassé, bleu nuit. Signature : le numéro « 78 » dans un petit cercle, liseré bicolore au col et aux poignets (**pas de bandes sur les côtés**, pour ne pas copier une marque réelle).

| Pièce | Emplacement | Coloris |
| --- | --- | --- |
| Veste « Tribune » (pièce phare) | Veste | Bleu nuit / Cerise · Cerise / Blanc · Vert sapin / Jaune · Noir / Cerise · Ciel / Marine · Jaune / Marine |
| Maillot « Domicile » | Haut | Cerise · Blanc · Bleu nuit · Vert sapin · Jaune |
| Pantalon « Entraînement » | Bas | Bleu nuit · Noir · Cerise · Vert sapin |
| Short « Extérieur » | Bas | Blanc · Cerise · Noir |
| Baskets « Terrain » | Chaussures | Blanc / Cerise · Bleu nuit / Cerise · Vert / Jaune |
| Bonnet « Virage » | Tête | Cerise · Bleu nuit |
| Écharpe « Kop » | Cou | Cerise / Blanc · Bleu nuit / Blanc |

**Orbite 2000** (`orbite_2000`) : Y2K / soirées. Collectif de DJ et de graphistes qui imprimait ses flyers pour les soirées de la région ; passé des affiches aux vêtements chromés en gardant l'énergie de l'époque. Brillant, ajusté, volumes futuristes, détails réfléchissants. Palette : argent chromé, violet électrique, bleu glacé, noir. Signature : petite étoile à quatre branches de 3 px.

| Pièce | Emplacement | Coloris |
| --- | --- | --- |
| Veste « Satellite » (pièce phare) | Veste | Chrome / Violet · Noir / Violet · Glacier / Violet · Rose / Violet · Chrome / Lime · Chrome / Bleu |
| T-shirt « Flyer » | Haut | Glacier / Violet · Rose / Violet · Chrome / Violet · Lime / Violet · Noir / Rose |
| Pantalon « Apesanteur » | Bas | Noir / Violet · Chrome / Violet · Glacier / Bleu · Violet nuit / Rose |
| Short « Hologramme » | Bas | Chrome-Violet · Chrome-Rose · Chrome-Bleu |
| Baskets « Lune » | Chaussures | Chrome / Violet · Noir / Rose · Rose / Violet |
| Bob « Fréquence » | Tête | Chrome / Violet · Rose / Bleu |
| Sac « Pastille » | Sac | Violet / Chrome · Rose / Chrome |

- **Serveur** : la migration 0023 ajoute les marques, pièces, coloris et étiquettes de couleur (`colorway_tags`) en **copiant** une ligne existante de chaque table (les migrations 0001 à 0004 ne sont pas dans le dépôt : leurs colonnes sont inconnues), puis en remplaçant id, nom, marque, emplacement, etc. Les nouveaux coloris entrent dans les boosters, la roue, le Market et l'album **si** les fonctions du serveur lisent la table `colorways` (non vérifié). Le **Videur** connaît les nouvelles marques grâce à la migration **0024** (voir la section 16).
- **3D de cette vague** (vérifiée sur les 175 coloris et les 48 Ultimes, deux corps, quatre angles, sans rognage du cadre) : les chaussures sont les **pieds de profil** de chaque paire (le pied droit sert aux deux pieds ; `profile` accepte maintenant `scaleY`, échelle en hauteur séparée de l'échelle en longueur) ; les jambes des pantalons et shorts n'incluent plus les traits de séparation du sprite (sinon une raie noire apparaissait entre les jambes) ; le bonnet « Docker » porte son étiquette orange sur le côté, les bonnets « Givre » et « Virage » un vrai pompon (le haut de l'avatar ne doit pas dépasser ~80 voxels, sinon le cadre du canvas le coupe) ; le sac à dos « Lichen » est dans le dos avec poche et languette, sangles devant ; le bob « Fréquence » est posé un cran plus bas qu'un bonnet. Limites : pas de logo dans le dos ; épaulettes du pull « Sentier » en panneaux plats ; le « 78 » et l'étoile des marques ne sont pas mis en avant sur les Ultimes.

Pièces à retoucher plus tard (ne pas bloquer la bêta) : Manteau « Atelier » (plus long), Casquette « Perchoir » (de profil), anses du Tote « Miettes » (arrondies).

## 6. Rareté et boosters

### Les 4 raretés et les taux

**Les taux et les règles sont appliqués par le serveur** (table `economy_config` et fonction `open_booster`, migrations SQL 0001 à 0004). `js/economy-config.js` n'en garde qu'une copie pour l'**affichage** (jauges, textes) : si une valeur change côté serveur, la mettre à jour aussi dans ce fichier.

| Rareté | Booster standard + cartes 1-2 du Signature | Carte 3 du Signature | Couleur d'interface |
| --- | --- | --- | --- |
| Commun | 82 % | — | gris |
| Rare | 14 % | 75 % | bleu |
| Épique | 3,5 % | 20 % | violet |
| Légendaire | 0,5 % | 5 % | or |

- Tirage : pour chaque carte, la rareté selon sa table, puis un coloris au hasard parmi **tous les coloris du catalogue** (75 à l'origine, 175 avec la 2e vague ; uniforme pour la bêta, décidé par le serveur).
- **Booster Signature** : **1 booster gratuit sur 4** (`BOOSTER.signatureEvery`). Sa 3e carte suit la table Signature et est **toujours révélée en dernier**. Compteur visible « Signature dans X boosters gratuits » ; Paquet avec lueur dorée fixe et étiquette « Booster Signature ».
- **Pity Légendaire** (`pity` dans la sauvegarde) : après **40** boosters d'affilée sans Légendaire, le taux Légendaire de chaque carte monte de **+1 point par booster** (41e : +1, 42e : +2…, les autres raretés gardent leurs proportions) ; le **60e** en contient forcément une. Choix de la courbe (+1 point linéaire) fait par Claude, à valider : `PITY.legendary.softStep`.
- **Pity Épique** (`pityEpic`) : après **16** boosters d'affilée sans Épique ou mieux, le suivant en contient une.
- Garantie forcée : la carte qui la reçoit est la carte Signature (booster Signature), sinon la carte la moins rare. Les deux compteurs comptent **tous** les boosters (gratuits, Signature) et repartent à 0 dès que la rareté (ou mieux pour l'Épique) sort, forcée ou non. Deux jauges sous le paquet (« Légendaire garantie · 12 / 60 », qui brille dès 40 ; « Épique garantie · 3 / 16 »).
- L'ancienne garantie « jamais 3 Communes » est **supprimée** (remplacée par le Signature et la pity Épique).
- **Vérification des taux** : l'ancienne simulation côté navigateur a été supprimée avec la logique de tirage. Pour vérifier les taux, il faudra une simulation côté serveur (SQL).
- La rareté **n'apparaît pas sur le sprite**. Elle s'affiche dans l'interface : bordure et étiquette colorées sur la carte, mention dans l'inventaire et sur l'image partagée. Une révélation plus marquée (lueur, son, vibration `navigator.vibrate` si dispo) pour Épique et Légendaire est bienvenue.

### Boosters

- Un booster = **3 cartes**.
- **Stock gratuit** : **1 booster généré toutes les 6 h**, **stock maximum 3** (`BOOSTER.refillHours`, `maxStock`, `startStock` = 3 pour un nouveau joueur). Le calcul se fait **sur le serveur, à l'heure du serveur** (`get_booster_state`) : on peut fermer le site et revenir plus tard, et changer l'heure du téléphone ne sert à rien. Stock plein = minuteur arrêté. Affichage au-dessus du paquet : 3 pastilles + « Prochain dans 5:12:08 » (ou « Stock plein »), décompte calculé depuis `next_in_seconds` et mis à jour chaque seconde ; à zéro, le front redemande l'état au serveur.
- **Pas d'achat de booster, pas d'accélération** : les boosters ne s'obtiennent que par le stock gratuit (1 toutes les 6 h) **et les récompenses du Videur** (voir ci-dessous). Aucun moyen de payer pour en avoir plus ou pour avancer le minuteur.
- **Boosters offerts par le Videur (migration 0026, décision du développeur)** : Bar **1**, Club **1**, VIP **2** (`economy_config.VIDEUR.doors[].boosters`, copie d'affichage dans `VIDEUR_INFO` de `js/economy-config.js`), **une seule fois par jour et par porte** (le même contrôle que le Flow : « Tu es déjà entré ici aujourd'hui »), **jamais de pièces** (décision du développeur : les pièces n'ont presque aucune façon de disparaître du jeu, en donner ferait monter les prix du Market ; les cartes, elles, disparaissent par la roue et l'album). Ils sont stockés **à part** (`profiles.bonus_stock`), **hors du plafond de 3** du stock gratuit, sans toucher à `private.refill` (non visible dans le dépôt). **Ordre d'ouverture : le stock gratuit d'abord, puis les boosters offerts** (le minuteur de recharge repart ainsi tout de suite). Ce sont des boosters ordinaires : mêmes taux, mêmes garanties, ils comptent dans `free_opened` (compteur Signature) et dans la pity. Affichage : « +N offerts » à côté des pastilles du stock, la pastille de la barre du bas compte gratuits + offerts, la fiche de verdict du Videur annonce « +5 Flow · +1 booster ». `get_booster_state` renvoie `bonus_stock`, `open_booster` ouvre un booster offert quand le stock gratuit est vide (sinon « Aucun booster disponible »), `videur_enter` renvoie `boosters_gained` (colonne `videur_attempts.boosters_gained`, vue `analytics_videur_daily.boosters_given`). **Sans la migration 0026**, le site fonctionne comme avant (pas de « +N offerts », pas de boosters au Videur). **Vérifié** sur PostgreSQL local (faux `private.refill`, `draw_rarity`… car les migrations 0001 à 0004 ne sont pas dans le dépôt : `get_booster_state` et `open_booster` sont des copies des fonctions du serveur lues par le développeur, + `bonus_stock`) : 1 / 1 / 2 boosters, une fois par jour, refus = rien, ordre gratuit puis offerts, droits `anon` refusés.
- **« Et maintenant ? » (29 octobre 2026)** : quand il n'y a plus aucun booster (stock gratuit et offerts à 0), l'écran Booster affiche sous le texte d'état deux pistes touchables : « Passe le Bar au Videur » (`#videur`, avec « +N booster offert » lu dans `VIDEUR_INFO`, copie d'affichage) et « Habille ton avatar » (`#avatar`). Bloc `#booster-next` (`index.html`), affiché / masqué par `refreshPack()` dans `js/booster.js`. Il ne sait pas si le Bar est déjà passé aujourd'hui (le texte dit « Une fois par jour »).
- **Kit de départ (migration 0030, `js/starter.js`, décision du développeur le 29 octobre 2026 : options A + B ensemble)** : à la première ouverture du jeu, une fiche demande au joueur de **choisir UNE marque** (7 tuiles avec le sprite de la pièce phare, bouton « Choisir <marque> » collé en bas, ✕ « plus tard » : la fiche revient à l'ouverture suivante tant que le kit n'est pas pris). Il reçoit, **en Commun** : un haut (sinon une **veste** : SIGNAL/9 n'a aucun emplacement `haut`), un bas, des chaussures de cette marque + **une 4e pièce** (tête, sinon cou, sinon sac) et **2 boosters offerts** (`profiles.bonus_stock`, hors plafond du stock gratuit ; `economy_config.STARTER.boosters`, copie d'affichage `STARTER_KIT` dans `js/economy-config.js`). **Pourquoi 4 pièces et non 3** : le Bar demande 4 points de rareté (`minRarity` 4, Commune = 1 point) ; 3 Communes ne suffisent pas. Les coloris sont tirés au hasard parmi ceux de la pièce. **Une seule fois par compte** (`profiles.starter_kit_at`, ligne verrouillée), **tous les comptes sans kit y ont droit** (les joueurs déjà inscrits aussi) ; pour le réserver aux nouveaux : `update public.profiles set starter_kit_at = now() where starter_kit_at is null;` avant d'ouvrir le site. Fonctions : `starter_kit_state()` (déjà pris ? marques proposées = celles qui ont haut/veste + bas + chaussures) et `claim_starter_kit(p_brand)` (tout ou rien, donne les cartes avec `private.give_cards`). Après la récupération, le site **équipe les pièces reçues sur les emplacements encore vides** (`set_equipped`, validé par le serveur) : une tenue existante n'est jamais écrasée ; puis récapitulatif des 4 pièces avec « Ouvrir mes boosters » / « Passer le Bar ». **Sans la migration 0030**, rien ne s'affiche. **Vérifié** sur PostgreSQL local (faux schéma reprenant le catalogue réel : 7 marques, 4 pièces chacune, deuxième récupération refusée, marque inconnue refusée, autre joueur intact, migration lancée 2 fois) et dans le navigateur (faux serveur, 320 et 375 px). **Les vraies fonctions du serveur (`private.give_cards`, enum `public.rarity` = `'commun'`) ne sont pas testées** : tester avec un compte neuf.
- **Plus de mode test ni de `?debug=1`** : sans stock, `open_booster` répond « Aucun booster disponible ». Pour tester, créer un compte de test.
- Ouverture (en place, `js/booster.js`) — **tout se fait en glissant le doigt (ou la souris)**, un simple toucher ne fait rien (le paquet sursaute, le texte d'aide rappelle le geste) :
  1. **Glisser sur le paquet le déchire** : la bande du haut suit le doigt puis s'arrache le long de la ligne pointillée (bord en dents de scie). Bruit de déchirure.
  2. Les 3 cartes forment une **pile** ; **une seule carte à la fois** (« Carte 1 / 3 »), **la plus rare toujours en dernier** (l'ordre est donné par le serveur).
  3. Sur une carte face cachée : **glisser la retourne** directement ; **rester appuyé fait monter son aura palier par palier** (gris Commun → bleu Rare → violet Épique → or Légendaire, ~0,65 s par palier, une note de plus en plus aiguë) **jusqu'à la rareté de la carte**, puis s'arrête. Lâcher garde l'aura atteinte.
  4. Une fois retournée, **glisser à nouveau** fait partir la carte sur le côté et amène la suivante. Après la 3e : récapitulatif des 3 cartes + « Continuer ».
  - **Hiérarchie des effets** (du plus discret au plus fort) : Rare = halo bleu fixe + reflet + quelques particules ; Épique = halo violet qui respire + onde + gerbe de particules + titre « ÉPIQUE ! » (sur place) ; Légendaire = double halo doré rapide (la carte tremble face cachée) puis **plein écran** (éclair, rayons, grande carte, 3 vagues de particules, son), qu'on quitte **en glissant** (bloqué 0,9 s pour savourer) → carte suivante.
  - Badge « NOUVEAU » sur les cartes jamais obtenues.
  - **Tutoriel du 1er booster** : un « doigt » (point lumineux avec traînée, en CSS) glisse en boucle avec une étiquette — « Glisse pour déchirer » sur le paquet, « Glisse pour retourner » puis « Glisse pour la suivante » sur la 1re carte. Il s'efface dès que le joueur glisse. Fini (`tutorialDone` dans la sauvegarde) quand le récapitulatif du 1er booster s'affiche ; s'il est interrompu, il revient.
  - Halo limité à ~65 px de portée : au-delà, il est coupé par le bord de l'écran et forme un rectangle.
- Les cartes sont enregistrées **par le serveur dès la déchirure** (`open_booster` est appelé quand le geste est validé ; recharger la page ne permet pas de retirer).
- Sons synthétisés par le navigateur (Web Audio, aucun fichier) ; constante `SONS_ACTIFS` dans `js/effects.js` pour les couper.
- Pièces du jeu : elles servent au Market (achat aux joueurs et à la Boutique Grail). Aucun argent réel.

### Amélioration par la roue (`js/upgrade.js`)

- Dans la Collection, **toucher une carte ouvre sa fiche** : carte en grand, nombre d'exemplaires, « Améliorer en [rareté suivante] », « Verrouiller » et « Défausser · +N pièces par carte ».
- On **mise de 1 à 5 cartes du même modèle et de la même rareté** (coloris libres, plusieurs exemplaires d'un même coloris comptent chacun). **Chance = 20 % par carte misée** (`UPGRADE.chancePerCard`, `UPGRADE.maxCards` dans `js/economy-config.js`) : 5 cartes = 100 %.
- **Réussite** : 1 carte du même modèle, **rareté au-dessus**. **Même coloris** si toutes les cartes misées ont le même coloris, sinon **coloris au hasard parmi tous ceux du modèle**.
- **Les cartes misées sont perdues dans tous les cas** (réussite ou échec). Une Légendaire ne s'améliore pas (« Rareté maximale »). Une carte portée dont le dernier exemplaire est misé quitte la tenue.
- Écran : 5 cases de mise (pré-remplies avec la carte touchée ; toucher une case la vide), cartes disponibles à ajouter, **roue** dont la part colorée (couleur de la rareté visée) = la chance, flèche en haut, avertissement si la réussite n'est pas sûre. La roue tourne ~3 s et s'arrête là où le tirage est tombé. Le **tirage est fait par le serveur** (`upgrade_cards` renvoie `success`, `chance`, `roll` et la carte obtenue) ; la roue s'arrête là où le serveur dit, et la collection est relue (recharger ne permet pas de rejouer). La chance affichée avant de lancer vient de la config d'affichage ; la vraie est celle du serveur.

### Atelier (`js/atelier.js`)

- Dans l'onglet Collection, un sélecteur en pilule bascule entre **« Collection »** (une carte par coloris, inchangée) et **« Atelier »**.
- L'Atelier montre **une ligne par modèle + rareté possédés** (Légendaires exclues) : marque et nom du modèle, rareté actuelle, barre **« X/5 »** (tous coloris confondus ; au-delà de 5, la barre reste pleine et affiche le vrai total, ex. « 7/5 »), chance de la roue en % et rareté visée (« → Épique »), puis les coloris possédés en vignettes avec leur nombre.
- Tri : **groupes par rareté**, la plus haute d'abord, chacun sous un **séparateur** (nom de la rareté + nombre de modèles + filet coloré) ; dans un groupe, du plus proche de 5 au plus éloigné (5 et plus = « prêt », bordure qui brille), puis l'ordre du catalogue.
- **Indice cliquable** en bas de chaque ligne : pilule « Tenter la roue · 40 % ›», ou « Améliorer en Épique · garanti ›» (pleine et pulsante) à 5 cartes ou plus.
- Toucher une ligne ouvre directement la roue (`openModel` dans `js/upgrade.js`) avec la mise pré-remplie : si un coloris a 5 exemplaires ou plus, uniquement lui (pour garder le même coloris) ; sinon les coloris les plus nombreux d'abord, jusqu'à 5 cartes.
- **Barre de filtres** (collée en haut, comme dans la Collection) : recherche « Rechercher un modèle » (nom du modèle, marque, coloris ou rareté), menus **Marque**, **Type** et **tri** (Progrès = défaut, Nom A→Z, Marque). La rareté reste toujours le premier critère de tri (séparateurs).
- Les cartes **verrouillées** ne comptent pas dans l'Atelier (une note « N cartes verrouillées : non comptées ici » s'affiche).
- En bas : bloc **Défausse** (valeurs par rareté + bouton « Défausser des cartes »). Chaque ligne a aussi un petit bouton « Défausser » (le modèle à cette rareté).

### Recherche et verrouillage (Collection)

- **Recherche** : champ « Rechercher une carte » en tête des filtres de la Collection ; chaque mot tapé doit se trouver dans le nom de la pièce, du coloris, de la marque ou de la rareté (sans tenir compte des majuscules ni des accents). Fonctions `normalizeText` / `matchesSearch` dans `js/data.js`.
- **Verrou** : dans la fiche d'une carte, bouton « Verrouiller / Déverrouiller ». Il s'applique à **la carte entière** (coloris + rareté, tous ses exemplaires), est enregistré par le serveur (`set_locked`, colonne `locked` de l'inventaire) et disparaît avec le dernier exemplaire. Une carte verrouillée porte un cadenas doré dans la Collection, n'est **jamais proposée à la mise** (roue) ni comptée dans l'Atelier, et son bouton « Améliorer » est grisé (« Carte verrouillée »). Elle peut toujours être portée. Pensé aussi pour la future défausse.

### Économie et pièces (`js/wallet.js`, serveur)

- **Les valeurs et les règles sont sur le serveur** (table `economy_config`, fonctions SQL). `js/economy-config.js` est une copie **pour l'affichage uniquement** (jauges, chance annoncée, prix conseillé, textes) : le front ne s'en sert jamais pour décider ou calculer un résultat.
- **Pièces** : le solde (`profiles.coins`) est lu sur le serveur et affiché **en haut à droite de toutes les pages**. Il ne change que par les fonctions du serveur (bonus, défausse, Market). Quand il change après une relecture, le nombre « défile » et bondit (`wallet.js`).
- **Bonus de connexion** : `claim_daily_bonus()` (une fois par jour calendaire à Paris, décidé par le serveur ; renvoie 0 s'il est déjà pris). Appelé à l'ouverture du jeu et au retour sur l'onglet ; notification « +20 pièces · bonus du jour ». **Le tout premier bonus du compte vaut 50 pièces** (`economy_config.COINS.signupBonus`, migration 0027 ; il est donné quand `profiles.last_daily_bonus` est vide, donc à la première ouverture du jeu), notification « +50 pièces · bienvenue sur Grail ! » ; les jours suivants, `COINS.dailyLoginBonus` (20). Les joueurs déjà inscrits gardent 20. Copie d'affichage : `DAILY_BONUS = { coins: 20, signup: 50 }` dans `js/economy-config.js`.
- **Erreurs** : le serveur renvoie des messages déjà en français (« Aucun booster disponible », « Carte verrouillée », « Le prix a changé »…). `api.js` les transmet tels quels (messages techniques anglais remplacés par un message générique) et `reportError()` (wallet.js) les affiche dans la notification rouge, sans casser l'écran.
- Les pièces servent à acheter au Market ; elles se gagnent par le bonus, la défausse et les ventes. Monnaie **virtuelle uniquement, jamais convertible en euros**.

### Market (`js/market.js`) — géré par le serveur

Onglet **Market** : Acheter / Vendre / Mes ventes / Historique.
- **Prix fixes**, pas d'enchères : le vendeur choisit librement le prix de **son** offre (de `MARKET.minPrice` à `MARKET.maxPrice`, 1 à 99 999 ; le « prix conseillé » `referencePrice` n'est qu'une référence d'affichage). Le prix d'une offre ne change pas une fois posée. **Depuis la migration 0028 (décision du développeur, Marché « Bazaar »), le nombre d'offres de chaque carte et TOUTES ses offres sont visibles** (avant : seule la moins chère, nombre jamais exposé). **L'identité du vendeur reste cachée** : on ne voit que « Boutique Grail », « Joueur » ou « Ton offre » (jamais de pseudo ni d'identifiant).
- **Limite de 10 ventes en même temps** et carte **verrouillée** non vendable : règles appliquées par le serveur (`market_list`) ; le front affiche seulement leurs messages.
- **Acheter = catalogue « Bazaar »** (`js/market-browse.js`, migration 0028), **3 touchers au plus de l'entrée au bouton d'achat** (modèle → rareté, un coloris étant déjà choisi → « Acheter ») :
  - **Entrée** : barre de recherche (nom, modèle, marque) toujours visible ; pilules **Modèles / Cartes** ; bouton **Filtres** (replié par défaut, pastille du nombre de filtres actifs) qui ouvre : Marque, Rareté, Emplacement, Disponibilité (avec offres / sans offre), Tri (Marque, Prix ↑, Prix ↓, Nombre d'offres, Rareté), « Que je n'ai pas », « Réinitialiser ». **Modèles** = grille des **48 modèles** (sprite, marque, « N offres · dès P » ou « aucune offre ») ; **Cartes** = **toutes** les cartes du jeu (chaque coloris dans chaque rareté, 700 avec les 7 marques), même sans offre, par pages de 60 (« Voir plus »). Chercher une carte précise (texte) ou filtrer par rareté / disponibilité / « que je n'ai pas » passe **automatiquement** à la vue Cartes ; Marque et Emplacement filtrent aussi les modèles. Un modèle n'apparaît que s'il a au moins une carte qui passe les filtres, et son total d'offres ne compte que ces cartes.
  - **Page d'un modèle** (`#market/m/<modèle>/<coloris>`) : les coloris en pastilles (sprite ×2, nombre d'offres), le premier coloris **qui a des offres** est choisi d'office ; dessous, ses **4 raretés côte à côte** (meilleur prix, nombre d'offres ou « aucune offre », « Tu l'as »). Les raretés sans offre restent visibles et touchables.
  - **Page d'une carte** (`#market/c/<coloris>/<rareté>`) : la carte, **meilleur prix** et nombre d'exemplaires, **dernière vente** (prix et ventes des `MARKET.recentDays` = 7 derniers jours), « Nouveau pour toi » / « tu en as N », **toutes les offres** du moins cher au plus cher (au plus `MARKET.offersPerCard` = 30, avec « Les 30 moins chères sur N ») avec « Acheter » en un toucher (grisé « Il te manque N » si le solde est trop bas), « Retirer » pour la mienne, et « Vendre cette carte » si je la possède (grisé si verrouillée). **Navigation par l'ancre de l'URL** : le bouton retour du téléphone remonte d'un cran ; depuis la liste de cartes, « ‹ Catalogue » rend la recherche et la position.
  - **Serveur** : `market_catalog()` renvoie une ligne par carte qui a des offres **ou** des ventes (`c`, `r`, `offers`, `best`, `mine`, `shop`, `last`, `last_at`, `recent`) ; le site connaît les autres cartes par son catalogue (« aucune offre »). `market_card_offers(coloris, rareté)` renvoie les offres (`id`, `price`, `shop`, `mine`) sans jamais le vendeur. Les ventes de la boutique comptent comme des ventes ; ses offres ne comptent que si la boutique est activée. Calculé en ~45 ms pour 700 cartes avec 7 000 offres et ventes. Rien n'est calculé par le site.
  - **Sans la migration 0028** : le Marché retombe sur les seules meilleures offres (vue `market_best_offers`) : mêmes écrans, mais « offre disponible » à la place du nombre et une seule offre par carte, avec une note « Nombre d'offres bientôt disponible ».
  - **Le défilement se fait dans `<main>`**, pas dans la fenêtre (`document.querySelector("main")`).
  - **Phases suivantes (demandées par le développeur, pas codées)** : **2** liste de souhaits et ordres d'achat (pièces bloquées, achat automatique, pastille) si le Marché est utilisé pendant le test ; **3** prix libres par fourchette min / max par rareté, historique et graphique des prix, meilleur prix d'achat / de vente façon Bazaar, garde-fous contre l'accaparement. Les prix sont **déjà libres** (le vendeur les choisit) : la phase 3 ajouterait des bornes par rareté et des graphiques, pas la liberté du prix.
  - `market_buy(id, prix_affiché)` : refuse si le prix a changé (« Le prix a changé ») ou si le solde manque. Dans la liste des offres d'une carte, la tienne porte l'étiquette « Ton offre » et le bouton « Retirer ».
- **Vendre** : choisir une carte, fixer son prix (− / champ / +, « Prix conseillé » = référence d'affichage, « Moins cher » = meilleure offre − 1). La carte quitte la collection pendant la vente. **Mes ventes** : liste avec « Retirer » (`market_cancel`, la carte revient).
- **Vendeur payé à l'achat** (même hors ligne) : à l'ouverture du jeu, au retour sur l'écran Market, au retour sur l'onglet et toutes les 30 s, le front appelle `market_ack_sales()` qui renvoie les ventes terminées pas encore vues → notification « Vendu : … · +N pièces ».
- **Historique** (4e pilule) : mes achats et mes ventes terminés, du plus récent au plus ancien (carte, « Acheté » / « Vendu », rareté, date, prix en rouge `−N` ou vert `+N`), totaux « Dépensé / Gagné » et bouton « Voir plus » (30 lignes à la fois). Lu par `market_history(p_limit, p_before)` (migration 0009) dans la table `transactions` (`market_buy` / `market_sale`, déjà écrites par `market_buy`) ; **l'autre joueur n'est jamais révélé**. Relu à l'ouverture de l'onglet et après chaque action. Les offres retirées ne figurent pas dans l'historique.
- **Taxe de 5 % sur chaque vente, payée par le vendeur** (migration 0011) : l'acheteur paie le prix affiché ; le vendeur reçoit `prix − taxe`, taxe = 5 % **arrondie à l'entier supérieur** (minimum 1 pièce : 8 → reçoit 7, 40 → 38, 600 → 570 ; un prix de 1 rapporte 0). Les pièces de la taxe disparaissent de l'économie. Taux dans `economy_config.MARKET.saleTaxPercent` (copie d'affichage : `MARKET.saleTaxPercent`, `saleTax()` / `saleNet()` dans `js/economy-config.js`). Appliquée par `market_buy`, gardée dans `market_listings.tax` ; `market_ack_sales` renvoie `received` (pièces réellement reçues) pour la notification « Vendu : … · +N pièces » ; l'Historique et la transaction `market_sale` montrent le montant net. La fiche « Vendre » annonce « tu recevras N pièces (−T) ». Les ventes d'avant la migration restent sans taxe.
- Pas d'autre frais.

#### Boutique Grail (migration 0027, vendeur système du Market) — décidée par le développeur

- **But** : donner de l'activité au Market les premières semaines et **retirer des pièces de l'économie**. **Un seul marché** : les offres de la boutique sont des offres comme les autres dans le catalogue du Marché (une ligne parmi les offres de la carte), mélangées à celles des joueurs. Chaque offre de la boutique porte l'étiquette verte **« Boutique Grail »** (celles des joueurs : « Joueur » ; la tienne : « Ton offre »), et un bandeau « Boutique Grail · Nouvelle sélection dans 5 h 12 » est affiché en haut de la vue Acheter. L'Historique marque « Acheté · Boutique Grail ». Les prix de la boutique sont au-dessus des prix de référence (+25 %) : une offre de joueur moins chère passe devant (les offres sont triées par prix).
- **Vendeur système** = offres **sans vendeur** (`market_listings.seller_id` vide, `is_system = true`, contrainte `seller_id is not null or is_system`) : pas de faux compte dans `auth.users`. Elles ne comptent **pas** dans la limite de 10 ventes (cette limite compte `seller_id = le joueur`) et n'apparaissent jamais dans « Mes ventes ».
- **Renouvellement quotidien à 6 h, heure de Paris** (`SHOP.refreshHour`, `SHOP.timezone`) : `private.shop_refresh()` supprime **uniquement** les offres système encore actives (les ventes déjà faites sont conservées, les offres de joueurs ne sont jamais touchées), puis tire la nouvelle sélection. Il ne renouvelle que si le « jour de boutique » (le jour décalé de 6 h) a changé (`public.shop_state`, une ligne). Déclenché (1) par **pg_cron** chaque heure pile (extension **active**, confirmé par le développeur le 29 octobre 2026 ; la migration planifie `grail-shop-refresh`), et (2) **à l'ouverture du Market** par `get_market_shop()` (le site l'appelle avant de lire les offres) : la boutique ne reste jamais figée, même sans pg_cron. Le décompte vient du serveur (`next_in_seconds`).
- **Tirage** (tout dans `economy_config.SHOP`, rien en dur ; la migration n'écrase pas un réglage déjà modifié) : pour **chaque coloris et chaque rareté**, chance d'apparaître puis stock tiré selon une répartition.

| Rareté | Chance d'apparaître | Répartition du stock | Prix |
| --- | --- | --- | --- |
| Commune | 25 % | 1 : 60 %, 2 : 25 %, 3 : 10 %, 4 : 5 % | 10 |
| Rare | 8 % | 1 : 75 %, 2 : 20 %, 3 : 5 % | 50 |
| Épique | 0,5 % | 1 | 200 |
| Légendaire | 0,1 % | 1 | 750 |

  Prix = `MARKET.referencePrice` (8 / 40 / 160 / 600) + `SHOP.priceMarkupPercent` (25 %), arrondi. Un exemplaire = une offre (une même carte peut avoir 2 à 4 offres identiques : la suivante apparaît quand la précédente est achetée). En moyenne ~44 Communes, ~14 Rares, ~1 Épique et ~0,2 Légendaire différentes par jour (~70 + ~18 offres pour les deux premières).
- **Achat d'une offre système** (`market_buy`) : **le vendeur ne reçoit rien** (les pièces dépensées disparaissent, c'est voulu), **aucune taxe**, aucune écriture côté vendeur ; la transaction de l'acheteur porte `shop: true`. Un joueur ne peut **jamais annuler** une offre système (`market_cancel` : `seller_id is distinct from uid` ; avec un vendeur vide, l'ancien test `seller_id <> uid` valait NULL et aurait donné la carte gratuitement, **défaut vérifié sur la version du serveur avant correction**).
- **Piège rencontré (corrigé)** : la vue `market_best_offers` est lue par les joueurs (rôle `authenticated`), qui ne peuvent pas lire `economy_config`. `private.cfg()` lit cette table **avec les droits de l'appelant** (même appelée depuis une vue), donc la vue ne doit **jamais** l'appeler : elle utilise `public.shop_enabled()` (`security definer`, renvoie seulement oui / non). **Règle de test : tester les vues et les lectures directes avec `set role authenticated`, jamais seulement avec un rôle administrateur.**
- **Un seul réglage pour tout couper** : `economy_config.SHOP.enabled = false` (SQL : `update economy_config set config = jsonb_set(config, '{SHOP,enabled}', 'false') where id = 1;`). Les offres disparaissent **tout de suite** de la vue et deviennent inachetables, puis sont supprimées au prochain passage (cron ou ouverture du Market) ; remettre `true` relance une sélection.
- **Sans la migration 0027** : le site marche comme avant (`getBestOffers` retombe sur les anciennes colonnes, `get_market_shop` absent = pas de bandeau).
- **Page « Règles du jeu »** : la rubrique « Market et pièces » décrit la boutique (chances et prix lus dans `SHOP` de `js/economy-config.js`, **copie d'affichage** : la mettre à jour si `economy_config.SHOP` change).
- **Vérifié** : base PostgreSQL locale (faux schéma reprenant les vraies colonnes et contraintes de `market_listings`, migration lancée 2 fois) : chances mesurées sur 300 renouvellements (43,7 / 13,9 / 0,78 / 0,19 cartes pour 43,75 / 14 / 0,875 / 0,175 attendues), répartition du stock 60 / 25 / 10 / 5 %, achat sans taxe ni versement (variation totale des pièces = −prix), achat entre joueurs inchangé (taxe, vendeur payé), annulation refusée, renouvellement qui ne touche pas les offres de joueurs, boutique coupée, bonus 50 puis 20. Navigateur (faux serveur) : 80 offres filtrées / triées en ~5 ms, 300 offres en ~12 ms, 320 à 768 px sans débordement. **`pg_cron` et les vraies fonctions du serveur ne sont pas testés.**

### Défausse (`js/discard.js`)

- **Valeurs** (`DISCARD_VALUES` : valeur du serveur, copiée dans `js/economy-config.js` pour l'affichage) : Commune **3**, Rare **15**, Épique **60**, Légendaire **200** pièces par carte.
- **Mode « Sélectionner » (Collection)** : bouton « Sélectionner » à côté de la recherche. En mode actif (le bouton devient « Terminer »), toucher une carte la **sélectionne** au lieu d'ouvrir sa fiche ; avec plusieurs exemplaires, chaque toucher en ajoute un (badge « 2/4 », puis retour à zéro). La recherche et les filtres restent utilisables, la sélection est conservée quand on change de filtre (la barre indique « dont N masquées par les filtres »). Barre collée en bas : total « N cartes · +X pièces », « Tout » (cartes affichées), « Doublons (garder 1) » (`DISCARD_KEEP`, cartes affichées), « Vider », « Défausser » (2e toucher dès l'Épique). Après confirmation : pièces qui volent, notification, sortie du mode. Code : `createSelection()` dans `js/discard.js`. Le bouton « Sélectionner des cartes » de l'Atelier y renvoie.
- **Écran « cartes similaires »** (gardé, complémentaire) : le bouton « Défausser » de la **fiche d'une carte** (les cartes du même modèle, 1 exemplaire déjà sélectionné) et celui d'une **ligne de l'Atelier** (le modèle à cette rareté) ouvrent un écran plus ciblé, où l'on voit toutes les cartes similaires. Le mode « Sélectionner » sert à balayer toute la collection, cet écran à décider au cas par cas.
- **Sélection dans l'écran « cartes similaires »** : on touche une carte pour ajouter un exemplaire (le badge « −n » montre ce qui est choisi, « ×n » ce qui reste), on touche une pastille de la sélection pour en retirer un. Raccourcis : « Tout sauf 1 exemplaire de chaque » (`DISCARD_KEEP`) et « Tout désélectionner ». Le total « N cartes · +X pièces » se met à jour en direct.
- **Cartes verrouillées** : visibles mais grisées, impossibles à sélectionner ; sur la fiche, le bouton est grisé « Défausser · carte verrouillée ». Le contrôle est refait par le serveur.
- **Sécurités** : à partir de la rareté `DISCARD_CONFIRM_FROM` (Épique), un **2e toucher** « Confirmer : N cartes contre X pièces » est demandé ; un avertissement apparaît si une carte portée quitte la tenue.
- **Tout ou rien, côté serveur** : `discard_cards([{ colorway_id, rarity, count }])` retire les cartes et verse les pièces dans une seule transaction ; elle refuse l'ensemble si une carte est verrouillée ou manque. Les pièces gagnées sont celles **renvoyées par le serveur**.
- **Animation** : des pièces dorées s'envolent du bouton vers le solde en haut (`flyCoins` dans `js/wallet.js`, 3 à 12 pièces selon le gain), puis le nombre du solde défile jusqu'à sa nouvelle valeur et « bondit » ; petit son de pièces. Désactivée si le téléphone réduit les animations. Le même défilement sert au bonus quotidien.
- Monnaie **virtuelle uniquement, jamais convertible en euros** (section 9). Les pièces servent au Market (achats, y compris à la Boutique Grail).

## 6 bis. Album et Ultimes (migration 0022, `js/album.js`) — décidé par le développeur

- **Idée** : créer une vraie collection. **L'album commence vide** ; le joueur y place les cartes qu'il veut. Vue **« Album »** = 3e pilule de l'écran Collection (Collection / Atelier / Album), lien « Comment marche l'album ? » → `#rules/album`.
- **Cases** : **une case par coloris et par rareté** (75 × 4 = 300), **chaque case ne se remplit qu'une fois** (« une seule carte de chaque rareté »). `album_add(coloris, rareté)` : le serveur vérifie qu'on possède la carte, la place dans `album_cards` et retire **un exemplaire** de la collection (s'il en reste, les autres restent).
- **DÉFINITIF** : aucune fonction ne retire une carte de l'album. Une carte placée **n'est plus utilisable** (ni portée, ni vendue, ni misée, ni défaussée, ni en vitrine : le déclencheur de la 0018 la retire de la tenue et de la vitrine si c'était le dernier exemplaire). Elle **compte toujours dans « X / 300 cartes »** (Collection et profil). Une fiche de confirmation (« Définitif… ») précède chaque ajout et signale ce qui change (tenue, vitrine, verrou, dernière case du modèle).
- **Ultime** : quand un modèle est complet dans l'album (**tous ses coloris × les 4 raretés** : ex. Shell « Relais » = 6 × 4 = 24 cases), le serveur accorde son **Ultime** (`album_ultimates`, un par modèle) : rareté **« Ultime »** (au-dessus de Légendaire), **ni vendable ni échangeable ni misable ni défaussable** (il n'est jamais dans `inventory`, donc aucune fonction existante ne peut le toucher), mais **portable partout** (tenue, avatar 3D, image et lien partagés, profil, Videur) et **en vitrine**. Célébration à l'obtention (carte irisée, particules, son `ultime`, vibration) avec « Le porter maintenant ». Un Ultime se porte avec `set_equipped_ultimate(slot, modèle)`, et se met en vitrine avec `set_showcase` (étendue à l'Ultime).
- **Format** : dans `profiles.equipped` et `profiles.showcase`, un Ultime s'écrit `"<modèle>_ultime|ultime"`. Côté site, `loadCatalogue()` renvoie `ultimates` / `ultimateById` ; `colorwayById` retrouve aussi les Ultimes (mais `colorways` reste à 75 : ils ne comptent pas dans les 300) ; `ALL_RARITIES` = les 4 raretés + `ULTIME` (`RARITIES` reste à 4 : tirages, roue, défausse et Market ne les voient pas). `getOwnedUltimates()` (`js/inventory.js`) donne les Ultimes au format des cartes pour le sélecteur de tenue et l'éditeur de vitrine.
- **Écran** : en-tête « X / 300 cases remplies · N / 20 Ultimes · N cartes à placer », recherche, filtre Marque, tri (Progrès / Nom / Marque) ; un bloc par modèle (silhouette de l'Ultime tant qu'il n'est pas gagné, barre « X / 24 », cadre irisé quand il est obtenu) qui se déplie : une ligne par coloris avec 4 cases (✓ dans l'album, « + » à placer = carte possédée, estompée = pas encore possédée). Sprite ×1 / ×2 selon la largeur de la rangée (`@container`).
- **Profil** : tuile « Ultimes N / 20 » ; `get_player_profile` et `list_friends_preview` montrent l'Ultime porté ou en vitrine aux amis.
- **Videur (à valider)** : un Ultime porté compte **15 points de rareté** (`economy_config.VIDEUR.rarityPoints.ultime`, Légendaire = 10), couleurs « sombre » et « vif » ; `private.videur_worn` est redéfinie dans la 0022.
- **Sans la migration 0022** : l'onglet Album affiche « Cette fonction n'est pas encore activée sur le serveur. » et le reste du jeu marche comme avant.
- **Vérifiée** sur une base PostgreSQL locale (faux schéma, migration lancée 2 fois) : ajout, doublon refusé, carte non possédée refusée, dernier exemplaire retiré de la tenue, Ultime accordé à la dernière case, port à un mauvais emplacement refusé, Ultime d'un autre joueur refusé, vitrine avec Ultime, profil et aperçu des amis, Videur, droits `anon` refusés. **Les vraies fonctions du serveur (0001 à 0004) ne sont pas testées.**
- **Points non tranchés** : échanges futurs entre joueurs (les cartes de l'album et les Ultimes ne sortiront jamais) ; points de rareté de l'Ultime au Videur (15 par défaut) ; un joueur peut placer une carte verrouillée (le verrou disparaît avec elle) ; mesure d'usage (`track_events`) non étendue à l'album.

## 7. Avatar — fiche de tenue (option validée)

✅ **Bêta : la « fiche de tenue » avec tenue « à plat »** (choisie après un essai de bonhomme habillé jugé raté : les icônes catalogue ne se portent pas). Au centre (canvas 64 × 96, ×2 sur téléphone, ×4 sur tablette / PC), les sprites portés sont posés **tels quels**, comme une photo de fit au sol : pile centrale de haut en bas (tête → haut avec la veste par-dessus → bas → chaussures), 2 px d'espace (resserré seulement si la tenue est trop haute), écharpe puis sac posés à droite. Texte d'invitation tant que rien n'est porté. Autour : 7 cases, **dans cet ordre précis** (gauche : Tête, Haut, Bas, Chaussures ; droite : Cou, Veste, Sac ; `OUTFIT_LAYOUT` dans `js/avatar.js`, l'ordre de `SLOTS` ne change pas car il sert aux listes « tête → pieds »). Les cases sont **un peu plus petites** : sprite ×2 (64 px) avec la bordure de rareté dessinée à l'intérieur, étiquette de 11 px. Toucher une case ouvre un panneau par le bas avec les cartes possédées pour cet emplacement. **La pièce portée est toujours la première** de la liste (si elle correspond aux filtres), très visible : contour blanc épais, halo et pastille « ✓ Portée ». **Toucher une carte l'équipe ; toucher la pièce portée la retire** (plus de bouton « Retirer la pièce »). En haut du panneau (qui garde une hauteur fixe, seule la liste défile) : **recherche** (nom de la pièce, du coloris, de la marque ou de la rareté), filtres **Marque** et **Rareté** (pas de « Type » : l'emplacement est déjà choisi) et **tri** (Rareté = défaut, Nom, Marque), plus un compteur « N / M pièces ». Les filtres sont remis à zéro à chaque ouverture. La case prend la couleur de rareté de la carte portée. Enregistrée sur le serveur (`set_equipped`, qui vérifie que la carte est possédée et va dans cet emplacement ; colonne `equipped`). Code : `drawAvatar()` dans `js/avatar.js` (réutilisable pour l'image partagée).

~~Ancienne piste~~ (remplacée par la 3D, section 7 bis) : vrais calques « portés ». Un corps de base unique (ex. 32 × 64, de face) + un calque « porté » par **forme** de pièce (20 dessins, pas 75), dessiné sur ce corps ; les 75 coloris générés automatiquement par recoloration à partir des couleurs de chaque icône. Les icônes actuelles restent pour les cartes. Claude fournit le gabarit, un calque d'exemple et le script de recoloration ; le développeur dessine les 20 formes.

Contexte d'origine : le gabarit d'avatar n'était pas fixé. Les sprites des pièces sont des **icônes 32 × 32 « catalogue »**, pas des calques dessinés pour être portés.

Approche par défaut pour la bêta, sauf consigne contraire :
- Un **corps de base unique** en pixel art, neutre et non genré, sur une grille fixe.
- Des **emplacements** : tête (bonnet, casquette), haut, veste/manteau (au-dessus du haut), bas, chaussures, sac (sacoche, sac, tote), cou (écharpe). **Une pièce par emplacement.**
- Ordre de dessin : corps → bas → chaussures → haut → veste → cou → tête → sac.
- Si les icônes 32 × 32 ne se superposent pas proprement au corps, proposer **avant de coder** la solution la plus simple (par exemple, afficher l'avatar avec les icônes posées autour du corps « façon fiche de tenue », ou créer des versions « portées » simplifiées), et la décrire en quelques lignes pour validation.

Ne pas passer plus de 30 minutes bloqué sur l'avatar : simplifier plutôt que perfectionner.

## 7 bis. Avatar 3D en voxels (échantillon en cours, décidé par le développeur)

- **Choix du développeur** : un **corps en voxels** (petits cubes) + des **vêtements modélisés autour**, toujours **pixelisés** (DA du jeu), qu'on fait **tourner en glissant** le doigt (face, côté, dos). Le corps ne bouge pas.
- **Écran Tenue** : sélecteur en pilule **« 3D » (par défaut) / « À plat »**. La vue « à plat » (section 7) reste inchangée et sert encore pour l'ancien profil d'ami (repli sans migration 0014). L'**image PNG partagée** montre maintenant l'**avatar 3D** (même vue de trois quarts que dans le jeu, `DEFAULT_YAW`) avec le choix Garçon / Fille du joueur.
- **Rendu maison, sans bibliothèque** (`js/avatar3d.js`) : une grille de voxels (48 × 84 × 48) ; un rayon par pixel d'un canvas **46 × 88**, recadré au plus juste sur l'avatar (mesuré : 44 × 81 voxels sur toutes les rotations et tenues), 1 voxel ≈ 1 pixel, éclairage selon l'orientation des faces, contour noir d'1 pixel comme les sprites. Canvas agrandi **×4 sur téléphone (×3 sous 360 px), ×5 sur tablette / PC** (facteur entier). ~2 ms par image sur ordinateur. Glisser vers la droite tourne la face vers la droite, avec un peu d'élan au lâcher ; `touch-action: pan-y` garde le défilement vertical.
- **Cadre de l'avatar** : en vue 3D, fond **gris sombre** (un peu plus clair que le fond du jeu), en vue « à plat » fond clair `#cccac4` (les contours noirs des sprites). Le cadre garde la **même largeur dans les deux vues** pour que les cases ne changent pas de taille. Sur tablette / PC la fiche est centrée et limitée à 440 px. Sous le cadre (3D seulement) : « Glisse l'avatar pour le faire tourner », la pilule **Garçon / Fille** et la mention « Pas encore en 3D ».
- **Corps de base** (`getBody(type, peau)` dans `js/wear-models.js`) : un **garçon** (cheveux courts, mèche sur le front) et une **fille** (cheveux mi-longs), avec visage simple en voxels, tenue de base (t-shirt, short, chaussettes) et 3 teintes de peau (`SKIN_TONES`, « moyenne » pour l'instant).
- **RÈGLE : une SEULE mensuration pour tous les avatars** (décidée par le développeur). Carrure, taille, bras, jambes et tête sont **identiques** (`commonBody` + `commonTorso`) ; seuls les cheveux, le visage et la peau changent. Ainsi un modèle de pièce sert pour tous, y compris pour les **futurs skins** (skin personnalisable ou skins achetables plus tard : **à décider, rien n'est codé**). Tout nouveau corps ou skin doit réutiliser `commonBody` / `commonTorso` sans en changer les dimensions.
- **Choix Garçon / Fille** : pilule sous le cadre de l'avatar 3D, **enregistré sur le serveur** (`profiles.avatar_body`, `set_avatar_body`, migration 0014) pour que les amis voient le bon avatar sur ton profil. Le navigateur en garde une copie (`grail_avatar_body`), utilisée seulement si le serveur ne connaît pas encore ce réglage (migration non exécutée). La page publique d'une tenue partagée affiche l'avatar choisi **au moment du partage** (migration 0019).
- **Un modèle par PIÈCE, pas par coloris** (`WEAR_MODELS`) : des blocs (`box` = pavé, `lathe` = volume tourné pour les bonnets, `profile` = silhouette de profil extrudée pour les chaussures) + la zone du sprite à copier en façade. Les **couleurs sont lues dans le sprite du coloris porté** : les 75 coloris suivent automatiquement. Dos et côtés = couleur principale de la pièce (les bandes comme ourlets et poignets sont gardées, pas les logos). `keep` garde les bords du sprite à l'échelle 1 (ourlet, poignet), seul le milieu est étiré. `hiddenBy` cache un bloc sous une autre pièce (capuche du hoodie sous une veste).
- **Ordre de dessin** : chaussures → bas (le pantalon tombe sur la chaussure) → haut → veste → cou → tête → sac.
- **Les 48 pièces (175 coloris) ont leur modèle 3D** (les 28 de la 2e vague sont à la fin de `WEAR_MODELS`). Sacs : sacoche « Tournée » portée en banane devant (sangle autour de la taille), sac « Losange » et tote « Miettes » tenus à la hanche droite avec leurs anses ; écharpe : tour de cou + deux pans devant ; casquette : calotte + visière ; chaussures : silhouette de profil extrudée. Vérifié : les 75 coloris se construisent et se dessinent sans erreur sur les deux corps. Si une future pièce n'a pas de modèle, la mention « Pas encore en 3D : … » la liste sous l'avatar.
- **Limites connues** : dos et côtés = couleur principale (pas de logo dans le dos) ; sacs tenus à la hanche vus de face un peu « flottants » ; chaussures longues et cachées sous les pantalons larges ; pas de poches ni de plis.
- **Avatar 3D aussi** sur la page de profil (soi-même et amis), dans l'écran **Videur**, sur l'**image PNG de partage** et sur la **page publique du lien** (`?tenue=CODE`) : la vue « à plat » n'existe plus que dans l'écran Tenue.
- **Reste à faire (hors périmètre pour l'instant)** : skins (voir la règle de mensuration), avatar 3D éventuel sur la page publique, retouches de détail des modèles.

## 8. Direction artistique de l'interface

- Pixel art 32 × 32 pour tous les vêtements **et l'avatar uniquement** (l'avatar 3D en voxels reste pixelisé). L'interface, elle, n'est **pas rétro** : moderne et nette, pour créer un **contraste** avec les sprites pixelisés.
- Ambiance **streetwear / drop / resell** : sobre, un peu « hype », pas mignon. Penser vitrine de sneakers plutôt que jeu d'habillage.
- Fond **sombre** presque noir, texte blanc cassé, beaucoup d'air, coins arrondis, boutons en pilule.
- Typographie : **Archivo** (Google Fonts), grotesque grasse et étirée pour les titres, normale pour le texte. **Pas de police pixel** dans l'interface.
- Chaque marque garde ses couleurs (section 5) dans les cartes.
- Boutons larges, adaptés au pouce.

## 8 bis. Navigation (barre du bas et en-tête)

- **Barre du bas : 5 onglets maximum**, dans cet ordre : **Collection · Market · Booster · Videur · Tenue**. Le **Booster est au centre**, dans une grande pastille crème (couleur du bouton principal du jeu, `.tab-main-pill`), plus grande que les autres onglets et un peu remontée au-dessus de la barre, avec un anneau de la couleur du fond ; elle s'allume quand le Booster est ouvert. Les autres onglets sont du texte (gris, blanc quand actif).
- **En-tête (toutes les pages)** : à droite, de gauche à droite : **pastille ronde « Amis »** (`.friends-button`, icône de deux personnes, point rouge `#friends-badge` = nombre de demandes reçues), **bouton rond « profil »** (anneau de réputation), **solde de pièces**. Les deux boutons ronds passent en blanc quand leur page est ouverte. L'écran Amis (`#friends`) reste une page à part entière, ouverte par la pastille.
- **Pastilles de notification** (`js/badges.js`, rouge corail, **le site ne fait que les afficher** : tout vient du serveur) :
  - **Booster** : le nombre de boosters à ouvrir (stock gratuit + boosters offerts du Videur, lus par `get_booster_state`), sur la pastille centrale, dès qu'il y en a au moins un. Quand le minuteur arrive à zéro, `badges.js` relit l'état même hors de l'écran Booster (c'est le serveur qui ajoute le booster) ; `onStateChange()` d'`inventory.js` prévient après chaque relecture.
  - **Videur** : un **point** tant que le joueur n'a joué **aucune porte aujourd'hui** (aucune porte n'a perdu d'essai, d'après `get_videur_night` ; jour de Paris décidé par le serveur). Il disparaît dès le premier essai (Bar, même raté), et revient le lendemain (relecture toutes les 5 min et au retour sur l'onglet). Rien n'est affiché si le serveur ne renvoie pas les compteurs d'essais.
  - **Amis** : le nombre de demandes d'ami reçues, sur la pastille ronde du haut (`friends.js`, relue toutes les 45 s).
- Tout nouvel écran doit trouver sa place sans dépasser 5 onglets : bouton rond en haut, lien depuis le profil, ou sous-vue d'un onglet existant. Vérifié à 320, 375 et 768 px.

## 9. Contraintes légales (non négociables)

Le développeur n'est pas juriste ; ces règles sont prudentes en attendant un avis.
- **Aucune marque réelle** : pas de nom, logo, modèle ni allusion (« style Dunk », etc.) dans le code, les noms de fichiers, les textes, les commentaires ou les métadonnées.
- Ne jamais copier la forme d'un modèle existant : on prend la **catégorie** (basket basse en cuir), pas le **modèle**.
- **Pas d'argent réel**, pas de loot box payante, pas de monnaie convertible en euros, pas de revente en argent réel. Le jeu est gratuit.
- **Pas de contenu libre créé par les joueurs** (texte, image) dans la bêta, pour éviter la modération. **Seule exception, décidée par le développeur : le pseudo libre**, validé par le serveur (3 à 16 caractères `A-Za-z0-9_`, unique sans tenir compte des majuscules, mots interdits (tables `blocked_words` = interdit partout dans le pseudo, `blocked_exact` = interdit seulement si le pseudo est exactement ce mot ; chiffres lookalike et lettres répétées détectés, migration 0007), un changement tous les 30 jours, le tout premier choix étant libre) et **jamais affiché dans une liste publique** : on ne retrouve un joueur qu'avec son pseudo exact, et seuls ses amis voient son profil. **Autre exception, décidée par le développeur : le pseudo est affiché sur la page publique d'une tenue partagée par lien** (et sur l'image PNG de partage), car le joueur choisit lui-même de partager (section 13 bis). La liste des mots interdits est à compléter par le développeur.
- Si des images générées par IA sont ajoutées un jour, le signaler dans le README.

## 10. Comment travailler avec le développeur

- Il connaît bien **Python** mais n'est pas développeur web professionnel : **commenter le code** en français, expliquer brièvement les choix, éviter les abstractions inutiles.
- **Une tâche = un changement petit et testable.** Pas de refonte non demandée.
- À la fin de chaque tâche, donner : ce qui a changé, comment le tester sur téléphone (étapes concrètes), et ce qui reste à faire.
- En cas de doute sur un choix de jeu (taux, règles, avatar), **demander** plutôt que d'inventer ; pour un détail technique, prendre l'option la plus simple et le dire.
- Ne jamais ajouter de dépendance, de service externe ou de fonctionnalité hors périmètre (section 3) sans le signaler.
- Garder ce fichier à jour quand une règle change.
- **Cache** : à chaque changement de CSS ou de JS, augmenter le numéro `?v=…` **partout** (dans `index.html` pour `style.css` et `js/main.js`, et dans **tous les `import`** des fichiers `js/`), sinon les téléphones gardent l'ancienne version jusqu'à 10 minutes. **Le catalogue aussi** : `fetch("data/pieces.json?v=…")` dans `js/data.js` porte le même numéro (sans lui, le téléphone garde l'ancien catalogue jusqu'à 10 minutes : les nouvelles pièces n'apparaissent pas). Toujours le même numéro pour un même fichier : un module importé sous deux adresses serait chargé deux fois (deux sauvegardes séparées).
- **Fusion automatique** : après chaque changement vérifié, Claude ouvre la pull request et la **fusionne lui-même dans `main`** (mise en ligne directe sur GitHub Pages), sans attendre de validation.

## 11. Après la bêta (pour information seulement)

- Test sur 2 semaines avec 15 à 30 amis ; signal positif si 3 à 4 reviennent d'eux-mêmes chaque jour.
- Ensuite, progressivement : comptes, tenue du jour avec vote, éditions limitées, plus de marques (5 à 10 au total, 1 à 2 pièces par catégorie chacune), puis échanges entre joueurs en monnaie virtuelle.
- Monétisation éventuelle (boosters supplémentaires ou abonnement) **seulement après avis juridique**.
- **Le Videur** (jeu quotidien de tenue : portes, dress codes, Flow ; règles cachées au Club et au VIP) est codé : voir la **section 16**.

## 12. Migration vers les serveurs Hetzner (**non prévue pour l'instant**, piste gardée pour mémoire)

**Statut au 29 octobre 2026 : aucun serveur payant n'est prévu.** Le front est sur GitHub Pages, le back sur Supabase, les e-mails sur Resend, le DNS sur Namecheap. Ce qui suit décrit l'ancien plan.

- Le développeur loue **2 serveurs Hetzner** avec un nom de domaine. Objectif : tout héberger chez lui (front, puis back et base de données externe). **Étape 1 : refaire le serveur front de zéro.** Étape 2 : serveur back + base de données (comptes, vrai Market).
- Le développeur n'a qu'un **iPad** cette semaine : Claude doit **tout faire à distance** (installation, déploiement, redémarrages, tests avec un vrai navigateur), sans demander de manipulation technique, et **guider pas à pas** pour ce qui ne peut passer que par la console Hetzner.
- **Accès** : clé SSH dédiée au déploiement, stockée dans les **réglages de l'environnement** (secret / variable d'environnement), **jamais collée dans le chat**. L'environnement doit autoriser le réseau vers le serveur (le SSH sortant est bloqué par défaut). Une nouvelle session récupère ces réglages.
- **Plan du serveur front** : Ubuntu LTS, utilisateur dédié, connexion par clé uniquement, pare-feu (22, 80, 443), mises à jour automatiques, Caddy (ou nginx) avec HTTPS automatique, déploiement automatique de `main` vers le serveur. **GitHub Pages reste en secours** : ne basculer le lien envoyé aux amis qu'une fois le nouveau serveur testé.
- **Règle de sécurité** : ne jamais effacer ni réinstaller un serveur sans la confirmation explicite du développeur ; sauvegarde (snapshot) avant toute réinstallation.
- Les comptes et le Market en ligne existent maintenant sur **Supabase** (section 13), qui est le back end. Les étapes Hetzner ne sont pas lancées.

## 13. Back end Supabase (comptes + serveur de jeu) — le serveur est la source de vérité

- Projet Supabase : `https://qsueqvsbhytqrotlxmak.supabase.co`. Les migrations SQL (**0001 à 0030**, exécutées par le développeur dans le SQL Editor, **ne jamais les modifier depuis le front** ; les 0005 à 0030 sont dans `supabase/migrations/`) créent : catalogue (`brands`, `pieces`, `colorways`), `economy_config`, `profiles`, `inventory`, `transactions`, `market_listings`, la vue `market_best_offers` et toutes les fonctions du jeu.
- **Règle d'or : ne jamais remettre de logique de jeu côté client.** Le front ne tire pas de carte, ne calcule ni gain ni chance réelle, ne vérifie pas de règle (limite de ventes, verrou, solde…). Il appelle une fonction, affiche le résultat, et relit l'état. Toute nouvelle règle ou nouvelle valeur d'économie se code **dans une migration SQL** (puis, si besoin d'affichage, dans `js/economy-config.js`).
- **Le jeu n'est accessible que connecté** : e-mail + mot de passe (écran de connexion / création de compte dans `index.html`, géré par `main.js`). **Accueil (29 octobre 2026)** : au-dessus du formulaire, une phrase (« Ouvre des boosters de vêtements, habille ton avatar et passe le Videur. ») et 3 visuels (un sprite, l'avatar 3D `assets/ui/accueil-avatar.png`, l'enseigne BAR / CLUB / VIP en CSS), cachés sur les panneaux « mot de passe oublié » / « nouveau mot de passe » et sur les écrans de moins de 640 px de haut (seule la phrase reste). **« Créer un compte » est l'onglet par défaut** ; « Connexion » s'ouvre d'abord si l'appareil a déjà eu un compte (clé `grail_has_account` du navigateur, posée à la création, à la connexion ou au démarrage avec une session). À l'inscription, le message « Confirme ton e-mail » s'affiche : le compte ne peut se connecter qu'après avoir cliqué le lien reçu. Un profil (3 boosters, 0 pièce) est créé automatiquement par le serveur ; les **50 pièces de bienvenue** arrivent au premier bonus de connexion (section 6, Économie). Bouton « Se déconnecter » **tout en bas de la page de profil** (bouton rond en haut ; il était dans l'écran Tenue), hors de la zone que le profil recharge : il reste visible même si le profil ne charge pas.
- **Mot de passe oublié** : lien « Mot de passe oublié ? » sous le formulaire de connexion (pas à la création de compte) → e-mail de réinitialisation (`resetPasswordForEmail`, réponse toujours neutre pour ne pas révéler quelles adresses ont un compte). Le lien reçu ramène sur le site avec `type=recovery` : `api.js` le détecte (`isRecoveryLink`) et `main.js` affiche « Nouveau mot de passe » (6 caractères minimum, saisie en double, `updatePassword`) **avant** de lancer le jeu ; lien expiré → message + renvoi vers « Mot de passe oublié ? ». **À régler dans Supabase** (Authentication → URL Configuration) : Site URL `https://huntgrail.eu` et Redirect URLs `https://huntgrail.eu/**` et `https://www.huntgrail.eu/**` (l'ancienne adresse `https://joueur01.github.io/Grail/**` peut rester pendant la transition), sinon les liens (confirmation et réinitialisation) pointent vers localhost.
- **Écritures interdites en direct** : le front ne fait que des **lectures** (`profiles`, `inventory`, `market_listings` = ses propres ventes, `market_best_offers`) et des **appels de fonctions** (`rpc`). Les fonctions : `get_booster_state`, `open_booster`, `upgrade_cards`, `discard_cards`, `claim_daily_bonus`, `set_locked`, `set_equipped`, `set_tutorial_done`, `market_list`, `market_cancel`, `market_buy`, `market_ack_sales`, `market_history`, `track_events`, `get_videur_night`, `videur_preview`, `videur_enter`, `get_player_profile`, `set_avatar_body`, `set_showcase`, `list_friends_preview`, `get_album`, `album_add`, `set_equipped_ultimate`, `delete_my_account`, `get_market_shop`, `market_catalog`, `market_card_offers`, `starter_kit_state`, `claim_starter_kit` (wrappers dans `js/api.js`). Liste non exhaustive : voir aussi les sections 13 bis (partage) et 14 (amis).
- **Cache local** (`js/inventory.js`) : après chaque action, `refreshState()` relit profil, inventaire, ventes et état des boosters ; l'affichage lit cette copie (instantané). Ce n'est qu'un cache d'affichage, jamais une source de vérité.
- Le catalogue affiché vient toujours de `data/pieces.json` (mêmes identifiants que la table `colorways` : 175 coloris avec les 7 marques ; la boutique et les boosters lisent la table `colorways`).
- **Tests** : sans compte de test, on teste les écrans contre un faux serveur (format de réponses des fonctions SQL) ; un test réel demande un compte de test confirmé (jamais de mot de passe réel dans le dépôt).

## 13 bis. Tenue partagée par lien (migration 0008, `js/share.js`, `js/shared-outfit.js`)

- **Un seul bouton** « Partager ma tenue » (onglet Tenue). `create_outfit_share()` enregistre une **copie** de la tenue portée sous un **code secret de 20 caractères** (même tenue = même lien ; 50 liens récents gardés par joueur) ; le lien est `<page du jeu>?tenue=CODE` et **n'est jamais affiché**.
  - **Téléphone / tablette** (écran tactile + `navigator.share`) : menu de partage natif avec l'**image PNG + le lien** (le lien seul si `canShare` refuse le fichier). Safari n'ouvre le menu que juste après un toucher : si la création du lien l'a fait expirer, notification « Lien prêt : touche une 2e fois » et le 2e toucher partage tout de suite (lien gardé en mémoire).
  - **Ordinateur** : petit menu posé au-dessus du bouton (ne décale pas la page) : « Copier le lien » / « Enregistrer en image ». Les confirmations (« Lien copié. », « Image enregistrée. ») sont des notifications temporaires (`showToast`).
- **Visible sans compte** : `main.js` détecte `?tenue=` avant toute connexion et affiche `shared-outfit.js` : l'**avatar 3D** (Garçon / Fille du joueur **au moment du partage**) porte la tenue, sur fond gris sombre, et **se fait tourner en glissant** ; dessous le **pseudo de la personne qui a partagé** (gras, sous l'avatar ; rien si elle n'en a pas choisi) puis « Partagée le 28 octobre 2026 » (**juste la date**, jour de Paris, sans l'heure), puis la liste des pièces avec rareté et le bouton « Jouer à Grail ». `get_shared_outfit(code)` est la **seule** fonction appelable par `anon` ; la table `outfit_shares` est illisible directement.
- **Pseudo (migration 0020, décision du développeur)** : `get_shared_outfit` renvoie aussi `pseudo`, **lu en direct** dans le profil (il n'est pas copié avec la tenue : un changement de pseudo — un tous les 30 jours — se voit sur les liens déjà envoyés ; compte supprimé = liens supprimés). **Le pseudo n'est jamais dans l'adresse du lien** (code secret de 20 caractères). L'**image PNG** affiche le pseudo en gras sous le logo (« Alice_92 · 5 pièces · 1 légendaire », « Ma tenue · … » si pas de pseudo) ; elle est refaite si le pseudo change entre la préparation et le partage (`getPseudo()` dans `js/inventory.js`). Rien d'autre n'est exposé : ni e-mail, ni pièces, ni inventaire, ni amis. **À surveiller** : le filtre des pseudos (`blocked_words`, section 9) protège maintenant aussi les pages publiques ; la liste des mots interdits reste à compléter par le développeur.
- **Migration 0019** : `outfit_shares.avatar_body` garde l'avatar avec la copie ; `get_shared_outfit` le renvoie avec `created_at`. **Même tenue ET même avatar = même lien** (changer Garçon / Fille donne un nouveau lien) ; quand un lien est retrouvé, sa **date passe à aujourd'hui** (la date affichée est celle du dernier partage). Les liens créés avant la migration s'affichent avec le Garçon. Sans la migration, la page du lien reste en 3D (avatar Garçon) et garde sa date (déjà renvoyée par le serveur).
- La copie ne change plus : changer de tenue donne un nouveau lien. **Seul le pseudo** (migration 0020) est exposé en plus de la tenue, de l'avatar et de la date ; aucune autre donnée du joueur (section 9).
- L'image PNG (`buildShareImage`) montre l'**avatar 3D** (canvas 46 × 88 rendu en ×6, cadre gris sombre resserré, vu de trois quarts comme un « screen » figé) avec la **date du jour** (« 28 octobre 2026 », en haut à droite ; refaite si on passe minuit page ouverte) et est préparée à l'avance à chaque changement de tenue. **Elle ne contient que la tenue du joueur** : le Garçon / Fille est celui de son profil, aucun pseudo. La page publique du lien est aussi en 3D (migration 0019).
- **Aperçu des liens dans les messageries (29 octobre 2026)** : le site est statique, donc **une seule carte pour tout le site** : balises Open Graph et Twitter dans le `<head>` d'`index.html` (titre « Grail : ouvre des boosters, habille ton avatar », image `https://huntgrail.eu/assets/brand/og-image.png`, adresses **absolues** obligatoires). Un lien de tenue partagée (`?tenue=CODE`) montre donc la même carte générale, **pas la tenue** (il faudrait un serveur pour ça). L'image 1200 × 630 est dessinée par `node tools/creer_apercu_og.js` (titre en Archivo, 3 sprites, avatar 3D de l'accueil). **À tester par le développeur** : coller le lien dans WhatsApp / Snapchat ; les messageries gardent l'ancien aperçu en cache (changer d'image = nouvelle adresse du fichier).

## 14. Amis (migration 0005, `js/friends.js`)

- **Pseudo libre** choisi par le joueur (`set_pseudo`), validé par le serveur (voir section 9). **Un changement tous les 30 jours** (`FRIENDS.pseudoChangeDays` dans `economy_config`, migration 0006) : le tout premier choix est libre et ne démarre pas le délai ; ensuite, après chaque changement, le serveur refuse (« Tu pourras changer de pseudo dans N jours ») et `list_friends` renvoie `pseudo_next_change`, affiché dans l'écran Amis (« Tu pourras changer de pseudo à partir du 27 novembre »). Aucune liste publique de joueurs.
- **Écran « Amis »** (**plus d'onglet** : pastille ronde « Amis » en haut, à gauche du bouton profil, `#friends`, avec un point rouge = demandes reçues ; elle passe en blanc quand l'écran est ouvert) : formulaire de pseudo tant qu'il n'est pas choisi ; « Ajouter un ami » (recherche par pseudo exact, casse ignorée) ; « Demandes reçues » (Accepter / Refuser) ; « Mes amis » ; « Demandes envoyées » (Annuler).
- **Aperçu de chaque ami dans la liste** (migration 0017, `list_friends_preview()`, un seul appel pour tous les amis) : à gauche un **mini avatar 3D** (canvas 46 × 88 en ×1, de trois quarts, immobile, fond gris sombre) avec la **tenue du moment** (pièces encore possédées) et le Garçon / Fille de l'ami ; sous le pseudo, ses **mini cartes de vitrine** (sprite sur case claire, contour de rareté, 3 au maximum) ou « Vitrine vide ». Les avatars sont dessinés puis la grille de voxels est libérée (pas de `createAvatar3D` : trop lourd pour 50 amis) et gardés en mémoire tant que la tenue ne change pas (pas de scintillement aux relectures toutes les 45 s). Toucher une ligne ouvre toujours le profil. **Sans la migration 0017**, la liste reste simple (pseudo + ›).
- **Profil d'un ami** (toucher un ami) : ouvre la **page de profil** (section 14 bis) : avatar 3D avec sa **tenue du moment**, vitrine, statistiques. Jamais ses pièces, son inventaire détaillé ni ses ventes. « Retirer cet ami » demande 2 touchers. (Sans la migration 0014, l'ancienne vue : tenue « à plat » + progression.)
- **Règles côté serveur** (`friend_request`, `friend_respond`, `friend_remove`, `list_friends`, `get_friend_profile`, `set_pseudo`) : limite de 50 amis et 20 demandes en attente (`economy_config.FRIENDS`), pas de demande à soi-même ni en double, si l'autre joueur avait déjà invité on devient amis tout de suite, seuls les amis acceptés lisent un profil. La table `friendships` est illisible directement.
- Si la migration 0005 n'est pas exécutée, l'écran affiche « Cette fonction n'est pas encore activée sur le serveur. ».
- Hors périmètre pour l'instant : cadeaux, échanges de cartes, classement entre amis.

## 14 bis. Page de profil (migrations 0014 et 0015, `js/profile.js`)

- **Accès** : **bouton rond « profil »** en haut, à gauche du solde de pièces, sur toutes les pages (`#profile`, pas d'onglet : la barre du bas n'a que 5 onglets ; la pastille « Amis » est juste à sa gauche). Le bouton passe en blanc quand la page est ouverte.
- **Contenu (choisi par le développeur : identité, statistiques, vitrine)** :
  - **Identité** : pseudo (ou « Sans pseudo » + lien « Choisir mon pseudo › » vers l'écran Amis), « Membre depuis octobre 2026 ».
  - **Avatar 3D** avec la tenue portée, sur fond gris sombre (×3 sur téléphone, ×4 tablette / PC), qu'on fait tourner en glissant ; « N pièces portées » et, sur son propre profil, bouton **« Modifier ma tenue »** (→ écran Tenue).
  - **Vitrine CHOISIE par le joueur (migration 0015)** : **vide au départ** (« Ta vitrine est vide… » + bouton « Ajouter des cartes ») ; le joueur choisit **quelles cartes, combien (jusqu'à 3, `economy_config.PROFILE.showcaseMax`, migration 0016 ; c'était 6 avant) et dans quel ordre**. Titre « Vitrine · N / 3 », bouton « Modifier la vitrine ». **Éditeur** (panneau du bas) : 3 cases numérotées en haut (sprite ×2) (toucher une case retire la carte), « Enregistrer » / « Tout retirer », puis toutes ses cartes avec recherche + filtres Marque / Rareté (toucher une carte l'ajoute ou la retire ; numéro d'ordre et contour blanc sur les cartes choisies ; message « 3 cartes maximum » au-delà ; un toucher ne redessine pas la liste, il met à jour les marques sur place, pour que le panneau ne remonte pas en haut sur Safari). `set_showcase(p_cards)` remplace la liste (`profiles.showcase`, tableau ordonné de "coloris|rareté") après avoir vérifié le nombre, les doublons et que chaque carte est possédée. Une carte vendue, misée ou défaussée **disparaît d'elle-même** de la vitrine (le serveur ne renvoie que les cartes encore possédées). Un ami voit la vitrine, sans bouton de modification. Le maximum de **3** est le choix du développeur, modifiable dans `economy_config`.
  - **Statistiques** : Collection X / 300 (+ exemplaires, barre de progression), boosters ouverts, série au Videur (jours), Flow, amis, et **pièces (seulement sur son propre profil)** ; pastilles par rareté (Légendaire → Commun).
- **Visible aussi par les amis** (choix du développeur) : toucher un ami dans l'écran Amis ouvre la **même page** dans le panneau (sans « Modifier ma tenue »), avec « Retirer cet ami » (2 touchers). **Un ami ne voit jamais le solde de pièces** (le serveur renvoie `coins: null`). Pas de réglages sur cette page.
- **Serveur** : `get_player_profile(p_player)` (null = soi-même ; sinon seulement un ami **accepté**, sinon « Ce joueur n'est pas ton ami ») renvoie pseudo, date d'inscription, `avatar_body`, tenue portée **et encore possédée**, cartes possédées / total / exemplaires / par rareté, vitrine choisie (cartes encore possédées) et `showcase_max`, boosters ouverts (`transactions.kind = 'booster'`), amis, Flow, série du Videur (même calcul que `get_videur_night`), pièces (soi-même seulement). Lecture seule, rien n'est calculé par le site.
- **Si la migration 0015 n'est pas exécutée** (mais la 0014 oui) : la vitrine montre encore les 3 cartes les plus rares, sans bouton de modification.
- **Si la migration 0014 n'est pas exécutée** : la page affiche « Cette fonction n'est pas encore activée sur le serveur. » ; le profil d'un ami retombe sur l'ancienne vue (tenue à plat + progression) ; le choix Garçon / Fille reste dans le navigateur.
- **Vérifiée** sur une base PostgreSQL locale avec un faux schéma (migration lancée 2 fois, profil soi-même / ami / non-ami / non connecté, droits `anon` refusés).

### Carte utilisée qui quitte la collection (migration 0018)

- **Règle** : une carte **portée** (tenue, `profiles.equipped`) ou **en vitrine** (`profiles.showcase`) dont le **dernier exemplaire** quitte l'inventaire — **mise en vente** (et vente), **défausse**, carte **misée à la roue** (amélioration) — est **retirée** de la tenue et de la vitrine. S'il reste au moins un exemplaire (ex. 3 → 2), rien ne change.
- **Comment** : un **déclencheur sur `public.inventory`** (`private.release_card_from_use`) : dès qu'une ligne passe à 0 exemplaire ou est supprimée, la carte est retirée de la tenue et de la vitrine **de ce joueur seulement**. Il agit au niveau de la table : il couvre `market_list`, `market_buy`, `discard_cards`, `upgrade_cards` et toute fonction future, **sans modifier** ces fonctions (les migrations 0001 à 0004 ne sont pas dans le dépôt, on ne peut pas les relire). Si l'offre est retirée du Market, la carte revient **dans la collection mais pas dans la tenue ni la vitrine** (avant, elle s'y remettait toute seule). La migration nettoie aussi une fois les données existantes.
- **Les écrans filtraient déjà** les cartes non possédées (tenue, vitrine, Videur, amis) ; le déclencheur règle les données elles-mêmes (lien de partage, statistiques).
- **Hors règle** : un **lien de partage déjà créé** reste une copie figée de la tenue du moment (section 13 bis) ; il n'est pas modifié.
- **Avertissement à la défausse** (`js/discard.js`) : « Une carte portée quitte ta tenue. », « Une carte quitte ta vitrine. » ou « … ta tenue et ta vitrine. » quand le dernier exemplaire d'une carte portée / en vitrine est sélectionné (le cache lit `profiles.showcase`, `getShowcaseKeys()` dans `js/inventory.js`).
- **Vérifié** sur une base PostgreSQL locale (faux schéma) : exemplaires restants → rien ; dernier exemplaire mis en vente / défaussé / misé → retiré de la tenue et de la vitrine ; carte qui revient → pas remise ; un autre joueur avec la même carte n'est pas touché ; migration relançable ; droits (le déclencheur n'est pas appelable par les joueurs). **Les vraies fonctions du serveur ne sont pas testées.**

## 14 ter. Page « Règles du jeu » (`js/rules.js`)

- **Rôle** : un endroit récapitulatif des **taux de drop** et des **spécificités techniques** du jeu, sans charger les écrans de jeu (idée du développeur). Ce n'est pas un tutoriel guidé.
- **Où** : **nouvelle page `#rules`** (avec « ‹ Retour » : bouton retour du téléphone compris), sans onglet (la barre du bas n'a que 5 onglets). Accès : bouton **« Règles et taux du jeu ›»** en bas de la page de profil, au-dessus de « Se déconnecter », et **liens « ? » discrets** sur les écrans concernés qui ouvrent la bonne rubrique : Booster (« Taux de drop et garanties ›» → `#rules/boosters`), Atelier (« Comment marche la roue ? ›» → `#rules/roue`), Market (« Règles du Market et taxe de vente ›» → `#rules/market`), Videur (« Règles du Videur ›» → `#rules/videur`). `main.js` ne lit que la partie avant « / » du hash pour choisir l'écran (`rules/market` → écran `rules`).
- **Contenu (8 rubriques repliables, toutes fermées au départ ; une rubrique demandée par un lien s'ouvre et le défilement s'y rend)** : **Boosters et taux de drop** (3 cartes, chances 82 / 14 / 3,5 / 0,5 %, Booster Signature 1 sur 4 avec sa dernière carte 75 / 20 / 5 %, garanties Légendaire 40 → 60 et Épique 16, stock 1 booster / 6 h jusqu'à 3, pas d'achat) ; **Roue** (1 à 5 cartes, 20 % par carte, cartes perdues, Légendaire non améliorable) ; **Défausse** (3 / 15 / 60 / 200 pièces, tout ou rien, verrou) ; **Market et pièces** (bonus quotidien et bonus d'inscription, prix fixes, 10 ventes, taxe de 5 % avec exemple, prix conseillés, **Boutique Grail** : renouvellement à 6 h, chances et prix par rareté, pièces qui disparaissent) ; **Album et Ultimes** (une case par coloris et par rareté, définitif, Ultime à la clé) ; **Le Videur** (3 portes, essais, Flow et boosters par porte, série ; **les règles cachées du Club et du VIP ne sont volontairement pas décrites**) ; **Réputation et Flow** (50 / 100 / 150… Flow, Flow dépensé à chaque niveau ; le tableau montre les 5 premiers niveaux puis la phrase « … et ainsi de suite : 50 Flow de plus à chaque niveau. » et précise qu'il n'y a **pas de niveau maximum pour l'instant** : ne pas présenter le niveau 5 comme une fin) ; **Profil, tenue et amis** (vitrine, tenue retirée si la carte part, avatar, pseudo, lien de partage).
- **Source des chiffres** : `js/economy-config.js` (**copie d'AFFICHAGE** : le serveur décide). La page lit ces valeurs, elle n'a aucun chiffre en dur ; **si le serveur change une valeur, la mettre à jour dans `economy-config.js`**, sinon la page affichera une valeur fausse. Ajouts pour cette page : `BOOSTER.refillHours / maxStock / signatureEvery`, `DAILY_BONUS` (20 par jour, 50 au premier), `SHOP` (Boutique Grail : chances et prix), `REPUTATION`, `SHOWCASE`, `VIDEUR_INFO` (essais, Flow et boosters par porte). Évolution possible : faire lire ces valeurs au serveur (petite migration) pour qu'elles ne puissent plus diverger.
- **Pourquoi afficher les taux** : bonne pratique de transparence pour un jeu à boosters, même gratuit.

## 15. Rétention et statistiques joueurs (migration 0010, `js/analytics.js`)

- **Objectif** : mesurer si les joueurs reviennent (J+1, J+7…) et pouvoir étudier leurs comportements. Tout reste **chez nous** (Supabase), sans service externe.
- **Ce que le serveur sait déjà** : `transactions` (inscription, bonus quotidien, boosters, roue, défausse, Market), `profiles`, `inventory`, `friendships`, `outfit_shares`. Un jour est « actif » s'il y a eu une ouverture du jeu **ou** une action enregistrée : l'historique d'avant la migration compte donc déjà.
- **Ce que le site envoie** (`track_events(session, [{name, props}])`, liste blanche côté serveur, 25 événements par envoi, 3000 par joueur et par jour, jamais bloquant) : `session_start` (plateforme ios/android/desktop, appli installée ou non, taille d'écran arrondie, langue, fuseau, site d'origine, écran d'arrivée), `ping` toutes les 30 s tant que le jeu est affiché (→ temps actif), `screen_view`, `outfit_change`, `share_native` / `share_copy` / `share_image`, `client_error`. Nouvelle session après 30 min d'absence. Envois groupés toutes les 15 s et au départ de la page. **Rien n'est envoyé si « Do Not Track » est activé.** Pour mesurer autre chose : ajouter le nom dans la liste blanche de `track_events` (nouvelle migration) puis `track("nom", {…})` côté site.
- **Tables** : `analytics_events` (événements), `player_days` (par joueur et par jour de Paris : sessions, secondes actives, événements). Visites des tenues partagées : colonnes `views` / `last_viewed_at` de `outfit_shares` (incrémentées par `get_shared_outfit`).
- **Vues à lire dans le SQL Editor / Table Editor de Supabase** (illisibles par le site et les joueurs) : `analytics_retention_curve` (% actifs à J+0, 1, 2, 3, 7, 14, 30…), `analytics_retention_cohorts` (par jour d'inscription), `analytics_activity_daily` (nouveaux joueurs, DAU / WAU / MAU, « stickiness », minutes actives), `analytics_player_summary` (un joueur par ligne : ancienneté, statut actif / à risque / perdu, jours actifs, séries, sessions, temps, boosters, roue, défausse, Market, pièces, cartes, amis, partages, minutes avant le 1er booster…), `analytics_funnel` (entonnoir d'activation), `analytics_events_daily`, `analytics_screens`, `analytics_devices`, `analytics_hours`. Exemple : `select * from analytics_retention_curve;`
- **Vie privée (RGPD)** : données pseudonymes (identifiant de joueur ; les vues n'affichent ni e-mail ni pseudo), aucune adresse IP, tout est supprimé avec le compte. La **politique de confidentialité est écrite et affichée dans le jeu** (section 17) : le développeur doit encore la faire valider (avis juridique, section 9).

## 17. Confidentialité et suppression du compte (`js/privacy.js`, `js/account.js`, migration 0025)

- **Politique de confidentialité** : texte en français dans `js/privacy.js` (12 rubriques : en bref, responsable, données traitées, finalités et bases légales, qui voit quoi, prestataires, durées, droits, cookies / stockage local, âge minimum, sécurité, changements). Elle s'ouvre dans un **panneau plein écran** (`#privacy`) par **tout élément portant l'attribut `data-privacy`** (un seul gestionnaire de clic sur le document) : elle marche **même sans compte**.
- **Où elle est proposée** : écran de connexion / création de compte (« En créant un compte, tu confirmes avoir lu la politique de confidentialité. Tu as 16 ans ou plus. »), **page publique d'une tenue partagée** (lien « Confidentialité » sous le bouton « Jouer à Grail »), **page de profil** (bouton « Politique de confidentialité ›» sous « Règles et taux du jeu »).
- **Informations de l'éditeur** : `js/privacy-config.js` (`editor` = nom de l'éditeur, `contact` = adresse e-mail de contact, `updated` = date de mise à jour). **Choix du développeur (29 octobre 2026) : `editor` reste vide (le texte dit « l'éditeur de Grail ») et `contact` est son adresse e-mail personnelle**, donc affichée publiquement dans la politique (risque de courriers indésirables ; une adresse dédiée du domaine pourra la remplacer). Si `contact` est vidé, aucune adresse n'est affichée. Ne pas y mettre d'information que le développeur n'a pas choisie de publier.
- **Si le jeu change** (nouvelle donnée collectée, nouveau prestataire, nouveau service tiers), **mettre `js/privacy.js` à jour**. Prestataires cités : Supabase (connexion, base, fonctions ; **données hébergées dans l'Union européenne**, confirmé par le développeur), GitHub Pages (hébergement), Google Fonts (police Archivo), jsDelivr (supabase-js) ; ces deux derniers reçoivent l'adresse IP du visiteur. **Resend** (envoi des e-mails de confirmation et de réinitialisation, section 18 ; il reçoit l'adresse e-mail des joueurs, envoi depuis l'Irlande) est **cité dans la politique depuis le 29 octobre 2026** (la mention de transfert hors Union européenne reste à faire valider par un juriste). Âge minimum annoncé : **16 ans**. Bases légales : exécution du service (compte, jeu) et intérêt légitime (statistiques d'usage, rien n'est envoyé si « Do Not Track » est activé).
- **Supprimer son compte** : bouton « Supprimer mon compte » **tout en bas du profil** (sous « Se déconnecter »). Une fiche liste ce qui disparaît et demande d'écrire **SUPPRIMER** (bouton rouge grisé tant que le mot est faux). Le site appelle `delete_my_account('SUPPRIMER')` ; **le serveur fait tout**, de façon irréversible : il supprime, dans **toutes** les tables du schéma public, les lignes dont une colonne uuid « propriétaire » (`user_id`, `player_id`, `seller_id`, `buyer_id`, `owner_id`, `requester`, `addressee`) vaut le joueur (un achat du joueur reste dans l'historique du vendeur, sans acheteur si la colonne l'accepte), puis le profil et le compte `auth.users`. Trois passes de nettoyage (les migrations 0001 à 0004 ne sont pas dans le dépôt : leurs liens ne sont pas connus) ; si une contrainte bloque encore, **rien n'est supprimé** et le joueur voit « Impossible de supprimer le compte pour le moment ». Réservée à `authenticated`, uniquement pour son propre compte (`auth.uid()`).
- **Côté site après suppression** : la mesure d'usage est arrêtée (`stopAnalytics()`) **avant** l'appel (rien n'est renvoyé au nom du compte supprimé), la session et les préférences du navigateur (`sb-*`, `grail_*`) sont effacées, puis retour à l'écran de connexion avec « Ton compte a été supprimé. Toutes tes données ont été effacées. ».
- **Vérifiée** sur une base PostgreSQL locale (faux schéma, migration lancée 2 fois) : mauvaise confirmation et absence de connexion refusées, `anon` refusé, suppression complète du joueur (compte, sessions, profil, cartes, amis, ventes, transactions, statistiques, liens partagés), **données d'un autre joueur intactes**. **Les vraies tables du serveur ne sont pas testées** : tester avec un compte de test.
- **Pas encore fait** : export de ses données (droit à la portabilité : aujourd'hui sur demande par le contact), suppression automatique des comptes inactifs, durée de conservation des sauvegardes de Supabase.

## 16. Le Videur — jeu quotidien des portes (codé : V1 puis V2 ; décidé par le développeur)

**Statut : V1 codée (migration 0012), V2 « règles cachées » codée (migration 0013), nouvelles marques (0024), boosters offerts (0026) ; `js/videur.js`, onglet « Videur ».** Les valeurs marquées « (défaut) » sont des propositions de Claude que le développeur n'a pas encore confirmées : elles vivent dans `economy_config` et se changent sans toucher au site.

### Idée

Chaque jour, un videur de soirée juge la tenue du joueur. **3 portes par jour**, de plus en plus difficiles : **Bar, Club, VIP**. Le but : donner à la tenue une **utilité** (style + rareté) et une raison de revenir chaque jour. Le serveur décide de tout (règle d'or, section 13) : le site affiche, il ne calcule rien.

### Déroulement

- **Jour = jour calendaire à Paris** (comme le bonus quotidien). Chaque jour, chaque porte a un **dress code** tiré par le serveur dans un lot de codes (au hasard déterministe selon la date).
- Les portes se passent **dans l'ordre** : réussir le Bar déverrouille le Club, etc.
- **Se présenter** utilise la **tenue enregistrée sur le serveur** (colonne `equipped`, déjà validée par `set_equipped`), jamais une tenue envoyée par le site.
- **Essais limités par porte et par jour** (voir la V2 ci-dessous : Bar 3, Club 5, VIP 5, `VIDEUR.doors[].tries`). Un refus n'a aucune autre pénalité. Une porte réussie ne rapporte qu'**une fois par jour** (Flow et boosters).
- **Aperçu gratuit et illimité : au Bar seulement** (V2). Le joueur peut demander au serveur le score de sa tenue actuelle, sans consommer d'essai. Il n'existe plus au Club ni au VIP (il révélerait les règles).

### Le score du Bar : deux jauges séparées (le Club et le VIP n'ont plus de jauges : voir la V2)

Chaque porte exige un minimum sur **les deux** ; le refus dit laquelle manque (« il te manque du style » / « il te manque de la rareté »).

- **Rareté** : points par pièce portée (`VIDEUR.rarityPoints`, défaut Commune 1 · Rare 3 · Épique 6 · Légendaire 10), somme des pièces portées (7 emplacements au maximum).
- **Style (0 à 100)** : le dress code est une liste de **règles pondérées** (la somme des poids fait 100) ; le score est la somme des poids des règles respectées. Types de règles : `brand` (au moins N pièces d'une marque), `same_brand` (toute la tenue d'une même marque), `palette` (au moins N pièces dont les couleurs sont dans une liste), `forbid_tag` (aucune pièce d'une couleur interdite), `complete` (haut, bas et chaussures portés), `slot` (un emplacement précis rempli, ex. un accessoire), `min_pieces` (au moins N pièces).
- **Seuils par porte** (défaut, à régler avec les tests) : Bar style 50 · rareté 4 ; Club style 70 · rareté 14 ; VIP style 85 · rareté 28.
- **Couleurs** : le catalogue n'a que le nom du coloris en texte. Une table `colorway_tags` (75 lignes, créée par la migration) étiquette chaque coloris (`sombre`, `clair`, `vif`, `neutre`, `delave`, `metal`…) pour que le serveur puisse évaluer les règles `palette` et `forbid_tag`.
- **Dress codes** : table `videur_codes` (porte, nom du lieu, texte d'introduction, règles en JSON, répliques du videur). Sobre, « street », jamais de marque réelle (section 9).

### Récompenses de la V1

- **Le Flow est devenu une RÉPUTATION (migration 0021, décision du développeur)** : voir la sous-section « Réputation » ci-dessous. Les gains de Flow ci-dessous n'ont pas changé.
- **Boosters** (migration 0026) : **à chaque porte réussie, une seule fois par jour** : Bar 1, Club 1, VIP 2 (voir la section 6). Pas de pièces.
- **Flow** (`profiles.flow`) : **garanti à chaque porte réussie**, par défaut Bar 5 · Club 12 · VIP 25 (`VIDEUR.doors[].flow`), plus un **bonus de série** (+1 par jour d'affilée avec au moins le Bar réussi, plafonné à +5, `VIDEUR.streakBonusCap`). Aucune pénalité si on rate un jour.
- **Règles du Flow (non négociables)** : jamais convertible en pièces, jamais échangeable entre joueurs, jamais acheté avec des pièces ni de l'argent réel, aucun avantage de jeu. **Il sert maintenant à monter en réputation** (il est dépensé à chaque niveau) ; les cosmétiques visuels éventuels seraient débloqués **par niveau** (voir « Étapes suivantes »).
- **Pas de coffre, pas d'objet collector, pas de saison dans la V1.**

### Fonctions serveur (migration 0012, faites)

- `get_videur_night()` → les 3 portes du jour (nom du lieu, intro, règles lisibles, seuils), l'état de chacune (verrouillée / ouverte / passée, essais restants), le Flow, la série.
- `videur_preview(p_door)` → détail du score de la tenue actuelle : chaque règle ✔/✖ avec ses points, style obtenu / seuil, rareté obtenue / seuil. **Ne consomme rien.**
- `videur_enter(p_door)` → consomme un essai, renvoie le verdict (entrée / refus), le détail, la réplique du videur, le Flow gagné. Tout est enregistré dans une table `videur_attempts` (joueur, jour, porte, essai, scores, tenue au moment de l'essai, réussite) et dans un journal du Flow (la contrainte de `transactions.kind` ne connaît pas les nouveaux types : prévoir une table dédiée ou l'élargir dans la migration).
- Lecture seule pour le site ; jamais d'écriture directe (section 13).

### Interface (aucun décor illustré pour l'instant)

- Nouvel écran **« Videur »**. La barre du bas a déjà 5 onglets : vérifier qu'un 6e tient à 320 px, sinon trouver une autre place.
- Contenu : la soirée du jour (nom, dress code en 2-3 lignes) ; la tenue actuelle **en 3D** (même avatar que l'écran Tenue, Garçon / Fille du joueur, qu'on fait tourner en glissant ; fond gris sombre, ×3 sur téléphone, ×4 tablette / PC) avec accès rapide pour la changer ; les deux jauges avec leurs seuils (aperçu) ; bouton « Se présenter » ; verdict avec la réplique du videur et la liste de ce qui a joué ; Flow gagné et série.
- Ambiance **sans illustration** : porte et enseigne en CSS (nom du lieu en Archivo, couleur par porte : bleu Bar, violet Club, or VIP comme les raretés), halo derrière la tenue, flash vert / rouge au verdict, sons synthétisés (coup à la porte, basse étouffée, son d'entrée / de refus). Le pixel art reste réservé aux vêtements et à l'avatar (section 8).
- Ton du videur : **sobre et sec** (défaut, à confirmer).
- Mesure : chaque essai est enregistré dans `videur_attempts` ; la vue `analytics_videur_daily` (essais, réussites, joueurs, Flow distribué par jour et par porte) se lit dans le SQL Editor, avec les vues de la section 15. L'écran compte aussi dans `screen_view`.
- **Code** : `js/videur.js` (écran : onglets des portes, enseigne CSS, règles ✔/✖ de l'aperçu, tenue en 3D (`createAvatar3D`), jauges Style / Rareté avec trait du seuil, bouton « Se présenter », fiche de verdict avec réplique) ; barre du bas : voir la section 8 bis (5 onglets, testés jusqu'à 320 px). Contenu de départ : 12 dress codes (4 par porte ; 4 de plus au Bar avec la 0024), 36 répliques, étiquettes de couleur des 75 coloris (175 avec la 0023). Seul le **titre sur la tenue partagée** et la **boutique de Flow** restent à faire.
- **Tenue évaluée** : seulement les pièces portées ET encore possédées ; une carte vendue ou misée ne compte plus.

### V2 — règles CACHÉES par paliers de difficulté (migration 0013)

Le Videur devient un **jeu de déduction** (façon Wordle / Mastermind) : plus on monte, moins on voit les règles.

| Porte | Mode | Règles | Retour après chaque essai | Essais / jour |
| --- | --- | --- | --- | --- |
| **Bar** | `visible` | visibles (tutoriel) | verdict détaillé, aperçu gratuit, jauges Style et Rareté | 3 |
| **Club** | `count` | **cachées** | « X critères sur N » + un indice vague sur UN critère raté | 5 |
| **VIP** | `hint` | **cachées** | **uniquement** l'indice vague (pas de compte) | 5 |

- **Entrer au Club ou au VIP** = respecter **tous** les critères du jour (4 au Club, 5 au VIP). Le seuil de rareté est un critère comme les autres : `rarity_min` (au moins N points) ou `rarity_max` (pas plus de N points), en alternance d'un jour à l'autre pour que les débutants et les cartes communes restent utiles. Nouveaux types de règles : `min_brands`, `no_slot`, `max_pieces`, `rarity_min`, `rarity_max`.
- **Contenu** : table `videur_riddles` (illisible par le site) : **20 énigmes au Club et 20 au VIP** à l'origine (28 chacun depuis la migration 0024), écrites à la main à partir d'une bibliothèque de critères ; chacun porte un `label` (révélé à la fin) et un `hint` (indice vague, ex. « Trop flashy. », « T'es pas du coin. », « Il fait nuit dehors, t'as pas vu ? »). Les 40 énigmes ont été vérifiées **réalisables** (recherche d'une tenue valide, puis rejouée dans le SQL). Une énigme par jour et par porte, **la même pour tous les joueurs**, en avançant d'un cran par jour dans la liste (cycle de 20 jours, puis de 28 avec la 0024). Les anciens dress codes du Club et du VIP (visibles) sont désactivés.
- **Révélation** : à la réussite, ou quand les essais de la porte sont épuisés, le serveur renvoie la règle du jour (`reveal`) ; le joueur la revoit en rechargeant. Jamais avant.
- **Secret côté serveur (non négociable)** : pour le Club et le VIP, `get_videur_night` et `videur_enter` ne renvoient **jamais** les règles, les seuils, les points par critère, le score de style ni les points de rareté : seulement accepté / refusé, le compte (Club), l'indice, les essais restants, l'historique des essais du jour et, à la fin, la règle. Le lieu et l'introduction de ces portes sont **neutres** (« Le Sous-sol », « Le Toit ») pour ne rien laisser deviner. `videur_preview` est **refusé** au Club et au VIP (« Pas d'aperçu pour cette porte »). Le site n'a aucune règle ni aucun seuil dans son code (`economy-config.js` n'en contient pas ; seuls le nombre d'essais et le Flow par porte y figurent, pour la page « Règles du jeu » : ce ne sont pas des secrets). **Toute évolution doit conserver cette propriété.**
- **Essais comptés par le serveur** (table `videur_attempts`, par joueur, jour de Paris et porte) : recharger la page ne rend rien ; pas d'essai supplémentaire achetable (refusé).
- **Interface** : au Club et au VIP, aucun aperçu, aucune jauge, aucune coche ; on voit la tenue, les essais restants, la série, et l'historique « Ce que le videur t'a dit » (indices, « X sur N » au Club). Fiche de verdict : ENTRÉE / REFUSÉ + indice (+ « X critères sur N » au Club) + règle du jour à la fin.
- **Partage sans spoiler** : bouton « Partager mon résultat » une fois la porte terminée : `Grail · Videur · Club 28/10`, `3/5` (ou `X/5`), puis une ligne de carrés (🟩 entré, 🟨 « presque » au Club seulement, ⬛ loin) ; jamais les critères. Menu natif sur téléphone, copie sinon.
- **Inchangé** : le Flow (Bar 5 · Club 12 · VIP 25), le bonus de série (Bar, +1 par jour, plafond +5) et le verrou des portes dans l'ordre.
- **Statistiques** : `analytics_videur_daily` ajoute le pourcentage moyen de critères respectés.

### 2e vague de marques au Videur (migration 0024, `tools/ecrire_enigmes_0024.py`)

- **Bar** : 4 dress codes visibles ajoutés, un par marque (« Bleu de travail », « Sortie en forêt », « Match à domicile », « Nuit chromée »).
- **Club et VIP** : **8 énigmes cachées par porte** ajoutées (deux par marque), soit **28 par porte** ; l'indice du critère de marque ne nomme pas la marque (« T'as jamais bossé de tes mains. », « Tu sors jamais de la ville, toi. », « T'as pas l'air de supporter grand monde. », « Il manque de l'éclat, ce soir. »). Chaque énigme a été **vérifiée réalisable** par recherche (un coloris par emplacement au plus, rareté au choix) avec les étiquettes de couleur des 175 coloris. Les anciens critères et l'ordre du cycle ne changent pas, mais le cycle passe de 20 à 28 jours : la rotation change une fois, le jour de la migration.
- **Secret** : inchangé (le site ne contient aucune règle ; la 0024 n'écrit que dans des tables illisibles par le site).
- Hors Videur : un Ultime porté compte 15 points de rareté (voir la section 6 bis).

**Points non tranchés (le développeur doit décider ; rien n'est implémenté)**
1. ~~Rôle exact du Flow~~ : **tranché** (il fait monter la réputation, voir ci-dessus). **Reste à préciser** : la série au Club et au VIP, et le bonus de série.
2. **Règle du jour impossible avec la petite collection d'un nouveau joueur** (ex. « au moins 18 points de rareté » avec quelques communes) : pistes à valider, dont **règles plus faciles au Club pour un joueur qui a peu de cartes**, ou **tenue d'essai prêtée** ; pour l'instant le joueur peut simplement échouer et lire la règle le soir.


### Réputation (le Flow devenu niveaux, migration 0021, `js/reputation.js`)

- **Règle** : on arrive **niveau 0**. Passer niveau 1 coûte **50 Flow**, niveau 2 **100**, niveau 3 **150**… : **50 de plus à chaque niveau** (coût du passage du niveau n au suivant = 50 × (n + 1), `economy_config.REPUTATION.costStep`). **À chaque passage de niveau, ce Flow est DÉPENSÉ** : `profiles.flow` est donc le Flow accumulé vers le niveau suivant (il baisse au passage), `profiles.rep_level` le niveau et `profiles.rep_next` le Flow à atteindre pour le suivant.
- **Serveur** : un **déclencheur** sur `profiles` (`private.reputation_rankup`) applique les passages de niveau, **plusieurs d'un coup** si le gain est grand, sans modifier `videur_enter` (qui fait toujours `update profiles set flow = flow + …`). La migration **convertit une fois** le Flow déjà gagné (ex. 120 Flow → niveau 1 + 70) ; relancer ne change plus rien. `get_player_profile` renvoie `flow`, `rep_level` et `rep_next`. Le site ne calcule aucun niveau.
- **Affichage (bien visible)** : (1) **anneau doré de progression + pastille du niveau autour du bouton rond « profil »**, en haut de toutes les pages, à côté du solde ; (2) **grande carte « Réputation / Niveau N »** avec barre et « 35 / 150 Flow · encore 115 pour le niveau 3 » **juste sous le pseudo** de la page de profil (un ami voit aussi le niveau de l'autre) ; (3) ligne « Réputation niv. N · 35 / 150 Flow · Série… » en haut de l'écran Videur. **Montée de niveau** : notification « Réputation : niveau N atteint ! », son, vibration et pulsation du bouton (détectée quand le niveau monte après une relecture).
- **Sans la migration 0021** : bouton profil simple, tuile « Flow » dans les statistiques et « Flow : N » au Videur, comme avant.
- **Vérifiée** sur une base PostgreSQL locale (faux schéma, migration lancée 2 fois) : 49 + 1 Flow → niveau 1 et Flow dépensé ; niveau 1 → 2 coûte 100 ; gros gain d'un coup → plusieurs niveaux sans perdre de Flow ; Flow existant converti ; autres mises à jour du profil sans effet.

### Points de vigilance

- **« Location » de cartes** : on peut acheter une carte chère, passer la porte, puis la revendre ; le coût réel est la taxe de 5 % (section 6, Market). C'est acceptable (cela alimente le Market et c'est un retrait de pièces), à surveiller.
- **Trop de portes difficiles = abandon** : le Bar doit se réussir avec une tenue commune bien choisie.
- Réglages à faire avec les amis testeurs : seuils, valeurs de Flow, nombre d'essais.

### Étapes suivantes (hors V1)

1. Cosmétiques (cadres, fonds, effets, tenues visibles en plus) et **titres** affichés sur la tenue partagée, **débloqués par niveau de réputation** (le Flow étant maintenant dépensé par les niveaux, une boutique « payée en Flow » n'a plus de sens : à redécider).
2. Coffres gagnés au Videur (pièces, ou très petite chance d'objet collector), toujours gratuits, avec les chances affichées.
3. Objets collector numérotés (exemplaires en nombre limité, revente au Market contre pièces uniquement : demande une vue de Market à part, annonces individuelles).
4. Saisons et classement entre amis ; puis, plus tard, un mode histoire (chapitres par marque) si le Videur est bien joué.

## 18. Logo et e-mails (`tools/creer_logo.py`, `assets/brand/`, `supabase/email-templates/`)

- **Logo** : un **graal** (coupe) en pixel art **16 × 16**, crème et or sur le fond du jeu (`#0f0f11`), coins arrondis, petit éclat doré en haut à droite. Dessiné en lettres dans `DESSIN` de `tools/creer_logo.py` ; pour le modifier, changer le dessin et relancer `python3 tools/creer_logo.py`. Tous les agrandissements sont des **facteurs entiers** (section 4).
- **Fichiers produits** : `favicon.ico` à la racine (16, 32 et 48 px, chaque taille agrandie sans flou ; **Google demande au moins 48 px** pour l'icône des résultats), `assets/brand/icon.svg` (onglet des navigateurs récents), `icon-180.png` (écran d'accueil iPhone), `icon-192.png` / `icon-512.png` (Android, `manifest.webmanifest`), `icon-32.png` / `icon-48.png`. Liens dans le `<head>` d'`index.html`. Le manifeste ne change pas le comportement du site (pas de `display` : le jeu s'ouvre toujours dans le navigateur).
- **Google** met à jour l'icône des résultats à son rythme (de quelques jours à quelques semaines) ; rien à faire de plus.
- **Logo des e-mails** : `assets/brand/logo-email.png` (576 × 160, affiché en 288 × 80 pour rester net sur les écrans Retina) = l'icône ×7 + « GRAIL » en **Archivo 900 étirée** (police du titre du jeu), crème sur un rectangle arrondi sombre (lisible sur fond clair comme sombre). Rendu une fois avec un navigateur (Playwright) et la police Archivo ; PNG car beaucoup de messageries n'affichent pas le SVG. Les e-mails l'appellent par son adresse publique `https://huntgrail.eu/assets/brand/logo-email.png` : **ne pas déplacer ce fichier** (les e-mails déjà envoyés perdraient leur logo).
- **Pourquoi un service d'e-mail à part** (vérifié dans la documentation de Supabase, octobre 2026) : sur l'offre **gratuite**, le service d'e-mail intégré n'envoie qu'aux adresses des membres de l'équipe du projet (donc **pas à des amis qui créent un compte**), à raison de 2 messages par heure, et depuis le **3 juin 2026** les projets gratuits créés après cette date **ne peuvent plus modifier** l'objet ni le contenu des e-mails sans service SMTP personnalisé. Le jeu passe donc par **Resend** (offre gratuite).
- **Resend** : domaine `huntgrail.eu` ajouté dans la région **Irlande (eu-west-1)** ; enregistrements DNS ajoutés chez Namecheap (Advanced DNS) : TXT `resend._domainkey` (DKIM), CNAME `rsend` et `send` (envoi), TXT `_dmarc` (`v=DMARC1; p=none;`, facultatif) ; ne pas toucher aux enregistrements du site (A, AAAA, CNAME `www`, TXT GitHub). Réglages dans Supabase → Authentication → Emails → SMTP Settings : expéditeur `noreply@huntgrail.eu`, nom `Grail`, hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = **clé API Resend (jamais dans le dépôt ni dans le chat)**. La limite d'e-mails par heure se règle dans Supabase → Authentication → Rate Limits.
- **Modèles d'e-mail** (`supabase/email-templates/`, **en français**, fond sombre, bouton crème en pilule, mise en page en tableaux pour les messageries) : `confirmation.html` (Confirm sign up, objet « Confirme ton compte Grail »), `mot-de-passe.html` (Reset password, « Ton nouveau mot de passe Grail »), `changement-email.html` (Change email address, « Confirme ta nouvelle adresse Grail »), `lien-magique.html` (Magic link, « Ton lien de connexion Grail » ; le jeu ne s'en sert pas). **À coller par le développeur** dans Supabase → Authentication → Emails → Templates (objet + contenu HTML, mode Source, puis « Save changes »). Le bouton utilise `{{ .ConfirmationURL }}` (variable de Supabase). Si un texte change, modifier le fichier du dépôt **et** le recoller dans Supabase.
- **Limites** : l'avatar de l'expéditeur dans Gmail (le logo à côté du nom) demanderait **BIMI** (DMARC strict + certificat de marque payant, plusieurs centaines à plus d'un millier de dollars par an) : non fait, le logo est déjà dans le corps du message. Le service gratuit de Resend est limité en volume (à surveiller si le jeu grandit).

## 19. État du projet, à faire, décisions en attente et pièges connus (mis à jour le 29 octobre 2026)

### Ce qui est fait (bêta en cours : objectif dimanche 1er novembre, section 3)
- **Cœur du jeu** : boosters tirés par le serveur (stock 1 / 6 h, Signature, pity), Collection / Atelier (roue) / Album (Ultimes), défausse, verrou, vitrine, profil, amis, réputation, page « Règles du jeu ».
- **Avatar 3D en voxels** (Garçon / Fille, 48 pièces, 175 coloris, 48 Ultimes), partage de tenue par lien public + image PNG.
- **Videur** (Bar visible, Club et VIP à règles cachées) avec **boosters offerts** (1 / 1 / 2) ; **7 marques** (175 coloris, 700 cartes).
- **Market** : catalogue « Bazaar » (modèle → coloris + rareté → offres), Vendre, Mes ventes, Historique, taxe de 5 %, **Boutique Grail** (vendeur système, renouvelée à 6 h), **50 pièces** au premier bonus.
- **Compte et légal** : connexion e-mail + mot de passe, mot de passe oublié, suppression du compte, politique de confidentialité écrite (avis juridique à demander, section 9).
- **Infrastructure** (confirmée par le développeur le 29 octobre 2026) : site sur **GitHub Pages** à `https://huntgrail.eu` (HTTPS activé, domaine vérifié), back end **Supabase** (offre gratuite ; **les migrations 0005 à 0029 sont exécutées** (la **0030**, kit de départ, est écrite mais **pas encore exécutée**) ; Site URL et Redirect URLs réglés), e-mails par **Resend** (domaine vérifié, section 18), DNS chez **Namecheap**, logo et favicon (section 18). **Aucun serveur payant.**
- **Testé** sur **iPad et iPhone** (tous les rendus) ; **Android pas encore testé**.

### À faire (par ordre d'importance)
1. **Avant d'inviter plus d'amis** : test complet avec un **compte neuf** (inscription → e-mail → confirmation → +50 pièces → booster → tenue → partage), si ce n'est pas déjà fait ; test sur **Android** (non testé).
2. **Politique de confidentialité** : Resend est cité et le contact est renseigné (fait) ; faire valider le texte par un juriste (dont le transfert de l'adresse e-mail vers Resend) ; envisager une adresse de contact dédiée du domaine plutôt que l'adresse personnelle.
3. **Sécurité (audit des droits fait le 29 octobre 2026 : RLS active partout, aucun droit d'écriture direct pour les joueurs ni `anon` après la migration 0029, seule `get_shared_outfit` appelable sans compte ; reste à faire :)** anti-robots à l'inscription (hCaptcha ou Cloudflare Turnstile, gratuit, pris en charge par Supabase) ; **comptes multiples** (chaque compte neuf = 3 boosters + 50 pièces, transférables via le Market) : idée d'un délai d'ancienneté (par exemple 24 h) avant de pouvoir vendre ; limites d'appels. **Rien de cela n'est décidé ni codé.**
4. **Sauvegardes** : l'offre gratuite de Supabase n'a pas de sauvegarde utilisable ; prévoir une sauvegarde régulière (sans serveur payant : à choisir, par exemple un export programmé stocké ailleurs) et **exporter le schéma réel** (migrations 0001 à 0004, fonctions de `private`) dans le dépôt : aujourd'hui on ne peut pas reconstruire le serveur depuis le dépôt seul.
5. **Limites de l'offre gratuite Supabase** (estimations, à confirmer avec la page Usage) : base de 500 Mo (la mesure d'usage `analytics_events` est la plus grosse consommation : prévoir un nettoyage des événements de plus de 30 jours), trafic sortant de 5 Go par mois (relectures toutes les 30 s et 45 s), pause du projet après 1 semaine sans activité.
6. **Dette technique** : CSS mort (`.price-badge`, `.mine-badge`, `.shop-badge` : plus utilisés depuis le catalogue) ; `screen_view` compté à chaque changement de page du Marché (`#market/...`) ; aucun test automatisé dans le dépôt (les tests se font avec un faux serveur et PostgreSQL local, hors dépôt) ; export des données (droit à la portabilité), suppression des comptes inactifs, expiration des offres du Market.
7. **Rétention** : voir les décisions en attente ci-dessous ; mesurer avec les vues de la section 15 (`analytics_retention_curve`, `analytics_funnel`, `analytics_player_summary`).

### Retours de la bêta (29 octobre 2026)
- **3 amis invités**, un seul retour pour l'instant, d'un ami sur un ton provocateur mais à prendre au sérieux :
  - « **ça se voit que c'est un site IA** » : l'ami sait que le jeu a été fait vite et ne sait pas que le développeur code. Précision du développeur : **ce n'est pas un reproche de soin, au contraire** (le rendu est « trop propre » pour quelqu'un de son entourage qui n'est pas dans le code). **Ce n'est donc pas un défaut ; le risque possible est de réputation** : si les gens qui le connaissent comprennent que le jeu est fait avec une IA, cela pourrait devenir un problème (à ne pas minimiser ni à trancher seul). **À creuser plus tard avec un agent plus technique** (manière d'en parler, transparence, ce qui est fait à la main, section 9 sur les images générées par IA). La direction artistique en pixel art est un choix du développeur et ne change pas.
  - « j'ai ouvert tes boosters, **y'a rien à faire jusqu'aux prochains boosters** » : **confirme le risque principal** (première session très courte : 3 boosters = 9 cartes, puis plus rien avant 6 h). Les boosters du Videur (1 / 1 / 2), le Market et la Boutique Grail ont été ajoutés pour y répondre, mais **un nouveau joueur ne sait pas forcément quoi faire ensuite** : un parcours guidé de la première session (tenue, Videur, partage, Market) est une piste sérieuse, non décidée.
- Les statistiques de rétention sont lisibles dans Supabase (section 15) ; à relire après la bêta.

### Décisions en attente (rien n'est codé tant que le développeur n'a pas tranché)
- ~~Tenue de départ complète~~ : **tranché le 29 octobre 2026** (kit de départ au choix parmi les marques + 2 boosters offerts, section 6) ; **migration 0030 à exécuter** puis à tester avec un compte neuf.
- **Stock gratuit plus généreux** (plafond de 3 à 5, un booster toutes les 4 h au lieu de 6 h) : « à réfléchir » ; attendre les chiffres réels de la bêta.
- **Quêtes quotidiennes** : jugées sympathiques mais **reportées** (risque d'avoir trop de listes d'objectifs à la fois) ; à reconsidérer si les amis disent ne pas savoir quoi faire après le Videur.
- **Market, phase 2** (liste de souhaits, ordres d'achat avec pièces bloquées, achat automatique, pastille) si le Marché est utilisé pendant le test ; **phase 3** (bornes de prix par rareté, historique et graphique des prix, meilleur prix d'achat / de vente, garde-fous contre l'accaparement) quand il y aura beaucoup de joueurs. Les prix sont déjà libres (le vendeur les choisit).
- **Identité des vendeurs du Market** : cachée (« Joueur » / « Boutique Grail ») ; l'afficher (pseudo, profil) a été **déconseillé** pour la bêta (harcèlement, RGPD) ; piste facultative plus tard : un réglage « afficher mon pseudo dans l'historique ».
- **Videur** : série au Club et au VIP, règles plus faciles pour un joueur qui a peu de cartes, points de rareté d'un Ultime (15 par défaut), réglage des seuils avec les testeurs.
- **Avatar** : skins (personnalisables ou achetables), règle de mensuration unique (section 7 bis).
- **Hetzner** : non prévu pour l'instant (section 12).
- **Après la bêta** : cosmétiques et titres par niveau de réputation, coffres, objets collector numérotés, saisons et classement entre amis (section 16, « Étapes suivantes »), monétisation éventuelle **seulement après avis juridique**.
- **Promotion** : pas de plan écrit ; une revue complète (produit, technique, croissance) est prévue avec Claude (idéalement avec les chiffres réels de la bêta).

### Pièges rencontrés (à ne pas refaire)
- **`private.cfg()` lit `economy_config` avec les droits de l'appelant**, même depuis une vue : un joueur (rôle `authenticated`) n'y a pas accès. Une **vue lue par les joueurs ne doit jamais l'appeler** ; passer par une petite fonction `security definer` dans `public` (comme `public.shop_enabled()`).
- **Tester les vues et les lectures avec `set role authenticated`**, jamais seulement avec un rôle administrateur : un test en administrateur masque les erreurs de droits. Dans le SQL Editor de Supabase, un `do $$ … $$` qui termine par `raise exception 'RESULTAT : %', texte` est un bon moyen d'afficher un diagnostic.
- **Un vendeur vide (offres de la boutique) fait que `seller_id <> uid` vaut NULL** : utiliser `is distinct from` (sinon un joueur pourrait « annuler » une offre de la boutique et recevoir la carte).
- **`create or replace view` ne peut qu'ajouter des colonnes à la fin** (même noms et types pour les existantes).
- **Les migrations sont exécutées à la main par le développeur** : toujours dire laquelle exécuter, la rendre relançable, et faire marcher le site **sans** elle quand c'est possible (messages « pas encore activée sur le serveur »). Quand une migration corrigée est publiée, le développeur doit **la relancer** : vérifier avec une requête de diagnostic qu'elle est bien en place.
- **SIGNAL/9 n'a aucune pièce à l'emplacement `haut`** (Shell et Gilet sont des `veste`) : la règle `complete` du Videur (haut + bas + chaussures) ne peut donc **jamais** être satisfaite par une tenue SIGNAL/9. À traiter si un dress code du Bar la pondère fortement (pistes : accepter `veste` à la place de `haut` dans `private.videur_eval`, ou changer l'emplacement du Gilet). Le kit de départ donne une veste à la place du haut pour cette marque.
- **C'est `<main>` qui défile**, pas la fenêtre (`document.querySelector("main")`).
- **Cache** : numéro `?v=…` à augmenter partout à chaque changement de JS / CSS / catalogue (section 10).
- **Supabase gratuit** : e-mails limités et modèles non modifiables sans SMTP personnalisé (section 18) ; pg_cron est actif (renouvellement de la boutique chaque heure pile) ; en secours, la boutique se renouvelle aussi à l'ouverture du Market.
- **Environnement Claude** : la clé API de Resend, la clé `service_role` et le mot de passe d'un compte ne doivent **jamais** être collés dans le chat ni dans le dépôt.

