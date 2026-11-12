import { Plugin } from 'obsidian';
import { ImportModal, ImportProfile } from './modal';
import { RollbackModal } from './journal';

export default class BasesDataStudio extends Plugin {
 async onload(): Promise<void> {
  const saved = await this.loadData() as {profile?:ImportProfile}|null;
  let profile=saved?.profile;
  this.addCommand({id:'inspect-import-batches', name:'Inspect and roll back import batches', callback: () => new RollbackModal(this.app).open()});
  this.addCommand({id:'import-data', name:'Import CSV or JSON', callback: () => new ImportModal(this.app,profile,async value=>{await this.saveData({profile:value}); profile=value;}).open()});
 }
}
