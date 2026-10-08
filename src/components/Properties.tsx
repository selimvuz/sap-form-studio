import { AlignCenter, AlignLeft, AlignRight, Bold, MousePointer2, Plus, SlidersHorizontal, Trash2, Type } from 'lucide-react';
import type { Alignment, FormDocument, FormElement, SchemaResult, TableElement } from '../model';
import { makeId } from '../model';

interface Props {
  document: FormDocument; element?: FormElement; schema?: SchemaResult;
  onChange: (id: string, patch: Partial<FormElement>) => void; onDelete: () => void; onMargin: (margin: number) => void;
}
function NumberInput({ label, value, onChange, min = 0, max = 1000, suffix = 'mm' }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; suffix?: string }) {
  return <label className="number-field"><span>{label}</span><div><input aria-label={label} type="number" min={min} max={max} step="0.5" value={Math.round(value * 100) / 100}
    onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange(Math.max(min, Math.min(max, event.target.valueAsNumber))); }} /><small>{suffix}</small></div></label>;
}
function AlignmentControl({ value, onChange }: { value: Alignment; onChange: (align: Alignment) => void }) {
  return <div className="segmented align-options">{(['left', 'center', 'right'] as const).map((align, i) => {
    const Icon = [AlignLeft, AlignCenter, AlignRight][i];
    return <button type="button" aria-label={`Align ${align}`} title={`Align ${align}`} className={value === align ? 'active' : ''} key={align} onClick={() => onChange(align)}><Icon size={15} /></button>;
  })}</div>;
}
function bindings(schema?: SchemaResult) {
  const result: string[] = [];
  function visit(node: SchemaResult['roots'][number]) { if (node.path) result.push(node.path); node.children.forEach(visit); }
  schema?.roots.forEach(visit);
  return result;
}

export default function Properties({ document, element, schema, onChange, onDelete, onMargin }: Props) {
  const update = (patch: Partial<FormElement>) => element && onChange(element.id, patch);
  function updateColumn(table: TableElement, index: number, patch: Partial<TableElement['columns'][number]>) {
    const columns = table.columns.map((column, i) => i === index ? { ...column, ...patch } : column);
    update({ columns, ...(patch.width !== undefined ? { width: columns.reduce((total, column) => total + column.width, 0) } : {}) });
  }
  return <aside className="properties-panel">
    <div className="panel-heading"><SlidersHorizontal size={15} /><h2>Properties</h2><span className="panel-heading-shortcut">⌘</span></div>
    <div className="properties-scroll">
      {!element ? <>
        <div className="empty-selection"><div className="empty-selection-icon"><MousePointer2 size={23} strokeWidth={1.5} /></div><h3>Make it your own</h3><p>Select an object on the page to adjust its layout and binding.</p></div>
        <section className="property-section"><h3>Page setup</h3><div className="page-format"><span>A4 Portrait</span><span>210 × 297 mm</span></div><NumberInput label="Margin guide" value={document.page.margin} min={0} max={80} onChange={onMargin} /><p className="property-hint">Visual guide only. Imported XDP page and content-area margins remain unchanged.</p></section>
        <section className="property-section"><h3>Working with SAP</h3><ol className="workflow-list"><li>Open your XSD and XDP from SFP.</li><li>Edit supported layout objects.</li><li>Export, upload and test in SFP.</li></ol><p className="property-hint">Your existing SAP ADS runtime generates the final PDF.</p></section>
      </> : <>
        <div className="selected-object-heading"><div className="object-type-icon"><Type size={18} /></div><div><span className="eyebrow">{element.kind === 'table' ? 'REPEATING TABLE' : element.kind === 'field' ? 'BOUND FIELD' : 'STATIC TEXT'}</span><h3>{element.name}</h3></div></div>
        <section className="property-section"><label className="form-field">Object name<input value={element.name} onChange={event => update({ name: event.target.value })} /></label>
          {element.kind === 'text' ? <label className="form-field">Text<textarea rows={3} value={element.text} onChange={event => update({ text: event.target.value })} /></label> : <><label className="form-field">Data binding<input list="data-bindings" value={element.binding} placeholder="$record.HEADER.VBELN" onChange={event => update({ binding: event.target.value })} /></label><datalist id="data-bindings">{bindings(schema).map(path => <option key={path} value={`$record.${path}`} />)}</datalist><p className="property-hint">Choose a schema path or enter an XFA binding.</p></>}
        </section>
        <section className="property-section"><h3>Layout <span>mm</span></h3><div className="two-columns"><NumberInput label="X" value={element.x} max={document.page.width} onChange={x => update({ x })} /><NumberInput label="Y" value={element.y} max={document.page.height} onChange={y => update({ y })} /><NumberInput label="Width" value={element.width} min={1} max={document.page.width} onChange={width => update({ width })} /><NumberInput label="Height" value={element.height} min={1} max={document.page.height} onChange={height => update({ height })} /></div></section>
        <section className="property-section"><h3>Typography</h3><div className="font-family">Preview font · Arial</div><div className="typography-row"><NumberInput label="Font size" value={element.fontSize} min={4} max={96} suffix="pt" onChange={fontSize => update({ fontSize })} /><button title="Bold" aria-label="Bold" className={`format-button ${element.bold ? 'active' : ''}`} onClick={() => update({ bold: !element.bold })}><Bold size={16} /></button></div><AlignmentControl value={element.align} onChange={align => update({ align })} /></section>
        {element.kind === 'table' && <>
          <section className="property-section"><h3>Repeating rows</h3><NumberInput label="Row height" value={element.rowHeight} min={3} max={50} onChange={rowHeight => update({ rowHeight })} /><label className="check-field"><input type="checkbox" checked={element.borders} onChange={event => update({ borders: event.target.checked })} />Show cell borders</label><p className="property-hint">The detail row repeats in ADS. Browser preview shows sample rows without pagination.</p></section>
          <section className="property-section"><h3>Columns <span>{element.columns.length}</span></h3>{element.columns.map((column, index) => <div className="column-editor" key={column.id}>
            <div className="column-heading"><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`Column ${index + 1} label`} value={column.label} onChange={event => updateColumn(element, index, { label: event.target.value })} /><button className="icon-button" aria-label={`Remove column ${index + 1}`} disabled={!!element.source || element.columns.length < 2} onClick={() => { const columns = element.columns.filter((_, i) => i !== index); update({ columns, width: columns.reduce((sum, item) => sum + item.width, 0) }); }}><Trash2 size={12} /></button></div>
            <label className="form-field small-label">Relative binding<input value={column.binding} onChange={event => updateColumn(element, index, { binding: event.target.value })} /></label>
            <div className="column-bottom"><NumberInput label="Width" value={column.width} min={3} max={180} onChange={width => updateColumn(element, index, { width })} /><AlignmentControl value={column.align} onChange={align => updateColumn(element, index, { align })} /></div>
          </div>)}<button className="full-width-button" disabled={!!element.source} title={element.source ? "Imported table column structure is preserved" : "Add column"} onClick={() => { const width = 25; const columns = [...element.columns, { id: makeId(), label: 'Column', binding: '$.FIELD', width, align: 'left' as const }]; update({ columns, width: columns.reduce((sum, item) => sum + item.width, 0) }); }}><Plus size={13} /> Add column</button></section>
        </>}
        {element.source?.deleteProtected && <div className="protected-note">This object contains preserved XFA features. Deletion is disabled: {element.source.deleteProtected}</div>}
        <section className="property-section"><button className="delete-button" onClick={onDelete} disabled={!!element.source?.deleteProtected}><Trash2 size={14} />Delete object <kbd>Del</kbd></button></section>
      </>}
    </div>
    <div className="panel-footer"><span className="status-dot" />Local workspace · Files stay in your browser</div>
  </aside>;
}
