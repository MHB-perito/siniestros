# -*- coding: utf-8 -*-
"""Genera los iconos de la app (icons/icon-180/192/512.png). Solo hace falta ejecutarlo una vez."""
import os

from PIL import Image, ImageDraw

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
AZUL = (11, 58, 110)


def icono(lado):
    img = Image.new("RGB", (lado, lado), AZUL)
    d = ImageDraw.Draw(img)
    u = lado / 100
    # Cámara blanca: cuerpo, visor y objetivo
    d.rounded_rectangle([18 * u, 32 * u, 82 * u, 76 * u], radius=8 * u, fill="white")
    d.rounded_rectangle([38 * u, 24 * u, 62 * u, 36 * u], radius=3 * u, fill="white")
    d.ellipse([36 * u, 40 * u, 64 * u, 68 * u], fill=AZUL)
    d.ellipse([42 * u, 46 * u, 58 * u, 62 * u], fill="white")
    return img


if __name__ == "__main__":
    os.makedirs(DIR, exist_ok=True)
    for lado in (180, 192, 512):
        icono(lado).save(os.path.join(DIR, f"icon-{lado}.png"))
