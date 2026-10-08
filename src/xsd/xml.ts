/** Parse local XML only. DTDs/entities are deliberately unsupported: uploads never fetch resources. */
export function parseLocalXml(source: string, label: string): Document {
  if (!source.trim()) throw new Error(`${label} is empty.`);
  if (source.length > 10_000_000) throw new Error(`${label} exceeds the 10 MB preview limit.`);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) {
    throw new Error(`${label}: DTDs and entity declarations are not supported.`);
  }
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const errors = Array.from(document.getElementsByTagName('*')).filter(el => el.localName === 'parsererror');
  if (errors.length || !document.documentElement) {
    throw new Error(`${label} is not well-formed XML. ${errors[0]?.textContent?.trim().slice(0, 240) ?? ''}`.trim());
  }
  return document;
}

export function childElements(element: Element): Element[] {
  return Array.from(element.children);
}
