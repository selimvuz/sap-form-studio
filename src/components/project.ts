import type { Alignment, FormDocument, FormElement, SampleData, SchemaResult, TableColumn } from '../model';
import { parseXdp } from '../xdp';
import { parseXsd } from '../xsd';
import { parseSampleData } from '../preview';

export type Project = { format: 'sap-form-studio'; version: 1; document: FormDocument; schema?: SchemaResult; schemaName: string; sample: SampleData; sampleName: string };
type ObjectRecord = Record<string, unknown>;
function record(value: unknown, name: string): ObjectRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Project ${name} must be an object.`);
  return value as ObjectRecord;
}
function string(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`Project ${name} must be text.`);
  return value;
}
function number(value: unknown, name: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) throw new Error(`Project ${name} must be a ${positive ? 'positive ' : ''}finite number.`);
  return value;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Project ${name} must be true or false.`);
  return value;
}
function alignment(value: unknown): Alignment {
  if (value !== 'left' && value !== 'center' && value !== 'right') throw new Error('Project alignment must be left, center or right.');
  return value;
}
function column(value: unknown): TableColumn {
  const item = record(value, 'column');
  return { id: string(item.id, 'column ID'), label: string(item.label, 'column label'), binding: string(item.binding, 'column binding'), width: number(item.width, 'column width', true), align: alignment(item.align) };
}

/** Rebuild source references and schema from original XML, never from editable JSON metadata. */
export function readProject(text: string): Project {
  if (text.length > 40_000_000) throw new Error('Projects must be smaller than 40 MB.');
  const project = record(JSON.parse(text), 'root');
  if (project.format !== 'sap-form-studio' || project.version !== 1) throw new Error('This is not a supported .sapform.json project.');
  const saved = record(project.document, 'document');
  const sourceXml = string(saved.sourceXml, 'source XDP');
  if (sourceXml.length > 25_000_000) throw new Error('Project source XDP exceeds 25 MB.');
  const baseline = parseXdp(sourceXml, string(saved.name, 'document name'));
  const originals = new Map(baseline.elements.map(element => [element.id, element]));
  if (!Array.isArray(saved.elements) || saved.elements.length > 10_000) throw new Error('Project objects are missing or exceed the 10,000 object limit.');
  const ids = new Set<string>();
  const elements: FormElement[] = saved.elements.map(value => {
    const item = record(value, 'layout object');
    const id = string(item.id, 'object ID');
    if (!id || ids.has(id)) throw new Error('Project object IDs must be present and unique.');
    ids.add(id);
    const original = originals.get(id);
    if (original && original.kind !== item.kind) throw new Error('An imported object type cannot be changed by a saved project.');
    const base = {
      id, name: string(item.name, 'object name'), x: number(item.x, 'X position'), y: number(item.y, 'Y position'),
      width: number(item.width, 'width', true), height: number(item.height, 'height', true),
      fontSize: number(item.fontSize, 'font size', true), bold: boolean(item.bold, 'font weight'), align: alignment(item.align),
      ...(original?.source ? { source: original.source } : {}),
    };
    if (item.kind === 'text') return { ...base, kind: 'text', text: string(item.text, 'static text') };
    if (item.kind === 'field') return { ...base, kind: 'field', binding: string(item.binding, 'field binding') };
    if (item.kind === 'table') {
      if (!Array.isArray(item.columns) || !item.columns.length || item.columns.length > 100) throw new Error('Project table must have between 1 and 100 columns.');
      const columns = item.columns.map(column);
      if (new Set(columns.map(c => c.id)).size !== columns.length) throw new Error('Table column IDs must be unique.');
      if (original?.kind === 'table' && original.columns.length !== columns.length) throw new Error('An imported table must retain its original column count.');
      return { ...base, kind: 'table', binding: string(item.binding, 'table binding'), columns, rowHeight: number(item.rowHeight, 'row height', true), borders: boolean(item.borders, 'borders') };
    }
    throw new Error('Project contains an unsupported object type.');
  });
  for (const original of baseline.elements) {
    if (original.source?.deleteProtected && !ids.has(original.id)) throw new Error('This project deletes an imported object that contains protected XFA features.');
  }
  const page = record(saved.page, 'page');
  const margin = number(page.margin, 'margin guide');
  if (margin < 0 || margin > 80) throw new Error('Margin guide must be between 0 and 80 mm.');
  let schema: SchemaResult | undefined;
  if (project.schema !== undefined) {
    const savedSchema = record(project.schema, 'schema');
    schema = parseXsd(string(savedSchema.source, 'schema source'));
  }
  return {
    format: 'sap-form-studio', version: 1,
    document: { ...baseline, elements, page: { ...baseline.page, margin } },
    schema, schemaName: project.schemaName === undefined ? '' : string(project.schemaName, 'schema filename'),
    sample: project.sample === undefined ? {} : parseSampleData(JSON.stringify(project.sample), 'project.json'),
    sampleName: project.sampleName === undefined ? '' : string(project.sampleName, 'sample filename'),
  };
}
