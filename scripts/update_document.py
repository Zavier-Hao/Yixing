"""Replace the downloadable Word file and refresh its existing HTML preview shell."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import html
import re
import shutil
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def update(source):
    source = Path(source)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    target = ROOT / 'dist/assets/yixing-product-design.docx'
    preview = ROOT / 'dist/technical-document.html'
    shell = preview.read_text(encoding='utf-8')
    # Keep the original page stylesheet, header and preview notice unchanged.
    marker = '</div>'
    split = shell.index(marker, shell.index('<div class="preview-note">')) + len(marker)
    with ZipFile(source) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
        relations = ET.fromstring(archive.read('word/_rels/document.xml.rels'))
        images = {}
        for rel in relations:
            if rel.get('Type', '').endswith('/image') and rel.get('TargetMode') != 'External':
                name = Path(rel.get('Target')).name
                data = archive.read('word/media/' + name)
                (ROOT / 'dist/assets/document-media' / name).write_bytes(data)
                images[rel.get('Id')] = 'assets/document-media/' + name

        def render(node):
            tag = node.tag.rsplit('}', 1)[-1]
            if tag == 'p':
                text = ''.join(n.text or '' if n.tag.endswith('}t') else '\n' if n.tag.endswith('}br') else '\t'
                               for n in node.iter() if n.tag.rsplit('}', 1)[-1] in ('t', 'br', 'tab'))
                result = '<p>' + html.escape(text) + '</p>' if text.strip() else ''
                for blip in node.findall('.//a:blip', NS):
                    image = images.get(blip.get('{' + NS['r'] + '}embed'))
                    if image:
                        result += '<figure><img src="' + image + '" alt="原始产品方案中的配图" loading="lazy"></figure>'
                return result
            if tag == 'tbl':
                rows = ['<tr>' + ''.join('<td>' + ''.join(render(c) for c in cell) + '</td>'
                                        for cell in row.findall('w:tc', NS)) + '</tr>'
                        for row in node.findall('w:tr', NS)]
                return '<div class="table-wrap"><table>' + ''.join(rows) + '</table></div>'
            return ''
        body = ''.join(render(n) for n in root.find('w:body', NS))
    shutil.copyfile(source, target)
    content = shell[:split] + body + '</article></html>'
    versioned = 'assets/yixing-product-design.docx?v=' + digest[:8]
    content = re.sub(r'assets/yixing-product-design\.docx(?:\?v=[a-zA-Z0-9-]+)?', versioned, content)
    preview.write_text(content, encoding='utf-8')
    index = ROOT / 'dist/index.html'
    content = index.read_text(encoding='utf-8')
    content = re.sub(r'assets/yixing-product-design\.docx(?:\?v=[a-zA-Z0-9-]+)?', versioned, content)
    content = re.sub(r'href="technical-document\.html(?:\?v=[a-zA-Z0-9-]+)?"',
                     'href="technical-document.html?v=' + digest[:8] + '"', content)
    content = re.sub(r'DOCX · [0-9.]+ MB', f'DOCX · {source.stat().st_size / 1024**2:.1f} MB', content)
    index.write_text(content, encoding='utf-8')
    assert target.read_bytes() == source.read_bytes()
    print('Updated document and preview. SHA256:', digest)

if __name__ == '__main__':
    update(sys.argv[1])
