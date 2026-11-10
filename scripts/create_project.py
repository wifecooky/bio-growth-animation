#!/usr/bin/env python3
"""Validate a biological growth recipe and scaffold a self-contained HyperFrames project."""
import argparse
import copy
import html
import json
import math
from pathlib import Path
import re
import shutil
import struct
import sys

SKILL = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL / 'assets' / 'template'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, label):
    require(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value), f'{label} must be a finite number')
    return value


def point(value, label, bounds=None):
    require(isinstance(value, list) and len(value) == 2, f'{label} must be [x, y]')
    for i, v in enumerate(value):
        number(v, f'{label}[{i}]')
        if bounds:
            require(0 <= v <= bounds[i], f'{label}[{i}] is outside its atlas cell')


def png_info(path):
    with path.open('rb') as f:
        require(f.read(8) == b'\x89PNG\r\n\x1a\n', 'atlas must be a PNG file')
        width = height = color = None
        transparency = False
        while True:
            head = f.read(8)
            require(len(head) == 8, 'truncated PNG')
            length, kind = struct.unpack('>I4s', head)
            if kind == b'IHDR':
                data = f.read(length)
                width, height, _, color, _, _, _ = struct.unpack('>IIBBBBB', data)
            elif kind == b'tRNS':
                transparency = True
                f.seek(length, 1)
            elif kind == b'IDAT':
                break
            else:
                f.seek(length, 1)
            f.seek(4, 1)
    return width, height, color in (4, 6) or transparency


def validate(config_path):
    c = json.loads(config_path.read_text(encoding='utf-8'))
    require(isinstance(c, dict), 'configuration must be an object')
    require(re.fullmatch(r'[a-z][a-z0-9-]{0,63}', c.get('id', '')), 'id must be a lowercase kebab-case identifier')
    c.setdefault('canvas', {'width': 900, 'height': 1200})
    w, h = c['canvas']['width'], c['canvas']['height']
    require(type(w) is int and type(h) is int and w > 0 and h > 0, 'canvas dimensions must be positive integers')
    require(w * 4 == h * 3, 'bundled HUD layout uses 3:4; adapt the HTML layout explicitly for other aspect ratios')
    c.setdefault('duration', 10)
    require(number(c['duration'], 'duration') >= 3, 'duration must be at least 3 seconds')
    c.setdefault('fps', 60)
    require(c['fps'] in (24, 25, 30, 50, 60), 'fps must be 24, 25, 30, 50, or 60')
    c.setdefault('growth', {'start': .55, 'end': c['duration'] - 1.2})
    start, end = c['growth']['start'], c['growth']['end']
    require(.12 <= number(start, 'growth.start') < number(end, 'growth.end') <= c['duration'], 'growth must lie inside the film duration')
    title = c['title']
    require(isinstance(title.get('lines'), list) and 1 <= len(title['lines']) <= 3 and all(isinstance(v, str) and v for v in title['lines']), 'title.lines needs 1–3 nonempty strings')
    for key in ['zh', 'taxon', 'archive']:
        title.setdefault(key, '')
        require(isinstance(title[key], str), f'title.{key} must be text')
    palette = {'background': '#050708', 'ink': '#e8e9e4', 'muted': '#8f9fa6', 'rule': '#35505b', 'accent': '#e4a05b', 'cold': '#a5c6d2'}
    palette.update(c.get('palette', {}))
    require(all(re.fullmatch(r'#[0-9a-fA-F]{6}', v) for v in palette.values()), 'palette entries must be six-digit hex colors')
    c['palette'] = palette
    a = c['atlas']
    for key in ['columns', 'rows', 'cellWidth', 'cellHeight']:
        require(type(a.get(key)) is int and a[key] > 0, f'atlas.{key} must be a positive integer')
    require(isinstance(a.get('file'), str) and a['file'], 'atlas.file is required')
    atlas_path = (config_path.parent / a['file']).resolve()
    require(atlas_path.is_file(), f'atlas does not exist: {atlas_path}')
    aw, ah, has_alpha = png_info(atlas_path)
    require((aw, ah) == (a['columns'] * a['cellWidth'], a['rows'] * a['cellHeight']), f'atlas size {aw}×{ah} does not match declared grid')
    require(has_alpha, 'atlas has no transparency channel; clean its background before building')
    c.setdefault('hero', {'anchor': [500, 915], 'pixelsPerUnit': 360 / a['cellWidth']})
    point(c['hero']['anchor'], 'hero.anchor')
    require(number(c['hero']['pixelsPerUnit'], 'hero.pixelsPerUnit') > 0, 'hero.pixelsPerUnit must be positive')
    c.setdefault('morph', {})
    c['morph'].setdefault('alphaThreshold', 96)
    c['morph'].setdefault('edgeSoftness', 1.25)
    require(type(c['morph']['alphaThreshold']) is int and 1 <= c['morph']['alphaThreshold'] <= 254, 'alphaThreshold must be an integer 1–254')
    require(0 < number(c['morph']['edgeSoftness'], 'edgeSoftness') <= 8, 'edgeSoftness must be >0 and <=8')
    names = c['landmarkNames']
    require(isinstance(names, list) and len(names) >= 6 and all(isinstance(v, str) and v for v in names), 'at least six named anatomy landmarks are required')
    require(len(set(names)) == len(names), 'landmarkNames must be unique')
    stages = c['stages']
    require(isinstance(stages, list) and 2 <= len(stages) <= 8, 'the template supports 2–8 stages')
    metrics = c.get('metrics', [{'key': 'size', 'label': 'REL. SIZE', 'unit': 'INDEX', 'digits': 2}, {'key': 'structure', 'label': 'STRUCTURE', 'unit': 'INDEX', 'digits': 2}])
    require(len(metrics) == 2 and len({m['key'] for m in metrics}) == 2, 'the bundled HUD has two distinct metrics')
    for m in metrics:
        require(all(isinstance(m.get(k), str) for k in ['key', 'label']), 'metric key and label must be text')
        m.setdefault('unit', 'INDEX')
        m.setdefault('digits', 2)
        require(type(m['digits']) is int and 0 <= m['digits'] <= 3, 'metric digits must be an integer 0–3')
    c['metrics'] = metrics
    ids = set()
    for i, s in enumerate(stages):
        label = f'stages[{i}]'
        s.setdefault('id', f'S{i + 1:02}')
        require(isinstance(s['id'], str) and s['id'] not in ids, f'{label}.id must be unique text')
        ids.add(s['id'])
        require(all(isinstance(s.get(k), str) for k in ['zh', 'en']), f'{label} needs zh and en labels')
        s.setdefault('cell', i)
        require(type(s['cell']) is int and 0 <= s['cell'] < a['columns'] * a['rows'], f'{label}.cell is outside atlas')
        require(number(s['scale'], label + '.scale') > 0, f'{label}.scale must be positive')
        point(s['anchor'], label + '.anchor', [a['cellWidth'], a['cellHeight']])
        s.setdefault('accent', palette['accent'])
        require(re.fullmatch(r'#[0-9a-fA-F]{6}', s['accent']), f'{label}.accent must be hex color')
        require(len(s['points']) == len(names), f'{label}.points count must match landmarkNames')
        for j, p in enumerate(s['points']):
            point(p, f'{label}.points[{j}]', [a['cellWidth'], a['cellHeight']])
        require(len({tuple(p) for p in s['points']}) == len(names), f'{label} has coincident anatomy points; split topology-changing phases instead')
        for m in metrics:
            number(s['metrics'][m['key']], label + '.metrics.' + m['key'])
        if 'visibleRect' in s:
            r = s['visibleRect']
            require(isinstance(r, list) and len(r) == 4, f'{label}.visibleRect needs [x0,y0,x1,y1]')
            for j, v in enumerate(r):
                number(v, label + '.visibleRect')
                require(0 <= v <= (a['cellWidth'] if j % 2 == 0 else a['cellHeight']), f'{label}.visibleRect is outside cell')
            require(r[0] < r[2] and r[1] < r[3], f'{label}.visibleRect is empty')
    for m in metrics:
        m.setdefault('max', max(abs(s['metrics'][m['key']]) for s in stages) or 1)
        require(number(m['max'], 'metric.max') > 0, 'metric.max must be positive')
    annotations = c.setdefault('annotations', [])
    require(isinstance(annotations, list) and len(annotations) <= 4, 'HUD supports up to four anatomy annotations')
    for i, an in enumerate(annotations):
        require(an.get('point') in names, f'annotation {i} refers to an unknown anatomy landmark')
        require(an.get('align', 'left') in ('left', 'right'), 'annotation align must be left or right')
        an.setdefault('align', 'left')
        for key in ['label', 'lineStart', 'elbow']:
            point(an[key], f'annotation[{i}].{key}')
        require(all(isinstance(an.get(k), str) for k in ['en', 'zh']), 'annotation labels must be text')
    c.setdefault('footer', {'en': 'CONCEPT SEQUENCE / VIRTUAL DATA', 'zh': '概念生长序列 · 示意数据'})
    require(all(isinstance(c['footer'].get(k), str) for k in ['en', 'zh']), 'footer needs en and zh text')
    return c, atlas_path


def build(config, atlas, out):
    require(not out.exists() or (out.is_dir() and not any(out.iterdir())), 'output directory must be absent or empty; existing projects are never overwritten')
    out.mkdir(parents=True, exist_ok=True)
    assets = out / 'assets'
    assets.mkdir()
    for name in ['gsap.min.js', 'growth-morph.js', 'fonts']:
        p = TEMPLATE / name
        if p.is_dir():
            shutil.copytree(p, assets / name)
        else:
            shutil.copy2(p, assets / name)
    if (TEMPLATE / 'THIRD_PARTY.md').exists():
        shutil.copy2(TEMPLATE / 'THIRD_PARTY.md', assets / 'THIRD_PARTY.md')
    shutil.copy2(atlas, assets / 'atlas.png')
    c = copy.deepcopy(config)
    c['atlas']['file'] = 'assets/atlas.png'
    text = (TEMPLATE / 'index.html').read_text(encoding='utf-8')
    replacements = {
        '@@TITLE@@': html.escape(c['title']['zh'] or ' '.join(c['title']['lines'])),
        '@@ID@@': c['id'], '@@DURATION@@': str(c['duration']), '@@FPS@@': str(c['fps']),
        '@@WIDTH@@': str(c['canvas']['width']), '@@HEIGHT@@': str(c['canvas']['height']),
        '@@SCALE@@': str(c['canvas']['width'] / 900),
        '@@BG_SIZE@@': f"{c['atlas']['columns'] * 100}% {c['atlas']['rows'] * 100}%",
        '@@CONFIG_SCRIPT@@': 'const GROWTH_CONFIG=' + json.dumps(c, ensure_ascii=False).replace('<', '\\u003c') + ';',
        '@@RUNTIME@@': (TEMPLATE / 'runtime.js').read_text(encoding='utf-8'),
    }
    for token, replacement in replacements.items():
        text = text.replace(token, replacement)
    require('@@' not in text, 'unexpanded template token')
    (out / 'index.html').write_text(text, encoding='utf-8')
    (out / 'config.json').write_text(json.dumps(c, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    version = '0.9.26'
    package = {'name': c['id'], 'private': True, 'type': 'module', 'scripts': {k: f'npx --yes hyperframes@{version} {v}' for k, v in {'dev': 'preview', 'check': 'check', 'render': 'render'}.items()}}
    (out / 'package.json').write_text(json.dumps(package, indent=2) + '\n')
    (out / 'hyperframes.json').write_text(json.dumps({'paths': {'assets': 'assets', 'blocks': 'compositions', 'components': 'compositions/components'}, 'media': {'autoProxy': True}}, indent=2) + '\n')
    (out / 'meta.json').write_text(json.dumps({'id': c['id'], 'name': c['title']['zh'] or c['id']}, ensure_ascii=False, indent=2) + '\n')
    motion = {'duration': c['duration'], 'assertions': [{'kind': 'appearsBy', 'selector': '#header', 'bySec': .8}, {'kind': 'appearsBy', 'selector': '#morph-canvas', 'bySec': .8}]}
    (out / 'index.motion.json').write_text(json.dumps(motion, indent=2) + '\n')
    (out / 'AGENTS.md').write_text('# Growth animation project\n\nRead the bio-growth-animation skill before edits. config.json is the portable recipe; index.html contains its embedded execution copy. For recipe changes, edit config.json, rebuild into a fresh sibling directory, inspect, and only then replace the selected result. Never overwrite user changes.\n\nUse npm run check before delivery. Inspect transition midpoints and the final hold; a passing check alone does not prove a correct morph. Export with npm run render -- --quality delivery --output renders/growth.mp4. Assets are local; no API calls are needed to render existing images.\n')
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    try:
        c, atlas = validate(args.config.resolve())
        if args.validate_only:
            print(json.dumps({'ok': True, 'id': c['id'], 'stages': len(c['stages']), 'landmarks': len(c['landmarkNames']), 'fps': c['fps']}, ensure_ascii=False))
        else:
            require(args.out is not None, '--out is required unless using --validate-only')
            out = build(c, atlas, args.out.resolve())
            print(json.dumps({'ok': True, 'project': str(out), 'duration': c['duration'], 'fps': c['fps']}, ensure_ascii=False))
    except (ValueError, KeyError, TypeError, OSError, struct.error) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
