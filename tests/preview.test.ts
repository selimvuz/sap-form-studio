import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableRows, normalizeBinding, parseSampleData, resolveBinding } from '../src/preview';

const json = readFileSync(resolve('public/samples/invoice-data.json'), 'utf8');
const xml = readFileSync(resolve('public/samples/invoice-data.xml'), 'utf8');

describe('sample data and binding preview', () => {
  it('unwraps the FORM_DATA record from JSON and preserves all rows', () => {
    const data = parseSampleData(json, 'invoice.json');
    expect(resolveBinding(data, '$record.HEADER.VBELN')).toBe('INV-2026-0042');
    expect(resolveBinding(data, '$record.FORM_DATA.HEADER.VBELN')).toBe('INV-2026-0042');
    const rows = getTableRows(data, '$record.ITEMS[*]');
    expect(rows).toHaveLength(3);
    expect(resolveBinding(rows[0], '$.MATNR')).toBe('SRV-CLOUD-01');
    expect(resolveBinding(data, 'ITEMS[1].POSNR')).toBe('000020');
    expect(resolveBinding(data, 'ITEMS.MATNR')).toEqual(['SRV-CLOUD-01', 'SRV-IMPL-02', 'SRV-SUPP-03']);
  });

  it('converts repeated XML siblings and preserves leading-zero SAP values', () => {
    const data = parseSampleData(xml);
    expect(getTableRows(data, 'ITEMS')).toHaveLength(3);
    expect(resolveBinding(data, 'ITEMS[0].POSNR')).toBe('000010');
    expect(resolveBinding(data, 'HEADER.KUNNR')).toBe('CUST-00128');
  });

  it('accepts native XFA datasets and XDP dataset wrappers', () => {
    const datasets = `<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><FORM_DATA><HEADER><VBELN>42</VBELN></HEADER><ITEMS><MATNR>TEST</MATNR></ITEMS></FORM_DATA></xfa:data></xfa:datasets>`;
    for (const source of [datasets, `<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">${datasets}</xdp:xdp>`]) {
      const data = parseSampleData(source);
      expect(resolveBinding(data, 'xfa.datasets.data.FORM_DATA.HEADER.VBELN')).toBe('42');
      expect(getTableRows(data, 'ITEMS')).toHaveLength(1);
    }
  });

  it('handles missing values, empty arrays, single rows and unsupported expressions safely', () => {
    expect(resolveBinding({}, '$record.MISSING')).toBeUndefined();
    expect(getTableRows({ ITEMS: [] }, 'ITEMS')).toEqual([]);
    expect(getTableRows({ ITEMS: { MATNR: 'ONE' } }, 'ITEMS')).toEqual([{ MATNR: 'ONE' }]);
    expect(resolveBinding({ ITEMS: { MATNR: 'ONE' } }, 'ITEMS[0].MATNR')).toBe('ONE');
    expect(resolveBinding({}, '__proto__.polluted')).toBeUndefined();
    expect(resolveBinding({}, 'constructor.name')).toBeUndefined();
    expect(resolveBinding({}, 'ITEMS.(foo)')).toBeUndefined();
    expect(normalizeBinding('$record.FORM_DATA[0].HEADER.VBELN')).toBe('HEADER.VBELN');
  });

  it('rejects invalid JSON/XML and unsafe entity declarations', () => {
    expect(() => parseSampleData('[]')).toThrow(/must be an object/);
    expect(() => parseSampleData('{no}')).toThrow(/not valid JSON/);
    expect(() => parseSampleData('<FORM_DATA>')).toThrow(/well-formed/);
    expect(() => parseSampleData('<!DOCTYPE data SYSTEM "https://invalid.example"><data/>')).toThrow(/DTDs/);
    expect(() => parseSampleData('<FORM_DATA><__proto__><polluted>true</polluted></__proto__></FORM_DATA>')).toThrow(/Unsupported/);
  });
});
