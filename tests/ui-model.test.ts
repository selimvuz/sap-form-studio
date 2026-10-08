import { describe, expect, it } from 'vitest';
import { createDocument, parseXdp, serializeXdp } from '../src/xdp';
import { parseXsd } from '../src/xsd';
import { readProject, type Project } from '../src/components/project';
import { resolveTableCell } from '../src/components/Canvas';
import fixture from './fixtures/preservation.xdp?raw';

function project(): Project {
  return { format: 'sap-form-studio', version: 1, document: createDocument(), schemaName: '', sampleName: '', sample: {} };
}
describe('Working project restoration', () => {
  it('retains edited layout and exact untouched XDP on a project save/open round trip', () => {
    const saved = project();
    saved.document = parseXdp(fixture, 'input.xdp');
    const title = saved.document.elements.find(e => e.kind === 'text');
    if (title?.kind !== 'text') throw new Error('Expected static text fixture');
    title.text = 'Edited in the working project';
    const exported = serializeXdp(saved.document);
    const restored = readProject(JSON.stringify(saved));
    expect(serializeXdp(restored.document)).toBe(exported);
    expect(restored.document.sourceXml).toBe(fixture);
  });
  it('rejects malformed fields before they can reach the renderer', () => {
    const saved = project();
    const field = saved.document.elements.find(e => e.kind === 'field')!;
    (field as unknown as Record<string, unknown>).binding = null;
    expect(() => readProject(JSON.stringify(saved))).toThrow('field binding must be text');
  });
  it('rejects duplicate object IDs', () => {
    const saved = project();
    saved.document.elements.push({ ...saved.document.elements[0] });
    expect(() => readProject(JSON.stringify(saved))).toThrow('unique');
  });
  it('rebuilds source references and synthetic status from the original XML', () => {
    const saved = project();
    const original = saved.document.elements[0].source;
    saved.document.elements[0].source = { start: 0, end: 1, offsetX: 999, offsetY: 999 };
    saved.document.synthetic = false;
    const restored = readProject(JSON.stringify(saved));
    expect(restored.document.elements[0].source).toEqual(original);
    expect(restored.document.synthetic).toBe(true);
  });
  it('rebuilds the schema tree from its XML, preserving namespaces and bindings', () => {
    const saved = project();
    saved.schema = parseXsd('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="FORM_DATA"><xs:complexType><xs:sequence><xs:element name="VALUE" type="xs:string"/></xs:sequence></xs:complexType></xs:element></xs:schema>');
    saved.schema.roots = [];
    const restored = readProject(JSON.stringify(saved));
    expect(restored.schema?.roots[0].children[0].path).toBe('VALUE');
  });
});
describe('Table preview binding scope', () => {
  const data = { HEADER: { VBELN: '900001' }, ITEMS: [{ MATNR: 'MAT-A', FKIMG: 0 }, { MATNR: 'MAT-B', FKIMG: 2 }] };
  it('resolves relative detail fields and keeps numeric zero', () => {
    expect(resolveTableCell(data, data.ITEMS[0], '$.MATNR', '$record.ITEMS[*]', 0)).toBe('MAT-A');
    expect(resolveTableCell(data, data.ITEMS[0], 'FKIMG', '$record.ITEMS[*]', 0)).toBe(0);
    expect(resolveTableCell(data, data.ITEMS[1], 'ITEMS.MATNR', '$record.ITEMS[*]', 1)).toBe('MAT-B');
  });
  it('resolves global record fields using the full sample dataset', () => {
    expect(resolveTableCell(data, data.ITEMS[1], '$record.HEADER.VBELN', '$record.ITEMS[*]', 1)).toBe('900001');
    expect(resolveTableCell(data, data.ITEMS[1], '$record.ITEMS[*].MATNR', '$record.ITEMS[*]', 1)).toBe('MAT-B');
  });
});
