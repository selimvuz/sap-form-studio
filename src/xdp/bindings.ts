/** Deliberately narrow SOM mapping. Imported expressions are retained unchanged unless explicitly edited. */
export function xfaBinding(path: string, relative = false): string {
  const trimmed = path.trim();
  if (!trimmed || /^[!$]/.test(trimmed)) return trimmed;
  return `${relative ? '$.' : '$record.'}${trimmed}`;
}
export function repeatBinding(path: string): string {
  const ref = xfaBinding(path);
  return /\[(?:\*|\d+)\]$/.test(ref) ? ref : `${ref}[*]`;
}
export function normalizeBinding(path: string): string {
  return path.replace(/^\$record\.?/, '').replace(/^\$\./, '').replace(/\[(?:\*|\d*)\]/g, '').replace(/^\./, '');
}
