import { describe, expect, it } from 'vitest';
import type { TableElement, TextElement } from '../src/model';
import { baseElement } from '../src/model';
import { createDocument, parseXdp, readXmlFile, serializeXdp, validateDocument } from '../src/xdp';
import { parseXsd } from '../src/xsd';
import invoiceSchema from '../public/samples/invoice.xsd?raw';

const ns = 'http://www.xfa.org/schema/xfa-template/3.3/';
const draw = (attrs = '') => `<draw name="Label" x="5mm" y="8mm" w="60mm" h="9mm" ${attrs}><value><text>Original</text></value></draw>`;
const xdp = (body: string) => `<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/" xmlns:vendor="urn:vendor"><template xmlns="${ns}"><subform name="Body" layout="position" x="6mm" y="7mm">${body}</subform></template><vendor:packet alpha='one'><!--untouched--><![CDATA[<keep/>]]></vendor:packet></xdp:xdp>`;
const tableOf = (document: ReturnType<typeof createDocument>) => document.elements.find(e => e.kind === 'table') as TableElement;

describe('independent preservation and binding edge cases', () => {
  it('protects unknown unqualified metadata attributes when deleting an imported component', () => {
    const source = xdp(draw('customMetadata="retain-me"'));
    const document = parseXdp(source);
    expect(document.elements).toHaveLength(1);
    document.elements = [];
    expect(() => serializeXdp(document)).toThrow(/protect|unsupported|metadata/i);
  });

  it('treats XFA-like elements inside an opaque vendor packet as opaque', () => {
    const source = xdp(`<vendor:metadata>${draw()}</vendor:metadata>`);
    const document = parseXdp(source);
    expect(document.elements).toHaveLength(0);
    expect(serializeXdp(document)).toBe(source);
  });

  it('keeps prototype content outside the editable visual tree', () => {
    const source = xdp(`<proto>${draw()}</proto>`);
    const document = parseXdp(source);
    expect(document.elements).toHaveLength(0);
    expect(serializeXdp(document)).toBe(source);
  });

  it('preserves unknown attributes and packets through several supported edits', () => {
    const source = xdp(draw('customMetadata="retain-me" vendor:label="keep &amp; escaped"'));
    const document = parseXdp(source);
    const element = document.elements[0] as TextElement;
    element.x += 2;
    element.fontSize = 17;
    element.bold = true;
    element.align = 'right';
    element.text = 'New & safe';
    const output = serializeXdp(document);
    expect(output).toContain('customMetadata="retain-me" vendor:label="keep &amp; escaped"');
    expect(output).toContain("<vendor:packet alpha='one'><!--untouched--><![CDATA[<keep/>]]></vendor:packet>");
    const reread = parseXdp(output).elements[0] as TextElement;
    expect(reread).toMatchObject({ x: 13, y: 15, fontSize: 17, bold: true, align: 'right', text: 'New & safe' });
  });

  it('uses the positioned insertion parent origin even without existing visual objects', () => {
    const document = parseXdp(xdp(''));
    const added: TextElement = { ...baseElement('text', 30, 40), kind: 'text', name: 'Added', text: 'Positioned' };
    document.elements.push(added);
    const output = serializeXdp(document);
    expect(output).toContain('x="24mm" y="33mm"');
    expect(parseXdp(output).elements[0]).toMatchObject({ x: 30, y: 40, name: 'Added' });
  });

  it.each(['proto', 'vendor:metadata'])('skips insertion subforms inside %s before the actual body', opaqueTag => {
    const opaque = `<${opaqueTag}><subform name="OpaqueTarget" layout="position">${draw()}</subform></${opaqueTag}>`;
    const source = `<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/" xmlns:vendor="urn:vendor"><template xmlns="${ns}">${opaque}<subform name="RealBody" layout="position"/></template></xdp:xdp>`;
    const document = parseXdp(source);
    document.elements.push({ ...baseElement('text', 30, 40), kind: 'text', name: 'Added', text: 'Insert into body' });
    const output = serializeXdp(document);
    expect(output).toContain(opaque);
    const dom = new DOMParser().parseFromString(output, 'application/xml');
    const inserted = [...dom.getElementsByTagNameNS(ns, 'draw')].find(node => node.getAttribute('name') === 'Added');
    expect(inserted?.parentElement?.getAttribute('name')).toBe('RealBody');
    expect(parseXdp(output).elements).toHaveLength(1);
  });

  it('blocks insertion when the only positioned subform is opaque prototype content', () => {
    const source = `<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="${ns}"><proto><subform name="OpaqueTarget" layout="position"/></proto></template></xdp:xdp>`;
    const document = parseXdp(source);
    document.elements.push({ ...baseElement('text'), kind: 'text', name: 'Added', text: 'Must not modify prototype' });
    expect(() => serializeXdp(document)).toThrow(/safe target|positioned body/i);
  });

  it.each(['', ' h="77mm"'])('resizes table rows while preserving its original container height (%s)', originalHeight => {
    const initial = createDocument();
    const source = initial.sourceXml.replace('<subform name="ItemsTable" layout="table"', `<subform name="ItemsTable" layout="table"${originalHeight}`);
    const document = parseXdp(source);
    const table = tableOf(document);
    table.rowHeight = 15;
    table.height = 30;
    const output = serializeXdp(document);
    const dom = new DOMParser().parseFromString(output, 'application/xml');
    const outer = [...dom.getElementsByTagNameNS(ns, 'subform')].find(node => node.getAttribute('name') === 'ItemsTable')!;
    expect(outer.getAttribute('h')).toBe(originalHeight ? '77mm' : null);
    const rows = [...outer.children].filter(node => node.localName === 'subform');
    expect(rows.map(row => row.getAttribute('h'))).toEqual(['15mm', '15mm']);
    for (const row of rows) {
      const cells = [...row.children].filter(node => ['field', 'draw'].includes(node.localName));
      expect(cells.every(cell => cell.getAttribute('h') === '15mm')).toBe(true);
    }
    expect(tableOf(parseXdp(output))).toMatchObject({ rowHeight: 15, height: 30 });
  });

  it('inserts new formatting in the XFA namespace under a prefixed-only template', () => {
    const source = `<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/" xmlns:xfa="${ns}"><xfa:template><xfa:subform name="Body" layout="position"><xfa:draw name="Label" w="60mm" h="9mm"><xfa:value><xfa:text>Original</xfa:text></xfa:value></xfa:draw></xfa:subform></xfa:template></xdp:xdp>`;
    const document = parseXdp(source);
    document.elements[0].fontSize = 18;
    document.elements[0].align = 'right';
    const output = serializeXdp(document);
    const dom = new DOMParser().parseFromString(output, 'application/xml');
    expect(dom.getElementsByTagNameNS(ns, 'font')[0]?.getAttribute('size')).toBe('18pt');
    expect(dom.getElementsByTagNameNS(ns, 'para')[0]?.getAttribute('hAlign')).toBe('right');
    expect(dom.getElementsByTagNameNS('', 'font')).toHaveLength(0);
  });

  it('does not approve a row-relative binding solely because it exists at record root', () => {
    const document = createDocument();
    const table = tableOf(document);
    table.columns[0].binding = '$.HEADER.VBELN';
    const issues = validateDocument(document, parseXsd(invoiceSchema));
    expect(issues.some(issue => issue.elementId === table.id && /Unresolved data binding.*HEADER\.VBELN/.test(issue.message))).toBe(true);
  });

  it('blocks an empty table binding rather than emitting a standalone wildcard', () => {
    const document = createDocument();
    const table = tableOf(document);
    table.binding = '';
    const issues = validateDocument(document, parseXsd(invoiceSchema));
    expect(issues.some(issue => issue.elementId === table.id && issue.severity === 'error' && /binding/i.test(issue.message))).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity])('blocks non-finite component dimensions (%s)', value => {
    const document = createDocument();
    document.elements[0].x = value;
    expect(validateDocument(document).some(issue => issue.severity === 'error' && /dimensions/.test(issue.message))).toBe(true);
  });

  it('blocks non-finite table row and column measurements', () => {
    const document = createDocument();
    const table = tableOf(document);
    table.rowHeight = Infinity;
    table.columns[0].width = NaN;
    const errors = validateDocument(document).filter(issue => issue.severity === 'error');
    expect(errors.some(issue => /row height/.test(issue.message))).toBe(true);
    expect(errors.some(issue => /Column widths/.test(issue.message))).toBe(true);
  });

  it('preserves UTF-8 XML text and its BOM on import', async () => {
    const source = '\uFEFF<?xml version="1.0" encoding="UTF-8"?>' + xdp(draw()).replace('Original', 'Büro &amp; café');
    const bytes = new TextEncoder().encode(source);
    const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File;
    expect(await readXmlFile(file)).toBe(source);
  });

  it('rejects conflicting non-UTF-8 declarations even when all actual bytes are ASCII', async () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?>' + xdp(draw()));
    const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File;
    await expect(readXmlFile(file)).rejects.toThrow(/declares ISO-8859-1/);
  });

  it.each([new Uint8Array([0xc3, 0x28]), new Uint8Array([0xff, 0xfe, 0x3c, 0x00])])('rejects invalid UTF-8 byte streams', async bytes => {
    const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File;
    await expect(readXmlFile(file)).rejects.toThrow(/requires UTF-8/);
  });
});
