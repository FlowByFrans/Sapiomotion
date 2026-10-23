"""Tile rendered stills into one labelled contact sheet for review."""
import sys, os
from PIL import Image, ImageDraw
files = sys.argv[2:]
out = sys.argv[1]
tw = 640
ims = [Image.open(f).convert('RGB') for f in files]
th = int(tw * ims[0].height / ims[0].width)
cols = 2 if len(ims) > 1 else 1
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols - 1) * 6, rows * th + (rows - 1) * 6), (255, 0, 255))
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * (tw + 6), (i // cols) * (th + 6)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    d = ImageDraw.Draw(sheet)
    d.rectangle((x, y, x + 120, y + 18), fill=(0, 0, 0))
    d.text((x + 4, y + 3), os.path.basename(f), fill=(255, 255, 0))
sheet.save(out)
