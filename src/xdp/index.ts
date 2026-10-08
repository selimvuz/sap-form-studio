import template from '../templates/minimal-sap-form.xdp?raw';
import { parseXdp } from './reader';
export { parseXdp } from './reader';
export { serializeXdp } from './writer';
export { validateDocument } from './validation';
export const createDocument = () => parseXdp(template, 'invoice-starter.xdp');

/** UTF-8 only in this PoC: never export UTF-8 bytes with a conflicting XML declaration. */
export async function readXmlFile(file: File): Promise<string> {
  if (file.size > 25_000_000) throw new Error('This PoC accepts XML files up to 25 MB.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('This PoC requires UTF-8 XML. Convert a copy to UTF-8 before importing; your source is unchanged.'); }
  const encoding = /^\uFEFF?\s*<\?xml\b[^?]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding)) throw new Error(`XML declares ${encoding}. Convert a copy to UTF-8 before importing.`);
  return text;
}
