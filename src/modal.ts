import { App, Modal, Notice, normalizePath } from 'obsidian';
import { infer, keyPath, parseInput, renderNote, Row, stableKey, validateMapping } from './import-core';

type Item = {path:string; content:string; status:'create'|'skip'};
export class ImportModal extends Modal {
 private rows: Row[] = [];
 private fields: string[] = [];
 private names: string[] = [];
 private key = '';
 private folder = 'Imported data';
 private plan: Item[] = [];
 private busy = false;
 constructor(app: App) { super(app); }
 onOpen(): void { this.showSetup(); }
 private showSetup(): void {
  const el = this.contentEl; el.empty(); el.createEl('h2',{text:'Import CSV or JSON'});
  el.createEl('p',{text:'Choose a local file. Existing notes are skipped to protect your edits.'});
  const input = el.createEl('input',{type:'file'}); input.accept = '.csv,.json';
  input.onchange = () => { void (async () => { try {
   const file = input.files?.[0]; if (!file) return;
   this.rows = parseInput(await file.text(), file.name);
   this.fields = Array.from(new Set(this.rows.flatMap(r => Object.keys(r))));
   this.names = [...this.fields]; this.key = this.fields[0] ?? ''; this.showMapping();
  } catch (e) { new Notice(`Cannot read file: ${String(e)}`); } })(); };
 }
 private showMapping(): void {
  const el = this.contentEl; el.empty(); el.createEl('h2',{text:'Map fields'});
  el.createEl('p',{text:'Leave a property name blank to omit it. The unique key identifies records across imports.'});
  const folder = el.createEl('input',{type:'text',value:this.folder}); folder.setAttribute('aria-label','Destination folder');
  folder.oninput = () => { this.folder = folder.value; };
  const select = el.createEl('select'); select.setAttribute('aria-label','Unique key field');
  this.fields.forEach(field => select.createEl('option',{text:field,value:field}));
  select.value = this.key; select.onchange = () => {this.key=select.value;};
  this.fields.forEach((field,i) => {
   const line = el.createDiv(); line.createSpan({text:`${field} → `});
   const name = line.createEl('input',{type:'text',value:this.names[i]});
   name.setAttribute('aria-label',`Property for ${field}`); name.oninput=()=>{this.names[i]=name.value.trim();};
   line.createSpan({text:` (example: ${String(infer(this.rows[0]?.[field] ?? ''))})`});
  });
  const button=el.createEl('button',{text:'Preview import'}); button.onclick=()=>{void this.preview();};
 }
 private async preview(): Promise<void> {
  try {
   validateMapping(this.fields,this.names,this.key);
   const raw = this.folder.trim().replace(/\\/g,'/');
   if (!raw || raw.startsWith('/') || raw.split('/').some(s => !s || s === '.' || s === '..') || Array.from(raw).some(c => c.charCodeAt(0) < 32)) throw new Error('Enter a valid vault folder.');
   this.folder=normalizePath(raw); const seen=new Set<string>(); const plan:Item[]=[];
   for (const row of this.rows) {
    const key=stableKey(row[this.key]); if(seen.has(key)) throw new Error(`Duplicate key in input: ${key}`); seen.add(key);
    const path=normalizePath(`${this.folder}/${await keyPath(key)}`);
    plan.push({path,content:renderNote(key,row,this.fields,this.names),status:this.app.vault.getAbstractFileByPath(path) ? 'skip':'create'});
   }
   this.plan=plan; this.showPreview();
  } catch(e) {new Notice(`Preview failed: ${String(e)}`);}
 }
 private showPreview():void {
  const el=this.contentEl; el.empty(); el.createEl('h2',{text:'Preview import'});
  el.createEl('p',{text:`New: ${this.plan.filter(x=>x.status==='create').length}; update: 0; skip: ${this.plan.filter(x=>x.status==='skip').length}. Existing notes are never overwritten.`});
  const list=el.createEl('ul'); this.plan.forEach(x=>list.createEl('li',{text:`${x.status}: ${x.path}`}));
  const back=el.createEl('button',{text:'Back'}); back.onclick=()=>this.showMapping();
  const run=el.createEl('button',{text:'Import'}); run.onclick=()=>{void this.execute();};
 }
 private async execute():Promise<void> {
  if(this.busy) return; this.busy=true; let created=0, skipped=0; const errors:string[]=[];
  try {
   let current=''; for(const part of this.folder.split('/')) {current=current ? `${current}/${part}` : part; if(!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);}
   for(const item of this.plan) {
    if(item.status==='skip' || this.app.vault.getAbstractFileByPath(item.path)) {skipped++; continue;}
    try {await this.app.vault.create(item.path,item.content); created++;} catch(e) {errors.push(`${item.path}: ${String(e)}`);}
   }
   const basePath=normalizePath(`${this.folder}/Imported data.base`);
   if(!this.app.vault.getAbstractFileByPath(basePath)) {
    const formula = `file.inFolder(${JSON.stringify(this.folder)})`;
    await this.app.vault.create(basePath,`filters:\n  and:\n    - ${JSON.stringify(formula)}\nviews:\n  - type: table\n    name: Data\n`);
   }
   const logPath=normalizePath(`${this.folder}/import-log-${Date.now()}.md`);
   await this.app.vault.create(logPath,`# Import log\n\nCreated: ${created}\nSkipped: ${skipped}\nErrors: ${errors.length}\n\n${errors.map(e=>`- ${e.replace(/[\r\n]/g,' ')}`).join('\n')}\n`);
   new Notice(`Import finished: ${created} created, ${skipped} skipped, ${errors.length} errors.`); this.close();
  } catch(e) {new Notice(`Import stopped after ${created} creations: ${String(e)}. Retry to skip existing notes.`, 12000);} finally {this.busy=false;}
 }
 onClose():void {this.contentEl.empty();}
}
