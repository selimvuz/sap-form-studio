import type { FormDocument, SchemaResult, ValidationIssue } from '../model';
import { flattenSchema } from '../xsd';
import { normalizeBinding } from './bindings';
import { parseXdp } from './reader';
import { parseXml } from './xml';
import { serializeXdp } from './writer';

export function validateDocument(doc: FormDocument, schema?: SchemaResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue['severity'], message: string, elementId?: string) => issues.push({ severity, message, elementId });
  try {
    const xml = parseXml(doc.sourceXml), rawIds = new Set<string>();
    parseXdp(doc.sourceXml);
    for (const n of xml.nodes) { const id = n.dom.getAttribute('id'); if (id && rawIds.has(id)) add('error', `Duplicated XML element ID: ${id}`); if (id) rawIds.add(id); }
  } catch (e) { add('error', (e as Error).message); return issues; }
  const ids = new Set<string>(), names = new Set<string>();
  const nodes = schema ? flattenSchema(schema.roots) : [];
  const paths = new Set(nodes.map(n => n.path));
  const checkBinding = (binding: string, id: string, context = '') => {
    if (!binding) { add('warning', 'A component has no explicit data binding.', id); return; }
    const normalized = normalizeBinding(binding);
    if (!/^[\w.-]+$/.test(normalized)) add('warning', `Complex binding is preserved but cannot be resolved locally: ${binding}`, id);
    else if (schema && !paths.has(context && !binding.startsWith('$record.') ? `${context}.${normalized}` : normalized)) add('warning', `Unresolved data binding: ${binding}${context ? ` (row ${context})` : ''}`, id);
  };
  for (const e of doc.elements) {
    if (ids.has(e.id)) add('error', `Duplicated element IDs: ${e.id}`, e.id); ids.add(e.id);
    if (!e.id || !['text', 'field', 'table'].includes(e.kind)) add('error', 'Unsupported component type or missing stable ID.', e.id);
    if (!/^[A-Za-z_][\w-]*$/.test(e.name)) add('warning', `Use a simple XFA name (letters, numbers, underscore): ${e.name}`, e.id);
    if (names.has(e.name)) add('warning', `Repeated object name; verify XFA scope: ${e.name}`, e.id); names.add(e.name);
    if ([e.x, e.y, e.width, e.height, e.fontSize].some(v => typeof v !== 'number' || !Number.isFinite(v)) || e.width <= 0 || e.height <= 0 || e.fontSize <= 0) add('error', `Invalid dimensions or font size: ${e.name}`, e.id);
    if (e.x < 0 || e.y < 0 || e.x + e.width > 210.1 || e.y + e.height > 297.1) add('warning', `Object extends beyond the A4 preview: ${e.name}`, e.id);
    if (e.kind === 'field' || e.kind === 'table') checkBinding(e.binding, e.id);
    if (e.kind === 'table') {
      if (!e.binding.trim()) add('error', `Repeating table requires a data binding: ${e.name}`, e.id);
      if (!e.columns.length || !Number.isFinite(e.rowHeight) || e.rowHeight <= 0) add('error', `Table needs columns and a positive row height: ${e.name}`, e.id);
      if (e.columns.some(c => !Number.isFinite(c.width) || c.width <= 0)) add('error', 'Column widths must be positive finite numbers.', e.id);
      if (Math.abs(e.columns.reduce((s, c) => s + c.width, 0) - e.width) > 0.2) add('warning', 'Table width differs from the sum of column widths. ADS uses columnWidths.', e.id);
      const context = normalizeBinding(e.binding);
      e.columns.forEach(c => checkBinding(c.binding, e.id, context));
      if (schema && !nodes.some(n => n.path === context && n.repeating)) add('warning', `Table binding does not resolve to a repeating schema node: ${e.binding}`, e.id);
      add('warning', 'Repeating table pagination, row growth, and overlap with later objects must be verified in SAP ADS.', e.id);
    }
  }
  if (!schema) add('warning', 'No XSD loaded; bindings cannot be checked against the SAP schema.');
  if (doc.synthetic) add('warning', 'This is a synthetic starter template. It has not been validated in SAP ADS.');
  doc.warnings.forEach(message => add('warning', message));
  const baseline = parseXdp(doc.sourceXml);
  for (const e of doc.elements) { const old = baseline.elements.find(b => b.id === e.id); if (old && old.name !== e.name) add('warning', `Renaming ${old.name} may affect preserved scripts or SOM references.`, e.id); }
  if (!issues.some(i => i.severity === 'error')) {
    try { serializeXdp(doc); } catch (e) { add('error', (e as Error).message); }
  }
  return issues;
}
