# CLAUDE.md — Grail

Ce fichier donne à Claude Code tout le contexte du projet. Lis-le en entier avant chaque tâche.
Réponds et commente en **français**. L'interface du jeu est en français.

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
- **Budget : GitHub Pages reste gratuit** ; le développeur loue aussi 2 serveurs Hetzner (voir section 12) pour la suite. Aucune API payante.
- **Le jeu a des comptes et un back end Supabase** (voir section 13). **Le serveur est la source de vérité** : le front affiche ce que le serveur renvoie et ne contient **aucune logique de jeu** (tirages, gains, chances, règles du Market). Plus de le serveur pour la sauvegarde du joueur.
- Hébergement du site : **GitHub Pages** (site statique, branche `main`, racine du dépôt).
- **Mobile d'abord** : le test se fait sur téléphone. Tout doit marcher au doigt, en portrait, sur un écran de ~375 px de large.
- Le développeur y passe 1 à 2 h par jour. Chaque tâche doit produire **quelque chose de visible qui marche**.

### Fonctionnalités de la bêta, dans l'ordre

1. **Booster** : un bouton « Ouvrir un booster » qui ouvre un booster de 3 cartes **tiré par le serveur** selon les taux de rareté (section 6), avec une petite animation de révélation carte par carte. ✅ Fait.
2. **Inventaire** : la collection du joueur, sauvegardée **sur le serveur**, avec filtres simples (marque, catégorie, rareté) et le nombre d'exemplaires de chaque carte. ✅ Fait : progression « X / 300 », filtres Marque / Type / Rareté (menus natifs, collés en haut), grille triée de la plus rare à la plus commune, badge « ×N » pour les doublons.
3. **Avatar** : un personnage en pixel art sur lequel on équipe une pièce par emplacement (section 7). ✅ Fait pour la bêta (fiche de tenue, tenue « à plat »).
4. **Partager ma tenue** : **lien public** (principal, section 13 bis) ; l'export en image reste en option secondaire. Ancien fonctionnement de l'image : exporter l'avatar habillé en **image PNG** (canvas → PNG), avec le nom des pièces et leur rareté, puis partage natif (`navigator.share` avec fichier si disponible, sinon téléchargement). ✅ Fait : PNG 1080 × 1350 (tenue à plat ×6 + liste tête → pieds : nom, marque, coloris, rareté + adresse du jeu), **préparé à l'avance** à chaque changement de tenue (Safari n'ouvre le partage que juste après un toucher), repli téléchargement ; bouton désactivé tant que rien n'est porté.
5. **Mise en ligne** sur GitHub Pages et test sur iPhone/Android.

### Hors périmètre de la bêta (ne pas coder pour l'instant)

Échanges directs entre joueurs, achats en argent réel, abonnement, comptes via réseaux sociaux, votes, défis de style, contenu créé librement par les joueurs (textes, images), notifications, 3D.

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
├── js/
│   ├── main.js        # navigation entre écrans
│   ├── api.js         # SEUL contact avec le serveur : connexion, lectures, une fonction par action
│   ├── supabase-config.js # adresse du projet + clé anon (publique)
│   ├── data.js        # chargement du catalogue, raretés, recherche
│   ├── economy-config.js  # valeurs de l'économie, pour l'AFFICHAGE seulement (le serveur décide)
│   ├── wallet.js      # solde de pièces (en-tête), bonus quotidien, notification
│   ├── booster.js     # écran Booster : stock, minuteur, déchirure, révélation
│   ├── effects.js     # sons synthétisés, vibrations, particules
│   ├── gestures.js    # gestes : glisser, rester appuyé, toucher
│   ├── inventory.js   # état du joueur lu sur le serveur (cache) + écran Collection
│   ├── cards.js       # dessin d'une carte (partagé booster / collection)
│   ├── upgrade.js     # fiche d'une carte + amélioration par la roue
│   ├── discard.js     # défausse : sélection de plusieurs cartes contre des pièces
│   ├── atelier.js     # vue « Atelier » : progression par modèle + rareté
│   ├── market.js      # Market entre joueurs (offres et actions via le serveur)
│   ├── friends.js     # écran Amis : pseudo, demandes, liste, tenue d'un ami (via le serveur)
│   ├── avatar.js      # rendu de l'avatar en canvas
│   ├── share.js       # partage de la tenue : lien public (principal) + export PNG (option)
│   └── shared-outfit.js  # page publique d'une tenue partagée (?tenue=CODE), sans compte
├── data/
│   └── pieces.json    # catalogue des pièces et coloris
├── assets/
│   ├── pieces/        # un PNG 32×32 par coloris, fond transparent
│   └── avatar/        # corps de base et éventuels calques « portés »
├── visuels/           # référence, ne pas servir au jeu
│   ├── sources/       # planches PNG d'origine fournies (une par marque)
│   ├── pieces/        # un SVG 32×32 par coloris
│   └── *_coloris_apercu.svg  # planches reconstruites en SVG
├── supabase/
│   └── migrations/
│       ├── 0005_amis.sql  # amis (à exécuter dans le SQL Editor de Supabase)
│       ├── 0006_pseudo_30_jours.sql  # un changement de pseudo tous les 30 jours
│       ├── 0007_pseudos_interdits.sql  # mots interdits dans les pseudos
│       └── 0008_tenue_partagee.sql  # lien public vers une tenue
├── tools/
│   └── extraire_sprites.py   # découpe les planches → PNG + SVG (Python + Pillow)
└── CLAUDE.md
```

## 5. Le catalogue

### Règles générales

- **20 pièces** réparties sur **3 marques fictives**, déclinées en **75 coloris** au total (26 + 26 + 23).
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

- Tirage : pour chaque carte, la rareté selon sa table, puis un coloris au hasard parmi les 75 (uniforme pour la bêta).
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
- **Pas d'achat de booster, pas d'accélération** : les boosters ne s'obtiennent que par le stock gratuit (1 toutes les 6 h). Aucun moyen de payer pour en avoir plus ou pour avancer le minuteur.
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
- Pièces du jeu : pas de dépense possible pour l'instant. Aucun argent réel.

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
- **Bonus de connexion** : `claim_daily_bonus()` (une fois par jour calendaire à Paris, décidé par le serveur ; renvoie 0 s'il est déjà pris). Appelé à l'ouverture du jeu et au retour sur l'onglet ; notification « +20 pièces · bonus du jour ».
- **Erreurs** : le serveur renvoie des messages déjà en français (« Aucun booster disponible », « Carte verrouillée », « Le prix a changé »…). `api.js` les transmet tels quels (messages techniques anglais remplacés par un message générique) et `reportError()` (wallet.js) les affiche dans la notification rouge, sans casser l'écran.
- Les pièces servent à acheter au Market ; elles se gagnent par le bonus, la défausse et les ventes. Monnaie **virtuelle uniquement, jamais convertible en euros**.

### Market (`js/market.js`) — géré par le serveur

Onglet **Market** : Acheter / Vendre / Mes ventes.
- **Prix fixes**, pas d'enchères. **Une seule offre par carte** (coloris + rareté) : la **moins chère** (vue `market_best_offers`) ; le nombre d'offres n'est jamais exposé. Quand elle est achetée, la suivante prend sa place.
- **Limite de 10 ventes en même temps** et carte **verrouillée** non vendable : règles appliquées par le serveur (`market_list`) ; le front affiche seulement leurs messages.
- **Acheter** : grille des meilleures offres (prix en pastille), recherche, filtres Rareté / Type, tri. `market_buy(id, prix_affiché)` : refuse si le prix a changé (« Le prix a changé ») ou si le solde manque. Si l'offre la moins chère est la tienne : badge « Ton offre » et « Retirer mon offre ».
- **Vendre** : choisir une carte, fixer son prix (− / champ / +, « Prix conseillé » = référence d'affichage, « Moins cher » = meilleure offre − 1). La carte quitte la collection pendant la vente. **Mes ventes** : liste avec « Retirer » (`market_cancel`, la carte revient).
- **Vendeur payé à l'achat** (même hors ligne) : à l'ouverture du jeu, au retour sur l'écran Market, au retour sur l'onglet et toutes les 30 s, le front appelle `market_ack_sales()` qui renvoie les ventes terminées pas encore vues → notification « Vendu : … · +N pièces ».
- Pas de taxe ni de frais pour l'instant.

### Défausse (`js/discard.js`)

- **Valeurs** (`DISCARD_VALUES` : valeur du serveur, copiée dans `js/economy-config.js` pour l'affichage) : Commune **3**, Rare **15**, Épique **60**, Légendaire **200** pièces par carte.
- **Mode « Sélectionner » (Collection)** : bouton « Sélectionner » à côté de la recherche. En mode actif (le bouton devient « Terminer »), toucher une carte la **sélectionne** au lieu d'ouvrir sa fiche ; avec plusieurs exemplaires, chaque toucher en ajoute un (badge « 2/4 », puis retour à zéro). La recherche et les filtres restent utilisables, la sélection est conservée quand on change de filtre (la barre indique « dont N masquées par les filtres »). Barre collée en bas : total « N cartes · +X pièces », « Tout » (cartes affichées), « Doublons (garder 1) » (`DISCARD_KEEP`, cartes affichées), « Vider », « Défausser » (2e toucher dès l'Épique). Après confirmation : pièces qui volent, notification, sortie du mode. Code : `createSelection()` dans `js/discard.js`. Le bouton « Sélectionner des cartes » de l'Atelier y renvoie.
- **Écran « cartes similaires »** (gardé, complémentaire) : le bouton « Défausser » de la **fiche d'une carte** (les cartes du même modèle, 1 exemplaire déjà sélectionné) et celui d'une **ligne de l'Atelier** (le modèle à cette rareté) ouvrent un écran plus ciblé, où l'on voit toutes les cartes similaires. Le mode « Sélectionner » sert à balayer toute la collection, cet écran à décider au cas par cas.
- **Sélection dans l'écran « cartes similaires »** : on touche une carte pour ajouter un exemplaire (le badge « −n » montre ce qui est choisi, « ×n » ce qui reste), on touche une pastille de la sélection pour en retirer un. Raccourcis : « Tout sauf 1 exemplaire de chaque » (`DISCARD_KEEP`) et « Tout désélectionner ». Le total « N cartes · +X pièces » se met à jour en direct.
- **Cartes verrouillées** : visibles mais grisées, impossibles à sélectionner ; sur la fiche, le bouton est grisé « Défausser · carte verrouillée ». Le contrôle est refait par le serveur.
- **Sécurités** : à partir de la rareté `DISCARD_CONFIRM_FROM` (Épique), un **2e toucher** « Confirmer : N cartes contre X pièces » est demandé ; un avertissement apparaît si une carte portée quitte la tenue.
- **Tout ou rien, côté serveur** : `discard_cards([{ colorway_id, rarity, count }])` retire les cartes et verse les pièces dans une seule transaction ; elle refuse l'ensemble si une carte est verrouillée ou manque. Les pièces gagnées sont celles **renvoyées par le serveur**.
- **Animation** : des pièces dorées s'envolent du bouton vers le solde en haut (`flyCoins` dans `js/wallet.js`, 3 à 12 pièces selon le gain), puis le nombre du solde défile jusqu'à sa nouvelle valeur et « bondit » ; petit son de pièces. Désactivée si le téléphone réduit les animations. Le même défilement sert au bonus quotidien.
- Monnaie **virtuelle uniquement, jamais convertible en euros** (section 9). Les pièces ne servent encore à rien d'autre.

## 7. Avatar — fiche de tenue (option validée)

✅ **Bêta : la « fiche de tenue » avec tenue « à plat »** (choisie après un essai de bonhomme habillé jugé raté : les icônes catalogue ne se portent pas). Au centre (canvas 64 × 96, ×2 sur téléphone, ×4 sur tablette / PC), les sprites portés sont posés **tels quels**, comme une photo de fit au sol : pile centrale de haut en bas (tête → haut avec la veste par-dessus → bas → chaussures), 2 px d'espace (resserré seulement si la tenue est trop haute), écharpe puis sac posés à droite. Texte d'invitation tant que rien n'est porté. Autour : 7 cases (gauche : Tête, Cou, Haut, Veste ; droite : Sac, Bas, Chaussures). Toucher une case ouvre un panneau par le bas avec les cartes possédées pour cet emplacement (plus rare d'abord) ; toucher une carte l'équipe, « Retirer la pièce » vide la case. La case prend la couleur de rareté de la carte portée. Enregistrée sur le serveur (`set_equipped`, qui vérifie que la carte est possédée et va dans cet emplacement ; colonne `equipped`). Code : `drawAvatar()` dans `js/avatar.js` (réutilisable pour l'image partagée).

**Après la bêta (si le test est positif) : vrais calques « portés »**. Un corps de base unique (ex. 32 × 64, de face) + un calque « porté » par **forme** de pièce (20 dessins, pas 75), dessiné sur ce corps ; les 75 coloris générés automatiquement par recoloration à partir des couleurs de chaque icône. Les icônes actuelles restent pour les cartes. Claude fournit le gabarit, un calque d'exemple et le script de recoloration ; le développeur dessine les 20 formes.

Contexte d'origine : le gabarit d'avatar n'était pas fixé. Les sprites des pièces sont des **icônes 32 × 32 « catalogue »**, pas des calques dessinés pour être portés.

Approche par défaut pour la bêta, sauf consigne contraire :
- Un **corps de base unique** en pixel art, neutre et non genré, sur une grille fixe.
- Des **emplacements** : tête (bonnet, casquette), haut, veste/manteau (au-dessus du haut), bas, chaussures, sac (sacoche, sac, tote), cou (écharpe). **Une pièce par emplacement.**
- Ordre de dessin : corps → bas → chaussures → haut → veste → cou → tête → sac.
- Si les icônes 32 × 32 ne se superposent pas proprement au corps, proposer **avant de coder** la solution la plus simple (par exemple, afficher l'avatar avec les icônes posées autour du corps « façon fiche de tenue », ou créer des versions « portées » simplifiées), et la décrire en quelques lignes pour validation.

Ne pas passer plus de 30 minutes bloqué sur l'avatar : simplifier plutôt que perfectionner.

## 8. Direction artistique de l'interface

- Pixel art 32 × 32 pour tous les vêtements **et l'avatar uniquement**. L'interface, elle, n'est **pas rétro** : moderne et nette, pour créer un **contraste** avec les sprites pixelisés.
- Ambiance **streetwear / drop / resell** : sobre, un peu « hype », pas mignon. Penser vitrine de sneakers plutôt que jeu d'habillage.
- Fond **sombre** presque noir, texte blanc cassé, beaucoup d'air, coins arrondis, boutons en pilule.
- Typographie : **Archivo** (Google Fonts), grotesque grasse et étirée pour les titres, normale pour le texte. **Pas de police pixel** dans l'interface.
- Chaque marque garde ses couleurs (section 5) dans les cartes.
- Boutons larges, adaptés au pouce.

## 9. Contraintes légales (non négociables)

Le développeur n'est pas juriste ; ces règles sont prudentes en attendant un avis.
- **Aucune marque réelle** : pas de nom, logo, modèle ni allusion (« style Dunk », etc.) dans le code, les noms de fichiers, les textes, les commentaires ou les métadonnées.
- Ne jamais copier la forme d'un modèle existant : on prend la **catégorie** (basket basse en cuir), pas le **modèle**.
- **Pas d'argent réel**, pas de loot box payante, pas de monnaie convertible en euros, pas de revente en argent réel. Le jeu est gratuit.
- **Pas de contenu libre créé par les joueurs** (texte, image) dans la bêta, pour éviter la modération. **Seule exception, décidée par le développeur : le pseudo libre**, validé par le serveur (3 à 16 caractères `A-Za-z0-9_`, unique sans tenir compte des majuscules, mots interdits (tables `blocked_words` = interdit partout dans le pseudo, `blocked_exact` = interdit seulement si le pseudo est exactement ce mot ; chiffres lookalike et lettres répétées détectés, migration 0007), un changement tous les 30 jours, le tout premier choix étant libre) et **jamais affiché dans une liste publique** : on ne retrouve un joueur qu'avec son pseudo exact, et seuls ses amis voient son profil. La liste des mots interdits est à compléter par le développeur.
- Si des images générées par IA sont ajoutées un jour, le signaler dans le README.

## 10. Comment travailler avec le développeur

- Il connaît bien **Python** mais n'est pas développeur web professionnel : **commenter le code** en français, expliquer brièvement les choix, éviter les abstractions inutiles.
- **Une tâche = un changement petit et testable.** Pas de refonte non demandée.
- À la fin de chaque tâche, donner : ce qui a changé, comment le tester sur téléphone (étapes concrètes), et ce qui reste à faire.
- En cas de doute sur un choix de jeu (taux, règles, avatar), **demander** plutôt que d'inventer ; pour un détail technique, prendre l'option la plus simple et le dire.
- Ne jamais ajouter de dépendance, de service externe ou de fonctionnalité hors périmètre (section 3) sans le signaler.
- Garder ce fichier à jour quand une règle change.
- **Cache** : à chaque changement de CSS ou de JS, augmenter le numéro `?v=…` **partout** (dans `index.html` pour `style.css` et `js/main.js`, et dans **tous les `import`** des fichiers `js/`), sinon les téléphones gardent l'ancienne version jusqu'à 10 minutes. Toujours le même numéro pour un même fichier : un module importé sous deux adresses serait chargé deux fois (deux sauvegardes séparées).
- **Fusion automatique** : après chaque changement vérifié, Claude ouvre la pull request et la **fusionne lui-même dans `main`** (mise en ligne directe sur GitHub Pages), sans attendre de validation.

## 11. Après la bêta (pour information seulement)

- Test sur 2 semaines avec 15 à 30 amis ; signal positif si 3 à 4 reviennent d'eux-mêmes chaque jour.
- Ensuite, progressivement : comptes, tenue du jour avec vote, éditions limitées, plus de marques (5 à 10 au total, 1 à 2 pièces par catégorie chacune), puis échanges entre joueurs en monnaie virtuelle.
- Monétisation éventuelle (boosters supplémentaires ou abonnement) **seulement après avis juridique**.

## 12. Migration vers les serveurs Hetzner (en cours, décidée par le développeur)

- Le développeur loue **2 serveurs Hetzner** avec un nom de domaine. Objectif : tout héberger chez lui (front, puis back et base de données externe). **Étape 1 : refaire le serveur front de zéro.** Étape 2 : serveur back + base de données (comptes, vrai Market).
- Le développeur n'a qu'un **iPad** cette semaine : Claude doit **tout faire à distance** (installation, déploiement, redémarrages, tests avec un vrai navigateur), sans demander de manipulation technique, et **guider pas à pas** pour ce qui ne peut passer que par la console Hetzner.
- **Accès** : clé SSH dédiée au déploiement, stockée dans les **réglages de l'environnement** (secret / variable d'environnement), **jamais collée dans le chat**. L'environnement doit autoriser le réseau vers le serveur (le SSH sortant est bloqué par défaut). Une nouvelle session récupère ces réglages.
- **Plan du serveur front** : Ubuntu LTS, utilisateur dédié, connexion par clé uniquement, pare-feu (22, 80, 443), mises à jour automatiques, Caddy (ou nginx) avec HTTPS automatique, déploiement automatique de `main` vers le serveur. **GitHub Pages reste en secours** : ne basculer le lien envoyé aux amis qu'une fois le nouveau serveur testé.
- **Règle de sécurité** : ne jamais effacer ni réinstaller un serveur sans la confirmation explicite du développeur ; sauvegarde (snapshot) avant toute réinstallation.
- Les comptes et le Market en ligne existent maintenant sur **Supabase** (section 13). L'étape 2 Hetzner (serveur back + base externe) reste à décider ; en attendant, Supabase est le back end.

## 13. Back end Supabase (comptes + serveur de jeu) — le serveur est la source de vérité

- Projet Supabase : `https://qsueqvsbhytqrotlxmak.supabase.co`. Les migrations SQL (**0001 à 0008**, exécutées par le développeur dans le SQL Editor, **ne jamais les modifier depuis le front** ; les 0005 à 0008 sont dans `supabase/migrations/`) créent : catalogue (`brands`, `pieces`, `colorways`), `economy_config`, `profiles`, `inventory`, `transactions`, `market_listings`, la vue `market_best_offers` et toutes les fonctions du jeu.
- **Règle d'or : ne jamais remettre de logique de jeu côté client.** Le front ne tire pas de carte, ne calcule ni gain ni chance réelle, ne vérifie pas de règle (limite de ventes, verrou, solde…). Il appelle une fonction, affiche le résultat, et relit l'état. Toute nouvelle règle ou nouvelle valeur d'économie se code **dans une migration SQL** (puis, si besoin d'affichage, dans `js/economy-config.js`).
- **Le jeu n'est accessible que connecté** : e-mail + mot de passe (écran de connexion / création de compte dans `index.html`, géré par `main.js`). À l'inscription, le message « Confirme ton e-mail » s'affiche : le compte ne peut se connecter qu'après avoir cliqué le lien reçu. Un profil (3 boosters, 0 pièce) est créé automatiquement par le serveur. Bouton « Se déconnecter » en bas de l'écran Tenue.
- **Mot de passe oublié** : lien « Mot de passe oublié ? » sous le formulaire de connexion (pas à la création de compte) → e-mail de réinitialisation (`resetPasswordForEmail`, réponse toujours neutre pour ne pas révéler quelles adresses ont un compte). Le lien reçu ramène sur le site avec `type=recovery` : `api.js` le détecte (`isRecoveryLink`) et `main.js` affiche « Nouveau mot de passe » (6 caractères minimum, saisie en double, `updatePassword`) **avant** de lancer le jeu ; lien expiré → message + renvoi vers « Mot de passe oublié ? ». **À régler dans Supabase** (Authentication → URL Configuration) : Site URL `https://joueur01.github.io/Grail/` et Redirect URLs `https://joueur01.github.io/Grail/**`, sinon les liens (confirmation et réinitialisation) pointent vers localhost.
- **Écritures interdites en direct** : le front ne fait que des **lectures** (`profiles`, `inventory`, `market_listings` = ses propres ventes, `market_best_offers`) et des **appels de fonctions** (`rpc`). Les fonctions : `get_booster_state`, `open_booster`, `upgrade_cards`, `discard_cards`, `claim_daily_bonus`, `set_locked`, `set_equipped`, `set_tutorial_done`, `market_list`, `market_cancel`, `market_buy`, `market_ack_sales` (wrappers dans `js/api.js`).
- **Cache local** (`js/inventory.js`) : après chaque action, `refreshState()` relit profil, inventaire, ventes et état des boosters ; l'affichage lit cette copie (instantané). Ce n'est qu'un cache d'affichage, jamais une source de vérité.
- Le catalogue affiché vient toujours de `data/pieces.json` (mêmes identifiants que la table `colorways`, vérifiés identiques : 75 coloris).
- **Tests** : sans compte de test, on teste les écrans contre un faux serveur (format de réponses des fonctions SQL) ; un test réel demande un compte de test confirmé (jamais de mot de passe réel dans le dépôt).

## 13 bis. Tenue partagée par lien (migration 0008, `js/share.js`, `js/shared-outfit.js`)

- Bouton principal « Partager ma tenue » : `create_outfit_share()` enregistre une **copie** de la tenue portée sous un **code secret de 20 caractères** (même tenue = même lien ; 50 liens récents gardés par joueur) et renvoie le code ; le lien est `<page du jeu>?tenue=CODE`, envoyé par `navigator.share` ou copié (champ + bouton « Copier » toujours affichés). Safari n'ouvre le menu de partage que juste après un toucher : si la création du lien l'a fait expirer, le lien reste affiché et le 2e toucher partage tout de suite.
- **Visible sans compte** : `main.js` détecte `?tenue=` avant toute connexion et affiche `shared-outfit.js` (tenue « à plat » sur case claire + liste des pièces avec rareté + bouton « Jouer à Grail »). `get_shared_outfit(code)` est la **seule** fonction appelable par `anon` ; la table `outfit_shares` est illisible directement.
- La copie ne change plus : changer de tenue donne un nouveau lien. **Aucun pseudo ni autre donnée du joueur** n'est exposé (le pseudo n'apparaît jamais publiquement, section 9).
- L'image PNG reste en bouton secondaire « Enregistrer en image » (`buildShareImage`, inchangée).
- Pas d'aperçu riche (miniature) dans les messageries : le site est statique, il faudrait un serveur pour générer les balises Open Graph.

## 14. Amis (migration 0005, `js/friends.js`)

- **Pseudo libre** choisi par le joueur (`set_pseudo`), validé par le serveur (voir section 9). **Un changement tous les 30 jours** (`FRIENDS.pseudoChangeDays` dans `economy_config`, migration 0006) : le tout premier choix est libre et ne démarre pas le délai ; ensuite, après chaque changement, le serveur refuse (« Tu pourras changer de pseudo dans N jours ») et `list_friends` renvoie `pseudo_next_change`, affiché dans l'écran Amis (« Tu pourras changer de pseudo à partir du 27 novembre »). Aucune liste publique de joueurs.
- **Écran « Amis »** (5e onglet, pastille rouge = demandes reçues) : formulaire de pseudo tant qu'il n'est pas choisi ; « Ajouter un ami » (recherche par pseudo exact, casse ignorée) ; « Demandes reçues » (Accepter / Refuser) ; « Mes amis » ; « Demandes envoyées » (Annuler).
- **Profil d'un ami** (toucher un ami) : sa **tenue du moment** dessinée « à plat » (même rendu que l'écran Tenue), la liste de ses pièces avec leur rareté, et sa progression « X / 300 cartes ». Rien d'autre n'est visible (ni pièces, ni inventaire détaillé, ni ventes). « Retirer cet ami » demande 2 touchers.
- **Règles côté serveur** (`friend_request`, `friend_respond`, `friend_remove`, `list_friends`, `get_friend_profile`, `set_pseudo`) : limite de 50 amis et 20 demandes en attente (`economy_config.FRIENDS`), pas de demande à soi-même ni en double, si l'autre joueur avait déjà invité on devient amis tout de suite, seuls les amis acceptés lisent un profil. La table `friendships` est illisible directement.
- Si la migration 0005 n'est pas exécutée, l'écran affiche « Cette fonction n'est pas encore activée sur le serveur. ».
- Hors périmètre pour l'instant : cadeaux, échanges de cartes, classement entre amis.
