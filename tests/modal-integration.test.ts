import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildSync } from 'esbuild';
import { keyPath } from '../src/import-core';

type NodeElement = { tag: string; text: string; children: NodeElement[] };
type ModalInstance = {
 rows: Record<string, unknown>[]; fields: string[]; names: string[]; key: string; folder: string;
 rawRows: Record<string, unknown>[]; isCsv: boolean;
 contentEl: NodeElement; closed: boolean;
 preview(): Promise<void>; execute(): Promise<void>;
};
type ModalConstructor = new (app: unknown) => ModalInstance;
const tempDirectory = mkdtempSync(join(tmpdir(), 'bases-modal-test-'));
const outputPath = join(tempDirectory, 'modal.cjs');
buildSync({entryPoints:['src/modal.ts'],bundle:true,platform:'node',format:'cjs',outfile:outputPath,alias:{obsidian:resolve('tests/fixtures/obsidian-mock.txt')},loader:{'.txt':'js'},logLevel:'silent'});
const localRequire = createRequire(import.meta.url);
// Bundle the real modal with only the Obsidian boundary replaced.
const ImportModal = (localRequire(outputPath) as {ImportModal: ModalConstructor}).ImportModal;
rmSync(tempDirectory,{recursive:true,force:true});
const notices = (Object.getPrototypeOf(ImportModal) as {notices: string[]}).notices;

class FakeVault {
 files = new Map<string,string>();
 folders = new Set<string>();
 failPath = '';
 failReadPath = '';
 getAbstractFileByPath(path: string): object | null {return this.files.has(path) || this.folders.has(path) ? {path} : null;}
 getMarkdownFiles(): {path:string}[] {return [...this.files.keys()].filter(path=>path.endsWith('.md')).map(path=>({path}));}
 async cachedRead(file: {path:string}): Promise<string> {if(file.path===this.failReadPath) throw Error('injected read failure'); const text=this.files.get(file.path); if(text===undefined) throw Error('missing file'); return text;}
 async createFolder(path: string): Promise<void> {if(this.getAbstractFileByPath(path)) throw Error('already exists'); this.folders.add(path);}
 async create(path: string, content: string): Promise<void> {if(path === this.failPath) throw Error('injected write failure'); if(this.getAbstractFileByPath(path)) throw Error('already exists'); this.files.set(path,content);}
}
function modal(vault: FakeVault, rows: Record<string,unknown>[]): ModalInstance {
 const instance = new ImportModal({vault});
 instance.rows=rows; instance.fields=['id','name']; instance.names=['id','name']; instance.key='id'; instance.folder='Imported data';
 return instance;
}
function allText(node: NodeElement): string {return [node.text,...node.children.map(allText)].join('\n');}

void test('preview is read-only and import creates notes, a view and a log; reimport preserves edits',async()=>{
 notices.length=0; const vault=new FakeVault(); const first=modal(vault,[{id:'a',name:'Alice'},{id:'b',name:'Bob'}]);
 await first.preview();
 assert.equal(vault.files.size,0); assert.equal(vault.folders.size,0);
 assert.match(allText(first.contentEl),/New: 2; update: 0; skip: 0/);
 assert.match(allText(first.contentEl),/"name": "Alice"/);
 await first.execute();
 const pathA=`Imported data/${await keyPath('a')}`; const pathB=`Imported data/${await keyPath('b')}`;
 assert.match(vault.files.get(pathA)!,/^---\n.*"bases_data_studio_key": "a"/s);
 assert.match(vault.files.get(pathB)!,/"name": "Bob"/);
 assert.match(vault.files.get('Imported data/Imported records.base')!,/type: table/);
 assert.match(vault.files.get('Imported data/Imported records.base')!,/!note\.bases_data_studio_key\.isEmpty\(\)/);
 assert.ok([...vault.files].some(([path,text])=>path.includes('import-log-') && text.includes('Created: 2')));
 const edited = vault.files.get(pathA)! + '\nUser edit\n'; vault.files.set(pathA,edited);
 const retry=modal(vault,[{id:'a',name:'changed'},{id:'b',name:'changed'}]); await retry.preview();
 assert.match(allText(retry.contentEl),/New: 0; update: 0; skip: 2/);
 // Simulate a later retry while keeping the first log intact.
 const originalNow=Date.now; Date.now=()=>originalNow()+1000;
 try {await retry.execute();} finally {Date.now=originalNow;}
 assert.equal([...vault.files.keys()].filter(path=>path.includes('import-log-')).length,2);
 assert.equal(vault.files.get(pathA),edited); assert.match(vault.files.get(pathB)!,/"name": "Bob"/);
 assert.ok(notices.some(message=>message.includes('0 created, 2 skipped')));
});
void test('duplicate input keys are rejected before any write',async()=>{
 notices.length=0; const vault=new FakeVault(); const instance=modal(vault,[{id:'a',name:'A'},{id:'a',name:'B'}]);
 await instance.preview(); assert.equal(vault.files.size,0); assert.equal(vault.folders.size,0);
 assert.ok(notices.some(message=>message.includes('Duplicate key in input')));
});
void test('the new filtered view is created alongside the legacy view without overwriting it',async()=>{
 notices.length=0; const vault=new FakeVault();
 const legacyPath='Imported data/Imported data.base'; const legacy='views:\n  - type: table\n    name: My customized view\n';
 vault.files.set(legacyPath,legacy);
 const instance=modal(vault,[{id:'a',name:'Alice'}]); await instance.preview();
 assert.match(allText(instance.contentEl),/Imported data\/Imported records\.base/);
 await instance.execute();
 assert.equal(vault.files.get(legacyPath),legacy);
 const newPath='Imported data/Imported records.base';
 assert.match(vault.files.get(newPath)!,/!note\.bases_data_studio_key\.isEmpty\(\)/);
 const customizedNewView='views:\n  - type: table\n    name: Customized new view\n'; vault.files.set(newPath,customizedNewView);
 const retry=modal(vault,[{id:'a',name:'changed'}]); await retry.preview(); await retry.execute();
 assert.equal(vault.files.get(legacyPath),legacy);
 assert.equal(vault.files.get(newPath),customizedNewView);
});
void test('a failed note write is logged and other records still import',async()=>{
 notices.length=0; const vault=new FakeVault(); vault.failPath=`Imported data/${await keyPath('a')}`;
 const instance=modal(vault,[{id:'a',name:'A'},{id:'b',name:'B'}]); await instance.preview(); await instance.execute();
 assert.equal(vault.files.has(vault.failPath),false); assert.ok(vault.files.has(`Imported data/${await keyPath('b')}`));
 const log=[...vault.files].find(([path])=>path.includes('import-log-'))?.[1];
 assert.match(log!,/Created: 1\nSkipped: 0\nErrors: 1/); assert.match(log!,/injected write failure/);
});

void test('a same-millisecond retry preserves records and creates a separate log',async()=>{
 notices.length=0; const originalNow=Date.now; Date.now=()=>123456;
 try {
  const vault=new FakeVault(); const first=modal(vault,[{id:'a',name:'A'}]);
  await first.preview(); await first.execute();
  const retry=modal(vault,[{id:'a',name:'changed'}]); await retry.preview(); await retry.execute();
  assert.match(vault.files.get(`Imported data/${await keyPath('a')}`)!,/"name": "A"/);
  assert.ok(notices.some(message=>message.includes('Import finished: 0 created, 1 skipped, 0 errors')));
  assert.equal([...vault.files.keys()].filter(path=>path.includes('import-log-')).length,2);
 } finally {Date.now=originalNow;}
});

void test('a moved or renamed imported note is found and preserved on reimport',async()=>{
 notices.length=0; const vault=new FakeVault(); const first=modal(vault,[{id:'a',name:'A'}]);
 await first.preview(); await first.execute();
 const original=`Imported data/${await keyPath('a')}`; const edited=vault.files.get(original)!+'\nHand edited';
 vault.files.delete(original); vault.files.set('Other folder/Renamed.md',edited);
 const retry=modal(vault,[{id:'a',name:'changed'}]); await retry.preview();
 assert.match(allText(retry.contentEl),/skip:\s*1/i);
 await retry.execute();
 assert.equal(vault.files.has(original),false); assert.equal(vault.files.get('Other folder/Renamed.md'),edited);
});

void test('the same key in two separate source folders creates independent notes',async()=>{
 notices.length=0; const vault=new FakeVault(); const first=modal(vault,[{id:'a',name:'A'}]); first.folder='First source';
 await first.preview(); await first.execute();
 const second=modal(vault,[{id:'a',name:'B'}]); second.folder='Second source'; await second.preview();
 assert.match(allText(second.contentEl),/new:\s*1/i); await second.execute();
 assert.match(vault.files.get(`First source/${await keyPath('a')}`)!,/"name": "A"/);
 assert.match(vault.files.get(`Second source/${await keyPath('a')}`)!,/"name": "B"/);
});

void test('ambiguous 0.1.0 numeric keys produce conflict instead of a duplicate or overwrite',async()=>{
 notices.length=0; const vault=new FakeVault(); const legacy=`Imported data/${await keyPath('12.5')}`;
 const existing='---\n"bases_data_studio_key": "12.5"\n"id": 12.5\n---\nOriginal user note';
 vault.files.set(legacy,existing);
 const retry=modal(vault,[{id:12.5,name:'A'}]); retry.isCsv=true; retry.rawRows=[{id:'12.50',name:'A'}];
 await retry.preview(); assert.match(allText(retry.contentEl),/conflict/i);
 await retry.execute();
 assert.equal(vault.files.get(legacy),existing); assert.equal(vault.files.has(`Imported data/${await keyPath('12.50')}`),false);
});

void test('a note moved between preview and confirmation does not get duplicated',async()=>{
 notices.length=0; const vault=new FakeVault(); const first=modal(vault,[{id:'a',name:'A'}]);
 await first.preview(); await first.execute();
 const original=`Imported data/${await keyPath('a')}`; const existing=vault.files.get(original)!;
 // A preview prepared before this change has to be rechecked at execution time.
 vault.files.delete(original);
 const retry=modal(vault,[{id:'a',name:'changed'}]); await retry.preview();
 assert.match(allText(retry.contentEl),/new:\s*1/i);
 vault.files.set('Moved between preview and confirmation.md',existing);
 await retry.execute();
 assert.equal(vault.files.has(original),false);
 assert.equal(vault.files.get('Moved between preview and confirmation.md'),existing);
 assert.ok(notices.some(message=>message.includes('Vault contents changed after preview')));
});

void test('an unrelated existing file at the target path is a conflict and stays intact',async()=>{
 notices.length=0; const vault=new FakeVault(); const path=`Imported data/${await keyPath('a')}`;
 vault.files.set(path,'My unrelated note');
 const instance=modal(vault,[{id:'a',name:'new'}]); await instance.preview();
 assert.match(allText(instance.contentEl),/conflict:\s*1/i); assert.match(allText(instance.contentEl),/Target path is occupied/i);
 await instance.execute(); assert.equal(vault.files.get(path),'My unrelated note');
});

void test('an unreadable note aborts preview rather than silently allowing a duplicate',async()=>{
 notices.length=0; const vault=new FakeVault(); vault.files.set('Moved.md','---\nbases_data_studio_key: a\n---\n'); vault.failReadPath='Moved.md';
 const instance=modal(vault,[{id:'a',name:'new'}]); await instance.preview();
 assert.ok(notices.some(message=>message.includes('Preview failed') && message.includes('injected read failure')));
 assert.equal(vault.files.size,1); assert.equal(vault.folders.size,0);
});
