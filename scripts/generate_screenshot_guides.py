"""Create the role guides from real UI captures.

Authoring is intentionally separate from capture. Before running this command,
run the PDF skill's artifact-operation marker for an edit of 8 PDFs.

Input:
  tmp/guide-screen-plan.json
  output/guide-assets/captures.json

The capture manifest accepts either {"captures": {key: capture}} or {key: capture}.
A capture has path, dimensions ({width,height} or [width,height]) and targets.
Targets are an object keyed by legend number, or a list with number/rect fields.
Each rectangle uses pixel coordinates x, y, width, height in the saved image.
A null rectangle leaves the numbered legend in place and emits a clear warning.

No PDF is written unless all required captures exist and all text can fit.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLAN = ROOT / 'tmp' / 'guide-screen-plan.json'
CAPTURE_DIR = ROOT / 'output' / 'guide-assets' / 'screenshots'
DEFAULT_MANIFEST = ROOT / 'output' / 'guide-assets' / 'captures.json'
OUT = ROOT / 'output' / 'pdf'
W, H = 1440, 1000
NAVY = HexColor('#10243a')
INK = HexColor('#182a3e')
ORANGE = HexColor('#e97824')
MUTED = HexColor('#63758a')
PALE = HexColor('#f3f6fa')
BORDER = HexColor('#dfe7f0')


def register_fonts():
    candidates = [Path('C:/Windows/Fonts'), Path('/usr/share/fonts/truetype/dejavu')]
    for base in candidates:
        regular = base / ('segoeui.ttf' if 'Windows' in str(base) else 'DejaVuSans.ttf')
        bold = base / ('segoeuib.ttf' if 'Windows' in str(base) else 'DejaVuSans-Bold.ttf')
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont('Guide', str(regular)))
            pdfmetrics.registerFont(TTFont('Guide-Bold', str(bold)))
            return
    raise FileNotFoundError('A readable Unicode font (Segoe UI or DejaVu Sans) is required.')


def style(name, size, leading=None, color=INK, bold=False):
    return ParagraphStyle(name, fontName='Guide-Bold' if bold else 'Guide', fontSize=size,
                          leading=leading or size * 1.4, textColor=color, spaceAfter=0)


def paragraph(text, sty, width):
    p = Paragraph(text, sty)
    _, height = p.wrap(width, 10000)
    return p, height


def draw_text(c, text, sty, x, top, width, max_height=None):
    p, height = paragraph(text, sty, width)
    if max_height is not None and height > max_height + .1:
        raise ValueError(f'Text does not fit ({height:.1f}>{max_height:.1f}): {text[:100]}')
    p.drawOn(c, x, top - height)
    return height


def resolve_image_path(value, key, manifest_path):
    if not value:
        return CAPTURE_DIR / f'{key}.jpg'
    p = Path(value)
    if p.is_absolute():
        return p
    # Paths are normally relative to project root or the manifest itself.
    choices = [ROOT / p, manifest_path.parent / p]
    return next((candidate for candidate in choices if candidate.is_file()), choices[0])


def normalize_manifest(raw):
    if isinstance(raw, dict) and 'captures' in raw:
        raw = raw['captures']
    if isinstance(raw, list):
        return {item.get('key', item.get('id')): item for item in raw}
    if not isinstance(raw, dict):
        raise ValueError('Capture manifest must contain a dictionary or list of captures.')
    return raw


def normalize_targets(raw):
    if not raw:
        return {}
    if isinstance(raw, list):
        return {str(item.get('number', index + 1)): item.get('rect', item.get('bounds'))
                for index, item in enumerate(raw) if isinstance(item, dict)}
    return {str(k): (v.get('rect', v.get('bounds', v)) if isinstance(v, dict) else v)
            for k, v in raw.items()}


def validate_inputs(plan_path, manifest_path):
    plan = json.loads(plan_path.read_text(encoding='utf-8-sig'))
    captures = normalize_manifest(json.loads(manifest_path.read_text(encoding='utf-8-sig')))
    required = list(dict.fromkeys(key for guide in plan['guides'] for key in guide['screens']))
    issues = []
    missing = []
    resolved = {}
    for key in required:
        if key not in plan['screens']:
            missing.append(f'{key}: missing screen plan')
            continue
        entry = captures.get(key)
        if entry is None:
            missing.append(f'{key}: missing manifest entry')
            continue
        if isinstance(entry, str):
            entry = {'path': entry}
        image_path = resolve_image_path(entry.get('path', entry.get('file')), key, manifest_path)
        if not image_path.is_file():
            missing.append(f'{key}: {image_path}')
            continue
        with Image.open(image_path) as im:
            actual_width, actual_height = im.size
        dimensions = entry.get('dimensions', entry.get('size'))
        if isinstance(dimensions, dict):
            declared_width, declared_height = dimensions.get('width'), dimensions.get('height')
        elif isinstance(dimensions, (list, tuple)) and len(dimensions) == 2:
            declared_width, declared_height = dimensions
        else:
            declared_width, declared_height = entry.get('width', actual_width), entry.get('height', actual_height)
        declared_width = float(declared_width or actual_width)
        declared_height = float(declared_height or actual_height)
        if declared_width <= 0 or declared_height <= 0:
            raise ValueError(f'{key}: invalid dimensions')
        targets = normalize_targets(entry.get('targets'))
        accepted = {}
        for legend in plan['screens'][key]['legend']:
            number = str(legend['number'])
            rect = targets.get(number)
            if isinstance(rect, dict):
                try:
                    rect = {name: float(rect[name]) for name in ('x', 'y', 'width', 'height')}
                except (KeyError, TypeError, ValueError):
                    rect = None
            elif isinstance(rect, (list, tuple)) and len(rect) == 4:
                rect = dict(zip(('x', 'y', 'width', 'height'), map(float, rect)))
            else:
                rect = None
            if rect is not None:
                finite = all(math.isfinite(v) for v in rect.values())
                positive = rect['width'] > 0 and rect['height'] > 0
                intersects = (rect['x'] < declared_width and rect['y'] < declared_height
                              and rect['x'] + rect['width'] > 0 and rect['y'] + rect['height'] > 0)
                if not finite or not positive or not intersects:
                    rect = None
            accepted[number] = rect
            if rect is None:
                issues.append({'screen': key, 'number': int(number), 'target_text': legend['target_text'],
                               'warning': 'Target rectangle unavailable; legend retained without an arrow.'})
        resolved[key] = {'path': image_path, 'width': actual_width, 'height': actual_height,
                         'coordinate_width': declared_width, 'coordinate_height': declared_height,
                         'targets': accepted}
    if missing:
        raise ValueError('No PDFs generated. Required captures are missing:\n  ' + '\n  '.join(missing))
    return plan, resolved, issues


def badge(c, x, y, number, radius=13, color=ORANGE):
    c.setFillColor(color)
    c.setStrokeColor(white)
    c.setLineWidth(2)
    c.circle(x, y, radius, fill=1, stroke=1)
    c.setFillColor(white)
    c.setFont('Guide-Bold', 12)
    c.drawCentredString(x, y - 4, str(number))


def arrow(c, x1, y1, x2, y2):
    c.setStrokeColor(ORANGE)
    c.setFillColor(ORANGE)
    c.setLineWidth(1.8)
    c.line(x1, y1, x2, y2)
    angle = math.atan2(y2 - y1, x2 - x1)
    length = 7
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - length * math.cos(angle - .5), y2 - length * math.sin(angle - .5))
    p.lineTo(x2 - length * math.cos(angle + .5), y2 - length * math.sin(angle + .5))
    p.close()
    c.drawPath(p, fill=1, stroke=0)


def draw_capture(c, capture, box, legends=None):
    bx, by, bw, bh = box
    scale = min(bw / capture['width'], bh / capture['height'])
    iw, ih = capture['width'] * scale, capture['height'] * scale
    ix, iy = bx + (bw - iw) / 2, by + (bh - ih) / 2
    c.setFillColor(white)
    c.setStrokeColor(BORDER)
    c.setLineWidth(1)
    c.roundRect(ix - 5, iy - 5, iw + 10, ih + 10, 9, fill=1, stroke=1)
    c.drawImage(str(capture['path']), ix, iy, width=iw, height=ih, mask='auto')
    if not legends:
        return
    used = []
    for legend in legends:
        number = legend['number']
        rect = capture['targets'].get(str(number))
        if rect is None:
            continue
        sx = iw / capture['coordinate_width']
        sy = ih / capture['coordinate_height']
        rx = ix + max(0, rect['x']) * sx
        rw = min(rect['width'], capture['coordinate_width'] - max(0, rect['x'])) * sx
        rh = min(rect['height'], capture['coordinate_height'] - max(0, rect['y'])) * sy
        ry = iy + ih - max(0, rect['y']) * sy - rh
        c.setFillColor(Color(1, .57, .15, alpha=.08))
        c.setStrokeColor(ORANGE)
        c.setLineWidth(1.4)
        c.roundRect(rx - 2, ry - 2, rw + 4, rh + 4, 3, fill=1, stroke=1)
        # Keep the number near its element, outside the highlighted text when room permits.
        center_y = ry + rh / 2
        if rx - ix > 36:
            cx, cy = rx - 20, center_y
            end_x, end_y = rx, center_y
        elif ix + iw - (rx + rw) > 36:
            cx, cy = rx + rw + 20, center_y
            end_x, end_y = rx + rw, center_y
        else:
            cx, cy = rx + min(max(rw / 2, 15), rw - 15), ry + rh + 19
            end_x, end_y = cx, ry + rh
        cx = min(max(cx, bx + 15), bx + bw - 15)
        cy = min(max(cy, by + 15), by + bh - 15)
        # Adjacent labels should remain independently legible.
        for _ in range(8):
            if not any(math.hypot(cx - px, cy - py) < 29 for px, py in used):
                break
            cy = max(by + 15, cy - 30)
        used.append((cx, cy))
        arrow(c, cx, cy, end_x, end_y)
        badge(c, cx, cy, number)


def footer(c, role, page, count):
    c.setStrokeColor(BORDER)
    c.setLineWidth(.8)
    c.line(44, 49, W - 44, 49)
    c.setFillColor(MUTED)
    c.setFont('Guide', 10)
    c.drawString(44, 29, 'OFICINA INTELIGENTE | MANUAL PASSO A PASSO')
    c.drawRightString(W - 44, 29, f'{role} | {page}/{count}')


def side_layout(screen):
    """Preflight the side column and select a font size that fits without clipping."""
    width = 370
    for size in (14.5, 14, 13.5, 13, 12.5):
        leading = size * 1.36
        blocks = []
        blocks.append(('heading', 'FAÇA NESTA ORDEM', style('stephead', 12, 17, ORANGE, True), 16))
        for index, instruction in enumerate(screen['steps'], 1):
            text = f'<b>{index}.</b> {escape(instruction)}'
            blocks.append(('step', text, style('step', size, leading), 8))
        blocks.append(('heading', 'O QUE CADA NÚMERO INDICA', style('legendhead', 12, 17, ORANGE, True), 13))
        for legend in screen['legend']:
            text = f"<b>{escape(legend['target_text'])}.</b> {escape(legend['caption'])}"
            blocks.append((str(legend['number']), text, style('legend', size, leading), 12))
        if screen.get('notes'):
            blocks.append(('note', '<b>Observe:</b> ' + escape(screen['notes']),
                           style('note', max(11.5, size - 1), max(16, leading - 1.5), MUTED), 0))
        total = sum(paragraph(text, sty, width if kind in ('heading', 'step', 'note') else width - 29)[1] + gap
                    for kind, text, sty, gap in blocks)
        if total <= 730:
            return blocks, width, total
    raise ValueError(f"Screen text cannot fit on one page: {screen['title']}")


def cover(c, guide, captures, plan, count):
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(ORANGE)
    c.roundRect(52, H - 88, 222, 30, 15, fill=1, stroke=0)
    draw_text(c, 'MANUAL PASSO A PASSO', style('coverpill', 11, 15, white, True), 68, H - 66, 190)
    draw_text(c, 'Oficina Inteligente', style('coverbrand', 20, 28, HexColor('#f9ab73'), True), 52, H - 136, 620)
    draw_text(c, guide['role'], style('coverrole', 44, 53, white, True), 52, H - 180, 750, 135)
    draw_text(c, 'Telas do sistema, ações em ordem e legendas para cada controle.',
              style('coverdesc', 23, 33, HexColor('#d8e3ee')), 54, H - 345, 640, 105)
    # Use a role-specific real capture, never a stock photo or an invented mockup.
    specific = next((k for k in guide['screens'] if k not in ('login', 'password-recovery', 'home')), guide['screens'][0])
    draw_capture(c, captures[specific], (790, 190, 590, 645))
    c.setFillColor(Color(1, 1, 1, alpha=.07))
    c.roundRect(52, 188, 660, 190, 14, fill=1, stroke=0)
    draw_text(c, 'COMO LER ESTE MANUAL', style('covertiptitle', 12, 18, HexColor('#f9ab73'), True), 75, 350, 610)
    draw_text(c, '1. Abra a tela indicada no início da página.<br/>2. Siga as ações em ordem.<br/>3. Use os números sobre a captura para encontrar os campos e botões.<br/>4. Confira o resultado antes de seguir.',
              style('covertip', 17, 27, white), 75, 314, 610, 130)
    draw_text(c, 'DADOS FICTÍCIOS PARA TREINAMENTO', style('coverdemo', 13, 19, HexColor('#f9ab73'), True), 54, 140, 670)
    draw_text(c, escape(plan['capture_disclaimer']), style('coverdisclaimer', 12, 18, HexColor('#bdcbd9')),
              54, 112, 1270, 42)
    c.setFillColor(HexColor('#bdcbd9'))
    c.setFont('Guide', 10)
    c.drawString(52, 31, f'{len(guide["screens"])} telas e etapas ilustradas | Edição de treinamento')
    c.drawRightString(W - 52, 31, f'1/{count}')
    c.showPage()


def screenshot_page(c, guide, screen, capture, page, count):
    c.setFillColor(white)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(ORANGE)
    c.roundRect(44, H - 66, 115, 23, 11, fill=1, stroke=0)
    draw_text(c, f'ETAPA {page - 1:02d}', style('steppill', 10, 14, white, True), 60, H - 49, 90)
    draw_text(c, escape(screen['title']), style('pagetitle', 30, 39, NAVY, True), 44, H - 88, W - 88, 44)
    draw_text(c, '<b>Como chegar:</b> ' + escape(screen['reach']), style('reach', 14, 20, MUTED),
              46, H - 140, W - 92, 42)
    c.setFillColor(PALE)
    c.roundRect(982, 88, 414, 755, 16, fill=1, stroke=0)
    draw_capture(c, capture, (49, 109, 899, 721), screen['legend'])
    blocks, width, _ = side_layout(screen)
    top = 822
    for kind, text, sty, gap in blocks:
        if kind not in ('heading', 'step', 'note'):
            p, height = paragraph(text, sty, width - 29)
            badge(c, 1004, top - min(height / 2, 17), kind, radius=11,
                  color=ORANGE if capture['targets'].get(kind) is not None else MUTED)
            p.drawOn(c, 1025, top - height)
        else:
            height = draw_text(c, text, sty, 1003, top, width)
        top -= height + gap
    c.setFillColor(MUTED)
    c.setFont('Guide', 10)
    c.drawString(48, 79, 'CAPTURA DO APLICATIVO | DADOS FICTÍCIOS PARA TREINAMENTO')
    missing_numbers = [str(item['number']) for item in screen['legend']
                       if capture['targets'].get(str(item['number'])) is None]
    if missing_numbers:
        c.setFont('Guide', 9)
        c.drawString(48, 95, 'Legenda sem seta nesta captura: ' + ', '.join(missing_numbers) + '. Consulte as descrições ao lado.')
    footer(c, guide['role'], page, count)
    c.showPage()


def generate(plan_path=DEFAULT_PLAN, manifest_path=DEFAULT_MANIFEST, output=OUT):
    register_fonts()
    plan, captures, issues = validate_inputs(Path(plan_path), Path(manifest_path))
    # Preflight all page text before replacing any existing manuals.
    for screen in plan['screens'].values():
        side_layout(screen)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    result = []
    for guide in plan['guides']:
        target = output / guide['file']
        temporary = target.with_suffix('.tmp.pdf')
        count = 1 + len(guide['screens'])
        c = canvas.Canvas(str(temporary), pagesize=(W, H), pageCompression=1)
        c.setTitle(f"Oficina Inteligente - {guide['role']} - Passo a passo")
        c.setAuthor('Oficina Inteligente')
        c.setSubject('Manual de uso com capturas reais dos componentes e dados fictícios de treinamento')
        cover(c, guide, captures, plan, count)
        for index, key in enumerate(guide['screens'], 2):
            screenshot_page(c, guide, plan['screens'][key], captures[key], index, count)
        c.save()
        temporary.replace(target)
        result.append({'file': str(target.resolve()), 'pages': count})
    report = {'outputs': result, 'warnings': issues, 'capture_count': len(captures)}
    report_dir = ROOT / 'tmp' / 'pdfs'
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / 'screenshot-guide-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for issue in issues:
        print(f"WARNING {issue['screen']} #{issue['number']} ({issue['target_text']}): no arrow rectangle.", file=sys.stderr)
    print(json.dumps({'generated': len(result), 'pages': sum(item['pages'] for item in result),
                      'capture_count': len(captures), 'missing_targets': len(issues), 'files': result}, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, default=DEFAULT_PLAN)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--output', type=Path, default=OUT)
    args = parser.parse_args()
    generate(args.plan, args.manifest, args.output)
