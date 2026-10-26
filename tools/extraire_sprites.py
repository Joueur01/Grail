"""Découpe les planches de coloris en sprites individuels.

Entrée : visuels/sources/<marque>_planche.png
  Chaque sprite y est dessiné à l'échelle ×5 dans une case grise de 160 × 160 px
  (donc 32 × 32 pixels « réels »). Les lignes de la planche = les pièces,
  les colonnes = les coloris, dans l'ordre de data/pieces.json.

Sorties :
  assets/pieces/<colorway_id>.png       sprite 32 × 32, fond transparent (servi au jeu)
  visuels/pieces/<colorway_id>.svg      même sprite en SVG (un <rect> par segment de pixels)
  visuels/<marque>_coloris_apercu.svg   planche de référence reconstruite en SVG

Utilisation (depuis la racine du dépôt) :  python3 tools/extraire_sprites.py
Nécessite Pillow (pip install pillow). Ce script ne sert qu'au développement,
il n'est pas utilisé par le site.
"""

import json
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
PAGE = (232, 230, 225)   # couleur du fond de la planche
CASE = (204, 202, 196)   # couleur du fond des cases = devient transparent
ECHELLE = 5              # 1 pixel du sprite = 5 × 5 px sur la planche
TAILLE = 32              # sprites de 32 × 32

# Ordre des lignes sur chaque planche (de la pièce la plus à la moins demandée).
# Les coloris de chaque ligne suivent l'ordre de data/pieces.json.
PLANCHES = {
    "signal9": ["shell_relais", "montantes_trame", "cargo_beton", "sacoche_tournee",
                "gilet_dossard", "bonnet_nuit", "short_course"],
    "halvane": ["manteau_atelier", "sac_losange", "mocassins_heritage", "col_roule_fil",
                "echarpe_lisere", "chemise_coupe", "pantalon_pli"],
    "pigeon_social_club": ["hoodie_dalle", "sneakers_bitume", "casquette_perchoir",
                           "t_shirt_roucoule", "short_ollie", "tote_miettes"],
}


def trouver_cases(image):
    """Renvoie [(y, [x, x, …]), …] : les coins haut-gauche des cases 160 × 160, ligne par ligne."""
    px = image.load()
    w, h = image.size
    cote = TAILLE * ECHELLE
    lignes = {}
    for y in range(1, h - cote):
        for x in range(1, w - cote):
            if (px[x, y] == CASE and px[x - 1, y] == PAGE and px[x, y - 1] == PAGE
                    and px[x + cote, y] == PAGE and px[x, y + cote] == PAGE):
                lignes.setdefault(y, []).append(x)
    return [(y, sorted(xs)) for y, xs in sorted(lignes.items())]


def lire_sprite(image, x0, y0):
    """Lit une case et renvoie une image 32 × 32 RGBA (fond de case → transparent)."""
    px = image.load()
    sprite = Image.new("RGBA", (TAILLE, TAILLE), (0, 0, 0, 0))
    for by in range(TAILLE):
        for bx in range(TAILLE):
            bloc = {px[x0 + bx * ECHELLE + i, y0 + by * ECHELLE + j]
                    for i in range(ECHELLE) for j in range(ECHELLE)}
            if len(bloc) != 1:
                raise ValueError(f"Bloc non uniforme en ({bx}, {by}) : la planche n'est pas à ×5 exact")
            couleur = bloc.pop()
            if couleur != CASE:
                sprite.putpixel((bx, by), couleur + (255,))
    return sprite


def rects_svg(sprite, dx=0, dy=0, echelle=1):
    """Transforme un sprite en <rect> SVG, en fusionnant les pixels voisins de même couleur."""
    morceaux = []
    for y in range(TAILLE):
        x = 0
        while x < TAILLE:
            r, g, b, a = sprite.getpixel((x, y))
            if a == 0:
                x += 1
                continue
            debut = x
            while x < TAILLE and sprite.getpixel((x, y)) == (r, g, b, a):
                x += 1
            morceaux.append(
                f'<rect x="{dx + debut * echelle}" y="{dy + y * echelle}" '
                f'width="{(x - debut) * echelle}" height="{echelle}" fill="#{r:02x}{g:02x}{b:02x}"/>')
    return morceaux


def svg_sprite(sprite):
    corps = "\n  ".join(rects_svg(sprite))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" '
            f'shape-rendering="crispEdges">\n  {corps}\n</svg>\n')


def echapper(texte):
    return texte.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_planche(marque, lignes):
    """Planche de référence : sprites ×5 dans des cases de 160 px, comme l'original."""
    case, pas_x, pas_y, gauche, haut = 160, 182, 234, 250, 70
    largeur = gauche + 6 * pas_x
    hauteur = haut + len(lignes) * pas_y
    parties = [f'<rect width="{largeur}" height="{hauteur}" fill="#e8e6e1"/>',
               f'<text x="20" y="42" font-size="24" font-weight="700" fill="#141414">'
               f'{echapper(marque["name"])} — coloris (de la plus à la moins demandée)</text>']
    for i, (piece, sprites) in enumerate(lignes):
        y = haut + i * pas_y
        parties.append(f'<text x="20" y="{y + 75}" font-size="18" font-weight="700" fill="#141414">'
                       f'{echapper(piece["name"])}</text>')
        parties.append(f'<text x="20" y="{y + 98}" font-size="14" fill="#666">{len(sprites)} coloris</text>')
        for j, (coloris, sprite) in enumerate(sprites):
            x = gauche + j * pas_x
            parties.append(f'<rect x="{x}" y="{y}" width="{case}" height="{case}" fill="#cccac4"/>')
            parties.extend(rects_svg(sprite, x, y, ECHELLE))
            parties.append(f'<text x="{x}" y="{y + case + 20}" font-size="14" fill="#141414">'
                           f'{echapper(coloris["name"])}</text>')
    corps = "\n  ".join(parties)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {largeur} {hauteur}" '
            f'width="{largeur}" height="{hauteur}" shape-rendering="crispEdges" '
            f'font-family="sans-serif">\n  {corps}\n</svg>\n')


def main():
    catalogue = json.loads((RACINE / "data/pieces.json").read_text(encoding="utf-8"))
    pieces = {p["id"]: p for p in catalogue["pieces"]}
    marques = {m["id"]: m for m in catalogue["brands"]}
    (RACINE / "assets/pieces").mkdir(parents=True, exist_ok=True)
    (RACINE / "visuels/pieces").mkdir(parents=True, exist_ok=True)

    total = 0
    for marque_id, ordre in PLANCHES.items():
        image = Image.open(RACINE / f"visuels/sources/{marque_id}_planche.png").convert("RGB")
        cases = trouver_cases(image)
        if len(cases) != len(ordre):
            raise ValueError(f"{marque_id} : {len(cases)} lignes trouvées, {len(ordre)} attendues")

        lignes = []
        for (y0, xs), nom_court in zip(cases, ordre):
            piece = pieces[f"{marque_id}_{nom_court}"]
            if len(xs) != len(piece["colorways"]):
                raise ValueError(f"{piece['id']} : {len(xs)} cases, {len(piece['colorways'])} coloris attendus")
            sprites = []
            for x0, coloris in zip(xs, piece["colorways"]):
                sprite = lire_sprite(image, x0, y0)
                sprite.save(RACINE / coloris["sprite"])
                (RACINE / f"visuels/pieces/{coloris['id']}.svg").write_text(svg_sprite(sprite), encoding="utf-8")
                sprites.append((coloris, sprite))
                total += 1
            lignes.append((piece, sprites))

        (RACINE / f"visuels/{marque_id}_coloris_apercu.svg").write_text(
            svg_planche(marques[marque_id], lignes), encoding="utf-8")
        print(f"{marque_id} : {sum(len(s) for _, s in lignes)} sprites")
    print(f"Total : {total} sprites")


if __name__ == "__main__":
    main()
