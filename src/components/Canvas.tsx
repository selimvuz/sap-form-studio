import { useRef, type CSSProperties, type DragEvent, type PointerEvent } from 'react';
import { Database, Grip, LockKeyhole } from 'lucide-react';
import type { DataNode, FormDocument, FormElement, SampleData } from '../model';
import { getTableRows, normalizeBinding, resolveBinding } from '../preview';

interface Props {
  document: FormDocument; selected: string | null; zoom: number; preview: boolean; sample: SampleData;
  onSelect: (id: string | null) => void; onChange: (id: string, patch: Partial<FormElement>) => void;
  onDropNode: (node: DataNode, x: number, y: number) => void;
}
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function resolveTableCell(sample: SampleData, row: Record<string, unknown>, binding: string, tableBinding: string, rowIndex: number): unknown {
  if (/^(?:\$record|\$data|xfa\.datasets\.data)(?:\.|$)/.test(binding)) {
    const value = resolveBinding(sample, binding);
    return Array.isArray(value) ? value[rowIndex] : value;
  }
  const context = normalizeBinding(tableBinding).replace(/\[(?:\*|\d+)\]/g, '');
  const normalized = normalizeBinding(binding).replace(/\[(?:\*|\d+)\]/g, '');
  return resolveBinding(row, context && normalized.startsWith(`${context}.`) ? normalized.slice(context.length + 1) : binding);
}

function ElementContent({ element, preview, sample }: { element: FormElement; preview: boolean; sample: SampleData }) {
  if (element.kind === 'text') return <div className="text-content">{element.text}</div>;
  if (element.kind === 'field') {
    const value = displayValue(resolveBinding(sample, element.binding));
    return <div className={`field-content ${preview ? 'is-preview' : ''}`}>
      {!preview && <Database size={11} />}
      <span>{preview ? value || '—' : element.binding.replace(/^\$record\./, '') || 'Unbound field'}</span>
    </div>;
  }
  const rows = preview ? getTableRows(sample, element.binding) : [{}];
  const widths = element.columns.map(column => `${column.width}fr`).join(' ');
  return <div className={`table-content ${element.borders ? 'with-borders' : ''}`}>
    <div className="table-header" style={{ gridTemplateColumns: widths, minHeight: `${element.rowHeight}mm` }}>
      {element.columns.map(column => <div key={column.id} style={{ textAlign: column.align }}>{column.label}</div>)}
    </div>
    {rows.map((row, index) => <div className="table-detail" key={index} style={{ gridTemplateColumns: widths, minHeight: `${element.rowHeight}mm` }}>
      {element.columns.map(column => <div key={column.id} style={{ textAlign: column.align }}>{preview ? displayValue(resolveTableCell(sample, row, column.binding, element.binding, index)) || '—' : <span className="table-binding">{column.binding.replace(/^\$\./, '')}</span>}</div>)}
    </div>)}
    {preview && rows.length === 0 && <div className="empty-table">No rows in sample data</div>}
    {!preview && <div className="table-repeat-label"><Grip size={9} /> Repeating detail · {element.binding.replace(/^\$record\./, '')}</div>}
  </div>;
}

export default function Canvas({ document, selected, zoom, preview, sample, onSelect, onChange, onDropNode }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: string; mode: 'move' | 'resize'; x: number; y: number; start: FormElement } | null>(null);
  const scale = zoom / 100;
  const pxPerMm = 96 / 25.4;
  function pointerDown(event: PointerEvent<HTMLDivElement>, element: FormElement, mode: 'move' | 'resize') {
    if (preview || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(element.id);
    gesture.current = { id: element.id, mode, x: event.clientX, y: event.clientY, start: { ...element } };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / (pxPerMm * scale);
    const dy = (event.clientY - drag.y) / (pxPerMm * scale);
    const round = (n: number) => Math.round(n * 10) / 10;
    if (drag.mode === 'move') onChange(drag.id, {
      x: round(Math.max(0, Math.min(document.page.width - drag.start.width, drag.start.x + dx))),
      y: round(Math.max(0, Math.min(document.page.height - drag.start.height, drag.start.y + dy))),
    });
    else onChange(drag.id, {
      width: round(Math.max(5, Math.min(document.page.width - drag.start.x, drag.start.width + dx))),
      height: round(Math.max(4, Math.min(document.page.height - drag.start.y, drag.start.height + dy))),
    });
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (preview) return;
    const json = event.dataTransfer.getData('application/x-sap-field');
    if (!json || !pageRef.current) return;
    try {
      const node = JSON.parse(json) as DataNode;
      const rect = pageRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(document.page.width - 65, (event.clientX - rect.left) / (pxPerMm * scale)));
      const y = Math.max(0, Math.min(document.page.height - 30, (event.clientY - rect.top) / (pxPerMm * scale)));
      onDropNode(node, Math.round(x), Math.round(y));
    } catch { /* Only drag payloads generated by the context tree are accepted. */ }
  }
  const pageStyle: CSSProperties = { width: `${document.page.width}mm`, height: `${document.page.height}mm`, transform: `scale(${scale})` };
  return <div className="canvas-scroll" onPointerDown={() => onSelect(null)}>
    <div className="page-caption"><span>PAGE 01</span><span>A4 · {document.page.width} × {document.page.height} mm</span></div>
    <div className="page-footprint" style={{ width: document.page.width * pxPerMm * scale, minHeight: document.page.height * pxPerMm * scale }}>
      <div ref={pageRef} className={`form-page ${preview ? 'preview-page' : ''}`} data-testid="form-canvas" style={pageStyle}
        onDragOver={event => { if (!preview) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={drop}>
        {!preview && <div className="margin-guide" style={{ inset: `${document.page.margin}mm` }} />}
        {document.elements.map(element => {
          const active = !preview && selected === element.id;
          const style: CSSProperties = {
            left: `${element.x}mm`, top: `${element.y}mm`, width: `${element.width}mm`, minHeight: `${element.height}mm`,
            height: preview && element.kind === 'table' ? 'auto' : `${element.height}mm`,
            fontSize: `${element.fontSize}pt`, fontWeight: element.bold ? 700 : 400, textAlign: element.align,
          };
          return <div key={element.id} className={`canvas-element element-${element.kind} ${active ? 'selected' : ''}`}
            style={style} data-element-id={element.id} data-element-name={element.name} role={preview ? undefined : 'button'}
            tabIndex={preview ? undefined : 0} aria-label={`${element.kind}: ${element.name}`}
            onFocus={() => !preview && onSelect(element.id)}
            onPointerDown={event => pointerDown(event, element, 'move')} onPointerMove={pointerMove}
            onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
            {active && <div className="selection-label">{element.source?.deleteProtected && <LockKeyhole size={10} />}{element.name}</div>}
            <ElementContent element={element} preview={preview} sample={sample} />
            {active && <><span className="selection-corner corner-tl" /><span className="selection-corner corner-tr" /><span className="selection-corner corner-bl" />
              <div className="resize-handle" role="button" aria-label="Resize selected element"
                onPointerDown={event => pointerDown(event, element, 'resize')} onPointerMove={pointerMove}
                onPointerUp={() => { gesture.current = null; }} /></>}
          </div>;
        })}
      </div>
    </div>
    <div className="canvas-bottom-note">{preview ? 'Browser preview is approximate. Verify the exported layout with SAP ADS.' : 'Drag data onto the page · Select an object to edit · Delete to remove'}</div>
  </div>;
}
