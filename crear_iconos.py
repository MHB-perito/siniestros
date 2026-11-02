# -*- coding: utf-8 -*-
"""Genera los iconos de la app (icons/icon-180/192/512.png): casa con lupa de perito."""
import os

from PIL import Image, ImageDraw

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
ARRIBA, ABAJO = (20, 74, 140), (8, 36, 74)
ORO = (245, 177, 52)
BLANCO = (255, 255, 255)


def icono(lado):
    g = 1024  # se dibuja grande y se reduce, para que los bordes salgan suaves
    img = Image.new("RGB", (g, g))
    d = ImageDraw.Draw(img)
    for y in range(g):  # degradado vertical
        t = y / g
        d.line([(0, y), (g, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(ARRIBA, ABAJO)))

    # Casa
    d.polygon([(170, 470), (430, 230), (690, 470)], fill=BLANCO)                      # tejado
    d.rectangle([590, 270, 650, 400], fill=BLANCO)                                     # chimenea
    d.rectangle([235, 450, 625, 790], fill=BLANCO)                                     # fachada
    d.rounded_rectangle([385, 600, 475, 790], radius=14, fill=ABAJO)                   # puerta
    d.rectangle([280, 520, 350, 590], fill=ABAJO)                                      # ventana

    # Lupa
    cx, cy, r = 640, 610, 175
    d.line([(cx + 110, cy + 110), (875, 845)], fill=ORO, width=78)                     # mango
    d.ellipse([845 - 39, 815 - 39, 875 + 39, 845 + 39], fill=ORO)                      # punta redonda
    d.ellipse([cx - r - 34, cy - r - 34, cx + r + 34, cy + r + 34], fill=ORO)          # aro
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(222, 236, 252))                  # cristal
    d.line([(cx - 85, cy + 5), (cx - 25, cy + 70), (cx + 95, cy - 70)], fill=(20, 74, 140),
           width=46, joint="curve")                                                    # visto bueno
    return img.resize((lado, lado), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(DIR, exist_ok=True)
    for lado in (180, 192, 512):
        icono(lado).save(os.path.join(DIR, f"icon-{lado}.png"))
