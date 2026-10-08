import type { DataNode, SchemaResult } from '../model';
import { childElements, parseLocalXml } from './xml';

const XSD = 'http://www.w3.org/2001/XMLSchema';
const local = (name: string) => name.split(':').pop() ?? name;
const schemaChildren = (element: Element) => childElements(element).filter(el => el.namespaceURI === XSD);
const namedChild = (element: Element, name: string) => schemaChildren(element).find(el => el.localName === name);

/** Import the element hierarchy. Root paths are relative to each global root element. */
export function parseXsd(xml: string): SchemaResult {
  const document = parseLocalXml(xml, 'XSD');
  const schema = document.documentElement;
  if (schema.localName !== 'schema' || schema.namespaceURI !== XSD) {
    throw new Error('The uploaded XML is not an XML Schema (xs:schema).');
  }
  const warnings = new Set<string>();
  const globals = schemaChildren(schema);
  const complexTypes = new Map(globals.filter(el => el.localName === 'complexType').map(el => [el.getAttribute('name') ?? '', el]));
  const simpleTypes = new Map(globals.filter(el => el.localName === 'simpleType').map(el => [el.getAttribute('name') ?? '', el]));
  const elements = new Map(globals.filter(el => el.localName === 'element').map(el => [el.getAttribute('name') ?? '', el]));
  const groups = new Map(globals.filter(el => el.localName === 'group').map(el => [el.getAttribute('name') ?? '', el]));
  const targetNamespace = schema.getAttribute('targetNamespace') ?? '';
  let nodeCount = 0;

  for (const element of Array.from(schema.getElementsByTagNameNS(XSD, '*'))) {
    if (['import', 'include', 'redefine', 'override'].includes(element.localName)) {
      warnings.add(`xs:${element.localName} is not loaded. Upload a self-contained XSD; external resources are never fetched.`);
    }
    if (element.localName === 'choice') warnings.add('Choice branches are shown together; the designer does not enforce choice exclusivity.');
    if (['any', 'anyAttribute'].includes(element.localName)) warnings.add('Wildcard schema content is not represented in the binding tree.');
    if (['attribute', 'attributeGroup'].includes(element.localName)) warnings.add('XML attributes are not represented as bindable XSD fields in this prototype.');
    if (['key', 'keyref', 'unique', 'assert'].includes(element.localName)) warnings.add('Schema identity constraints and assertions are not evaluated.');
  }

  function isLocalReference(name: string, context: Element): boolean {
    if (!name.includes(':')) return true;
    const namespace = context.lookupNamespaceURI(name.split(':')[0]);
    return namespace === targetNamespace || namespace === null;
  }

  function occurrence(element: Element, attr: 'minOccurs' | 'maxOccurs'): number | 'unbounded' {
    const value = element.getAttribute(attr);
    if (attr === 'maxOccurs' && value === 'unbounded') return value;
    if (value === null) return 1;
    if (!/^\d+$/.test(value)) {
      warnings.add(`Invalid ${attr}="${value}" on ${element.getAttribute('name') || element.localName}; treated as 1.`);
      return 1;
    }
    return Math.min(Number(value), Number.MAX_SAFE_INTEGER);
  }

  function primitive(type: Element | undefined, fallback: string, visited = new Set<Element>()): string {
    if (!type || visited.has(type)) return fallback;
    visited.add(type);
    const restriction = namedChild(type, 'restriction');
    if (restriction) {
      const base = restriction.getAttribute('base') ?? 'string';
      return primitive(simpleTypes.get(local(base)), local(base), visited);
    }
    if (namedChild(type, 'list')) return 'list';
    if (namedChild(type, 'union')) return 'union';
    return fallback;
  }

  function multiplyMax(a: number | 'unbounded', b: number | 'unbounded'): number | 'unbounded' {
    if (a === 0 || b === 0) return 0;
    return a === 'unbounded' || b === 'unbounded' ? 'unbounded' : Math.min(a * b, Number.MAX_SAFE_INTEGER);
  }

  function collect(container: Element, path: string, stack: Set<Element>, depth: number, parentMin = 1, parentMax: number | 'unbounded' = 1): DataNode[] {
    const result: DataNode[] = [];
    for (const child of schemaChildren(container)) {
      if (child.localName === 'element') {
        result.push(build(child, path, stack, depth, false, parentMin, parentMax));
      } else if (['sequence', 'all', 'choice'].includes(child.localName)) {
        const min = Number(occurrence(child, 'minOccurs')) * parentMin;
        const max = multiplyMax(occurrence(child, 'maxOccurs'), parentMax);
        // Individual choice branches may be absent, even if the group itself is required.
        result.push(...collect(child, path, stack, depth, child.localName === 'choice' ? 0 : min, max));
      } else if (child.localName === 'group') {
        const reference = child.getAttribute('ref') ?? '';
        const group = isLocalReference(reference, child) ? groups.get(local(reference)) : undefined;
        if (!group) warnings.add(`Unresolved model group "${reference}".`);
        else if (stack.has(group)) warnings.add(`Recursive model group "${reference}" was truncated.`);
        else {
          const next = new Set(stack).add(group);
          result.push(...collect(group, path, next, depth + 1, Number(occurrence(child, 'minOccurs')) * parentMin, multiplyMax(occurrence(child, 'maxOccurs'), parentMax)));
        }
      } else if (['complexContent', 'simpleContent'].includes(child.localName)) {
        result.push(...collect(child, path, stack, depth, parentMin, parentMax));
      } else if (child.localName === 'extension' || child.localName === 'restriction') {
        const baseName = child.getAttribute('base') ?? '';
        const base = isLocalReference(baseName, child) ? complexTypes.get(local(baseName)) : undefined;
        if (child.localName === 'extension' && base && !stack.has(base)) {
          result.push(...collect(base, path, new Set(stack).add(base), depth + 1, parentMin, parentMax));
        } else if (child.localName === 'extension' && base && stack.has(base)) warnings.add(`Recursive extension "${baseName}" was truncated.`);
        else if (child.localName === 'extension' && !base && child.parentElement?.localName !== 'simpleContent') warnings.add(`Unresolved base complex type "${baseName}".`);
        result.push(...collect(child, path, stack, depth, parentMin, parentMax));
      }
    }
    return result;
  }

  function build(element: Element, parentPath: string, stack: Set<Element>, depth: number, root = false, inheritedMin = 1, inheritedMax: number | 'unbounded' = 1): DataNode {
    if (++nodeCount > 5000) throw new Error('This XSD exceeds the prototype limit of 5,000 expanded nodes.');
    if (depth > 40) throw new Error('This XSD exceeds the prototype nesting limit of 40 levels.');
    const reference = element.getAttribute('ref') ?? '';
    const definition = reference && isLocalReference(reference, element) ? elements.get(local(reference)) : undefined;
    if (reference && !definition) warnings.add(`Unresolved element reference "${reference}".`);
    const declaration = definition ?? element;
    const name = element.getAttribute('name') || declaration.getAttribute('name') || local(reference) || 'unnamed';
    const path = root ? '' : [parentPath, name].filter(Boolean).join('.');
    const minOccurs = Number(occurrence(element, 'minOccurs')) * inheritedMin;
    const maxOccurs = multiplyMax(occurrence(element, 'maxOccurs'), inheritedMax);
    const typeName = declaration.getAttribute('type') ?? '';
    const inlineComplex = namedChild(declaration, 'complexType');
    const complex = inlineComplex ?? (isLocalReference(typeName, declaration) ? complexTypes.get(local(typeName)) : undefined);
    const simple = namedChild(declaration, 'simpleType') ?? (isLocalReference(typeName, declaration) ? simpleTypes.get(local(typeName)) : undefined);
    let type = complex ? 'complex' : primitive(simple, local(typeName) || 'string');
    if (complex) {
      const simpleContent = namedChild(complex, 'simpleContent');
      const contentType = simpleContent && (namedChild(simpleContent, 'extension') ?? namedChild(simpleContent, 'restriction'));
      if (contentType) type = primitive(simpleTypes.get(local(contentType.getAttribute('base') ?? '')), local(contentType.getAttribute('base') ?? 'string'));
    }
    const node: DataNode = {
      id: `schema-${nodeCount}`, name, path, type,
      repeating: maxOccurs === 'unbounded' || maxOccurs > 1,
      optional: minOccurs === 0, minOccurs, maxOccurs, children: [],
    };
    if (complex) {
      if (stack.has(complex)) warnings.add(`Recursive type at "${path || name}" was truncated; recursive branches are not editable.`);
      else node.children = collect(complex, path, new Set(stack).add(complex), depth + 1);
    } else if (typeName && !simple) {
      const prefix = typeName.includes(':') ? typeName.split(':')[0] : '';
      const namespace = prefix ? declaration.lookupNamespaceURI(prefix) : declaration.lookupNamespaceURI(null);
      if (namespace !== XSD) warnings.add(`Type "${typeName}" is not defined in this XSD; shown as a scalar field.`);
    }
    return node;
  }

  const declarations = globals.filter(el => el.localName === 'element');
  if (!declarations.length) throw new Error('This XSD has no global root element to bind.');
  declarations.sort((a, b) => Number(b.getAttribute('name') === 'FORM_DATA') - Number(a.getAttribute('name') === 'FORM_DATA'));
  const roots = declarations.map(element => build(element, '', new Set(), 0, true));
  if (roots.length > 1) warnings.add('Multiple global root elements are shown. Binding paths are relative to each root; use the root matching your sample data.');
  return { roots, warnings: [...warnings], source: xml };
}

export function flattenSchema(roots: DataNode[]): DataNode[] {
  return roots.flatMap(node => [node, ...flattenSchema(node.children)]);
}
