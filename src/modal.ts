import { App, Modal, Notice, normalizePath, getFrontMatterInfo, parseYaml } from 'obsidian';
import { infer, keyPath, legacyKeys, parseInput, renderNote, Row, stableKey, validateMapping } from './import-core';

type Status = 'create'|'skip'|'conflict';
type Item = {key:string; path:string; content:string; status:Status; aliases:string[]; reason?:string};
type Existing = {key:string; source?:string; path:string};
export class ImportModal extends Modal {
 private rows: Row[] = [];
 private rawRows: Row[] = [];
 private isCsv = false;
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
   this.isCsv = file.name.toLowerCase().endsWith('.csv');
   this.rawRows = parseInput(await file.text(), file.name, {inferCsv:false});
   this.rows = this.isCsv ? this.rawRows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, infer(value)]))) : this.rawRows;
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
  select.value = this.key;
  const examples: HTMLElement[] = [];
  const updateExamples = () => this.fields.forEach((field, i) => { const example = this.isCsv && field === this.key ? this.rawRows[0]?.[field] : this.rows[0]?.[field]; const target = examples[i]; if (target) target.setText(` (example: ${JSON.stringify(example === undefined ? '' : example)})`); });
  select.onchange = () => {this.key=select.value; updateExamples();};
  this.fields.forEach((field,i) => {
   const line = el.createDiv(); line.createSpan({text:`${field} → `});
   const name = line.createEl('input',{type:'text',value:this.names[i]});
   name.setAttribute('aria-label',`Property for ${field}`); name.oninput=()=>{this.names[i]=name.value.trim();};
   examples.push(line.createSpan());
  });
  updateExamples();
  const button=el.createEl('button',{text:'Preview import'}); button.onclick=()=>{void this.preview();};
 }
 private async preview(): Promise<void> {
  try {
   validateMapping(this.fields,this.names,this.key);
   const raw = this.folder.trim().replace(/\\/g,'/');
   if (!raw || raw.startsWith('/') || raw.split('/').some(s => !s || s === '.' || s === '..') || Array.from(raw).some(c => c.charCodeAt(0) < 32)) throw new Error('Enter a valid vault folder.');
   this.folder=normalizePath(raw); const seen=new Set<string>(); const plan:Item[]=[];
   const existing=await this.indexNotes();
   for (const [index, row] of this.rows.entries()) {
    const keyValue = this.isCsv ? this.rawRows[index]?.[this.key] : row[this.key];
    const key=stableKey(keyValue); if(seen.has(key)) throw new Error(`Duplicate key in input: ${key}`); seen.add(key);
    const path=normalizePath(`${this.folder}/${await keyPath(key)}`);
    const noteRow = this.isCsv ? {...row, [this.key]: keyValue} : row;
    const aliases=legacyKeys(key,this.isCsv);
    const result=this.classify(existing,key,path,aliases);
    plan.push({key,path,aliases,content:renderNote(key,noteRow,this.fields,this.names,this.folder),...result});
   }
   this.plan=plan; this.showPreview();
  } catch(e) {new Notice(`Preview failed: ${String(e)}`);}
 }
 // Read the actual frontmatter instead of relying on a potentially stale metadata cache.
 // Fail closed if a note with our marker cannot be read or parsed.
 private async indexNotes():Promise<Existing[]> {
  const records:Existing[]=[];
  for(const file of this.app.vault.getMarkdownFiles()) {
   const content=await this.app.vault.cachedRead(file);
   if (!content.includes('bases_data_studio_key')) continue;
   const info=getFrontMatterInfo(content); if(!info.exists) continue;
   if(!/(?:^|\n)\s*(?:"bases_data_studio_key"|'bases_data_studio_key'|bases_data_studio_key)\s*:/.test(info.frontmatter)) continue;
   let data:unknown;
   try {data=parseYaml(info.frontmatter);} catch {throw new Error(`Cannot read import metadata in ${file.path}.`);}
   if(!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Invalid import metadata in ${file.path}.`);
   const props=data as Record<string,unknown>;
   if(!Object.prototype.hasOwnProperty.call(props,'bases_data_studio_key')) throw new Error(`Invalid import metadata in ${file.path}.`);
   const value=props.bases_data_studio_key;
   if(typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new Error(`Invalid import key in ${file.path}.`);
   const source=props.bases_data_studio_source;
   if(source !== undefined && typeof source !== 'string') throw new Error(`Invalid import source in ${file.path}.`);
   records.push({key:String(value),source,path:file.path});
  }
  return records;
 }
 private classify(existing:Existing[], key:string, path:string, aliases:string[]):{status:Status;reason?:string} {
  const exact=existing.filter(x=>x.source===this.folder && x.key===key);
  const legacy=existing.filter(x=>x.source===undefined && aliases.includes(x.key));
  if(legacy.length) return {status:'conflict',reason:`Legacy key may match ${legacy.map(x=>x.path).join(', ')}. After checking the original record, set its bases_data_studio_key to the original key and bases_data_studio_source to ${JSON.stringify(this.folder)}, then preview again.`};
  if(exact.length>1) return {status:'conflict',reason:`Multiple notes have this key: ${exact.map(x=>x.path).join(', ')}.`};
  if(exact.length===1) return {status:'skip',reason:`Already imported: ${exact[0]?.path ?? ''}`};
  if(this.app.vault.getAbstractFileByPath(path)) return {status:'conflict',reason:`Target path is occupied: ${path}.`};
  return {status:'create'};
 }
 private showPreview():void {
  const el=this.contentEl; el.empty(); el.createEl('h2',{text:'Preview import'});
  el.createEl('p',{text:`New: ${this.plan.filter(x=>x.status==='create').length}; update: 0; skip: ${this.plan.filter(x=>x.status==='skip').length}; conflict: ${this.plan.filter(x=>x.status==='conflict').length}. Conflicts are skipped and need manual review. Existing notes are never overwritten. The destination folder will also contain an import log and, if absent, a Bases view at ${this.folder}/Imported records.base.`});
  const list=el.createEl('ul'); this.plan.forEach(x=>{ const item=list.createEl('li'); const details=item.createEl('details'); details.createEl('summary',{text:`${x.status}: ${x.key} (${x.path})${x.reason ? ` — ${x.reason}` : ''}`}); details.createEl('pre',{text:x.content}); });
  const back=el.createEl('button',{text:'Back'}); back.onclick=()=>this.showMapping();
  const run=el.createEl('button',{text:'Import'}); run.onclick=()=>{void this.execute();};
 }
 private async execute():Promise<void> {
  if(this.busy) return; this.busy=true; let created=0, skipped=0; const errors:string[]=[];
  try {
   const existing=await this.indexNotes();
   if(this.plan.some(item=>item.status==='create' && this.classify(existing,item.key,item.path,item.aliases).status!=='create')) {
    throw new Error('Vault contents changed after preview. Preview the import again.');
   }
   let current=''; for(const part of this.folder.split('/')) {current=current ? `${current}/${part}` : part; if(!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);}
   for(const item of this.plan) {
    if(item.status!=='create' || this.app.vault.getAbstractFileByPath(item.path)) {skipped++; continue;}
    try {await this.app.vault.create(item.path,item.content); created++;} catch(e) {errors.push(`${item.path}: ${String(e)}`);}
   }
   const basePath=normalizePath(`${this.folder}/Imported records.base`);
   if(!this.app.vault.getAbstractFileByPath(basePath)) {
    // Source is recorded at import time, so moving a note does not remove it
    // from its dataset's view.
    const formula = `note.bases_data_studio_source == ${JSON.stringify(this.folder)}`;
    await this.app.vault.create(basePath,`filters:\n  and:\n    - ${JSON.stringify(formula)}\n    - '!note.bases_data_studio_key.isEmpty()'\nviews:\n  - type: table\n    name: Data\n`);
   }
   const logPath=normalizePath(`${this.folder}/import-log-${Date.now()}-${crypto.randomUUID()}.md`);
   const conflicts=this.plan.filter(item=>item.status==='conflict');
   const entries=[...errors,...conflicts.map(item=>`Conflict for ${JSON.stringify(item.key)}: ${item.reason ?? 'manual review required'}`)];
   await this.app.vault.create(logPath,`# Import log\n\nCreated: ${created}\nSkipped: ${skipped}\nErrors: ${errors.length}\nConflicts: ${conflicts.length}\n\n${entries.map(e=>`- ${e.replace(/[\r\n]/g,' ')}`).join('\n')}\n`);
   new Notice(`Import finished: ${created} created, ${skipped} skipped, ${errors.length} errors${conflicts.length ? `, ${conflicts.length} conflicts to review` : ''}.`); this.close();
  } catch(e) {new Notice(`Import stopped after ${created} creations: ${String(e)}. Retry to skip existing notes.`, 12000);} finally {this.busy=false;}
 }
 onClose():void {this.contentEl.empty();}
}
