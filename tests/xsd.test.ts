import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSchema, parseXsd } from '../src/xsd';

const wrap = (inner: string, attributes = '') => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" ${attributes}>${inner}</xs:schema>`;
const fixture = readFileSync(resolve('public/samples/invoice.xsd'), 'utf8');

describe('XSD data model', () => {
  it('loads the invoice header and repeated items with root-relative paths', () => {
    const schema = parseXsd(fixture);
    const nodes = flattenSchema(schema.roots);
    expect(schema.warnings).toEqual([]);
    expect(schema.roots[0]).toMatchObject({ name: 'FORM_DATA', path: '', type: 'complex' });
    expect(nodes.find(node => node.path === 'HEADER.FKDAT')).toMatchObject({ type: 'date', repeating: false });
    expect(nodes.find(node => node.path === 'ITEMS')).toMatchObject({ repeating: true, optional: true, maxOccurs: 'unbounded' });
    expect(nodes.find(node => node.path === 'ITEMS.NETWR')).toMatchObject({ type: 'decimal', repeating: false });
  });

  it('resolves namespace-qualified named types, global refs, simple restrictions and inheritance', () => {
    const schema = parseXsd(wrap(`
      <xs:element name="FORM_DATA" type="tns:Extended"/>
      <xs:element name="CODE" type="tns:CodeType"/>
      <xs:simpleType name="CodeType"><xs:restriction base="xs:string"><xs:maxLength value="10"/></xs:restriction></xs:simpleType>
      <xs:complexType name="Base"><xs:sequence><xs:element ref="tns:CODE" minOccurs="0"/></xs:sequence></xs:complexType>
      <xs:complexType name="Extended"><xs:complexContent><xs:extension base="tns:Base"><xs:sequence><xs:element name="TOTAL" type="xs:decimal"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType>
    `, 'targetNamespace="urn:invoice" xmlns:tns="urn:invoice"'));
    expect(schema.roots[0].children.map(node => node.path)).toEqual(['CODE', 'TOTAL']);
    expect(schema.roots[0].children[0]).toMatchObject({ type: 'string', optional: true });
  });

  it('retains nested repeating nodes and warns about unsupported choices and imports', () => {
    const schema = parseXsd(wrap(`
      <xs:import namespace="urn:other" schemaLocation="https://invalid.example/schema.xsd"/>
      <xs:element name="FORM_DATA"><xs:complexType><xs:sequence>
        <xs:element name="ORDERS" maxOccurs="unbounded"><xs:complexType><xs:sequence>
          <xs:element name="LINES" maxOccurs="unbounded"><xs:complexType><xs:choice>
            <xs:element name="CODE" type="xs:string"/><xs:element name="TEXT" type="xs:string"/>
          </xs:choice></xs:complexType></xs:element>
        </xs:sequence></xs:complexType></xs:element>
      </xs:sequence></xs:complexType></xs:element>`));
    const orders = schema.roots[0].children[0];
    expect(orders.repeating).toBe(true);
    expect(orders.children[0]).toMatchObject({ path: 'ORDERS.LINES', repeating: true });
    expect(orders.children[0].children[0].optional).toBe(true);
    expect(schema.warnings.some(warning => warning.includes('not loaded'))).toBe(true);
    expect(schema.warnings.some(warning => warning.includes('Choice'))).toBe(true);
  });

  it('handles model groups and repeated compositors', () => {
    const schema = parseXsd(wrap(`
      <xs:group name="Details"><xs:sequence><xs:element name="VALUE" type="xs:string"/></xs:sequence></xs:group>
      <xs:element name="FORM_DATA"><xs:complexType><xs:sequence maxOccurs="3"><xs:group ref="Details" minOccurs="0"/></xs:sequence></xs:complexType></xs:element>`));
    expect(schema.roots[0].children[0]).toMatchObject({ name: 'VALUE', repeating: true, optional: true, maxOccurs: 3 });
  });

  it('stops recursive named types without losing their parent nodes', () => {
    const schema = parseXsd(wrap(`<xs:element name="FORM_DATA" type="Node"/><xs:complexType name="Node"><xs:sequence><xs:element name="CHILD" type="Node" minOccurs="0"/></xs:sequence></xs:complexType>`));
    expect(schema.roots[0].children[0].children).toEqual([]);
    expect(schema.warnings.some(warning => warning.includes('Recursive'))).toBe(true);
  });

  it('rejects malformed XML, non-schema XML, missing roots and DTD/entity declarations', () => {
    expect(() => parseXsd('<broken>')).toThrow(/well-formed/);
    expect(() => parseXsd('<hello/>')).toThrow(/not an XML Schema/);
    expect(() => parseXsd(wrap(''))).toThrow(/no global root/);
    expect(() => parseXsd('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///secret">]><foo>&x;</foo>')).toThrow(/DTDs/);
  });
});
