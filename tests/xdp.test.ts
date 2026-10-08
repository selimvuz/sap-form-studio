import { describe, expect, it } from 'vitest';
import { baseElement, type FieldElement, type FormDocument, type TableElement, type TextElement } from '../src/model';
import { createDocument, parseXdp, serializeXdp, validateDocument } from '../src/xdp';
import fixture from './fixtures/preservation.xdp?raw';

const TEMPLATE_NS = 'http://www.xfa.org/schema/xfa-template/3.3/';
const opaquePacket = fixture.slice(fixture.indexOf('  <vendor:opaque'), fixture.indexOf('\n  <x:xmpmeta'));
const tailPackets = fixture.slice(fixture.indexOf('  <config'));
function xml(source: string) {
  const result = new DOMParser().parseFromString(source, 'application/xml');
  expect(result.getElementsByTagName('parsererror').length).toBe(0);
  return result;
}
function named(source: string, localName: string, name: string) {
  const result = [...xml(source).getElementsByTagNameNS(TEMPLATE_NS, localName)].find(n => n.getAttribute('name') === name);
  expect(result, `Expected XFA ${localName} named ${name}`).toBeDefined();
  return result!;
}
function title(doc: FormDocument): TextElement {
  const result = doc.elements.find(e => e.kind === 'text' && e.name === 'Title');
  expect(result).toBeDefined();
  return result as TextElement;
}
function field(name = 'AddedField', binding = '$.HEADER.KUNNR'): FieldElement {
  return { ...baseElement('field', 25, 50), kind: 'field', name, binding };
}
function table(): TableElement {
  return {
    ...baseElement('table', 25, 90), kind: 'table', name: 'AddedItems', binding: '$.ITEMS[*]',
    width: 130, height: 20, rowHeight: 10, borders: true,
    columns: [
      { id: 'col-posnr', label: 'Position', binding: 'POSNR', width: 30, align: 'left' },
      { id: 'col-arktx', label: 'Description', binding: 'ARKTX', width: 100, align: 'left' },
    ],
  };
}
function prefixedFixture() {
  const dom = new DOMParser().parseFromString(fixture, 'application/xml');
  const template = dom.getElementsByTagNameNS(TEMPLATE_NS, 'template')[0];
  const fragment = new XMLSerializer().serializeToString(template);
  const prefixed = fragment
    .replace(/(<\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, '$1xfa:$2')
    .replace(`xmlns="${TEMPLATE_NS}"`, `xmlns:xfa="${TEMPLATE_NS}"`);
  const start = fixture.indexOf('  <template');
  const end = fixture.indexOf('</template>', start) + '</template>'.length;
  return fixture.slice(0, start) + '  ' + prefixed + fixture.slice(end);
}

describe('XDP conservative round-trip', () => {
  it('returns the complete unchanged source text including unknown XML', () => {
    const document = parseXdp(fixture, 'preservation.xdp');
    expect(serializeXdp(document)).toBe(fixture);
    expect(document.sourceXml).toBe(fixture);
    expect(title(document).text).toBe('Before & after');
  });

  it('retains CRLF line endings for a no-op export', () => {
    const source = fixture.replace(/\r?\n/g, '\r\n');
    expect(serializeXdp(parseXdp(source))).toBe(source);
  });

  it('changes plain text without rewriting unrelated packets, attributes, or processing instructions', () => {
    const document = parseXdp(fixture);
    title(document).text = 'Changed & <still text>';
    const result = serializeXdp(document, true);
    expect(result).toBe(fixture.replace('Before &amp; after', 'Changed &amp; &lt;still text&gt;'));
    expect(result).toContain(opaquePacket);
    expect(result.endsWith(tailPackets)).toBe(true);
    expect(result).toContain('<?xfa generator="Synthetic_Preservation_Test"');
    expect(result).toContain('<?templateDesigner expand 1?>');
    expect(result).toContain("x='5mm'");
    expect(document.sourceXml).toBe(fixture);
    xml(result);
  });

  it('adds an explicitly bound field while preserving the original unknown packets', () => {
    const document = parseXdp(fixture);
    document.elements.push(field());
    const result = serializeXdp(document);
    const added = named(result, 'field', 'AddedField');
    expect(added.getElementsByTagNameNS(TEMPLATE_NS, 'bind')[0].getAttribute('match')).toBe('dataRef');
    expect(added.getElementsByTagNameNS(TEMPLATE_NS, 'bind')[0].getAttribute('ref')).toBe('$.HEADER.KUNNR');
    expect(result.endsWith(tailPackets)).toBe(true);
    expect(result).toContain(opaquePacket);
    expect(parseXdp(result).elements.some(e => e.kind === 'field' && e.name === 'AddedField')).toBe(true);
  });

  it('writes a simple table with a bound, unbounded detail row and XFA namespaces', () => {
    const document = parseXdp(fixture);
    document.elements.push(table());
    const result = serializeXdp(document);
    const added = named(result, 'subform', 'AddedItems');
    expect(added.getAttribute('layout')).toBe('table');
    expect(added.getAttribute('columnWidths')).toBe('30mm 100mm');
    const rows = [...added.getElementsByTagNameNS(TEMPLATE_NS, 'subform')].filter(n => n.getAttribute('layout') === 'row');
    expect(rows).toHaveLength(2);
    const detail = rows.find(n => n.getElementsByTagNameNS(TEMPLATE_NS, 'occur')[0]?.getAttribute('max') === '-1');
    expect(detail).toBeDefined();
    expect(detail!.getElementsByTagNameNS(TEMPLATE_NS, 'field')).toHaveLength(2);
    expect([...detail!.children].find(n => n.localName === 'bind')?.getAttribute('ref')).toContain('ITEMS');
    expect(result.endsWith(tailPackets)).toBe(true);
    expect(parseXdp(result).elements.some(e => e.kind === 'table')).toBe(true);
  });

  it('round-trips prefixed templates and preserves their namespace during edits/additions', () => {
    const source = prefixedFixture();
    const document = parseXdp(source);
    expect(serializeXdp(document)).toBe(source);
    title(document).text = 'Prefix preserved';
    document.elements.push(field('PrefixedField'));
    const result = serializeXdp(document);
    expect(named(result, 'field', 'PrefixedField').namespaceURI).toBe(TEMPLATE_NS);
    expect(named(result, 'draw', 'Title').getElementsByTagNameNS(TEMPLATE_NS, 'text')[0].textContent).toBe('Prefix preserved');
    expect(result.endsWith(tailPackets)).toBe(true);
  });

  it('keeps nested coordinates relative to their original parent when moving an object', () => {
    const document = parseXdp(fixture);
    const nested = document.elements.find(e => e.name === 'NestedText')!;
    expect(nested).toBeDefined();
    expect(nested.source).toBeDefined();
    expect(nested.x - nested.source!.offsetX).toBeCloseTo(5);
    expect(nested.y - nested.source!.offsetY).toBeCloseTo(8);
    expect(nested.source!.offsetX).toBeGreaterThan(0);
    nested.x += 10;
    nested.y += 2;
    const moved = named(serializeXdp(document), 'draw', 'NestedText');
    expect(moved.getAttribute('x')).toBe('15mm');
    expect(moved.getAttribute('y')).toBe('10mm');
  });

  it('escapes new text and attributes so they cannot become XML markup', () => {
    const document = parseXdp(fixture);
    const payload = '</text><script>bad()</script>&"\'';
    title(document).text = payload;
    const added = field('Escaped " name & value', '$.HEADER.VALUE["a&b"]');
    document.elements.push(added);
    const result = serializeXdp(document);
    const dom = xml(result);
    expect(dom.getElementsByTagNameNS('*', 'script')).toHaveLength(0);
    expect(named(result, 'draw', 'Title').getElementsByTagNameNS(TEMPLATE_NS, 'text')[0].textContent).toBe(payload);
    const outputField = named(result, 'field', added.name);
    expect(outputField.getAttribute('name')).toBe(added.name);
    expect(outputField.getElementsByTagNameNS(TEMPLATE_NS, 'bind')[0].getAttribute('ref')).toBe(added.binding);
  });

  it('warns about unsupported visual content but retains it after a supported edit', () => {
    const document = parseXdp(fixture);
    expect(document.warnings.length).toBeGreaterThan(0);
    title(document).text = 'Supported change';
    const result = serializeXdp(document);
    expect(named(result, 'draw', 'UnsupportedImage').getElementsByTagNameNS(TEMPLATE_NS, 'image')[0].textContent).toBe('AA==');
  });

  it('retains comments and processing instructions inside an edited text value', () => {
    const source = fixture.replace('Before &amp; after', '<!--keep-inline--><?keep instruction?>Before &amp; after');
    const document = parseXdp(source);
    title(document).text = 'Changed';
    const result = serializeXdp(document);
    expect(result).toContain('<!--keep-inline--><?keep instruction?>Changed');
    xml(result);
  });

  it('can change CDATA text while leaving unrelated CDATA unchanged', () => {
    const source = fixture.replace('Before &amp; after', '<![CDATA[Before & after]]>');
    const document = parseXdp(source);
    expect(title(document).text).toBe('Before & after');
    title(document).text = 'CDATA terminator ]]> stays text';
    const result = serializeXdp(document);
    expect(named(result, 'draw', 'Title').getElementsByTagNameNS(TEMPLATE_NS, 'text')[0].textContent).toBe('CDATA terminator ]]> stays text');
    expect(result).toContain(opaquePacket);
  });

  it('safely expands a self-closing text value when adding text', () => {
    const source = fixture.replace('<text xliff:rid="keep-translation-key">Before &amp; after</text>', '<text xliff:rid="keep-translation-key"/>');
    const document = parseXdp(source);
    title(document).text = 'Now populated';
    const result = serializeXdp(document);
    const outputText = named(result, 'draw', 'Title').getElementsByTagNameNS(TEMPLATE_NS, 'text')[0];
    expect(outputText.textContent).toBe('Now populated');
    expect(outputText.getAttributeNS('urn:oasis:names:tc:xliff:document:1.1', 'rid')).toBe('keep-translation-key');
  });

  it('blocks deleting an imported component that contains unknown metadata', () => {
    const document = parseXdp(fixture);
    const target = title(document);
    expect(target.source?.deleteProtected).toBeTruthy();
    document.elements = document.elements.filter(e => e.id !== target.id);
    expect(() => serializeXdp(document, true)).toThrow(/protect|unsupported|metadata/i);
    expect(document.sourceXml).toBe(fixture);
  });
});

describe('XDP validation boundaries', () => {
  it('creates a well-formed synthetic document without claiming ADS validation', () => {
    const document = createDocument();
    expect(document.synthetic).toBe(true);
    const result = serializeXdp(document);
    expect(xml(result).getElementsByTagNameNS(TEMPLATE_NS, 'template')).toHaveLength(1);
  });

  it.each([
    '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template></xdp:xdp>',
    '<xdp:xdp><template/></xdp:xdp>',
    '',
  ])('rejects malformed or unbound-prefix XML without replacing source (%s)', source => {
    expect(() => parseXdp(source)).toThrow();
  });

  it('rejects DTD/entity declarations rather than resolving external entities', () => {
    const source = '<!DOCTYPE xdp [<!ENTITY external SYSTEM "file:///private">]>' + fixture;
    expect(() => parseXdp(source)).toThrow(/DTD|entity|Invalid XML/i);
  });

  it('rejects an XDP without an XFA template packet', () => {
    expect(() => parseXdp('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><unknown xmlns="urn:test"/></xdp:xdp>')).toThrow(/template/i);
  });

  it('reports duplicated model IDs before export', () => {
    const document = parseXdp(fixture);
    document.elements[1].id = document.elements[0].id;
    expect(validateDocument(document).some(issue => issue.severity === 'error' && /duplicat/i.test(issue.message))).toBe(true);
  });
});
