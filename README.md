# Bases Data Studio

Import local CSV and JSON data into Obsidian notes and explore the results in Bases. The plugin runs locally and does not send data to a server.

This is a development preview. Requires Obsidian 1.15.0 or later. Test in a backup vault before importing important data.

## Import data

Run **Bases Data Studio: Import CSV or JSON**, choose a CSV with headers or a JSON array of objects, select a destination folder and a stable unique key, map fields to properties, then review the preview before importing. The preview shows new records, skipped records and conflicts. Existing notes are not overwritten; updates must currently be made by hand.

Use a separate destination folder for each dataset and keep using the same folder and key field when reimporting. Each imported note records its key and source folder in `bases_data_studio_key` and `bases_data_studio_source`; leave these properties intact so the plugin can recognize a note even if it is moved or renamed. It scans Markdown notes in the vault when preparing and confirming an import. Changing the original source folder for a dataset changes its identity. Duplicate or empty input keys stop the preview; occupied paths and ambiguous existing records are reported as conflicts and skipped.

The plugin creates `Imported records.base` and an import log in the destination folder. Existing views are not overwritten. In particular, the old `Imported data.base` from 0.1.0 is kept; open the new view to avoid including logs and the base itself. If interrupted, repeat the import, then inspect the log and notices for errors.

CSV values are converted to numbers or booleans conservatively; selected keys and leading-zero identifiers remain text. CSV column names must be nonempty and unique. JSON values retain their types; supported values are strings, numbers, booleans, null, and lists of strings. Nested objects, other lists and duplicate JSON keys are rejected. Quote high-precision JSON numbers to preserve them as text.

## Upgrading from 0.1.0

The old release converted and trimmed keys, so their original values cannot always be recovered. When a legacy note might match an input record, the preview marks it as a conflict and skips it. Check the original data and note manually. Once you have identified the correct record, set its `bases_data_studio_key` property to the exact original key as text and add `bases_data_studio_source` with the original destination folder path. Then preview again. Keep both properties when moving or renaming the note. Take a backup before making these changes.

## Development

Based on the [official Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). Run `npm install`, `npm test`, `npm run lint`, and `npm run build`. Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/bases-data-studio/`, then reload and enable the plugin.

## Roadmap

Future work includes safe updates, conflict resolution, synchronization, and reporting.

## Release

Create a GitHub release with a tag matching the manifest version and attach `main.js`, `manifest.json`, and `styles.css`. Submit the repository through the [Obsidian Community Directory](https://community.obsidian.md) after reviewing its requirements.
