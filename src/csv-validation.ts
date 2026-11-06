import Papa from 'papaparse';

/** Check the input header before Papa turns rows into JavaScript objects.
 * Duplicate headers are otherwise silently renamed, and __proto__ is discarded. */
export function validateCsvHeaders(text: string): void {
 const result = Papa.parse<string[]>(text, {header:false, delimiter:',', skipEmptyLines:'greedy', preview:1});
 if (result.errors.length) throw new Error(`Invalid CSV header: ${result.errors.map(error => error.message).join('; ')}`);
 const headers = result.data[0];
 if (!headers?.length) throw new Error('The CSV file has no header row.');
 const seen = new Set<string>();
 for (const header of headers) {
  if (!header.trim()) throw new Error('CSV column names cannot be empty.');
  if (header === '__proto__') throw new Error('CSV column name "__proto__" is not supported; rename it before importing.');
  if (seen.has(header)) throw new Error(`Duplicate CSV column name: ${JSON.stringify(header)}. Rename the columns before importing.`);
  seen.add(header);
 }
}
