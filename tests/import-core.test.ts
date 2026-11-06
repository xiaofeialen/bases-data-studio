import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseInput, infer, stableKey, validateMapping, keyPath, renderNote } from '../src/import-core';
void test('CSV quoting and JSON validation',()=>{assert.deepEqual(parseInput('id,name\n1,"A, B"','x.csv'),[{id:'1',name:'A, B'}]); assert.throws(()=>parseInput('{}','x.json'));});
void test('types and keys',()=>{assert.equal(infer('001'), '001'); assert.equal(infer('12.5'),12.5); assert.equal(infer('false'),false); assert.throws(()=>stableKey('  ')); assert.throws(()=>validateMapping(['id'],['x'],'missing'));});
void test('stable filenames and safe YAML quoting',async()=>{assert.equal(await keyPath('a'),await keyPath('a')); assert.notEqual(await keyPath('a'),await keyPath('b')); assert.match(renderNote('a\nb',{id:'x\ny'},['id'],['title']),/"x\\ny"/);});
