import Papa from 'papaparse';

export type Row = Record<string, unknown>;

// Compare decimal values without converting their digits to a floating point number.
function decimalParts(text: string): string | null {
 const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
 if (!match) return null;
 const fraction = match[3] ?? '';
 let digits = ((match[2] ?? '') + fraction).replace(/^0+/, '');
 if (!digits) return '0';
 let exponent = Number(match[4] ?? 0) - fraction.length;
 if (!Number.isSafeInteger(exponent)) return null;
 while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
 return `${match[1]}${digits}e${exponent}`;
}
function safeNumber(text: string): number | null {
 const value = Number(text);
 if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) return null;
 if (Object.is(value, -0)) return null;
 return decimalParts(text) === decimalParts(String(value)) ? value : null;
}
// JSON.parse silently rounds large and high-precision numeric literals. Check the
// original tokens first so we can reject the file instead of changing its data.
function validateJsonNumbers(text: string): void {
 let quoted = false, escaped = false;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
  if (c === '"') { quoted = true; continue; }
  if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) {
   const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))?.[0];
   if (token) { if (safeNumber(token) === null) throw new Error(`JSON number cannot be represented safely: ${token}. Quote it to import as text.`); i += token.length - 1; }
  }
 }
}
function validateValue(value: unknown, field: string, row: number): void {
 if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
 if (Array.isArray(value) && value.every(item => typeof item === 'string')) return;
 throw new Error(`Row ${row}, field ${JSON.stringify(field)}: use a scalar, null, or a list of text; nested objects and other lists are not supported.`);
}
export function parseInput(text: string, name: string): Row[] {
 let rows: unknown;
 if (name.toLowerCase().endsWith('.csv')) {
  const result = Papa.parse<Row>(text, {header:true, skipEmptyLines:'greedy'});
  if (result.errors.length) throw new Error(result.errors.map(e => `Row ${e.row ?? '?'}: ${e.message}`).join('\n'));
  rows = result.data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, infer(value)])));
 } else if (name.toLowerCase().endsWith('.json')) { validateJsonNumbers(text); rows = JSON.parse(text); }
 else throw new Error('Choose a CSV or JSON file.');
 if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Expected an array of objects.');
 if (!rows.length) throw new Error('The file contains no records.');
 (rows as Row[]).forEach((row, i) => Object.entries(row).forEach(([field, value]) => validateValue(value, field, i + 1)));
 return rows as Row[];
}
export function infer(value: unknown): unknown {
 if (typeof value !== 'string') return value;
 const s = value.trim();
 if (s === '') return '';
 if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
 if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return safeNumber(s) ?? value;
 return value;
}
export function validateMapping(fields: string[], names: string[], key: string): void {
 if (!fields.includes(key)) throw new Error('Select a unique key field.');
 const selected = names.filter(Boolean);
 if (selected.some(n => /[\r\n]/.test(n) || n === 'bases_data_studio_key')) throw new Error('Property names must be single-line and cannot use the reserved key name.');
 if (new Set(selected).size !== selected.length) throw new Error('Property names must be unique.');
}
export function stableKey(value: unknown): string {
 if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new Error('Keys must be nonempty strings, numbers or booleans.');
 const s = String(value).trim(); if (!s) throw new Error('Keys cannot be empty.'); return s;
}
export async function keyPath(key: string): Promise<string> {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
 return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('') + '.md';
}
// JSON scalar and collection syntax is also valid YAML; quoting avoids YAML injection.
export function renderNote(key: string, row: Row, fields: string[], names: string[]): string {
 const lines = [`${JSON.stringify('bases_data_studio_key')}: ${JSON.stringify(key)}`];
 fields.forEach((field,i) => { const name = names[i]; if (name) lines.push(`${JSON.stringify(name)}: ${JSON.stringify(row[field] === undefined ? '' : row[field])}`); });
 return `---\n${lines.join('\n')}\n---\n`;
}
