import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Braces, Check, ChevronDown, CircleHelp, Code2, Database, Download, Eye, FileCode2, FileJson2, FilePlus2, FolderOpen, Info, LayoutTemplate, Maximize2, Minus, MoreHorizontal, PanelTop, Plus, Save, ShieldCheck, Table2, Type, X } from 'lucide-react';
import type { DataNode, FormDocument, FormElement, SampleData, SchemaResult, TableColumn, ValidationIssue } from './model';
import { baseElement, makeId } from './model';
import { createDocument, parseXdp, readXmlFile, serializeXdp, validateDocument } from './xdp';
import { parseXsd } from './xsd';
import { parseSampleData } from './preview';
import Canvas from './components/Canvas';
import DataPanel from './components/DataPanel';
import Properties from './components/Properties';
import { readProject, type Project } from './components/project';
import starterSchema from '../public/samples/invoice.xsd?raw';
import starterData from '../public/samples/invoice-data.json?raw';

type Modal = 'help' | 'source' | 'validation' | null;
function download(contents: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Some browsers consume the Blob asynchronously after dispatching the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function toError(error: unknown) { return error instanceof Error ? error.message : String(error); }
function leafNodes(node: DataNode): DataNode[] { return node.children.length ? node.children.flatMap(leafNodes) : [node]; }
function firstRepeating(nodes: DataNode[]): DataNode | undefined {
  for (const node of nodes) { if (node.repeating) return node; const child = firstRepeating(node.children); if (child) return child; }
  return undefined;
}

export default function App() {
  const [document, setDocument] = useState<FormDocument>(() => createDocument());
  const [schema, setSchema] = useState<SchemaResult | undefined>(() => parseXsd(starterSchema));
  const [schemaName, setSchemaName] = useState('invoice.xsd');
  const [sample, setSample] = useState<SampleData>(() => parseSampleData(starterData, 'invoice-data.json'));
  const [sampleName, setSampleName] = useState('invoice-data.json');
  const [selected, setSelected] = useState<string | null>(null);
  const [compatibility, setCompatibility] = useState(true);
  const [preview, setPreview] = useState(false);
  const [zoom, setZoom] = useState(80);
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const xdpInput = useRef<HTMLInputElement>(null);
  const xsdInput = useRef<HTMLInputElement>(null);
  const sampleInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const selectedElement = document.elements.find(element => element.id === selected);
  const allWarnings = [...document.warnings, ...(schema?.warnings ?? [])];
  const notify = (text: string, error = false) => setToast({ text, error });

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), toast.error ? 10000 : 5000); return () => window.clearTimeout(timer); }, [toast]);

  function updateElement(id: string, patch: Partial<FormElement>) {
    setDocument(current => ({ ...current, elements: current.elements.map(element => {
      if (element.id !== id) return element;
      if (element.kind === 'table') {
        if (patch.height !== undefined && !('rowHeight' in patch)) patch = { ...patch, rowHeight: patch.height / 2 };
        if ('rowHeight' in patch && patch.rowHeight !== undefined) patch = { ...patch, height: patch.rowHeight * 2 };
      }
      // Keep physical column widths consistent when the table frame is resized.
      if (element.kind === 'table' && patch.width !== undefined && !('columns' in patch)) {
        const total = element.columns.reduce((sum, column) => sum + column.width, 0);
        return { ...element, ...patch, columns: element.columns.map(column => ({ ...column, width: column.width / (total || 1) * patch.width! })) } as FormElement;
      }
      return { ...element, ...patch } as FormElement;
    }) }));
    setDirty(true);
  }
  function deleteSelected() {
    if (!selectedElement || preview) return;
    if (selectedElement.source?.deleteProtected) { notify(`Cannot delete this object: ${selectedElement.source.deleteProtected}`, true); return; }
    setDocument(current => ({ ...current, elements: current.elements.filter(element => element.id !== selectedElement.id) }));
    setSelected(null); setDirty(true);
  }
  function insert(element: FormElement) {
    setDocument(current => ({ ...current, elements: [...current.elements, element] })); setSelected(element.id); setDirty(true); setPreview(false);
  }
  function addText(preset?: 'header' | 'footer') {
    insert({ ...baseElement('text', 20, preset === 'header' ? 15 : preset === 'footer' ? 275 : 105), kind: 'text',
      text: preset === 'header' ? 'Page header' : preset === 'footer' ? 'Page footer' : 'New text',
      ...(preset ? { name: `${preset}_${makeId().slice(-6)}`, width: 170, fontSize: 9 } : {}) });
  }
  function addField(node?: DataNode, x = 20, y = 110) {
    const defaultNode = schema?.roots.flatMap(leafNodes).find(item => !item.repeating);
    const field = node ?? defaultNode;
    insert({ ...baseElement('field', x, y), kind: 'field', binding: field ? `$record.${field.path}` : '', ...(field ? { name: `${field.name}_${makeId().slice(-6)}` } : {}) });
  }
  function addTable(node?: DataNode, x = 20, y = 150) {
    const group = node ?? firstRepeating(schema?.roots ?? []);
    const leaves = group ? leafNodes(group).filter(item => item !== group) : [];
    const width = Math.min(170, document.page.width - x - 10);
    const columns: TableColumn[] = leaves.length ? leaves.map(item => ({
      id: makeId(), label: item.name, binding: `$.${item.path.slice(group!.path.length + 1)}`, width: width / leaves.length,
      align: item.type.toLowerCase().match(/decimal|int|float|double/) ? 'right' : 'left',
    })) : [{ id: makeId(), label: 'Description', binding: '$.DESCRIPTION', width: width * 0.65, align: 'left' }, { id: makeId(), label: 'Amount', binding: '$.AMOUNT', width: width * 0.35, align: 'right' }];
    insert({ ...baseElement('table', x, y), kind: 'table', binding: group ? `$record.${group.path}[*]` : '$record.ITEMS[*]',
      columns, width, height: 16, rowHeight: 8, borders: true, fontSize: 9 });
  }
  function addNode(node: DataNode, x = 20, y = 110) { if (node.repeating) addTable(node, x, y); else if (!node.children.length) addField(node, x, y); }

  async function openFile(event: ChangeEvent<HTMLInputElement>, kind: 'xdp' | 'xsd' | 'sample' | 'project') {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (kind === 'project' && file.size > 40_000_000) throw new Error('Projects must be smaller than 40 MB.');
      const text = kind === 'xdp' || kind === 'xsd' ? await readXmlFile(file) : await file.text();
      if (kind === 'xdp') { const imported = parseXdp(text, file.name); setDocument(imported); setSelected(null); setDirty(false); setPreview(false); notify(`Opened ${file.name} · ${imported.elements.length} supported objects`); }
      if (kind === 'xsd') { const imported = parseXsd(text); setSchema(imported); setSchemaName(file.name); setDirty(true); notify(`Loaded ${file.name}`); }
      if (kind === 'sample') { const imported = parseSampleData(text, file.name); setSample(imported); setSampleName(file.name); setDirty(true); notify(`Sample data loaded: ${file.name}`); }
      if (kind === 'project') {
        const project = readProject(text);
        const doc = project.document;
        setDocument(doc); setSchema(project.schema); setSchemaName(project.schemaName ?? ''); setSample(project.sample ?? {}); setSampleName(project.sampleName ?? ''); setSelected(null); setDirty(false); setPreview(false); notify(`Opened project ${file.name}`);
      }
    } catch (error) { notify(`Could not open ${file.name}: ${toError(error)}`, true); }
  }
  function saveProject() {
    const project: Project = { format: 'sap-form-studio', version: 1, document, schema, schemaName, sample, sampleName };
    download(JSON.stringify(project, null, 2), document.name.replace(/\.xdp$/i, '') + '.sapform.json', 'application/json'); setDirty(false); setMenuOpen(false); notify('Working project saved. Export XDP when you are ready for SAP.');
  }
  function actualExport() {
    try {
      const xml = serializeXdp(document, compatibility);
      download(xml, document.name.toLowerCase().endsWith('.xdp') ? document.name : `${document.name}.xdp`, 'application/vnd.adobe.xdp+xml');
      setModal(null); setDirty(false); notify('XDP exported. Upload to SFP and validate with your existing SAP ADS runtime.');
    } catch (error) { notify(`Export failed: ${toError(error)}`, true); }
  }
  function exportXdp() {
    try {
      const result = validateDocument(document, schema); setIssues(result);
      if (result.length) setModal('validation'); else actualExport();
    } catch (error) { notify(`Validation failed: ${toError(error)}`, true); }
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); return; }
      if (event.key === 'Escape') { setModal(null); setMenuOpen(false); setSelected(null); }
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]') || modal) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });
  const errorCount = issues.filter(issue => issue.severity === 'error').length;

  return <div className="app-shell">
    <input ref={xdpInput} type="file" accept=".xdp,application/xml,text/xml" hidden onChange={event => void openFile(event, 'xdp')} />
    <input ref={xsdInput} type="file" accept=".xsd,application/xml,text/xml" hidden onChange={event => void openFile(event, 'xsd')} />
    <input ref={sampleInput} type="file" accept=".json,.xml" hidden onChange={event => void openFile(event, 'sample')} />
    <input ref={projectInput} type="file" accept=".sapform.json,.json" hidden onChange={event => void openFile(event, 'project')} />
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><LayoutTemplate size={24} strokeWidth={1.6} /></div><div><strong>Form Studio<span>POC</span></strong><small>SAP ADOBE LAYOUT AUTHORING</small></div></div>
      <div className="document-title"><FileCode2 size={16} /><span>{document.name}</span>{dirty && <span className="unsaved-dot" title="Unsaved changes" />}<span className="document-kind">{document.synthetic ? 'Starter template' : 'Imported XDP'}</span></div>
      <div className="header-actions"><button className={`compatibility-toggle ${compatibility ? 'enabled' : ''}`} role="switch" aria-checked={compatibility} aria-label="Compatibility Mode" onClick={() => { setCompatibility(!compatibility); notify(compatibility ? 'Compatibility Mode off. Source preservation safeguards still apply.' : 'Compatibility Mode enabled. Unmanaged XFA is preserved.'); }}><ShieldCheck size={15} /><span>Compatibility Mode</span><span className="switch-track"><span /></span></button>
        <button className="icon-button help-button" title="About this proof of concept" aria-label="Help" onClick={() => setModal('help')}><CircleHelp size={18} /></button>
        <div className="project-menu"><button className="icon-button" title="Project options" aria-label="Project options" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={20} /></button>{menuOpen && <div className="dropdown-menu"><button onClick={saveProject}><Save size={15} />Save project <kbd>Ctrl S</kbd></button><button onClick={() => { projectInput.current?.click(); setMenuOpen(false); }}><FolderOpen size={15} />Open project</button><button onClick={() => { setModal('source'); setMenuOpen(false); }}><Code2 size={15} />View original XML</button><button onClick={() => { sampleInput.current?.click(); setMenuOpen(false); }}><FileJson2 size={15} />Load sample data</button></div>}</div>
      </div>
    </header>
    <div className="main-toolbar">
      <div className="toolbar-group file-tools"><button onClick={() => { setDocument(createDocument()); setSelected(null); setPreview(false); setDirty(false); notify('New starter form created. Test this synthetic template in your SAP environment before use.'); }}><FilePlus2 size={16} />New Form</button><button onClick={() => xsdInput.current?.click()}><Database size={16} />Open XSD</button><button onClick={() => xdpInput.current?.click()}><FolderOpen size={16} />Open XDP</button></div>
      <span className="toolbar-divider" /><div className="toolbar-group insert-tools"><button onClick={() => addText()} title="Add static text"><Type size={17} />Text</button><button onClick={() => addField()} title="Add bound field"><Braces size={17} />Field</button><button onClick={() => addTable()} title="Add repeating table"><Table2 size={17} />Table</button><div className="header-footer-tools"><button onClick={() => addText('header')} title="Add page header text" aria-label="Add header"><PanelTop size={16} /></button><button onClick={() => addText('footer')} title="Add page footer text" aria-label="Add footer"><PanelTop size={16} style={{ transform: 'rotate(180deg)' }} /></button></div></div>
      <div className="toolbar-spacer" /><button className={`preview-button ${preview ? 'active' : ''}`} onClick={() => { setPreview(!preview); setSelected(null); }}><Eye size={16} />{preview ? 'Back to editor' : 'Preview'}</button><button className="export-button" onClick={exportXdp}><Download size={16} />Export XDP</button>
    </div>
    <main className="workspace">
      <DataPanel document={document} schema={schema} schemaName={schemaName} selected={selected} onSelect={id => { setPreview(false); setSelected(id); }} onAdd={node => addNode(node)} onOpenSchema={() => xsdInput.current?.click()} />
      <section className="canvas-area">
        <div className="canvas-topbar"><div className="view-tabs"><button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}><LayoutTemplate size={13} />Design</button><button className={preview ? 'active' : ''} onClick={() => { setPreview(true); setSelected(null); }}><Eye size={13} />Browser Preview</button></div><div className="zoom-controls"><button className="icon-button" aria-label="Zoom out" onClick={() => setZoom(Math.max(40, zoom - 10))}><Minus size={13} /></button><button className="zoom-value" title="Reset zoom" onClick={() => setZoom(80)}>{zoom}%<ChevronDown size={11} /></button><button className="icon-button" aria-label="Zoom in" onClick={() => setZoom(Math.min(150, zoom + 10))}><Plus size={13} /></button><button className="icon-button fit-page" title="Fit page width" aria-label="Fit page width" onClick={() => { const center = window.document.querySelector('.canvas-area'); if (center) setZoom(Math.max(40, Math.min(100, Math.floor((center.clientWidth - 76) / (document.page.width * 96 / 25.4) * 100)))); }}><Maximize2 size={13} /></button></div></div>
        {preview ? <div className="preview-notice"><Eye size={14} /><span><strong>Browser Preview</strong> · Approximate layout, not SAP ADS output.</span><button onClick={() => sampleInput.current?.click()}><ArrowUpFromLine size={13} />{sampleName || 'Load sample data'}</button></div> : <div className="editing-notice"><span className="status-dot" /><span>{document.synthetic ? 'Starter form · Replace with your SAP-exported XDP for the compatibility test.' : 'Editing an in-memory copy · Original file is preserved.'}</span></div>}
        <Canvas document={document} selected={selected} zoom={zoom} preview={preview} sample={sample} onSelect={setSelected} onChange={updateElement} onDropNode={addNode} />
      </section>
      <Properties document={document} element={selectedElement} schema={schema} onChange={updateElement} onDelete={deleteSelected} onMargin={margin => { setDocument(current => ({ ...current, page: { ...current.page, margin } })); setDirty(true); }} />
    </main>
    <footer className="status-bar"><div><span className="status-dot" />{document.elements.length} objects<span className="status-separator" />{schema ? 'Schema loaded' : 'No schema'}<span className="status-separator" /><button onClick={() => sampleInput.current?.click()}>{sampleName ? 'Sample data ready' : 'Load sample data'}</button></div><div>{allWarnings.length > 0 && <button className="warnings-button" onClick={() => setWarningsExpanded(!warningsExpanded)}><AlertCircle size={12} />{allWarnings.length} {allWarnings.length === 1 ? 'notice' : 'notices'}</button>}<span className="status-separator" /><span>Author locally. Render with SAP ADS.</span></div></footer>
    {warningsExpanded && <div className="warnings-popover"><div><h3>Compatibility notices</h3><button className="icon-button" onClick={() => setWarningsExpanded(false)} aria-label="Close notices"><X size={15} /></button></div>{allWarnings.map((warning, index) => <p key={index}><AlertCircle size={14} /><span>{warning}</span></p>)}</div>}
    {toast && <div className={`toast ${toast.error ? 'error-toast' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <AlertCircle size={17} /> : <Check size={17} />}<span>{toast.text}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section className={`modal ${modal === 'source' ? 'source-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={19} /></button>
      {modal === 'help' && <><div className="modal-icon"><LayoutTemplate size={26} /></div><span className="eyebrow">A FOCUSED PROOF OF CONCEPT</span><h2 id="modal-title">Your layout. Your SAP runtime.</h2><p>Form Studio edits the layout-authoring step of SAP Adobe Forms. Your form interface and existing SAP ADS runtime remain in place.</p><div className="help-steps"><span><ArrowDownToLine size={19} /><strong>01 · Open</strong>Download XDP and XSD from SFP.</span><span><Type size={19} /><strong>02 · Design</strong>Edit text, fields and repeating tables.</span><span><ArrowUpFromLine size={19} /><strong>03 · Validate</strong>Upload XDP and test in SFP.</span></div><div className="modal-note"><Info size={17} /><p>Browser Preview is approximate. The synthetic starter has not been tested with SAP ADS. A real SAP-exported XDP is the recommended starting point. Unsupported XFA remains in the source, even when it is not visible on the canvas.</p></div><p className="keyboard-help"><kbd>Delete</kbd> Remove selected object <kbd>Ctrl / ⌘ S</kbd> Save working project</p><button className="export-button modal-primary" onClick={() => setModal(null)}>Back to the form</button></>}
      {modal === 'source' && <><span className="eyebrow">PRESERVED SOURCE</span><h2 id="modal-title">Original XDP XML</h2><p>This read-only source is retained alongside your edited layout. Export applies targeted changes to supported objects.</p><textarea className="source-editor" readOnly value={document.sourceXml} aria-label="Original XDP source" spellCheck={false} /><div className="modal-note"><ShieldCheck size={16} /><p>Unmanaged packets, namespaces and processing instructions are retained. Inspect your export and confirm it in SAP ADS.</p></div></>}
      {modal === 'validation' && <><div className={`modal-icon ${errorCount ? 'error-icon' : ''}`}>{errorCount ? <AlertCircle size={25} /> : <ShieldCheck size={25} />}</div><span className="eyebrow">XDP EXPORT CHECK</span><h2 id="modal-title">{errorCount ? 'Resolve these issues first' : 'Ready for your SAP test'}</h2><p>{errorCount ? `${errorCount} ${errorCount === 1 ? 'error blocks' : 'errors block'} export. Update the affected objects and try again.` : 'Local checks completed. Review these notices, then export your XDP for validation with SAP ADS.'}</p><div className="validation-list">{issues.map((issue, index) => <div className={`validation-item ${issue.severity}`} key={index}><AlertCircle size={16} /><div><strong>{issue.severity === 'error' ? 'Error' : 'Notice'}</strong><p>{issue.message}</p>{issue.elementId && <button onClick={() => { setSelected(issue.elementId!); setPreview(false); setModal(null); }}>Select affected object</button>}</div></div>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Back to editor</button><button className="export-button" disabled={errorCount > 0} onClick={actualExport}><Download size={16} />Download XDP</button></div></>}
    </section></div>}
  </div>;
}
