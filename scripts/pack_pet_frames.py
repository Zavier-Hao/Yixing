"""Pack the background-extracted reference into aligned transparent sprite cells.

Usage: python scripts/pack_pet_frames.py path/to/extracted-atlas.png
Requires Pillow. Background extraction happens before this packaging step.
"""
from pathlib import Path
import json
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/assets/pet-frames'
SIZE = 256
ROWS = [
    ('idle', [300, 420, 535, 655, 770, 885, 1005, 1125], 94, 218, 116, 1.65),
    ('run', [295, 415, 535, 655, 775, 895, 1015, 1135], 262, 378, 120, 1.65),
    ('roll', [275, 370, 465, 560, 655, 750, 845, 940, 1040, 1135], 423, 522, 96, 1.85),
    ('pet', [300, 415, 535, 650, 765, 885, 1005, 1125], 568, 674, 116, 1.85),
    ('drag', [300, 400, 500, 600, 700, 800, 900, 1000, 1120], 701, 820, 100, 1.85),
    ('release', [305, 420, 540, 655, 775, 890, 1010, 1130], 859, 982, 120, 1.65),
]

def main(source):
    im = Image.open(source).convert('RGBA')
    if im.size != (1536, 1024):
        raise ValueError('Expected the extracted 1536x1024 reference atlas')
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGBA', (SIZE * 10, SIZE * len(ROWS)))
    manifest = {'cellSize': SIZE, 'columns': 10, 'rows': {}}
    for row, (name, centers, top, bottom, width, scale) in enumerate(ROWS):
        folder = OUT / name
        folder.mkdir(exist_ok=True)
        for index, center in enumerate(centers):
            crop = im.crop((center-width//2, top, center+width//2, bottom))
            crop = crop.resize((round(crop.width*scale), round(crop.height*scale)), Image.Resampling.LANCZOS)
            cell = Image.new('RGBA', (SIZE, SIZE))
            # Common baseline per action preserves compression and bounce in the source.
            cell.alpha_composite(crop, ((SIZE-crop.width)//2, 232-crop.height))
            cell.save(folder / f'{index+1:02}.png', optimize=True)
            sheet.alpha_composite(cell, (index*SIZE, row*SIZE))
        manifest['rows'][name] = {'row': row, 'frames': len(centers)}
    sheet.save(OUT / 'atlas.webp', lossless=True, method=6)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    # A deliberately opaque contact sheet for visual QA, outside production assets.
    preview = Image.new('RGBA', sheet.size, '#07171b')
    preview.alpha_composite(sheet)
    preview.thumbnail((1280, 768))
    cache = ROOT / '.cache'
    cache.mkdir(exist_ok=True)
    preview.save(cache / 'pet-frames-preview.png')
    print(f'Packed {sum(len(row[1]) for row in ROWS)} frames into {OUT}')

if __name__ == '__main__':
    main(sys.argv[1])
