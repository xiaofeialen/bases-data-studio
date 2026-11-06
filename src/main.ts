import { Plugin } from 'obsidian';
import { ImportModal } from './modal';

export default class BasesDataStudio extends Plugin {
 onload(): void {
  this.addCommand({id:'import-data', name:'Import CSV or JSON', callback: () => new ImportModal(this.app).open()});
 }
}
