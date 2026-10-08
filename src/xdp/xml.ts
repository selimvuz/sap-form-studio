/** DOMParser validates namespaces; this lexical index allows edits without DOM reserialization. */
export interface XmlNode {
  start: number; openEnd: number; closeStart: number; end: number; selfClosing: boolean;
  dom: Element; children: XmlNode[]; parent?: XmlNode;
  textSpans: { start: number; end: number }[];
}
export interface XmlSource { source: string; document: XMLDocument; root: XmlNode; nodes: XmlNode[] }
export const XDP_NS = 'http://ns.adobe.com/xdp/';
export const isTemplateNamespace = (ns: string | null) => /^http:\/\/www\.xfa\.org\/schema\/xfa-template\/\d+(?:\.\d+)?\/$/.test(ns || '');
export function parseXml(source: string): XmlSource {
  if (source.length > 25_000_000) throw new Error('XML exceeds the 25 MB PoC limit.');
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(source)) throw new Error('DTD/entity declarations are not supported. The source has not been changed.');
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const error = document.getElementsByTagName('parsererror')[0];
  if (error || !document.documentElement) throw new Error(`Invalid XML: ${error?.textContent?.slice(0, 220) || 'missing root'}`);
  const elements = Array.from(document.getElementsByTagName('*'));
  const nodes: XmlNode[] = [], stack: XmlNode[] = [];
  let i = 0, ei = 0;
  while (i < source.length) {
    if (source[i] !== '<') {
      const end = source.indexOf('<', i);
      const stop = end < 0 ? source.length : end;
      stack.at(-1)?.textSpans.push({ start: i, end: stop }); i = stop; continue;
    }
    let terminal = '';
    if (source.startsWith('<!--', i)) terminal = '-->';
    else if (source.startsWith('<![CDATA[', i)) terminal = ']]>';
    else if (source.startsWith('<?', i)) terminal = '?>';
    if (terminal) {
      const end = source.indexOf(terminal, i) + terminal.length;
      if (end < i + terminal.length) throw new Error('Unterminated XML section.');
      if (terminal === ']]>') stack.at(-1)?.textSpans.push({ start: i, end });
      i = end; continue;
    }
    let j = i + 1, quote = '';
    for (; j < source.length; j++) {
      if (quote) { if (source[j] === quote) quote = ''; }
      else if (source[j] === '"' || source[j] === "'") quote = source[j];
      else if (source[j] === '>') break;
    }
    const end = j + 1;
    if (source.startsWith('</', i)) {
      const node = stack.pop();
      if (!node) throw new Error('Invalid XML stack.');
      node.closeStart = i; node.end = end;
    } else {
      const selfClosing = /\/\s*>$/.test(source.slice(i, end));
      const dom = elements[ei++];
      if (!dom) throw new Error('Could not safely map source XML to its DOM.');
      const node: XmlNode = { start: i, openEnd: end, closeStart: end, end, selfClosing, dom, children: [], parent: stack.at(-1), textSpans: [] };
      node.parent?.children.push(node); nodes.push(node);
      if (!selfClosing) stack.push(node);
    }
    i = end;
  }
  if (stack.length || ei !== elements.length) throw new Error('Could not safely index XML.');
  return { source, document, root: nodes[0], nodes };
}
export const attr = (n: XmlNode, name: string) => n.dom.getAttribute(name) ?? '';
export const child = (n: XmlNode, name: string) => n.children.find(c => c.dom.localName === name && c.dom.namespaceURI === n.dom.namespaceURI);
export const children = (n: XmlNode, name: string) => n.children.filter(c => c.dom.localName === name && c.dom.namespaceURI === n.dom.namespaceURI);
export const escapeText = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\r', '&#13;');
export const escapeAttr = (s: string) => escapeText(s).replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\n', '&#10;').replaceAll('\t', '&#9;');
export function xmlElement(name: string, attributes: Record<string, string>, content = ''): string {
  const attrs = Object.entries(attributes).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  return content ? `<${name}${attrs}>${content}</${name}>` : `<${name}${attrs}/>`;
}
export function mm(value: string, fallback = 0): number {
  if (!value) return fallback;
  const m = /^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|in|pt|pc)?\s*$/.exec(value);
  if (!m) return fallback;
  return Number(m[1]) * ({ mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 }[m[2] || 'in'] ?? 1);
}
export const measure = (value: number) => `${Number(value.toFixed(4))}mm`;
interface Patch { start: number; end: number; text: string }
export class XmlPatcher {
  private attrs = new Map<XmlNode, Map<string, string>>();
  private inserts = new Map<XmlNode, string[]>();
  private patches: Patch[] = [];
  private newProperties = new Map<XmlNode, Map<string, Record<string, string>>>();
  constructor(private xml: XmlSource) {}
  setAttr(node: XmlNode, name: string, value: string) {
    if (attr(node, name) === value) return;
    if (!this.attrs.has(node)) this.attrs.set(node, new Map());
    this.attrs.get(node)!.set(name, value);
  }
  append(node: XmlNode, content: string) {
    if (!this.inserts.has(node)) this.inserts.set(node, []);
    this.inserts.get(node)!.push(content);
  }
  setText(node: XmlNode, value: string) {
    if (node.children.length) throw new Error('Rich text cannot be replaced safely by the plain text editor.');
    if (node.textSpans.length) node.textSpans.forEach((s, i) => this.patches.push({ ...s, text: i ? '' : escapeText(value) }));
    else this.append(node, escapeText(value));
  }
  remove(node: XmlNode) { this.patches.push({ start: node.start, end: node.end, text: '' }); }
  /** Create only a missing direct XFA property; untouched siblings retain their original text. */
  property(node: XmlNode, name: string, attrs: Record<string, string>) {
    const existing = child(node, name);
    if (existing) Object.entries(attrs).forEach(([k, v]) => this.setAttr(existing, k, v));
    else {
      if (!this.newProperties.has(node)) this.newProperties.set(node, new Map());
      const properties = this.newProperties.get(node)!;
      properties.set(name, { ...(properties.get(name) || {}), ...attrs });
    }
  }
  result(): string {
    for (const [node, properties] of this.newProperties) for (const [name, attributes] of properties) this.append(node, xmlElement(name, { xmlns: node.dom.namespaceURI!, ...attributes }));
    const opens = new Set([...this.attrs.keys(), ...[...this.inserts.keys()].filter(n => n.selfClosing)]);
    for (const node of opens) {
      let tag = this.xml.source.slice(node.start, node.openEnd);
      const changes = this.attrs.get(node);
      const remaining = new Map(changes);
      tag = tag.replace(/([^\s=<>/]+)(\s*=\s*)(["'])([\s\S]*?)\3/g, (full, name: string, eq: string, q: string) => {
        if (!remaining.has(name)) return full;
        const value = remaining.get(name)!; remaining.delete(name);
        return `${name}${eq}${q}${escapeAttr(value)}${q}`;
      });
      const suffix = [...remaining].map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
      tag = tag.replace(/\s*\/?>$/, match => suffix + match);
      if (node.selfClosing && this.inserts.has(node)) tag = tag.replace(/\/\s*>$/, '>') + this.inserts.get(node)!.join('') + `</${node.dom.tagName}>`;
      this.patches.push({ start: node.start, end: node.openEnd, text: tag });
    }
    for (const [node, inserts] of this.inserts) if (!node.selfClosing) this.patches.push({ start: node.closeStart, end: node.closeStart, text: inserts.join('') });
    const sorted = this.patches.sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = 0, out = '';
    for (const p of sorted) {
      if (p.start < cursor) throw new Error('Overlapping XML edits were blocked to protect the original.');
      out += this.xml.source.slice(cursor, p.start) + p.text; cursor = p.end;
    }
    return out + this.xml.source.slice(cursor);
  }
}
