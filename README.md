# Bases Data Studio

Import local CSV and JSON data into Obsidian notes and explore the results in Bases. The plugin runs locally and does not send data to a server.

This is a development preview. Requires Obsidian 1.15.0 or later. Test in a backup vault before importing important data.

## Import data

Run **Bases Data Studio: Import CSV or JSON**, choose a CSV with headers or a JSON array of objects, select a destination folder and a stable unique key, map fields to properties, then review the preview before importing. The preview shows new records, possible updates, skipped records and conflicts. Expand an update to see old and new values, then check only the properties you want to change. No existing property is updated unless selected. The note body and unselected properties are preserved. If a selected property or record identity changes after preview, that note is not updated; preview again.

After an import, the last folder, key field and field mappings are saved locally and restored for matching fields next time. Review them before each import, especially when switching datasets. Source data and field values are not stored in these settings. Updates are not an automatic synchronization and there is no built-in undo; back up your vault before updating important notes. The log records counts and errors, not the old values.

Use a separate destination folder for each dataset and keep using the same folder and key field when reimporting. Each imported note records its key and source folder in `bases_data_studio_key` and `bases_data_studio_source`; leave these properties intact so the plugin can recognize a note even if it is moved or renamed. It scans Markdown notes in the vault when preparing and confirming an import. Changing the original source folder for a dataset changes its identity. Duplicate or empty input keys stop the preview; occupied paths and ambiguous existing records are reported as conflicts and skipped.

The plugin creates `Imported records.base` and an import log in the destination folder. Existing views are not overwritten. In particular, the old `Imported data.base` from 0.1.0 is kept; open the new view to avoid including logs and the base itself. If interrupted, repeat the import, then inspect the log and notices for errors.

CSV values are converted to numbers or booleans conservatively; selected keys and leading-zero identifiers remain text. CSV column names must be nonempty and unique. JSON values retain their types; supported values are strings, numbers, booleans, null, and lists of strings. Nested objects, other lists and duplicate JSON keys are rejected. Quote high-precision JSON numbers to preserve them as text.

## Upgrading from 0.1.0

The old release converted and trimmed keys, so their original values cannot always be recovered. When a legacy note might match an input record, the preview marks it as a conflict and skips it. Check the original data and note manually. Once you have identified the correct record, set its `bases_data_studio_key` property to the exact original key as text and add `bases_data_studio_source` with the original destination folder path. Then preview again. Keep both properties when moving or renaming the note. Take a backup before making these changes.

## Development

Based on the [official Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). Run `npm install`, `npm test`, `npm run lint`, and `npm run build`. Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/bases-data-studio/`, then reload and enable the plugin.

## Roadmap

Future work includes richer conflict resolution, reversible updates, synchronization, and reporting.

## Release

Create a GitHub release with a tag matching the manifest version and attach `main.js`, `manifest.json`, and `styles.css`. Submit the repository through the [Obsidian Community Directory](https://community.obsidian.md) after reviewing its requirements.

### Import journals and rollback

Each import writes a journal under the vault's configuration directory at
`plugins/bases-data-studio/journals/`. The journal contains file paths, import
keys, original selected property values, and the full contents of newly created
notes. It remains on disk until removed manually, including after rollback; it is
local data and is not transmitted by this plugin. Protect it like the vault
itself, and include it in backups when recovery is required.

The **Inspect and roll back import batches** command lists complete and
incomplete batches. Review the preview before applying it. A property is
restored only when its current value still equals the imported value; conflicts
are reported. A rollback attempt is recorded before a change, so an interrupted
or failed attempt requires manual inspection rather than an automatic retry.
Operations without a completion record are also left for manual review. Do not
edit journal files. Missing or malformed journals cannot be used for recovery.

Unchanged created notes with an unambiguous batch marker are moved to the
vault trash after a fresh content check. Obsidian does not expose an atomic
compare-and-delete operation: a concurrent edit between the check and trash
operation can be moved to trash too. Restore the note from the vault trash if
that happens. Also, Obsidian's adapter does not expose a filesystem flush guarantee, so
read-back verification cannot guarantee recovery from a sudden power loss.
Keep independent backups. Close other Obsidian windows and sync clients while
importing or rolling back; this implementation does not coordinate across
processes or devices.

To verify in a disposable vault, first make a separate backup. Build the plugin,
copy `main.js`, `manifest.json`, and `styles.css` into the vault's plugin
folder, then enable it. Import a CSV twice, check that no duplicate notes appear,
select an update and import it, then edit one property and the note body. Run
**Inspect and roll back import batches**, review the latest batch, and verify
that edited properties and body remain untouched while unchanged selected
properties revert. Repeat rollback; move a created note and inspect its batch;
check that the unchanged note moves to the vault trash. Repeat using JSON, a missing
note, and a legacy note. Restore the backup after testing. Manual verification on Obsidian 1.15.1 with a separate backup covered repeated CSV preview, JSON update and property rollback, a moved unchanged note, and preservation of an edited note, body, and unrelated property.

### 0.4.0 release notes

Adds import batch journals, batch inspection, conflict-aware rollback and regression tests. Incomplete operations require manual inspection. Created notes are moved to the vault trash only after identity and content checks.
