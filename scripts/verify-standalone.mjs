import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const file = fileURLToPath(new URL('../FormStudio.html', import.meta.url));
const html = await readFile(file, 'utf8');
assert.ok(html.includes('Copyright (c) 2026 Yavuz Selim Doğdu'), 'The standalone build includes the project license.');
assert.ok(html.includes('Permission is hereby granted'), 'The standalone build includes full license terms.');
const js = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
assert.ok(js, 'An inline application bundle must exist.');
assert.ok(!/<(?:script|link)\b[^>]+(?:src|href)=/.test(html), 'No external script/style assets.');
const dom = new JSDOM(html.replace(/<script type="module">[\s\S]*?<\/script>/, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'file:///FormStudio.html' });
dom.window.TextDecoder = TextDecoder;
dom.window.TextEncoder = TextEncoder;
// The Vite single-entry bundle has no remaining imports. Evaluate it after DOM creation,
// matching the deferred execution of an inline module in a desktop browser.
dom.window.eval(js);
await new Promise(resolve => setTimeout(resolve, 100));
assert.equal(dom.window.document.querySelectorAll('[data-element-id]').length, 14);
assert.ok(dom.window.document.body.textContent.includes('Schema loaded'));
const preview = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === 'Browser Preview');
assert.ok(preview);
preview.click();
await new Promise(resolve => setTimeout(resolve, 30));
assert.ok(dom.window.document.body.textContent.includes('INV-2026-0042'));
assert.ok(dom.window.document.body.textContent.includes('Cloud platform subscription'));
dom.window.close();
console.log('Standalone smoke check passed: 14 objects, bundled schema and sample-data preview; no external assets.');
