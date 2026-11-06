import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseInput, infer, stableKey, validateMapping, keyPath, renderNote, legacyKeys } from '../src/import-core';
void test('CSV quoting and JSON validation',()=>{assert.deepEqual(parseInput('id,name\n1,"A, B"','x.csv'),[{id:1,name:'A, B'}]); assert.throws(()=>parseInput('{}','x.json'));});
void test('types and keys',()=>{assert.equal(infer('001'), '001'); assert.equal(infer('12.5'),12.5); assert.equal(infer('false'),false); assert.throws(()=>stableKey('  ')); assert.throws(()=>validateMapping(['id'],['x'],'missing'));});
void test('stable filenames and safe YAML quoting',async()=>{assert.equal(await keyPath('a'),await keyPath('a')); assert.notEqual(await keyPath('a'),await keyPath('b')); assert.match(renderNote('a\nb',{id:'x\ny'},['id'],['title']),/"x\\ny"/);});
void test('preserves high precision CSV fields as text',()=>{assert.equal(infer('9007199254740993'),'9007199254740993'); assert.equal(infer('0.1234567890123456789'),'0.1234567890123456789'); assert.equal(infer('12.50'),12.5); assert.deepEqual(parseInput('id,value\n9007199254740993,0.1234567890123456789','x.csv'),[{id:'9007199254740993',value:'0.1234567890123456789'}]);});
void test('JSON retains strings and null; rejects unsupported structures and unsafe numbers',()=>{const row=parseInput('[{"id":"001","text":"true","value":null,"tags":["a","b"]}]','x.json')[0]!; assert.equal(row.text,'true'); assert.match(renderNote('001',row,['text','value'],['text','value']),/"text": "true"\n"value": null/); assert.throws(()=>parseInput('[{"id":9007199254740993}]','x.json'),/represented safely/); assert.throws(()=>parseInput('[{"id":0.1234567890123456789}]','x.json'),/represented safely/); assert.throws(()=>parseInput('[{"id":1,"obj":{"x":1}}]','x.json'),/nested objects/); assert.throws(()=>parseInput('[{"id":1,"list":[1]}]','x.json'),/not supported/); assert.equal(parseInput('[{"id":1e2,"text":"9007199254740993"}]','x.json')[0]?.id,100);});

void test('imports single-column CSV with and without a final newline',()=>{assert.deepEqual(parseInput('id\na\nb\n','x.csv'),[{id:'a'},{id:'b'}]); assert.deepEqual(parseInput('id\n12.50','x.csv'),[{id:12.5}]);});

void test('raw CSV keys retain their original text while other values can be inferred',()=>{const rows=parseInput('id,value\n12.50,3\n12.5,4\nTRUE,5\ntrue,6','x.csv',{inferCsv:false}); assert.deepEqual(rows.map(row=>stableKey(row.id)),['12.50','12.5','TRUE','true']); assert.deepEqual(rows.map(row=>infer(row.value)),[3,4,5,6]); assert.equal(stableKey('  ID  '),'  ID  '); assert.match(renderNote(stableKey(rows[0]!.id),rows[0]!,['id'],['id']),/"id": "12.50"/);});

void test('legacy keys identify lossy 0.1.0 conversions without collapsing new keys',()=>{
 assert.deepEqual(legacyKeys(' 12.50 ',true),['12.50','12.5']);
 assert.deepEqual(legacyKeys('TRUE',true),['TRUE','true']);
 assert.deepEqual(legacyKeys('12.50',false),['12.50']);
 assert.throws(()=>validateMapping(['id'],['Bases_Data_Studio_Source'],'id'),/reserved/);
 assert.match(renderNote('a',{},[],[],'folder'),/"bases_data_studio_source": "folder"/);
});
void test('rejects duplicate or unsafe input fields before data is lost',()=>{
 assert.throws(()=>parseInput('id,name,name\n1,A,B\n','x.csv'),/Duplicate CSV column name/);
 assert.throws(()=>parseInput('id,__proto__\n1,A\n','x.csv'),/__proto__/);
 assert.throws(()=>parseInput('[{"id":"a","name":"A","name":"B"}]','x.json'),/Duplicate JSON/);
});

void test('rejects property names that differ only by case',()=>{assert.throws(()=>validateMapping(['a','b'],['Name','name'],'a'),/unique/);});
