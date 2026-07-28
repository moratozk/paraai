"""
Converte uma fonte TTF para o formato de fonte do Adafruit_GFX (.h).

Por que isso existe: as fontes que acompanham a biblioteca (FreeSans, FreeMono,
FreeSerif) são derivadas das URW de 1996 e ficam pesadas e mal espaçadas na
tela do totem. Gerando a partir da Bahnschrift — a DIN da Microsoft, mesma
família usada em sinalização rodoviária — o texto fica condensado, alto e
muito mais legível no mesmo espaço.

Uso:
    python gerar_fonte.py

Gera os .h em Main/. Rode de novo só se quiser mudar tamanho ou fonte-base.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
TTF = r"C:\Windows\Fonts\bahnschrift.ttf"

# Bahnschrift é variável; estes eixos dão o peso/largura que queremos.
# (PIL usa a instância padrão, então ajustamos pelo tamanho.)
SAIDA = Path(__file__).resolve().parent.parent / "Main"

# Só os caracteres que o totem realmente desenha. Cortar o resto economiza
# flash: a faixa ASCII inteira gastaria ~3x mais.
CARACTERES = (
    " !#$%&'()*+,-./0123456789:;<=>?@"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
)

FONTES = [
    ("ParaAiGrande", 40),   # botões ENTRADA/SAÍDA, números de destaque
    ("ParaAiMedio", 26),    # títulos de tela
    ("ParaAiPequeno", 19),  # rótulos e textos de apoio
]

LIMIAR = 128  # binarização: o GFX é 1 bit por pixel, sem antialiasing


def glifos_da_fonte(caminho_ttf, tamanho_px):
    fonte = ImageFont.truetype(caminho_ttf, tamanho_px)
    ascent, descent = fonte.getmetrics()

    glifos = []
    bitmaps = bytearray()

    ordenados = sorted(set(CARACTERES))
    primeiro, ultimo = ord(ordenados[0]), ord(ordenados[-1])

    for codigo in range(primeiro, ultimo + 1):
        ch = chr(codigo)

        if ch not in CARACTERES:
            # buraco na faixa: glifo vazio, mas precisa existir na tabela
            glifos.append((len(bitmaps), 0, 0, tamanho_px // 3, 0, 0))
            continue

        # mede a caixa real da tinta
        caixa = fonte.getbbox(ch)
        avanco = round(fonte.getlength(ch))

        if caixa is None or caixa[2] <= caixa[0] or caixa[3] <= caixa[1]:
            # espaço e afins: sem pixels, só avanço
            glifos.append((len(bitmaps), 0, 0, avanco, 0, 0))
            continue

        x0, y0, x1, y1 = caixa
        largura, altura = x1 - x0, y1 - y0

        # renderiza o glifo isolado
        img = Image.new("L", (largura, altura), 0)
        ImageDraw.Draw(img).text((-x0, -y0), ch, font=fonte, fill=255)

        inicio = len(bitmaps)
        acumulador, bits = 0, 0
        for py in range(altura):
            for px in range(largura):
                acumulador = (acumulador << 1) | (1 if img.getpixel((px, py)) >= LIMIAR else 0)
                bits += 1
                if bits == 8:
                    bitmaps.append(acumulador)
                    acumulador, bits = 0, 0
        if bits:                       # sobra do último byte
            bitmaps.append(acumulador << (8 - bits))

        # yOffset do GFX é relativo à baseline, negativo para cima
        glifos.append((inicio, largura, altura, avanco, x0, y0 - ascent))

    y_advance = ascent + descent
    return glifos, bitmaps, primeiro, ultimo, y_advance


def escrever_header(nome, glifos, bitmaps, primeiro, ultimo, y_advance, tamanho_px):
    linhas = []
    linhas.append(f"// Gerado por Ferramentas/gerar_fonte.py a partir de Bahnschrift {tamanho_px}px.")
    linhas.append("// Não editar à mão — rode o script de novo para regerar.")
    linhas.append(f"#pragma once")
    linhas.append("#include <Adafruit_GFX.h>")
    linhas.append("")

    # bitmaps
    linhas.append(f"const uint8_t {nome}Bitmaps[] PROGMEM = {{")
    for i in range(0, len(bitmaps), 12):
        pedaco = ", ".join(f"0x{b:02X}" for b in bitmaps[i:i + 12])
        linhas.append(f"  {pedaco},")
    linhas.append("};")
    linhas.append("")

    # tabela de glifos
    linhas.append(f"const GFXglyph {nome}Glyphs[] PROGMEM = {{")
    for idx, (off, w, h, adv, xo, yo) in enumerate(glifos):
        ch = chr(primeiro + idx)
        visivel = ch if ch.isprintable() and ch != " " else "espaco"
        linhas.append(
            f"  {{ {off:5d}, {w:3d}, {h:3d}, {adv:3d}, {xo:4d}, {yo:4d} }},   // '{visivel}'"
        )
    linhas.append("};")
    linhas.append("")

    linhas.append(f"const GFXfont {nome} PROGMEM = {{")
    linhas.append(f"  (uint8_t  *){nome}Bitmaps,")
    linhas.append(f"  (GFXglyph *){nome}Glyphs,")
    linhas.append(f"  0x{primeiro:02X}, 0x{ultimo:02X}, {y_advance}")
    linhas.append("};")
    linhas.append("")

    destino = SAIDA / f"{nome}.h"
    destino.write_text("\n".join(linhas), encoding="utf-8")
    return destino, len(bitmaps)


def main():
    if not Path(TTF).exists():
        raise SystemExit(f"Fonte não encontrada: {TTF}")

    print(f"Fonte base: {TTF}\n")
    total = 0
    for nome, tamanho in FONTES:
        glifos, bitmaps, primeiro, ultimo, yadv = glifos_da_fonte(TTF, tamanho)
        destino, bytes_bitmap = escrever_header(
            nome, glifos, bitmaps, primeiro, ultimo, yadv, tamanho
        )
        total += bytes_bitmap
        # altura das maiúsculas, que é o que usamos para alinhar
        alt_maiuscula = max(-g[5] for g in glifos if g[2] > 0)
        print(f"  {nome:16s} {tamanho:3d}px  cap-height {alt_maiuscula:2d}px  "
              f"yAdvance {yadv:2d}  {bytes_bitmap:5d} bytes  -> {destino.name}")

    print(f"\nTotal em flash: {total / 1024:.1f} KB")


if __name__ == "__main__":
    main()
