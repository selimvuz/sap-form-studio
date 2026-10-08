import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
let html = await readFile(path.join(dist, 'index.html'), 'utf8');
const script = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
const style = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g;
for (const match of [...html.matchAll(script)]) {
  const js = await readFile(path.join(dist, match[1].replace(/^\//, '')), 'utf8');
  html = html.replace(match[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
}
for (const match of [...html.matchAll(style)]) {
  const css = await readFile(path.join(dist, match[1].replace(/^\//, '')), 'utf8');
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
if (/<(?:script|link)[^>]+(?:src|href)="\//.test(html)) throw new Error('A standalone asset was not inlined.');
const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const licenseText = `Form Studio\n\n${license}\n\n${notices}`;
if (licenseText.includes('-->')) throw new Error('License notice contains an HTML comment terminator.');
html = html.replace(/<!doctype html>/i, match => `${match}\n<!--\n${licenseText}\n-->`);
await writeFile(path.join(root, 'FormStudio.html'), html, 'utf8');
console.log('Built FormStudio.html — open directly in a browser; no server required.');
