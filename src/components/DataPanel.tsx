import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, FileCode2, Folder, GripVertical, Layers, ListTree, Plus, Repeat2, Search, Table2, Type } from 'lucide-react';
import type { DataNode, FormDocument, SchemaResult } from '../model';

interface Props {
  document: FormDocument; schema?: SchemaResult; schemaName: string; selected: string | null;
  onSelect: (id: string) => void; onAdd: (node: DataNode) => void; onOpenSchema: () => void;
}
function TreeNode({ node, depth, search, onAdd }: { node: DataNode; depth: number; search: string; onAdd: (node: DataNode) => void }) {
  const [expanded, setExpanded] = useState(true);
  const matches = (item: DataNode): boolean => item.name.toLowerCase().includes(search) || item.path.toLowerCase().includes(search) || item.children.some(matches);
  if (search && !matches(node)) return null;
  const branch = node.children.length > 0;
  const canAdd = node.repeating || !branch;
  return <div>
    <div className={`tree-node ${node.repeating ? 'repeating-node' : ''} ${canAdd ? 'draggable-node' : ''}`} style={{ paddingLeft: 13 + depth * 15 }}
      title={canAdd ? `${node.path} · Drag to canvas or double-click to add` : node.path} draggable={canAdd}
      onDragStart={event => { if (!canAdd) return; event.dataTransfer.setData('application/x-sap-field', JSON.stringify(node)); event.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={() => canAdd ? onAdd(node) : setExpanded(!expanded)}>
      {branch ? <button className="tree-chevron" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`} onClick={() => setExpanded(!expanded)}>{expanded || search ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="tree-chevron leaf-spacer" />}
      {node.repeating ? <Repeat2 size={14} className="repeat-icon" /> : branch ? <Folder size={14} className="folder-icon" /> : <span className="field-type-icon">{node.type.toLowerCase().match(/decimal|int|float|double/) ? '#' : 'T'}</span>}
      <span className="tree-node-name">{node.name}{node.repeating && <small>[]</small>}</span>
      {canAdd ? <button className="tree-add" title={`Add ${node.name} to form`} aria-label={`Add ${node.name} to form`} onClick={() => onAdd(node)}><Plus size={12} /></button> : <span className="node-count">{node.children.length}</span>}
    </div>
    {branch && (expanded || search) && node.children.map(child => <TreeNode key={child.id} node={child} depth={depth + 1} search={search} onAdd={onAdd} />)}
  </div>;
}
export default function DataPanel({ document, schema, schemaName, selected, onSelect, onAdd, onOpenSchema }: Props) {
  const [tab, setTab] = useState<'data' | 'layers'>('data');
  const [search, setSearch] = useState('');
  return <aside className="data-panel">
    <div className="left-tabs"><button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}><Database size={14} />Data context</button><button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}><Layers size={14} />Layers</button></div>
    {tab === 'data' ? <>
      <div className="context-header"><div className="context-label"><span>SAP FORM INTERFACE</span><button className="icon-button" aria-label="Open schema" title="Open XSD" onClick={onOpenSchema}><Plus size={14} /></button></div><div className="schema-filename"><FileCode2 size={14} /><span>{schemaName || 'No schema loaded'}</span></div></div>
      <label className="data-search"><Search size={14} /><input value={search} onChange={event => setSearch(event.target.value.toLowerCase())} placeholder="Find a field…" aria-label="Search data fields" /><kbd>⌕</kbd></label>
      <div className="tree-scroll">{schema?.roots.length ? schema.roots.map(node => <TreeNode key={node.id} node={node} depth={0} search={search} onAdd={onAdd} />) : <div className="empty-tree"><ListTree size={28} /><p>Your SAP data context starts here.</p><button className="full-width-button" onClick={onOpenSchema}>Open an XSD file</button></div>}</div>
      <div className="data-legend"><span><span className="field-type-icon">T</span> Field</span><span><Repeat2 size={13} />Repeating group</span></div>
      <div className="sidebar-tip"><GripVertical size={19} /><div><strong>Data, meet layout.</strong><p>Drag a field onto the page. Repeating groups become tables.</p></div></div>
    </> : <><div className="context-header"><div className="context-label"><span>PAGE 01 · {document.elements.length} OBJECTS</span></div></div><div className="tree-scroll layers-list">{document.elements.map(element => {
      const Icon = element.kind === 'text' ? Type : element.kind === 'field' ? Database : Table2;
      return <button key={element.id} className={`layer-item ${selected === element.id ? 'active' : ''}`} onClick={() => onSelect(element.id)}><Icon size={14} /><span>{element.name}</span><small>{element.kind}</small></button>;
    })}{!document.elements.length && <div className="empty-tree"><p>Add your first object from the toolbar.</p></div>}</div><div className="sidebar-tip"><Layers size={20} /><div><strong>Supported objects</strong><p>Other imported XFA structures stay preserved in the source.</p></div></div></>}
  </aside>;
}
