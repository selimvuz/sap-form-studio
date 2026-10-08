import type { BaseElement, FormDocument, FormElement, TableElement } from '../model';
import { xfaBinding, repeatBinding } from './bindings';
import { insertionTarget, offsetOf, readXdp, tableParts, templateOf } from './reader';
import { attr, child, escapeText, measure, mm, parseXml, xmlElement, XmlPatcher } from './xml';
import type { XmlNode } from './xml';

const font = (e: BaseElement) => xmlElement('font', { typeface: 'Arial', size: `${e.fontSize}pt`, weight: e.bold ? 'bold' : 'normal' });
const para = (align: string) => xmlElement('para', { hAlign: align, vAlign: 'middle' });
const border = (enabled: boolean) => xmlElement('border', { presence: enabled ? 'visible' : 'hidden' }, xmlElement('edge', { thickness: '0.3pt' }));
const value = (text: string) => xmlElement('value', {}, xmlElement('text', {}, escapeText(text)));
function tableXml(e: TableElement): string {
  if (!e.binding.trim()) throw new Error('A repeating table requires a data binding.');
  const header = e.columns.map((c, i) => xmlElement('draw', { name: `Header${i + 1}`, w: measure(c.width), h: measure(e.rowHeight) },
    value(c.label) + font({ ...e, bold: true }) + para(c.align) + border(e.borders))).join('');
  const cells = e.columns.map((c, i) => xmlElement('field', { name: `Cell${i + 1}`, w: measure(c.width), h: measure(e.rowHeight), access: 'readOnly' },
    xmlElement('ui', {}, xmlElement('textEdit', {})) + font(e) + para(c.align) + value('') +
    xmlElement('bind', { match: 'dataRef', ref: xfaBinding(c.binding, true) }) + border(e.borders))).join('');
  return xmlElement('bind', { match: 'none' }) +
    xmlElement('subform', { name: 'HeaderRow', layout: 'row', h: measure(e.rowHeight) }, xmlElement('bind', { match: 'none' }) + header) +
    xmlElement('subform', { name: 'DetailRow', layout: 'row', h: measure(e.rowHeight) },
      xmlElement('occur', { min: '0', max: '-1', initial: '1' }) + xmlElement('bind', { match: 'dataRef', ref: repeatBinding(e.binding) }) + cells);
}
export function elementXml(e: FormElement, namespace: string, offset = { x: 0, y: 0 }): string {
  const attrs: Record<string, string> = { xmlns: namespace, name: e.name, x: measure(e.x - offset.x), y: measure(e.y - offset.y), w: measure(e.width) };
  if (e.kind === 'table') return xmlElement('subform', { ...attrs, layout: 'table', columnWidths: e.columns.map(c => measure(c.width)).join(' ') }, tableXml(e));
  attrs.h = measure(e.height);
  if (e.kind === 'text') return xmlElement('draw', attrs, value(e.text) + font(e) + para(e.align));
  return xmlElement('field', { ...attrs, access: 'readOnly' }, xmlElement('ui', {}, xmlElement('textEdit', {})) + font(e) + para(e.align) + value('') +
    xmlElement('bind', { match: e.binding ? 'dataRef' : 'none', ...(e.binding ? { ref: xfaBinding(e.binding) } : {}) }));
}
function updateBase(p: XmlPatcher, n: XmlNode, old: BaseElement, now: BaseElement, geometry = true) {
  if (old.name !== now.name) p.setAttr(n, 'name', now.name);
  if (geometry) {
    const mapping = { x: 'x', y: 'y', width: 'w', height: 'h' } as const;
    for (const key of Object.keys(mapping) as (keyof typeof mapping)[]) if (old[key] !== now[key]) {
      let number = now[key];
      if (key === 'x') number -= old.source?.offsetX || 0;
      if (key === 'y') number -= old.source?.offsetY || 0;
      p.setAttr(n, mapping[key], measure(number));
    }
  }
  const f: Record<string, string> = {};
  if (old.fontSize !== now.fontSize) f.size = `${now.fontSize}pt`;
  if (old.bold !== now.bold) f.weight = now.bold ? 'bold' : 'normal';
  if (Object.keys(f).length) p.property(n, 'font', f);
  if (old.align !== now.align) p.property(n, 'para', { hAlign: now.align });
}
function updateTable(p: XmlPatcher, n: XmlNode, old: TableElement, now: TableElement) {
  const parts = tableParts(n); if (!parts) throw new Error('This table structure cannot be changed safely.');
  if (old.columns.length !== now.columns.length) throw new Error('Changing the number of columns on an imported table is not supported. Create a new table instead.');
  if (old.binding !== now.binding && !now.binding.trim()) throw new Error('A repeating table requires a data binding.');
  if (old.binding !== now.binding) p.property(parts.detail, 'bind', { match: 'dataRef', ref: repeatBinding(now.binding) });
  if (old.columns.some((c, i) => c.width !== now.columns[i].width)) p.setAttr(n, 'columnWidths', now.columns.map(c => measure(c.width)).join(' '));
  if (old.rowHeight !== now.rowHeight) [parts.header, parts.detail].forEach(row => p.setAttr(row, 'h', measure(now.rowHeight)));
  now.columns.forEach((c, i) => {
    const previous = old.columns[i], h = parts.headCells[i], cell = parts.cells[i];
    if (previous.label !== c.label) p.setText(child(child(h, 'value')!, 'text')!, c.label);
    if (previous.binding !== c.binding) p.property(cell, 'bind', { match: 'dataRef', ref: xfaBinding(c.binding, true) });
    for (const target of [h, cell]) {
      if (previous.width !== c.width) p.setAttr(target, 'w', measure(c.width));
      if (old.rowHeight !== now.rowHeight) p.setAttr(target, 'h', measure(now.rowHeight));
      if (previous.align !== c.align) p.property(target, 'para', { hAlign: c.align });
      if (old.fontSize !== now.fontSize) p.property(target, 'font', { size: `${now.fontSize}pt` });
      if (old.bold !== now.bold && target === cell) p.property(target, 'font', { weight: now.bold ? 'bold' : 'normal' });
      if (old.borders !== now.borders) {
        if (child(target, 'border')) p.property(target, 'border', { presence: now.borders ? 'visible' : 'hidden' });
        else p.append(target, xmlElement('border', { xmlns: target.dom.namespaceURI!, presence: now.borders ? 'visible' : 'hidden' }, xmlElement('edge', { thickness: '0.3pt' })));
      }
    }
  });
}
/** Compatibility is always conservative. Turning off the badge never regenerates unknown XML. */
export function serializeXdp(doc: FormDocument, _compatibility = true): string {
  const xml = parseXml(doc.sourceXml), baseline = readXdp(xml, doc.name), template = templateOf(xml), p = new XmlPatcher(xml);
  const byId = new Map(baseline.elements.map(e => [e.id, e])), current = new Map(doc.elements.map(e => [e.id, e]));
  if (current.size !== doc.elements.length) throw new Error('Duplicated element IDs must be resolved before export.');
  for (const previous of baseline.elements) {
    const now = current.get(previous.id), node = xml.nodes.find(n => n.start === previous.source!.start)!;
    if (!now) {
      if (previous.source?.deleteProtected) throw new Error(previous.source.deleteProtected);
      p.remove(node); continue;
    }
    if (now.kind !== previous.kind) throw new Error('Changing an imported component type is not supported.');
    // Table height belongs to its rows; setting a container height would constrain repetition.
    updateBase(p, node, previous, now.kind === 'table' ? { ...now, height: previous.height } : now);
    if (now.kind === 'text' && previous.kind === 'text' && now.text !== previous.text) p.setText(child(child(node, 'value')!, 'text')!, now.text);
    if (now.kind === 'field' && previous.kind === 'field' && now.binding !== previous.binding) p.property(node, 'bind', { match: now.binding ? 'dataRef' : 'none', ref: xfaBinding(now.binding) });
    if (now.kind === 'table' && previous.kind === 'table') updateTable(p, node, previous, now);
  }
  const fresh = doc.elements.filter(e => !byId.has(e.id));
  if (fresh.length) {
    const target = insertionTarget(xml);
    if (!target) throw new Error('Adding objects requires a positioned body subform; no safe target was found in this form.');
    const offset = offsetOf(target, xml);
    // The insertion point is inside target, so its own position also contributes to the origin.
    const targetBase = baseline.elements.find(e => e.source && xml.nodes.find(n => n.start === e.source!.start)?.parent === target);
    const origin = targetBase ? { x: targetBase.source!.offsetX, y: targetBase.source!.offsetY } : childOrigin(target, offset);
    p.append(target, fresh.map(e => elementXml(e, template.dom.namespaceURI!, origin)).join(''));
  }
  const out = p.result();
  templateOf(parseXml(out));
  return out;
}
const childOrigin = (n: XmlNode, offset: { x: number; y: number }) => ({ x: offset.x + mm(attr(n, 'x')), y: offset.y + mm(attr(n, 'y')) });
