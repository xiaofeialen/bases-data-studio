import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateCsvHeaders } from '../src/csv-validation';

void test('accepts single columns, quoted commas, and BOM-prefixed files', () => {
 assert.doesNotThrow(() => validateCsvHeaders('id\n12.5\n'));
 assert.doesNotThrow(() => validateCsvHeaders('\ufeff"id","full, name"\n1,John\n'));
});
void test('rejects duplicate, blank and prototype-mutating CSV headers before parsing records', () => {
 assert.throws(() => validateCsvHeaders('id,name,name\n1,A,B\n'), /Duplicate CSV column name/);
 assert.throws(() => validateCsvHeaders('id,"name","name"\n1,A,B\n'), /Duplicate CSV column name/);
 assert.throws(() => validateCsvHeaders('id,  \n1,A\n'), /cannot be empty/);
 assert.throws(() => validateCsvHeaders('id,__proto__\n1,A\n'), /__proto__/);
 assert.throws(() => validateCsvHeaders(''), /no header row/);
});
