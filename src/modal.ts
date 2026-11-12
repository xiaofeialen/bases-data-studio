import { App, Modal, Notice, normalizePath, getFrontMatterInfo, parseYaml } from 'obsidian';
import { confirmEntry, fingerprint, finishBatch, recordEntry, startBatch } from './journal';
import { infer, keyPath, legacyKeys, parseInput, renderNote, Row, stableKey, validateMapping } from './import-core';

type Status = 'create'|'skip'|'conflict'|'update';
type Change = {name:string; before:unknown; exists:boolean; after:unknown; selected:boolean};
type Item = {key:string; path:string; content:string; status:Status; aliases:string[]; reason?:string; changes?:Change[]};
type Existing = {key:string; source?:string; path:string; props:Record<string,unknown>};
export type ImportProfile = {folder:string; key:string; names:Record<string,string>};
const equal = (a:unknown,b:unknown):boolean => JSON.stringify(a) === JSON.stringify(b);
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
 constructor(app: App, private profile?:ImportProfile, private saveProfile?:(profile:ImportProfile)=>Promise<void>) { super(app); }
 onOpen(): void { this.showSetup(); }
 private showSetup(): void {
  const el = this.contentEl; el.empty(); el.createEl('h2',{text:'Import CSV or JSON'});
  el.createEl('p',{text:'Choose a local file. Existing notes are changed only when you select fields in the preview.'});
  const input = el.createEl('input',{type:'file'}); input.accept = '.csv,.json';
  input.onchange = () => { void (async () => { try {
   const file = input.files?.[0]; if (!file) return;
   this.isCsv = file.name.toLowerCase().endsWith('.csv');
   this.rawRows = parseInput(await file.text(), file.name, {inferCsv:false});
   this.rows = this.isCsv ? this.rawRows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, infer(value)]))) : this.rawRows;
   this.fields = Array.from(new Set(this.rows.flatMap(r => Object.keys(r))));
   this.names = this.fields.map(field=>this.profile && Object.prototype.hasOwnProperty.call(this.profile.names,field) ? this.profile.names[field] ?? field : field);
   this.key = this.profile && this.fields.includes(this.profile.key) ? this.profile.key : this.fields[0] ?? '';
   if(this.profile) this.folder=this.profile.folder;
   this.showMapping();
  } catch (e) { new Notice(`Cannot read file: ${String(e)}`); } })(); };
 }
 private showMapping(): void {
  const el = this.contentEl; el.empty(); el.createEl('h2',{text:'Map fields'});
  el.createEl('p',{text:'Leave a property name blank to omit it. The unique key identifies records across imports.'});
  if(this.profile) el.createEl('p',{text:'The last used folder, key and matching field mappings have been restored. Review them for this dataset.'});
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
   for(const item of plan) {
    if(item.status!=='skip') continue;
    const match=existing.find(x=>x.source===this.folder && x.key===item.key);
    if(!match) continue;
    const rowIndex=this.rows.findIndex((row,i)=>stableKey(this.isCsv ? this.rawRows[i]?.[this.key] : row[this.key])===item.key);
    const row=this.rows[rowIndex]; if(!row) continue;
    const changes:Change[]=[];
    for(const [i, field] of this.fields.entries()) {
     const name=this.names[i]; if(!name) continue;
     const collisions=Object.keys(match.props).filter(k=>k.toLowerCase()===name.toLowerCase());
     if(collisions.some(k=>k!==name)) {item.status='conflict'; item.reason=`Property name differs only by case: ${name}.`; break;}
     const exists=Object.prototype.hasOwnProperty.call(match.props,name);
     const after=this.isCsv && field===this.key ? this.rawRows[rowIndex]?.[field] : row[field];
     const value=after === undefined ? '' : after;
     if(!exists || !equal(match.props[name],value)) changes.push({name,before:match.props[name],exists,after:value,selected:false});
    }
    if(item.status==='skip' && changes.length) {item.status='update'; item.path=match.path; item.changes=changes; item.reason='Select fields to update; unselected fields are preserved.';}
   }
   this.plan=plan; this.showPreview();
  } catch(e) {new Notice(`Preview failed: ${String(e)}`);}
 }
 // Read the actual frontmatter instead of relying on a potentially stale metadata cache.
 // Fail closed if a note with our marker cannot be read or parsed.
 private async indexNotes():Promise<Existing[]> {
  const records:Existing[]=[];
  for(const file of this.app.vault.getMarkdownFiles()) {
   const content=await this.app.vault.read(file);
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
   records.push({key:String(value),source,path:file.path,props});
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
  el.createEl('p',{text:`New: ${this.plan.filter(x=>x.status==='create').length}; update: ${this.plan.filter(x=>x.status==='update').length}; skip: ${this.plan.filter(x=>x.status==='skip').length}; conflict: ${this.plan.filter(x=>x.status==='conflict').length}. Select each field to update. Conflicts are skipped. The destination folder will also contain an import log and, if absent, a Bases view at ${this.folder}/Imported records.base.`});
  const list=el.createEl('ul'); this.plan.forEach(x=>{ const item=list.createEl('li'); const details=item.createEl('details'); details.createEl('summary',{text:`${x.status}: ${x.key} (${x.path})${x.reason ? ` — ${x.reason}` : ''}`}); if(x.changes) x.changes.forEach(change=>{const line=details.createEl('label'); const input=line.createEl('input',{type:'checkbox'}); input.onchange=()=>{change.selected=input.checked;}; line.createSpan({text:` ${change.name}: ${change.exists ? JSON.stringify(change.before) : '(missing)'} → ${JSON.stringify(change.after)}`});}); else details.createEl('pre',{text:x.content}); });
  const back=el.createEl('button',{text:'Back'}); back.onclick=()=>this.showMapping();
  const run=el.createEl('button',{text:'Import'}); run.onclick=()=>{void this.execute();};
 }
 private async execute():Promise<void> {
  if(this.busy) return; this.busy=true; let created=0, updated=0, skipped=0; const errors:string[]=[];
  try {
   const existing=await this.indexNotes();
   if(this.plan.some(item=>item.status==='create' && this.classify(existing,item.key,item.path,item.aliases).status!=='create')) {
    throw new Error('Vault contents changed after preview. Preview the import again.');
   }
   let current=''; for(const part of this.folder.split('/')) {current=current ? `${current}/${part}` : part; if(!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);}
   const batch=await startBatch(this.app,this.folder);
   for(const item of this.plan) {
    if(item.status==='update') {
     const selected=item.changes?.filter(change=>change.selected) ?? [];
     if(!selected.length) {skipped++; continue;}
     const exact=existing.filter(x=>x.source===this.folder && x.key===item.key);
     const legacy=existing.filter(x=>x.source===undefined && item.aliases.includes(x.key));
     if(exact.length!==1 || exact[0]?.path!==item.path || legacy.length) {errors.push(`${item.path}: identity changed after preview.`); continue;}
     const file=this.app.vault.getFileByPath(item.path);
     if(!file || file.extension!=='md') {errors.push(`${item.path}: note is missing.`); continue;}
     try {
      const content=await this.app.vault.read(file);
      const id=crypto.randomUUID();
      await recordEntry(this.app,{version:1,batch,id,kind:'update',source:this.folder,key:item.key,path:item.path,metadata:{ctime:file.stat.ctime,mtime:file.stat.mtime,size:file.stat.size},fingerprint:await fingerprint(content),changes:selected.map(c=>({name:c.name,exists:c.exists,...(c.exists ? {before:c.before} : {}),after:c.after}))});
      await this.app.fileManager.processFrontMatter(file, frontmatter=>{
       const props=frontmatter as Record<string,unknown>;
       if(String(props.bases_data_studio_key)!==item.key || props.bases_data_studio_source!==this.folder) throw new Error('Identity changed after preview.');
       for(const change of selected) {
        if(Object.keys(props).some(k=>k!==change.name && k.toLowerCase()===change.name.toLowerCase()) || Object.prototype.hasOwnProperty.call(props,change.name)!==change.exists || !equal(props[change.name],change.before)) throw new Error(`Property changed after preview: ${change.name}.`);
       }
       for(const change of selected) props[change.name]=change.after;
      }); await confirmEntry(this.app,batch,id); updated++;
     } catch(e) {errors.push(`${item.path}: ${String(e)}`);}
     continue;
    }
    if(item.status!=='create' || this.app.vault.getAbstractFileByPath(item.path)) {skipped++; continue;}
    try {
     const content=item.content.replace('---\n',`---\n"bases_data_studio_batch": ${JSON.stringify(batch)}\n`);
     const id=crypto.randomUUID();
     await recordEntry(this.app,{version:1,batch,id,kind:'create',source:this.folder,key:item.key,path:item.path,fingerprint:await fingerprint(content),changes:[],content});
     await this.app.vault.create(item.path,content); await confirmEntry(this.app,batch,id); created++;
    } catch(e) {errors.push(`${item.path}: ${String(e)}`);}
   }
   await finishBatch(this.app,batch);
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
   await this.app.vault.create(logPath,`# Import log\n\nCreated: ${created}\nSkipped: ${skipped}\nErrors: ${errors.length}\nUpdated: ${updated}\nConflicts: ${conflicts.length}\n\n${entries.map(e=>`- ${e.replace(/[\r\n]/g,' ')}`).join('\n')}\n`);
   if(this.saveProfile) await this.saveProfile({folder:this.folder,key:this.key,names:Object.fromEntries(this.fields.map((field,i)=>[field,this.names[i] ?? '']))});
   new Notice(`Import finished: ${created} created, ${skipped} skipped, ${errors.length} errors, ${updated} updated${conflicts.length ? `, ${conflicts.length} conflicts to review` : ''}.`); this.close();
  } catch(e) {new Notice(`Import stopped after ${created} creations: ${String(e)}. Retry to skip existing notes.`, 12000);} finally {this.busy=false;}
 }
 onClose():void {this.contentEl.empty();}
}
