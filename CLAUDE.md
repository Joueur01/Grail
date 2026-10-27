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
- **Budget 0 €** : aucun service payant, aucune API payante.
- **Aucun serveur, aucune base de données, aucun compte.** Tout tourne dans le navigateur ; les données du joueur sont en `localStorage`.
- Hébergement : **GitHub Pages** (site statique, branche `main`, racine du dépôt).
- **Mobile d'abord** : le test se fait sur téléphone. Tout doit marcher au doigt, en portrait, sur un écran de ~375 px de large.
- Le développeur y passe 1 à 2 h par jour. Chaque tâche doit produire **quelque chose de visible qui marche**.

### Fonctionnalités de la bêta, dans l'ordre

1. **Booster** : un bouton « Ouvrir un booster » qui tire 3 pièces selon les taux de rareté (section 6), avec une petite animation de révélation carte par carte. ✅ Fait.
2. **Inventaire** : la collection du joueur, sauvegardée en `localStorage`, avec filtres simples (marque, catégorie, rareté) et le nombre d'exemplaires de chaque carte. ✅ Fait : progression « X / 300 », filtres Marque / Type / Rareté (menus natifs, collés en haut), grille triée de la plus rare à la plus commune, badge « ×N » pour les doublons.
3. **Avatar** : un personnage en pixel art sur lequel on équipe une pièce par emplacement (section 7). ✅ Fait pour la bêta (fiche de tenue, tenue « à plat »).
4. **Partager ma tenue** : exporter l'avatar habillé en **image PNG** (canvas → PNG), avec le nom des pièces et leur rareté, puis partage natif (`navigator.share` avec fichier si disponible, sinon téléchargement). ✅ Fait : PNG 1080 × 1350 (tenue à plat ×6 + liste tête → pieds : nom, marque, coloris, rareté + adresse du jeu), **préparé à l'avance** à chaque changement de tenue (Safari n'ouvre le partage que juste après un toucher), repli téléchargement ; bouton désactivé tant que rien n'est porté.
5. **Mise en ligne** sur GitHub Pages et test sur iPhone/Android.

### Hors périmètre de la bêta (ne pas coder pour l'instant)

Comptes, serveur, marché entre joueurs, échanges, monnaie du jeu, achats, abonnement, votes, défis de style, contenu créé librement par les joueurs (textes, images), notifications, 3D.

Ces fonctionnalités viendront plus tard **seulement si le test est positif**. Le code peut rester simple et ne pas les anticiper.

## 4. Stack technique

- **HTML, CSS et JavaScript « vanilla »**, sans framework ni étape de build (pas de npm, pas de bundler). Le site doit fonctionner en ouvrant simplement les fichiers via GitHub Pages.
- Modules ES (`<script type="module">`) autorisés.
- Pixel art : toujours afficher les sprites agrandis par un **facteur entier** (×4, ×6, ×8…) avec `image-rendering: pixelated` (canvas : `imageSmoothingEnabled = false`). Jamais de flou ni de redimensionnement non entier.
- Taille des sprites dans les cartes : choisie selon la **largeur réelle de la carte** (container queries `@container`), jamais selon la largeur de l'écran, pour qu'un sprite ne dépasse jamais de sa carte. Avant chaque mise en ligne, vérifier les écrans de 320 px (petit téléphone) à 1920 px (PC), iPad portrait et paysage compris.
- Pas de dépendance externe sauf nécessité réelle ; si besoin, une police Google Fonts au maximum.
- `localStorage` : toujours encapsuler lecture et écriture dans `try/catch`, et que le site marche même si le stockage est vide ou indisponible. Prévoir un numéro de version du format de sauvegarde (`grail_save_v1`) pour pouvoir le faire évoluer.

### Arborescence visée

```
/
├── index.html
├── style.css
├── js/
│   ├── main.js        # navigation entre écrans
│   ├── data.js        # chargement du catalogue
│   ├── booster.js     # tirage, déchirure du paquet, révélation carte par carte
│   ├── effects.js     # sons synthétisés, vibrations, particules
│   ├── gestures.js    # gestes : glisser, rester appuyé, toucher
│   ├── inventory.js   # collection + sauvegarde localStorage + écran Collection
│   ├── cards.js       # dessin d'une carte (partagé booster / collection)
│   ├── upgrade.js     # fiche d'une carte + amélioration par la roue
│   ├── avatar.js      # rendu de l'avatar en canvas
│   └── share.js       # export PNG + partage
├── data/
│   └── pieces.json    # catalogue des pièces et coloris
├── assets/
│   ├── pieces/        # un PNG 32×32 par coloris, fond transparent
│   └── avatar/        # corps de base et éventuels calques « portés »
├── visuels/           # référence, ne pas servir au jeu
│   ├── sources/       # planches PNG d'origine fournies (une par marque)
│   ├── pieces/        # un SVG 32×32 par coloris
│   └── *_coloris_apercu.svg  # planches reconstruites en SVG
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

### Les 4 raretés

| Rareté | Taux de tirage (provisoire) | Couleur d'interface suggérée |
| --- | --- | --- |
| Commun | 70 % | gris |
| Rare | 22 % | bleu |
| Épique | 7 % | violet |
| Légendaire | 1 % | or |

- Les taux sont **provisoires** : les garder dans **une seule constante** facile à modifier.
- Tirage : on tire d'abord la rareté selon les taux, puis un coloris au hasard parmi les 75 (uniforme pour la bêta).
- **Garantie « Rare minimum »** : jamais 3 Communes dans un booster. Si les autres cartes sont toutes Communes, la dernière est tirée parmi Rare / Épique / Légendaire en gardant leurs proportions (22 : 7 : 1).
- **Pity « Légendaire garantie »** : après `PITY_LEGENDAIRE` − 1 boosters d'affilée sans Légendaire (constante dans `js/data.js`, **30** par défaut), le suivant (le 30e) en contient forcément une : la carte la moins rare devient Légendaire. Le compteur (`pity` dans la sauvegarde) repart à **0** dès qu'une Légendaire sort, forcée ou non. **Jauge visible sous le paquet** (« Légendaire garantie · 12 / 30 », barre dorée qui brille sur les 5 derniers, « Prochain booster ! » à 29).
- Effet mesuré par simulation (200 000 boosters) avec ces deux garanties : par carte ≈ 58 % Commun · 30 % Rare · 9,7 % Épique · 1,9 % Légendaire ; ≈ 1 booster sur 17 contient une Légendaire (dont ~28 % offertes par la jauge).
- La rareté **n'apparaît pas sur le sprite**. Elle s'affiche dans l'interface : bordure et étiquette colorées sur la carte, mention dans l'inventaire et sur l'image partagée. Une révélation plus marquée (lueur, son, vibration `navigator.vibrate` si dispo) pour Épique et Légendaire est bienvenue.

### Boosters

- Un booster = **3 cartes**.
- ⚠️ **Actuellement : boosters illimités pour les tests** (`BOOSTERS_ILLIMITES = true` dans `js/main.js`). **Remettre à `false` avant d'envoyer le lien aux amis.**
- Bêta : **1 booster gratuit par jour** (remise à zéro à minuit, heure locale), plus un bouton de test caché ou un paramètre d'URL (`?debug=1`) pour en ouvrir autant que voulu pendant les tests.
- Ouverture (en place, `js/booster.js`) — **tout se fait en glissant le doigt (ou la souris)**, un simple toucher ne fait rien (le paquet sursaute, le texte d'aide rappelle le geste) :
  1. **Glisser sur le paquet le déchire** : la bande du haut suit le doigt puis s'arrache le long de la ligne pointillée (bord en dents de scie). Bruit de déchirure.
  2. Les 3 cartes forment une **pile** ; **une seule carte à la fois** (« Carte 1 / 3 »), **la plus rare toujours en dernier**.
  3. Sur une carte face cachée : **glisser la retourne** directement ; **rester appuyé fait monter son aura palier par palier** (gris Commun → bleu Rare → violet Épique → or Légendaire, ~0,65 s par palier, une note de plus en plus aiguë) **jusqu'à la rareté de la carte**, puis s'arrête. Lâcher garde l'aura atteinte.
  4. Une fois retournée, **glisser à nouveau** fait partir la carte sur le côté et amène la suivante. Après la 3e : récapitulatif des 3 cartes + « Continuer ».
  - **Hiérarchie des effets** (du plus discret au plus fort) : Rare = halo bleu fixe + reflet + quelques particules ; Épique = halo violet qui respire + onde + gerbe de particules + titre « ÉPIQUE ! » (sur place) ; Légendaire = double halo doré rapide (la carte tremble face cachée) puis **plein écran** (éclair, rayons, grande carte, 3 vagues de particules, son), qu'on quitte **en glissant** (bloqué 0,9 s pour savourer) → carte suivante.
  - Badge « NOUVEAU » sur les cartes jamais obtenues.
  - **Tutoriel du 1er booster** : un « doigt » (point lumineux avec traînée, en CSS) glisse en boucle avec une étiquette — « Glisse pour déchirer » sur le paquet, « Glisse pour retourner » puis « Glisse pour la suivante » sur la 1re carte. Il s'efface dès que le joueur glisse. Fini (`tutorialDone` dans la sauvegarde) quand le récapitulatif du 1er booster s'affiche ; s'il est interrompu, il revient.
  - Halo limité à ~65 px de portée : au-delà, il est coupé par le bord de l'écran et forme un rectangle.
- Les cartes sont sauvegardées **dès la déchirure** (recharger la page ne permet pas de retirer).
- Sons synthétisés par le navigateur (Web Audio, aucun fichier) ; constante `SONS_ACTIFS` dans `js/effects.js` pour les couper.
- Pas de monnaie, pas d'achat dans la bêta.

### Amélioration par la roue (`js/upgrade.js`)

- Dans la Collection, **toucher une carte ouvre sa fiche** : carte en grand, nombre d'exemplaires, « Améliorer en [rareté suivante] » et « Défausser · bientôt » (grisé).
- On **mise de 1 à 5 cartes du même modèle et de la même rareté** (coloris libres, plusieurs exemplaires d'un même coloris comptent chacun). **Chance = 20 % par carte misée** (`UPGRADE_CHANCE_PER_CARD`, `UPGRADE_MAX_CARDS` dans `js/data.js`) : 5 cartes = 100 %.
- **Réussite** : 1 carte du même modèle, **rareté au-dessus**. **Même coloris** si toutes les cartes misées ont le même coloris, sinon **coloris au hasard parmi tous ceux du modèle**.
- **Les cartes misées sont perdues dans tous les cas** (réussite ou échec). Une Légendaire ne s'améliore pas (« Rareté maximale »). Une carte portée dont le dernier exemplaire est misé quitte la tenue.
- Écran : 5 cases de mise (pré-remplies avec la carte touchée ; toucher une case la vide), cartes disponibles à ajouter, **roue** dont la part colorée (couleur de la rareté visée) = la chance, flèche en haut, avertissement si la réussite n'est pas sûre. La roue tourne ~3 s et s'arrête là où le tirage est tombé. La collection est mise à jour **dès le lancement** (recharger ne permet pas de rejouer).

### Défausse (prévue, PAS codée)

- Défausser une carte contre de la **monnaie du jeu**, montant selon la rareté (`DISCARD_VALUES` dans `js/data.js`, valeurs provisoires). Bouton grisé « Défausser · bientôt » dans la fiche.
- ⚠️ La monnaie du jeu est **hors périmètre de la bêta** (section 3) ; monnaie **virtuelle uniquement, jamais convertible en euros** (section 9). À valider avant de l'activer.

## 7. Avatar — fiche de tenue (option validée)

✅ **Bêta : la « fiche de tenue » avec tenue « à plat »** (choisie après un essai de bonhomme habillé jugé raté : les icônes catalogue ne se portent pas). Au centre (canvas 64 × 96, ×2 sur téléphone, ×4 sur tablette / PC), les sprites portés sont posés **tels quels**, comme une photo de fit au sol : pile centrale de haut en bas (tête → haut avec la veste par-dessus → bas → chaussures), 2 px d'espace (resserré seulement si la tenue est trop haute), écharpe puis sac posés à droite. Texte d'invitation tant que rien n'est porté. Autour : 7 cases (gauche : Tête, Cou, Haut, Veste ; droite : Sac, Bas, Chaussures). Toucher une case ouvre un panneau par le bas avec les cartes possédées pour cet emplacement (plus rare d'abord) ; toucher une carte l'équipe, « Retirer la pièce » vide la case. La case prend la couleur de rareté de la carte portée. Sauvegarde dans `equipped` (`emplacement → colorwayId|rareté`). Code : `drawAvatar()` dans `js/avatar.js` (réutilisable pour l'image partagée).

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
- **Pas de contenu libre créé par les joueurs** (pseudo libre affiché publiquement, texte, image) dans la bêta, pour éviter la modération.
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
