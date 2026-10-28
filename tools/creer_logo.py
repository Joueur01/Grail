"""Crée le logo de Grail : un graal (coupe) en pixel art 16 × 16, crème et or sur fond presque noir.

Sorties (assets/brand/ et racine du dépôt) :
  favicon.ico                 16, 32 et 48 px (onglet du navigateur, résultats Google)
  assets/brand/icon.svg       même dessin en SVG (onglet des navigateurs récents, net à toutes les tailles)
  assets/brand/icon-<N>.png   32, 48, 180 (écran d'accueil iPhone), 192 et 512 px (Android, manifeste)
Tous les agrandissements sont des facteurs ENTIERS (pixel art net, section 4 du CLAUDE.md).
Le logo des e-mails (icône + « GRAIL ») est fait à part, avec la police du jeu : voir CLAUDE.md, section 18.

Utilisation (depuis la racine du dépôt) :  python3 tools/creer_logo.py
"""

from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent

# Couleurs : celles de l'interface (style.css)
COULEURS = {
    "B": (15, 15, 17, 255),     # fond du jeu (--bg)
    "C": (242, 241, 238, 255),  # crème (--text)
    "c": (189, 186, 179, 255),  # crème dans l'ombre
    "W": (255, 255, 255, 255),  # reflet
    "G": (242, 194, 48, 255),   # or (--rarity-legendaire)
    "g": (184, 134, 11, 255),   # or dans l'ombre
    ".": (0, 0, 0, 0),          # transparent (coins arrondis)
}

# Le graal, 16 × 16 : coupe, nœud doré, pied ; petit éclat doré en haut à droite.
DESSIN = [
    ".BBBBBBBBBBBBBB.",
    "BBBBBBBBBBBBBGBB",
    "BBBBBBBBBBBBGGGB",
    "BBGGGGGGGGGGgGBB",
    "BBCWCCCCCCCCccBB",
    "BBCWCCCCCCCCccBB",
    "BBBCCCCCCCCccBBB",
    "BBBBCCCCCCccBBBB",
    "BBBBBCCCCccBBBBB",
    "BBBBBBGGGgBBBBBB",
    "BBBBBBBCcBBBBBBB",
    "BBBBBBBCcBBBBBBB",
    "BBBBBBCCccBBBBBB",
    "BBBBGGGGGGggBBBB",
    "BBBBBBBBBBBBBBBB",
    ".BBBBBBBBBBBBBB.",
]


def dessin_16():
    im = Image.new("RGBA", (16, 16))
    for y, ligne in enumerate(DESSIN):
        assert len(ligne) == 16, f"ligne {y} : {len(ligne)} pixels"
        for x, ch in enumerate(ligne):
            im.putpixel((x, y), COULEURS[ch])
    return im


def agrandi(im, taille):
    """Agrandit par un facteur ENTIER et centre sur le fond du jeu si la taille n'est pas un multiple de 16."""
    k = taille // 16
    grand = im.resize((16 * k, 16 * k), Image.NEAREST)
    if 16 * k == taille:
        return grand
    fond = Image.new("RGBA", (taille, taille), COULEURS["B"])
    marge = (taille - 16 * k) // 2
    fond.alpha_composite(grand, (marge, marge))
    return fond


def svg(im):
    """Un <rect> par suite de pixels de même couleur, ligne par ligne."""
    rects = []
    for y in range(16):
        x = 0
        while x < 16:
            r, g, b, a = im.getpixel((x, y))
            if a == 0:
                x += 1
                continue
            debut = x
            while x < 16 and im.getpixel((x, y)) == (r, g, b, a):
                x += 1
            rects.append(f'<rect x="{debut}" y="{y}" width="{x - debut}" height="1" fill="#{r:02x}{g:02x}{b:02x}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">'
            + "".join(rects) + "</svg>\n")


def main():
    dossier = RACINE / "assets/brand"
    dossier.mkdir(parents=True, exist_ok=True)
    im = dessin_16()
    for taille in (32, 48, 180, 192, 512):
        agrandi(im, taille).save(dossier / f"icon-{taille}.png")
    (dossier / "icon.svg").write_text(svg(im), encoding="utf-8")
    # favicon.ico : 16, 32 et 48 px dans un seul fichier (Google demande au moins 48 px)
    # (chaque taille est fournie déjà agrandie, sinon Pillow réduirait le 48 px en flou)
    agrandi(im, 48).save(RACINE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)],
                         append_images=[im, agrandi(im, 32)])
    print("Logo créé : favicon.ico, assets/brand/icon.svg, icon-32/48/180/192/512.png")


if __name__ == "__main__":
    main()
