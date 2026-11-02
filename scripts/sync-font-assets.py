"""Fetch unmodified Google Fonts WOFF2 files and their original OFL notices.

Run manually when updating font assets. No build-time or browser-time downloader
is used for chapter fonts. Source URLs and SHA-256 hashes are recorded.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
FAMILIES = {
    'lora': 'Lora', 'merriweather': 'Merriweather', 'literata': 'Literata',
    'newsreader': 'Newsreader', 'ebgaramond': 'EB Garamond', 'sourceserif4': 'Source Serif 4',
    'librebaskerville': 'Libre Baskerville', 'nunito': 'Nunito', 'dmsans': 'DM Sans',
    'lexend': 'Lexend', 'atkinsonhyperlegible': 'Atkinson Hyperlegible',
    'opensans': 'Open Sans', 'outfit': 'Outfit',
}


def fetch(url):
    if urlparse(url).hostname not in {'raw.githubusercontent.com', 'fonts.googleapis.com', 'fonts.gstatic.com'}:
        raise ValueError('Unexpected font source')
    with urlopen(Request(url, headers={'User-Agent': UA}), timeout=45) as response:
        return response.read()


def family_assets(item):
    slug, name = item
    base = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{slug}/'
    metadata = fetch(base + 'METADATA.pb').decode()
    if 'license: "OFL"' not in metadata:
        raise ValueError(f'Unverified commercial-use font license: {name}')
    license_bytes = fetch(base + 'OFL.txt')
    (ROOT / 'public/fonts/licenses' / f'{slug}-OFL.txt').write_bytes(license_bytes)
    record = {'name': name, 'slug': slug, 'metadata_url': base + 'METADATA.pb',
              'license_url': base + 'OFL.txt', 'license': f'/fonts/licenses/{slug}-OFL.txt',
              'metadata_sha256': hashlib.sha256(metadata.encode()).hexdigest(), 'faces': []}
    # DM Sans is shared with the interface; Outfit is interface-only.
    if slug in {'dmsans', 'outfit'}:
        return record, ''
    blocks = re.findall(r'fonts \{(.*?)\n\}', metadata, re.S)
    if any('wght]' in block or ',wght' in block or '[wght' in block for block in blocks):
        axes = 'ital,wght@0,400..700;1,400..700'
    else:
        faces = []
        for block in blocks:
            style = re.search(r'style: "(.*?)"', block).group(1)
            weight = int(re.search(r'weight: (\d+)', block).group(1))
            if weight in {400, 700}:
                faces.append((int(style == 'italic'), weight))
        axes = 'ital,wght@' + ';'.join(f'{italic},{weight}' for italic, weight in sorted(set(faces)))
    css_url = 'https://fonts.googleapis.com/css2?' + urlencode({'family': name + ':' + axes, 'display': 'swap'})
    record['css_url'] = css_url
    css = fetch(css_url).decode()
    rules = []
    for subset, block in re.findall(r'/\* ([^*]+) \*/\s*(@font-face\s*\{[^}]+\})', css):
        if subset.strip() not in {'latin', 'latin-ext'}:
            continue
        url = re.search(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', block).group(1)
        data = fetch(url)
        if not data.startswith(b'wOF2'):
            raise ValueError(f'{name}: expected an original WOFF2 font')
        digest = hashlib.sha256(data).hexdigest()
        filename = f'{slug}-{digest[:16]}.woff2'
        (ROOT / 'public/fonts/reader' / filename).write_bytes(data)
        local = '/fonts/reader/' + filename
        record['faces'].append({'source_url': url, 'path': local, 'sha256': digest,
                                'bytes': len(data), 'subset': subset.strip(),
                                'style': re.search(r'font-style: ([^;]+)', block).group(1),
                                'weight': re.search(r'font-weight: ([^;]+)', block).group(1)})
        block = block.replace(url, local).replace(f"font-family: '{name}'", f"font-family: 'Nooklie Reader {name}'")
        rules.append(block)
    if not rules:
        raise ValueError(f'{name}: no Latin WOFF2 faces found')
    return record, '\n'.join(rules)


if __name__ == '__main__':
    (ROOT / 'public/fonts/licenses').mkdir(parents=True, exist_ok=True)
    (ROOT / 'public/fonts/reader').mkdir(parents=True, exist_ok=True)
    results = list(ThreadPoolExecutor(max_workers=4).map(family_assets, FAMILIES.items()))
    (ROOT / 'lib/fonts/reader.css').write_text('/* Original Google Fonts WOFF2 binaries; OFL notices in /fonts/licenses/. */\n' + '\n'.join(css for _, css in results))
    (ROOT / 'public/fonts/manifest.json').write_text(json.dumps([record for record, _ in results], ensure_ascii=False, indent=2) + '\n')
    notices = []
    for record, _ in results:
        notices.append(f'=== {record["name"]} ===\nSource: {record["metadata_url"]}\n\n' + (ROOT / ('public' + record['license'])).read_text())
    (ROOT / 'public/fonts/LICENSES.txt').write_text('\n\n'.join(notices))
    print(f'Verified {len(results)} OFL families; downloaded {sum(len(r[0]["faces"]) for r in results)} Latin font faces.')
