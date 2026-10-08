import type { Alignment, BaseElement, FormDocument, FormElement, TableElement } from '../model';
import { attr, child, children, isTemplateNamespace, mm, parseXml, XDP_NS } from './xml';
import type { XmlNode, XmlSource } from './xml';

export function templateOf(xml: XmlSource): XmlNode {
  if (xml.root.dom.localName !== 'xdp' || xml.root.dom.namespaceURI !== XDP_NS) throw new Error('Missing XDP root namespace (http://ns.adobe.com/xdp/).');
  const template = xml.root.children.find(n => n.dom.localName === 'template' && isTemplateNamespace(n.dom.namespaceURI));
  if (!template) throw new Error('Missing XFA template packet or supported XFA template namespace.');
  return template;
}
export function isInside(node: XmlNode, name: string): boolean {
  for (let n = node.parent; n; n = n.parent) if (n.dom.localName === name) return true;
  return false;
}
function property(node: XmlNode, name: string): XmlNode | undefined {
  for (let n: XmlNode | undefined = node; n; n = n.parent) { const p = child(n, name); if (p) return p; }
}
export function offsetOf(node: XmlNode, xml: XmlSource): { x: number; y: number } {
  let x = 0, y = 0;
  for (let n = node.parent; n; n = n.parent) {
    if (n.dom.localName === 'subform') { x += mm(attr(n, 'x')); y += mm(attr(n, 'y')); }
    if (n.dom.localName === 'pageArea') return { x, y };
  }
  const area = xml.nodes.find(n => n.dom.localName === 'contentArea' && isTemplateNamespace(n.dom.namespaceURI));
  if (area) { x += mm(attr(area, 'x')); y += mm(attr(area, 'y')); }
  return { x, y };
}
function alignment(value: string): Alignment { return value === 'center' || value === 'right' ? value : 'left'; }
function deletionRisk(node: XmlNode): string | undefined {
  const safe = new Set(['draw', 'field', 'subform', 'value', 'text', 'font', 'para', 'bind', 'ui', 'textEdit', 'occur', 'border', 'edge', 'corner', 'margin', 'fill', 'color']);
  const safeAttrs = new Set(['name', 'id', 'x', 'y', 'w', 'h', 'minW', 'minH', 'maxW', 'maxH', 'layout', 'locale', 'restoreState', 'access', 'presence', 'size', 'typeface', 'weight', 'posture', 'hAlign', 'vAlign', 'match', 'ref', 'min', 'max', 'initial', 'columnWidths', 'thickness', 'stroke', 'cap', 'join', 'radius', 'value', 'multiLine', 'maxChars', 'topInset', 'bottomInset', 'leftInset', 'rightInset']);
  const visit = (n: XmlNode): boolean => !safe.has(n.dom.localName) || n.dom.namespaceURI !== node.dom.namespaceURI ||
    Array.from(n.dom.attributes).some(a => a.namespaceURI ? a.namespaceURI !== 'http://www.w3.org/2000/xmlns/' : !safeAttrs.has(a.name)) ||
    Array.from(n.dom.childNodes).some(c => c.nodeType === 7 || c.nodeType === 8) || n.children.some(visit);
  return visit(node) ? 'This imported component contains unsupported XML, metadata, or processing instructions. Deletion is protected.' : undefined;
}
function base(node: XmlNode, xml: XmlSource): BaseElement {
  const offset = offsetOf(node, xml), font = property(node, 'font'), para = property(node, 'para');
  return {
    id: `xfa-${node.start}`, name: attr(node, 'name') || node.dom.localName,
    x: mm(attr(node, 'x')) + offset.x, y: mm(attr(node, 'y')) + offset.y,
    width: mm(attr(node, 'w'), 60), height: mm(attr(node, 'h') || attr(node, 'minH'), 8),
    fontSize: font ? mm(attr(font, 'size'), 10 * 25.4 / 72) * 72 / 25.4 : 10,
    bold: !!font && attr(font, 'weight') === 'bold', align: alignment(para ? attr(para, 'hAlign') : ''),
    source: { start: node.start, end: node.end, offsetX: offset.x, offsetY: offset.y, deleteProtected: deletionRisk(node) },
  };
}
export function tableParts(node: XmlNode) {
  const rows = children(node, 'subform').filter(n => attr(n, 'layout') === 'row');
  const detail = rows.find(n => { const o = child(n, 'occur'); return o && (attr(o, 'max') === '-1' || Number(attr(o, 'max')) > 1); });
  const header = rows.find(n => n !== detail);
  if (!header || !detail || rows.length !== 2) return;
  const headCells = header.children.filter(n => n.dom.localName === 'draw' && n.dom.namespaceURI === node.dom.namespaceURI);
  const cells = children(detail, 'field');
  if (!cells.length || cells.length !== headCells.length || cells.some(c => !child(child(c, 'ui') || c, 'textEdit'))) return;
  if (headCells.some(c => !child(child(c, 'value') || c, 'text') || child(child(c, 'value')!, 'text')!.children.length)) return;
  return { header, detail, headCells, cells };
}
function table(node: XmlNode, xml: XmlSource): TableElement | undefined {
  const parts = tableParts(node); if (!parts) return;
  const { detail, header, cells, headCells } = parts;
  const widths = attr(node, 'columnWidths').trim().split(/\s+/).map(v => mm(v));
  if (widths.length !== cells.length || widths.some(w => !w)) return;
  const bind = child(detail, 'bind');
  // A table-level binding changes the scope of a relative detail reference. Preserve complex scopes as opaque.
  const outer = child(node, 'bind');
  if (outer && attr(outer, 'match') !== 'none') return;
  const b = base(node, xml), style = base(cells[0], xml);
  return { ...b, fontSize: style.fontSize, bold: style.bold, align: style.align, kind: 'table',
    height: mm(attr(header, 'h'), 9) + mm(attr(detail, 'h'), 9),
    binding: bind ? attr(bind, 'ref') : '', rowHeight: mm(attr(detail, 'h') || attr(cells[0], 'h'), 9),
    borders: !!child(cells[0], 'border') && attr(child(cells[0], 'border')!, 'presence') !== 'hidden',
    columns: cells.map((c, i) => ({ id: `col-${c.start}`, label: child(child(headCells[i], 'value')!, 'text')!.dom.textContent || '',
      binding: child(c, 'bind') ? attr(child(c, 'bind')!, 'ref') : attr(c, 'name'), width: widths[i], align: base(c, xml).align })),
  };
}
export function insertionTarget(xml: XmlSource): XmlNode | undefined {
  const template = templateOf(xml);
  return xml.nodes.find(n => n.start > template.start && n.end < template.end &&
    n.dom.namespaceURI === template.dom.namespaceURI && n.dom.localName === 'subform' &&
    !attr(n, 'use') && !attr(n, 'usehref') && (!attr(n, 'presence') || attr(n, 'presence') === 'visible') &&
    (!attr(n, 'rotate') || attr(n, 'rotate') === '0') &&
    !ancestors(n).filter(a => a.start > template.start).some(a =>
      a.dom.namespaceURI !== template.dom.namespaceURI || a.dom.localName !== 'subform' ||
      attr(a, 'use') || attr(a, 'usehref') || (attr(a, 'presence') && attr(a, 'presence') !== 'visible') ||
      (attr(a, 'rotate') && attr(a, 'rotate') !== '0')) &&
    (!attr(n, 'layout') || attr(n, 'layout') === 'position') && !isInside(n, 'pageSet') &&
    !child(n, 'occur') && !isInside(n, 'subformSet') &&
    !ancestors(n).some(a => ['table', 'row'].includes(attr(a, 'layout')) || (child(a, 'occur') && attr(child(a, 'occur')!, 'max') !== '1')));
}
function ancestors(node: XmlNode): XmlNode[] { const out: XmlNode[] = []; for (let n = node.parent; n; n = n.parent) out.push(n); return out; }
export function readXdp(xml: XmlSource, name = 'imported-form.xdp'): FormDocument {
  const template = templateOf(xml), elements: FormElement[] = [], warnings = new Set<string>();
  const skip = new Set<XmlNode>();
  const suppress = (n: XmlNode) => { skip.add(n); n.children.forEach(suppress); };
  const relevant = xml.nodes.filter(n => n.dom.namespaceURI === template.dom.namespaceURI && n.start > template.start && n.end <= template.end);
  for (const n of relevant) {
    if (skip.has(n)) continue;
    // A familiar local name inside an opaque subtree does not make that subtree editable.
    const branch = ancestors(n).filter(a => a.start > template.start);
    if (branch.some(a => a.dom.namespaceURI !== template.dom.namespaceURI || !['subform', 'pageSet', 'pageArea'].includes(a.dom.localName) || attr(a, 'use') || attr(a, 'usehref') || (attr(a, 'presence') && attr(a, 'presence') !== 'visible') || (attr(a, 'rotate') && attr(a, 'rotate') !== '0'))) continue;
    const kind = n.dom.localName;
    if (kind === 'subform' && attr(n, 'layout') === 'table') {
      const t = table(n, xml);
      const parentFlow = n.parent && ['tb', 'lr-tb', 'rl-tb', 'row', 'table'].includes(attr(n.parent, 'layout'));
      if (t && !parentFlow) elements.push(t);
      else warnings.add('A complex or flowed table is preserved but cannot be edited. Only simple positioned tables with one header and one repeating row are supported.');
      suppress(n); continue;
    }
    if (!['draw', 'field'].includes(kind)) continue;
    if (n.parent && ['tb', 'lr-tb', 'rl-tb', 'row'].includes(attr(n.parent, 'layout'))) {
      warnings.add('Direct children of flowed subforms are preserved but not editable; browser positioning cannot represent their layout safely.'); continue;
    }
    if (ancestors(n).some(a => child(a, 'occur') && (attr(child(a, 'occur')!, 'max') === '-1' || Number(attr(child(a, 'occur')!, 'max')) > 1))) {
      warnings.add('Repeating subforms outside supported tables are preserved but not editable.'); continue;
    }
    if (attr(n, 'use') || attr(n, 'usehref') || (attr(n, 'presence') && attr(n, 'presence') !== 'visible') || (attr(n, 'rotate') && attr(n, 'rotate') !== '0')) {
      warnings.add('Hidden, rotated, or referenced objects are preserved but not editable.'); continue;
    }
    const b = base(n, xml);
    if (kind === 'draw') {
      const text = child(child(n, 'value') || n, 'text');
      if (text && !text.children.length) elements.push({ ...b, kind: 'text', text: text.dom.textContent || '' });
      else warnings.add('Images, shapes, rich text, and other unsupported draws are preserved but not editable.');
    } else {
      if (child(child(n, 'ui') || n, 'textEdit')) {
        elements.push({ ...b, kind: 'field', binding: child(n, 'bind') ? attr(child(n, 'bind')!, 'ref') : '' });
        if (child(n, 'caption')) warnings.add('Field captions are preserved but are not reproduced in the browser preview.');
      } else warnings.add('Non-text fields are preserved but are not editable in this PoC.');
    }
  }
  if (relevant.some(n => ['script', 'event', 'calculate', 'validate', 'subformSet', 'exclGroup', 'proto', 'extras'].includes(n.dom.localName))) warnings.add('This form contains XFA elements not yet supported by the visual editor. They are preserved during export; scripts are never executed in the browser.');
  if (relevant.some(n => ['tb', 'lr-tb', 'rl-tb'].includes(attr(n, 'layout')))) warnings.add('Flowed ancestor placement is approximate. Existing parent layout rules remain unchanged in XDP.');
  if (!insertionTarget(xml)) warnings.add('No safe positioned body subform was found. Existing objects can be edited, but adding new objects is blocked.');
  const medium = relevant.find(n => n.dom.localName === 'medium');
  if (medium && (Math.abs(mm(attr(medium, 'short'), 210) - 210) > 1 || Math.abs(mm(attr(medium, 'long'), 297) - 297) > 1)) warnings.add('The source page is not A4 portrait. Its page settings are preserved; the editor shows an A4 guide.');
  if (relevant.filter(n => n.dom.localName === 'pageArea').length > 1) warnings.add('Multiple page areas are preserved. The single-page preview overlays supported objects and does not paginate.');
  return { name, sourceXml: xml.source, elements, page: { width: 210, height: 297, margin: 15 }, warnings: [...warnings], synthetic: xml.source.includes('FORMA_SYNTHETIC_TEMPLATE') };
}
export const parseXdp = (xml: string, name?: string) => readXdp(parseXml(xml), name);
