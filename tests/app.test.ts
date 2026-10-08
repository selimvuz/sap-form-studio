import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../src/App';
import { parseXdp } from '../src/xdp';
import fixture from './fixtures/preservation.xdp?raw';

const sample = { HEADER: { VBELN: '9000012345', KUNNR: '100000' }, ITEMS: [{ POSNR: '10', MATNR: 'MAT-001', ARKTX: 'Example Product', FKIMG: '2', NETWR: '500.00' }] };
const opaquePacket = fixture.slice(fixture.indexOf('  <vendor:opaque'), fixture.indexOf('\n  <x:xmpmeta'));
const tailPackets = fixture.slice(fixture.indexOf('  <config'));
let container: HTMLDivElement;
let root: Root;
let blobs: Blob[];
let downloads: { name: string; attached: boolean; href: string }[];

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find(candidate => candidate.getAttribute('aria-label') === label || candidate.textContent?.trim() === label);
  expect(match, `Expected a button named "${label}"`).toBeDefined();
  return match!;
}
async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}
async function importXdp(text: string, name = 'sap-layout.xdp') {
  const input = container.querySelector<HTMLInputElement>('input[type="file"][accept^=".xdp"]')!;
  const bytes = new TextEncoder().encode(text);
  const file = new File([text], name, { type: 'application/xml' });
  // jsdom's File implements FileReader but not File.arrayBuffer in every version.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function importSampleData() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"][accept=".json,.xml"]')!;
  const json = JSON.stringify(sample);
  const file = new File([json], 'preview-data.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => json });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function changeText(value: string) {
  const input = container.querySelector<HTMLTextAreaElement>('.properties-panel textarea');
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    input!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
const objectCount = () => container.querySelectorAll('[data-element-id]').length;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  blobs = [];
  downloads = [];
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL(blob: Blob) { blobs.push(blob); return `blob:app-test/${blobs.length}`; }
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, attached: this.isConnected, href: this.href });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(App)); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Application import, authoring and export flow', () => {
  it('exports edited text, a schema-bound field and a repeating table while preserving unrelated XDP', async () => {
    expect(button('Compatibility Mode').getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('invoice.xsd');
    await importXdp(fixture);
    await importSampleData();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Sample data loaded: preview-data.json');
    expect(objectCount()).toBe(3);
    await click(button('Layers'));
    const titleLayer = [...container.querySelectorAll<HTMLButtonElement>('.layer-item')].find(layer => layer.querySelector('span')?.textContent === 'Title');
    expect(titleLayer).toBeDefined();
    await click(titleLayer!);
    await changeText('Invoice edited outside LiveCycle — A & B');
    expect(container.querySelector('[data-element-name="Title"]')?.textContent).toContain('Invoice edited outside LiveCycle — A & B');
    await click(button('Data context'));
    await click(button('Add KUNNR to form'));
    await click(button('Add ITEMS to form'));
    expect(objectCount()).toBe(5);

    await click(button('Preview'));
    expect(container.querySelector('.preview-page')?.textContent).toContain('100000');
    expect(container.querySelector('.preview-page')?.textContent).toContain('Example Product');
    expect(container.querySelector('.preview-notice')?.textContent).toContain('not SAP ADS output');
    await click(button('Back to editor'));
    await click(button('Export XDP'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button('Download XDP').disabled).toBe(false);
    await click(button('Download XDP'));

    expect(downloads).toEqual([{ name: 'sap-layout.xdp', attached: true, href: 'blob:app-test/1' }]);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('application/vnd.adobe.xdp+xml');
    const output = await readBlob(blobs[0]);
    const exported = parseXdp(output, downloads[0].name);
    const title = exported.elements.find(element => element.name === 'Title');
    expect(title?.kind === 'text' && title.text).toBe('Invoice edited outside LiveCycle — A & B');
    expect(exported.elements.some(element => element.kind === 'field' && element.binding === '$record.HEADER.KUNNR')).toBe(true);
    const table = exported.elements.find(element => element.kind === 'table');
    expect(table?.kind === 'table' && table.binding).toBe('$record.ITEMS[*]');
    expect(table?.kind === 'table' && table.columns.map(column => column.binding)).toEqual(['$.POSNR', '$.MATNR', '$.ARKTX', '$.FKIMG', '$.NETWR']);
    expect(output).toContain(opaquePacket);
    expect(output.slice(output.indexOf('  <config'))).toBe(tailPackets);
    expect(output).toContain('<?formServer defaultPDFRenderFormat acrobat10.0dynamic?>');
    expect(output).toContain('<?renderCache.subset "Helvetica" 0 0 UTF-16 2 4 0041?>');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('XDP exported');
  });

  it('retains the current imported layout when another XDP is malformed', async () => {
    await importXdp(fixture);
    await importXdp('<broken>', 'invalid.xdp');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not open invalid.xdp');
    expect(objectCount()).toBe(3);
    expect(container.querySelector('.document-title')?.textContent).toContain('sap-layout.xdp');
    expect(container.querySelector('[data-element-name="Title"]')?.textContent).toBe('Before & after');
    expect(downloads).toHaveLength(0);
  });

  it('supports Delete for a newly added object while keeping imported protected objects', async () => {
    await importXdp(fixture);
    await click(button('Text'));
    expect(objectCount()).toBe(4);
    await act(async () => { container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    expect(objectCount()).toBe(3);
    await click(button('Layers'));
    const titleLayer = [...container.querySelectorAll<HTMLButtonElement>('.layer-item')].find(layer => layer.querySelector('span')?.textContent === 'Title');
    await click(titleLayer!);
    await act(async () => { container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    expect(objectCount()).toBe(3);
    expect(container.querySelector('[data-element-name="Title"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Cannot delete this object');
  });

  it('resizes an object with a pointer gesture and exports the new physical dimensions', async () => {
    await importXdp(fixture);
    await click(button('Text'));
    const object = container.querySelector<HTMLElement>('.canvas-element.selected')!;
    const name = object.dataset.elementName;
    expect(object.style.width).toBe('65mm');
    expect(object.style.height).toBe('9mm');
    const handle = object.querySelector<HTMLElement>('[aria-label="Resize selected element"]')!;
    const capture = vi.fn();
    Object.defineProperty(handle, 'setPointerCapture', { value: capture });
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerId', { value: 7 });
      return event;
    };
    const pixelsPerMm = (96 / 25.4) * 0.8; // The app starts at 80% canvas zoom.
    await act(async () => { handle.dispatchEvent(pointer('pointerdown', 100, 100)); });
    await act(async () => { handle.dispatchEvent(pointer('pointermove', 100 + 10 * pixelsPerMm, 100 + 5 * pixelsPerMm)); });
    await act(async () => { handle.dispatchEvent(pointer('pointerup', 100 + 10 * pixelsPerMm, 100 + 5 * pixelsPerMm)); });
    expect(capture).toHaveBeenCalledWith(7);
    expect(object.style.width).toBe('75mm');
    expect(object.style.height).toBe('14mm');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Width"]')?.value).toBe('75');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Height"]')?.value).toBe('14');
    await click(button('Export XDP'));
    await click(button('Download XDP'));
    const output = parseXdp(await readBlob(blobs[0]), downloads[0].name);
    const resized = output.elements.find(element => element.name === name);
    expect(resized?.width).toBe(75);
    expect(resized?.height).toBe(14);
    expect(resized?.x).toBe(20);
    expect(resized?.y).toBe(105);
  });
});
