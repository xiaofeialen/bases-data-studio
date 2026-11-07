import { Plugin } from 'obsidian';
import { ImportModal, ImportProfile } from './modal';

export default class BasesDataStudio extends Plugin {
 async onload(): Promise<void> {
  const saved = await this.loadData() as {profile?:ImportProfile}|null;
  let profile=saved?.profile;
  this.addCommand({id:'import-data', name:'Import CSV or JSON', callback: () => new ImportModal(this.app,profile,async value=>{await this.saveData({profile:value}); profile=value;}).open()});
 }
}
