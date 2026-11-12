import { App, getFrontMatterInfo, Modal, Notice, parseYaml, TFile } from 'obsidian';

export type JournalChange = {name:string; exists:boolean; before?:unknown; after:unknown};
export type JournalEntry = {version:1; batch:string; id:string; kind:'create'|'update'; source:string; key:string; path:string; fingerprint:string; changes:JournalChange[]; content?:string};
const root = (app:App) => `${app.vault.configDir}/plugins/bases-data-studio/journals`;
const equal = (a:unknown,b:unknown):boolean => JSON.stringify(a)===JSON.stringify(b);
export async function fingerprint(content:string):Promise<string> {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function ensure(app:App,path:string):Promise<void> {
 let parent=''; for(const part of path.split('/')) {parent=parent ? `${parent}/${part}` : part; if(!await app.vault.adapter.exists(parent)) await app.vault.adapter.mkdir(parent);}
}
// Each record is immutable. A failed write or read-back prevents the note mutation.
async function writeRecord(app:App,path:string,value:unknown):Promise<void> {
 const data=JSON.stringify(value); if(await app.vault.adapter.exists(path)) throw new Error(`Journal record already exists: ${path}`);
 await app.vault.adapter.write(path,data);
 if(await app.vault.adapter.read(path)!==data) throw new Error(`Journal verification failed: ${path}`);
}
export async function startBatch(app:App,source:string):Promise<string> {
 const batch=crypto.randomUUID(); const dir=`${root(app)}/${batch}`; await ensure(app,dir);
 await writeRecord(app,`${dir}/batch.json`,{version:1,batch,source,started:new Date().toISOString()}); return batch;
}
export async function recordEntry(app:App,entry:JournalEntry):Promise<void> {await writeRecord(app,`${root(app)}/${entry.batch}/${entry.id}.json`,entry);}
export async function confirmEntry(app:App,batch:string,id:string):Promise<void> {await writeRecord(app,`${root(app)}/${batch}/${id}.done`,{version:1,batch,id});}
export async function finishBatch(app:App,batch:string):Promise<void> {await writeRecord(app,`${root(app)}/${batch}/complete.json`,{version:1,batch});}
function validEntry(value:unknown,batch:string):value is JournalEntry {
 if(!value || typeof value!=='object' || Array.isArray(value)) return false;
 const e=value as JournalEntry;
 return e.version===1 && e.batch===batch && typeof e.id==='string' && /^[\da-f-]{36}$/.test(e.id) && (e.kind==='create'||e.kind==='update') && typeof e.source==='string' && typeof e.key==='string' && typeof e.path==='string' && /^[\da-f]{64}$/.test(e.fingerprint) && Array.isArray(e.changes) && e.changes.every(c=>c && typeof c.name==='string' && c.name.length>0 && !/[\r\n]/.test(c.name) && !['bases_data_studio_key','bases_data_studio_source','bases_data_studio_batch','__proto__','constructor','prototype'].includes(c.name.toLowerCase()) && typeof c.exists==='boolean' && Object.prototype.hasOwnProperty.call(c,'after') && (!c.exists || Object.prototype.hasOwnProperty.call(c,'before'))) && (e.kind!=='create' || typeof e.content==='string');
}
export async function listBatches(app:App):Promise<{id:string;complete:boolean}[]> {
 if(!await app.vault.adapter.exists(root(app))) return [];
 const listing=await app.vault.adapter.list(root(app)); const result:{id:string;complete:boolean}[]=[];
 for(const dir of listing.folders) {
  const id=dir.split('/').pop() ?? ''; if(!/^[\da-f-]{36}$/.test(id)) continue;
  result.push({id,complete:await app.vault.adapter.exists(`${dir}/complete.json`)});
 }
 return result.reverse();
}
async function readEntries(app:App,batch:string):Promise<JournalEntry[]> {
 if(!/^[\da-f-]{36}$/.test(batch)) throw new Error('Invalid batch ID.');
 const dir=`${root(app)}/${batch}`; const listing=await app.vault.adapter.list(dir);
 const header=JSON.parse(await app.vault.adapter.read(`${dir}/batch.json`)) as {version?:unknown;batch?:unknown};
 if(header.version!==1 || header.batch!==batch) throw new Error('Invalid batch journal.');
 const entries:JournalEntry[]=[];
 for(const path of listing.files.sort()) {
  const name=path.split('/').pop() ?? ''; if(name==='batch.json'||name==='complete.json'||/^[\da-f-]{36}\.(?:done|rollback)$/.test(name)) continue;
  const value:unknown=JSON.parse(await app.vault.adapter.read(path));
  if(!validEntry(value,batch) || name!==`${value.id}.json`) throw new Error(`Invalid journal record: ${path}`);
  entries.push(value);
 }
 return entries.reverse();
}
async function findNote(app:App,entry:JournalEntry):Promise<TFile|null> {
 const matches:TFile[]=[];
 for(const file of app.vault.getMarkdownFiles()) {
  const content=await app.vault.read(file); if(!content.includes('bases_data_studio_key')) continue;
  const info=getFrontMatterInfo(content); if(!info.exists) continue;
  const data:unknown=parseYaml(info.frontmatter);
  if(data && typeof data==='object' && !Array.isArray(data)) {
   const props=data as Record<string,unknown>;
   if(String(props.bases_data_studio_key)===entry.key && props.bases_data_studio_source===entry.source) matches.push(file);
  }
 }
 if(matches.length>1) throw new Error('Multiple notes match this identity.');
 return matches[0] ?? null;
}
export type RollbackResult = {entry:JournalEntry; message:string; actionable:boolean};
async function inspect(app:App,entry:JournalEntry):Promise<RollbackResult> {
 const rollbackPath=`${root(app)}/${entry.batch}/${entry.id}.rollback`;
 if(await app.vault.adapter.exists(rollbackPath)) return {entry,message:`Rollback already attempted for ${entry.path}; review any unresolved conflicts manually.`,actionable:false};
 const donePath=`${root(app)}/${entry.batch}/${entry.id}.done`;
 if(!await app.vault.adapter.exists(donePath)) return {entry,message:`Unconfirmed operation at ${entry.path}; review manually.`,actionable:false};
 const done:unknown=JSON.parse(await app.vault.adapter.read(donePath));
 if(!done || typeof done!=='object' || (done as {version?:unknown}).version!==1 || (done as {batch?:unknown}).batch!==entry.batch || (done as {id?:unknown}).id!==entry.id) throw new Error('Invalid completion record.');
 const file=await findNote(app,entry); if(!file) return {entry,message:'Missing note or identity changed; review manually.',actionable:false};
 const content=await app.vault.read(file);
 if(entry.kind==='create') {
  const info=getFrontMatterInfo(content); const parsed:unknown=info.exists ? parseYaml(info.frontmatter) : null;
  const marker=parsed && typeof parsed==='object' && !Array.isArray(parsed) ? (parsed as Record<string,unknown>).bases_data_studio_batch : undefined;
  const safe=marker===entry.batch && content===entry.content && await fingerprint(content)===entry.fingerprint;
  return {entry,message:safe ? `Unchanged created note: ${file.path}; delete manually after review.` : `Conflict: created note changed: ${file.path}`,actionable:false};
 }
 const info=getFrontMatterInfo(content); const props:unknown=info.exists ? parseYaml(info.frontmatter) : null;
 if(!props || typeof props!=='object' || Array.isArray(props)) return {entry,message:`Conflict: invalid frontmatter: ${file.path}`,actionable:false};
 const data=props as Record<string,unknown>;
 const safe=entry.changes.filter(c=>Object.prototype.hasOwnProperty.call(data,c.name) && equal(data[c.name],c.after));
 return {entry,message:`${file.path}: ${safe.length} of ${entry.changes.length} properties can revert; others need review.`,actionable:safe.length>0};
}
export async function previewRollback(app:App,batch:string):Promise<RollbackResult[]> {
 const entries=await readEntries(app,batch); const results:RollbackResult[]=[];
 for(const entry of entries) {try {results.push(await inspect(app,entry));} catch(e) {results.push({entry,message:`Conflict: ${String(e)}`,actionable:false});}}
 return results;
}
export async function rollback(app:App,batch:string):Promise<string[]> {
 const entries=await readEntries(app,batch); const messages:string[]=[];
 for(const entry of entries) {
  try {
   const check=await inspect(app,entry); if(!check.actionable) {messages.push(check.message); continue;}
   const file=await findNote(app,entry); if(!file) {messages.push('Note disappeared; skipped.'); continue;}
   await writeRecord(app,`${root(app)}/${entry.batch}/${entry.id}.rollback`,{version:1,batch:entry.batch,id:entry.id});
    const conflicts:string[]=[];
    await app.fileManager.processFrontMatter(file,frontmatter=>{
     const props=frontmatter as Record<string,unknown>;
     if(String(props.bases_data_studio_key)!==entry.key || props.bases_data_studio_source!==entry.source) throw new Error('Identity changed.');
     for(const c of entry.changes) {
      if(Object.prototype.hasOwnProperty.call(props,c.name) && equal(props[c.name],c.after)) {if(c.exists) props[c.name]=c.before; else delete props[c.name];}
      else if(Object.prototype.hasOwnProperty.call(props,c.name)===c.exists && (!c.exists || equal(props[c.name],c.before))) continue;
      else conflicts.push(c.name);
     }
    });
    messages.push(conflicts.length ? `Conflicts in ${file.path}: ${conflicts.join(', ')}.` : `Reverted ${file.path}.`);
  } catch(e) {messages.push(`Conflict: ${entry.path}: ${String(e)}`);}
 }
 return messages;
}
export class RollbackModal extends Modal {
 onOpen():void {void this.showBatches();}
 private async showBatches():Promise<void> {
  this.contentEl.empty(); this.contentEl.createEl('h2',{text:'Inspect import batches'});
  try {const batches=await listBatches(this.app); if(!batches.length) this.contentEl.createEl('p',{text:'No journals found.'});
   for(const batch of batches) {const button=this.contentEl.createEl('button',{text:`${batch.id} — ${batch.complete?'complete':'incomplete'}`}); button.onclick=()=>{void this.showPreview(batch.id);};}
  } catch(e) {new Notice(`Cannot list journals: ${String(e)}`);}
 }
 private async showPreview(batch:string):Promise<void> {
  try {const items=await previewRollback(this.app,batch); this.contentEl.empty(); this.contentEl.createEl('h2',{text:`Rollback preview: ${batch}`});
   const list=this.contentEl.createEl('ul'); items.forEach(item=>list.createEl('li',{text:item.message}));
   const back=this.contentEl.createEl('button',{text:'Back'}); back.onclick=()=>{void this.showBatches();};
   const button=this.contentEl.createEl('button',{text:'Revert safe changes'}); button.onclick=()=>{button.disabled=true; void (async()=>{try {const results=await rollback(this.app,batch); this.contentEl.empty(); this.contentEl.createEl('h2',{text:'Rollback results'}); const list=this.contentEl.createEl('ul'); results.forEach(result=>list.createEl('li',{text:result}));} catch(e) {new Notice(`Rollback stopped: ${String(e)}`);}})();};
  } catch(e) {new Notice(`Cannot read journal: ${String(e)}`);}
 }
 onClose():void {this.contentEl.empty();}
}
