import type { SampleData } from '../model';
import { childElements, parseLocalXml } from '../xsd/xml';

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const objectValue = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function xmlValue(element: Element, depth = 0): unknown {
  if (depth > 60) throw new Error('Sample XML exceeds the preview nesting limit of 60 levels.');
  const children = childElements(element);
  const attributes = Array.from(element.attributes).filter(attr => attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/');
  if (!children.length && !attributes.length) return element.textContent?.trim() ?? '';
  const result: Record<string, unknown> = Object.create(null);
  for (const attribute of attributes) result[`@${attribute.localName}`] = attribute.value;
  for (const child of children) {
    const name = child.localName;
    if (forbiddenKeys.has(name)) throw new Error(`Unsupported sample XML element name: ${name}.`);
    const value = xmlValue(child, depth + 1);
    if (Object.hasOwn(result, name)) result[name] = Array.isArray(result[name]) ? [...result[name] as unknown[], value] : [result[name], value];
    else result[name] = value;
  }
  if (!children.length) result['#text'] = element.textContent?.trim() ?? '';
  return result;
}

function unwrap(data: SampleData): SampleData {
  let result = data;
  if (objectValue(result['xfa:datasets'])) result = result['xfa:datasets'];
  else if (objectValue(result.datasets)) result = result.datasets;
  if (objectValue(result['xfa:data'])) result = result['xfa:data'];
  else if (objectValue(result.data) && (Object.keys(result).length === 1 || Object.hasOwn(result.data, 'FORM_DATA'))) result = result.data;
  if (objectValue(result.FORM_DATA)) result = result.FORM_DATA;
  return result;
}

/** JSON objects or XML datasets; values remain strings in XML to preserve SAP identifiers. */
export function parseSampleData(text: string, fileName = ''): SampleData {
  const input = text.replace(/^\uFEFF/, '').trim();
  if (!input) throw new Error('Sample data is empty.');
  if (input.length > 10_000_000) throw new Error('Sample data exceeds the 10 MB preview limit.');
  if (input.startsWith('<') || /\.xml$/i.test(fileName)) {
    const document = parseLocalXml(input, 'Sample data');
    let root: Element = document.documentElement;
    if (root.localName === 'xdp') {
      const datasets = childElements(root).find(el => el.localName === 'datasets');
      if (!datasets) throw new Error('This XDP has no datasets packet containing sample data.');
      root = datasets;
    }
    if (root.localName === 'datasets') {
      const data = childElements(root).find(el => el.localName === 'data');
      if (!data) throw new Error('The XFA datasets packet has no data element.');
      root = data;
    }
    if (root.localName === 'data' && childElements(root).length === 1) root = childElements(root)[0];
    const value = xmlValue(root);
    if (!objectValue(value)) throw new Error('Sample XML must contain a record with child elements.');
    return unwrap(value);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(input); }
  catch { throw new Error('Sample data is not valid JSON. Upload a JSON object or well-formed XML.'); }
  if (!objectValue(parsed)) throw new Error('Sample JSON must be an object containing named fields.');
  return unwrap(parsed);
}

/**
 * Supported bindings: dotted element names, optional FORM_DATA/$record/$ prefixes,
 * xfa.datasets.data prefixes, and non-negative [n] / [*] selectors.
 * Full SOM expressions (predicates, parent navigation, functions) are unsupported.
 */
export function normalizeBinding(binding: string): string {
  return binding.trim()
    .replace(/^(?:xfa\.datasets\.data|\$record|\$data|\$)(?:\.|$)/, '')
    .replace(/^FORM_DATA(?:\[0\])?(?:\.|$)/, '');
}

type Segment = { name: string; index?: number | '*' };
function segments(binding: string): Segment[] | undefined {
  const normalized = normalizeBinding(binding);
  if (!normalized) return [];
  const parsed: Segment[] = [];
  for (const part of normalized.split('.')) {
    const match = /^([A-Za-z_@][A-Za-z0-9_:@-]*)(?:\[(\d+|\*)\])?$/.exec(part);
    if (!match || forbiddenKeys.has(match[1])) return undefined;
    parsed.push({ name: match[1], index: match[2] === undefined ? undefined : match[2] === '*' ? '*' : Number(match[2]) });
  }
  return parsed;
}

export function resolveBinding(data: unknown, binding: string): unknown {
  const path = segments(binding);
  if (!path) return undefined;
  const initial = objectValue(data) ? unwrap(data) : data;
  function walk(current: unknown, position: number): unknown {
    if (position === path!.length) return current;
    if (Array.isArray(current)) {
      const values = current.map(row => walk(row, position)).filter(value => value !== undefined);
      return values.length ? values.flat() : undefined;
    }
    if (!objectValue(current)) return undefined;
    const segment = path![position];
    if (!Object.hasOwn(current, segment.name)) return undefined;
    let value = current[segment.name];
    if (typeof segment.index === 'number') {
      value = Array.isArray(value) ? value[segment.index] : segment.index === 0 ? value : undefined;
    }
    return walk(value, position + 1);
  }
  return walk(initial, 0);
}

/** Repeated records and singleton records share the same table-preview contract. */
export function getTableRows(data: unknown, binding: string): Record<string, unknown>[] {
  const value = resolveBinding(data, binding);
  return (Array.isArray(value) ? value.flat() : [value]).filter(objectValue);
}
