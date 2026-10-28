"""Ajoute les 4 marques de la 2e vague au catalogue : Ferrant & Fils, Brume, A.S. Faubourg 78, Orbite 2000.

Entrée : visuels/sources/<marque>_planche.png
  Chaque sprite y est dessiné à l'échelle ×4 dans une case de 128 × 128 px (32 × 32 pixels « réels »),
  fond de case gris (212, 210, 204). Les lignes de la planche suivent l'ordre des pièces ci-dessous,
  les colonnes l'ordre des coloris.

Sorties (rien n'est écrasé si déjà présent, sauf les sprites qui sont refaits) :
  data/pieces.json                       marques, pièces et coloris ajoutés à la fin
  assets/pieces/<colorway_id>.png        sprite 32 × 32, fond transparent (servi au jeu)
  visuels/pieces/<colorway_id>.svg       même sprite en SVG

Utilisation (depuis la racine du dépôt) :  python3 tools/ajouter_marques.py
Nécessite Pillow. Ne sert qu'au développement, pas au site.
Les mêmes données servent à écrire la migration SQL 0023 (supabase/migrations/0023_nouvelles_marques.sql,
à partir de tools/modele_0023.sql).
"""

import json
import re
import unicodedata
from pathlib import Path

from PIL import Image

from extraire_sprites import svg_sprite

RACINE = Path(__file__).resolve().parent.parent
CASE = (212, 210, 204)   # fond des cases = devient transparent
ECHELLE = 4              # 1 pixel du sprite = 4 × 4 px sur la planche
TAILLE = 32

# (id court, nom, catégorie, emplacement, description, [coloris])
MARQUES = {
    "ferrant_fils": {
        "name": "Ferrant & Fils", "style": "Workwear",
        "pieces": [
            ("veste_contremaitre", "Veste « Contremaître »", "haut", "veste",
             "Veste de chantier en toile épaisse, poches plaquées, pointillé de couture blanc.",
             ["Bleu denim", "Noir délavé", "Kaki", "Rouille", "Écru", "Vert forêt"]),
            ("chemise_fabrique", "Chemise « Fabrique »", "haut", "haut",
             "Surchemise de filature, coupe droite, deux poches plaquées.",
             ["Écru", "Bleu ciel délavé", "Kaki clair", "Rouille", "Charbon"]),
            ("pantalon_etabli", "Pantalon « Établi »", "bas", "bas",
             "Pantalon de travail droit, poches plaquées et étiquette « F&F » sur la hanche.",
             ["Bleu denim", "Noir délavé", "Kaki", "Écru"]),
            ("pantalon_peintre", "Pantalon « Peintre »", "bas", "bas",
             "Pantalon de peintre en toile claire, taches de couleur et passant à marteau.",
             ["Écru taché", "Gris clair", "Kaki clair"]),
            ("bottines_godillot", "Bottines « Godillot »", "chaussures", "chaussures",
             "Bottines de chantier lacées, semelle crème.",
             ["Brun rouille", "Noir", "Sable"]),
            ("bonnet_docker", "Bonnet « Docker »", "accessoire", "tete",
             "Bonnet de docker en maille épaisse avec petite étiquette.",
             ["Charbon", "Marine"]),
            ("sac_musette", "Sac « Musette »", "accessoire", "sac",
             "Musette en toile, anses cousues et poche plaquée.",
             ["Écru", "Kaki clair"]),
        ],
    },
    "brume": {
        "name": "Brume", "style": "Outdoor",
        "pieces": [
            ("polaire_brouillard", "Polaire « Brouillard »", "haut", "veste",
             "Polaire douce à zip, sangle corail et petit sommet brodé.",
             ["Sauge", "Bleu brume", "Pierre", "Nuit", "Crème", "Ocre"]),
            ("pull_sentier", "Pull « Sentier »", "haut", "haut",
             "Pull de randonnée aux épaules renforcées, volumes arrondis.",
             ["Bleu brume", "Sauge", "Pierre sombre", "Corail clair", "Nuit"]),
            ("pantalon_moraine", "Pantalon « Moraine »", "bas", "bas",
             "Pantalon technique, taille corail et poches zippées.",
             ["Pierre / Corail", "Olive / Crème", "Nuit / Corail", "Sable / Nuit"]),
            ("short_source", "Short « Source »", "bas", "bas",
             "Short de rando léger, liserés corail.",
             ["Sauge / Corail", "Bleu brume / Corail", "Sable / Nuit"]),
            ("baskets_cairn", "Baskets « Cairn »", "chaussures", "chaussures",
             "Baskets de marche, lacets corail, semelle crème.",
             ["Pierre / Corail", "Sauge", "Nuit"]),
            ("bonnet_givre", "Bonnet « Givre »", "accessoire", "tete",
             "Bonnet côtelé à pompon.",
             ["Bleu brume / Corail", "Corail / Crème"]),
            ("sac_lichen", "Sac « Lichen »", "accessoire", "sac",
             "Sac à dos arrondi, sangles corail et poche frontale.",
             ["Sauge", "Nuit"]),
        ],
    },
    "faubourg_78": {
        "name": "A.S. Faubourg 78", "style": "Sportswear rétro",
        "pieces": [
            ("veste_tribune", "Veste « Tribune »", "haut", "veste",
             "Veste de club à col et poignets contrastés, numéro 78 dans un cercle.",
             ["Bleu nuit / Cerise", "Cerise / Blanc", "Vert sapin / Jaune", "Noir / Cerise", "Ciel / Marine", "Jaune / Marine"]),
            ("maillot_domicile", "Maillot « Domicile »", "haut", "haut",
             "Maillot d'archives, flocage 78, liseré bicolore au col et aux poignets.",
             ["Cerise", "Blanc", "Bleu nuit", "Vert sapin", "Jaune"]),
            ("pantalon_entrainement", "Pantalon « Entraînement »", "bas", "bas",
             "Pantalon de survêtement, revers contrastés aux chevilles.",
             ["Bleu nuit", "Noir", "Cerise", "Vert sapin"]),
            ("short_exterieur", "Short « Extérieur »", "bas", "bas",
             "Short de match, liseré bicolore à la taille.",
             ["Blanc", "Cerise", "Noir"]),
            ("baskets_terrain", "Baskets « Terrain »", "chaussures", "chaussures",
             "Baskets de salle rétro, empiècements contrastés.",
             ["Blanc / Cerise", "Bleu nuit / Cerise", "Vert / Jaune"]),
            ("bonnet_virage", "Bonnet « Virage »", "accessoire", "tete",
             "Bonnet de supporter à pompon, double liseré.",
             ["Cerise", "Bleu nuit"]),
            ("echarpe_kop", "Écharpe « Kop »", "accessoire", "cou",
             "Écharpe de tribune rayée à franges.",
             ["Cerise / Blanc", "Bleu nuit / Blanc"]),
        ],
    },
    "orbite_2000": {
        "name": "Orbite 2000", "style": "Y2K / soirées",
        "pieces": [
            ("veste_satellite", "Veste « Satellite »", "haut", "veste",
             "Veste chromée ajustée, bandes réfléchissantes et étoile à quatre branches.",
             ["Chrome / Violet", "Noir / Violet", "Glacier / Violet", "Rose / Violet", "Chrome / Lime", "Chrome / Bleu"]),
            ("tshirt_flyer", "T-shirt « Flyer »", "haut", "haut",
             "T-shirt court imprimé flyer de soirée, étoile à quatre branches.",
             ["Glacier / Violet", "Rose / Violet", "Chrome / Violet", "Lime / Violet", "Noir / Rose"]),
            ("pantalon_apesanteur", "Pantalon « Apesanteur »", "bas", "bas",
             "Pantalon ajusté brillant, ceinture électrique et bandes réfléchissantes.",
             ["Noir / Violet", "Chrome / Violet", "Glacier / Bleu", "Violet nuit / Rose"]),
            ("short_hologramme", "Short « Hologramme »", "bas", "bas",
             "Short dégradé holographique.",
             ["Chrome-Violet", "Chrome-Rose", "Chrome-Bleu"]),
            ("baskets_lune", "Baskets « Lune »", "chaussures", "chaussures",
             "Baskets montantes chromées à lacets électriques.",
             ["Chrome / Violet", "Noir / Rose", "Rose / Violet"]),
            ("bob_frequence", "Bob « Fréquence »", "accessoire", "tete",
             "Bob brillant à large bord.",
             ["Chrome / Violet", "Rose / Bleu"]),
            ("sac_pastille", "Sac « Pastille »", "accessoire", "sac",
             "Petit sac rigide aux anses chromées, étoile à quatre branches.",
             ["Violet / Chrome", "Rose / Chrome"]),
        ],
    },
}


def slug(texte):
    """« Écru taché » → « ecru_tache » ; « Chrome-Violet » → « chrome_violet »."""
    s = unicodedata.normalize("NFD", texte.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def catalogue_marque(marque_id):
    """Marque et pièces au format de data/pieces.json."""
    m = MARQUES[marque_id]
    pieces = []
    for i, (court, nom, categorie, emplacement, description, coloris) in enumerate(m["pieces"]):
        pid = f"{marque_id}_{court}"
        pieces.append({
            "id": pid, "brand": marque_id, "name": nom, "category": categorie, "slot": emplacement,
            "flagship": i == 0, "description": description,
            "colorways": [{"id": f"{pid}_{slug(c)}", "name": c, "sprite": f"assets/pieces/{pid}_{slug(c)}.png"}
                          for c in coloris],
        })
    return {"id": marque_id, "name": m["name"], "style": m["style"]}, pieces


def trouver_cases(image, page):
    """Renvoie [(y, [x, …]), …] : les coins haut-gauche des cases 128 × 128, ligne par ligne."""
    px = image.load()
    w, h = image.size
    cote = TAILLE * ECHELLE
    lignes = {}
    for y in range(1, h - cote):
        for x in range(1, w - cote):
            if (px[x, y] == CASE and px[x - 1, y] == page and px[x, y - 1] == page
                    and px[x + cote, y] == page and px[x, y + cote] == page):
                lignes.setdefault(y, []).append(x)
    return [(y, sorted(xs)) for y, xs in sorted(lignes.items())]


def lire_sprite(image, x0, y0):
    px = image.load()
    sprite = Image.new("RGBA", (TAILLE, TAILLE), (0, 0, 0, 0))
    for by in range(TAILLE):
        for bx in range(TAILLE):
            bloc = {px[x0 + bx * ECHELLE + i, y0 + by * ECHELLE + j]
                    for i in range(ECHELLE) for j in range(ECHELLE)}
            if len(bloc) != 1:
                raise ValueError(f"Bloc non uniforme en ({bx}, {by}) : la planche n'est pas à ×{ECHELLE} exact")
            couleur = bloc.pop()
            if couleur != CASE:
                sprite.putpixel((bx, by), couleur + (255,))
    return sprite


# Étiquettes de couleur (table colorway_tags, utilisée par les règles du Videur) déduites des mots du nom du coloris.
MOTS_TAGS = {
    "sombre": ["noir", "nuit", "charbon", "marine", "vert foret", "vert sapin", "brun", "violet nuit", "denim"],
    "clair": ["ecru", "creme", "blanc", "ciel", "glacier", "chrome", "gris clair", "clair", "sable"],
    "vif": ["lime", "rose", "violet", "cerise", "jaune", "corail"],
    "neutre": ["ecru", "creme", "gris", "pierre", "sable", "kaki", "noir", "blanc", "charbon", "olive"],
    "delave": ["delave", "tache"],
    "terre": ["kaki", "rouille", "ocre", "sable", "brun", "olive"],
    "chaud": ["rouille", "ocre", "corail", "cerise", "jaune", "rose", "brun", "sable"],
    "froid": ["bleu", "denim", "glacier", "ciel", "nuit", "marine", "violet", "chrome", "sauge"],
    "metal": ["chrome"],
}


def tags_coloris(nom):
    texte = " ".join(slug(nom).split("_"))
    sans_espace = f" {texte} "
    return sorted(t for t, mots in MOTS_TAGS.items()
                  if any(f" {slug(m).replace('_', ' ')} " in sans_espace for m in mots))


def ecrire_migration():
    """Écrit supabase/migrations/0023_nouvelles_marques.sql à partir des données ci-dessus."""
    marques, pieces, tags = [], [], []
    for marque_id in MARQUES:
        marque, ps = catalogue_marque(marque_id)
        marques.append({"id": marque["id"], "name": marque["name"], "style": marque["style"]})
        for p in ps:
            pieces.append({"id": p["id"], "brand_id": marque_id, "brand": marque_id, "name": p["name"],
                           "category": p["category"], "slot": p["slot"], "flagship": p["flagship"],
                           "description": p["description"]})
            for c in p["colorways"]:
                tags.append((c["id"], tags_coloris(c["name"])))
    donnees = {"brands": marques, "pieces": pieces,
               "colorways": [{"id": c["id"], "piece_id": p["id"], "name": c["name"], "sprite": c["sprite"]}
                             for marque_id in MARQUES for p in catalogue_marque(marque_id)[1] for c in p["colorways"]]}
    json_sql = json.dumps(donnees, ensure_ascii=False).replace("'", "''")
    valeurs_tags = ",\n".join(f"  ('{cid}', '{{{','.join(t)}}}')" for cid, t in tags)
    modele = (RACINE / "tools/modele_0023.sql").read_text(encoding="utf-8")
    sortie = modele.replace("@@DONNEES@@", json_sql).replace("@@TAGS@@", valeurs_tags)
    (RACINE / "supabase/migrations/0023_nouvelles_marques.sql").write_text(sortie, encoding="utf-8")
    print(f"Migration écrite : {len(marques)} marques, {len(pieces)} pièces, {len(donnees['colorways'])} coloris")


def main():
    chemin = RACINE / "data/pieces.json"
    catalogue = json.loads(chemin.read_text(encoding="utf-8"))
    (RACINE / "assets/pieces").mkdir(parents=True, exist_ok=True)
    (RACINE / "visuels/pieces").mkdir(parents=True, exist_ok=True)
    total = 0
    for marque_id in MARQUES:
        marque, pieces = catalogue_marque(marque_id)
        image = Image.open(RACINE / f"visuels/sources/{marque_id}_planche.png").convert("RGB")
        page = image.getpixel((0, 0))
        cases = trouver_cases(image, page)
        if len(cases) != len(pieces):
            raise ValueError(f"{marque_id} : {len(cases)} lignes trouvées, {len(pieces)} attendues")
        for (y0, xs), piece in zip(cases, pieces):
            if len(xs) != len(piece["colorways"]):
                raise ValueError(f"{piece['id']} : {len(xs)} cases, {len(piece['colorways'])} coloris attendus")
            for x0, coloris in zip(xs, piece["colorways"]):
                sprite = lire_sprite(image, x0, y0)
                sprite.save(RACINE / coloris["sprite"])
                (RACINE / f"visuels/pieces/{coloris['id']}.svg").write_text(svg_sprite(sprite), encoding="utf-8")
                total += 1
        if not any(b["id"] == marque_id for b in catalogue["brands"]):
            catalogue["brands"].append(marque)
        known = {p["id"] for p in catalogue["pieces"]}
        catalogue["pieces"].extend(p for p in pieces if p["id"] not in known)
        print(f"{marque_id} : {sum(len(p['colorways']) for p in pieces)} sprites")
    chemin.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Total : {total} sprites ; catalogue : {len(catalogue['brands'])} marques, "
          f"{len(catalogue['pieces'])} pièces, {sum(len(p['colorways']) for p in catalogue['pieces'])} coloris")
    ecrire_migration()


if __name__ == "__main__":
    main()
