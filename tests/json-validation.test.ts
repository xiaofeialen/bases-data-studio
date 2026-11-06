import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseJsonUniqueKeys } from '../src/json-validation';

void test('keeps valid JSON and permits the same key in different objects', () => {
 const source = JSON.stringify([{id:'a',message:'inside string: },{,"',nested:{id:'b'}},{id:'c'}]);
 assert.deepEqual(parseJsonUniqueKeys(source), JSON.parse(source));
 assert.deepEqual(parseJsonUniqueKeys('[{"__proto__":"safe","constructor":2}]'), JSON.parse('[{"__proto__":"safe","constructor":2}]'));
});
void test('rejects repeated keys, including escaped equivalents and nested objects', () => {
 assert.throws(() => parseJsonUniqueKeys('[{"id":"a","x":1,"x":2}]'), /Duplicate JSON property "x"/);
 assert.throws(() => parseJsonUniqueKeys('[{"a":1,"\\u0061":2}]'), /Duplicate JSON property "a"/);
 assert.throws(() => parseJsonUniqueKeys('[{"x":[{"foo":1,"foo":2}]}]'), /Duplicate JSON property "foo"/);
});
void test('handles deep nesting without recursion and delegates syntax errors to JSON.parse', () => {
 const deep = '['.repeat(12000) + '0' + ']'.repeat(12000);
 assert.doesNotThrow(() => parseJsonUniqueKeys(deep));
 assert.throws(() => parseJsonUniqueKeys('[{"x":}]'), SyntaxError);
});
