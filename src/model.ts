export type Alignment = 'left' | 'center' | 'right';
export interface SourceRef {
  start: number;
  end: number;
  offsetX: number;
  offsetY: number;
  deleteProtected?: string;
}
export interface BaseElement {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  align: Alignment;
  source?: SourceRef;
}
export interface TextElement extends BaseElement { kind: 'text'; text: string }
export interface FieldElement extends BaseElement { kind: 'field'; binding: string }
export interface TableColumn { id: string; label: string; binding: string; width: number; align: Alignment }
export interface TableElement extends BaseElement {
  kind: 'table'; binding: string; columns: TableColumn[]; rowHeight: number; borders: boolean;
}
export type FormElement = TextElement | FieldElement | TableElement;
export interface FormDocument {
  name: string;
  sourceXml: string;
  elements: FormElement[];
  page: { width: number; height: number; margin: number };
  warnings: string[];
  synthetic: boolean;
}
export interface DataNode {
  id: string; name: string; path: string; type: string; repeating: boolean; optional: boolean;
  minOccurs: number; maxOccurs: number | 'unbounded'; children: DataNode[];
}
export interface SchemaResult { roots: DataNode[]; warnings: string[]; source: string }
export interface ValidationIssue { severity: 'error' | 'warning'; message: string; elementId?: string }
export type SampleData = Record<string, unknown>;
export const makeId = () => `el-${crypto.randomUUID()}`;
export function baseElement(kind: FormElement['kind'], x = 20, y = 100): BaseElement {
  const id = makeId();
  return { id, name: `${kind}_${id.slice(-8)}`, x, y, width: 65, height: 9, fontSize: 10, bold: false, align: 'left' };
}
