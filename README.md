# Bases Data Studio

An early-stage Obsidian community plugin for importing local CSV and JSON data into notes and exploring them in Bases. No server or telemetry is used.

## Status

Development preview, not published. Test in a backup vault before use. Requires Obsidian 1.9.0 or later with Bases.

## Use

Run **Bases Data Studio: Import CSV or JSON**, choose a CSV with headers or a JSON array of objects, select a destination folder and stable unique key, map property names, and review the preview before importing. Each unique key maps to a deterministic filename in that folder. Existing filenames are skipped, including on repeated imports; changes to existing records are not applied. Duplicate or empty keys stop the preview. Use the same folder and key field for subsequent imports. Identical string representations such as `1` and `"1"` are the same key.

The plugin creates a `.base` view and a Markdown import log in the destination folder. It does not overwrite existing notes or the existing view. If interrupted, repeat the import to skip already-created files; inspect the log and notices for errors. CSV values are converted to numbers or booleans conservatively; leading-zero identifiers remain text. JSON values retain their types. Back up your vault before importing.

## Development

Based on the [official Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). Run `npm install`, `npm test`, and `npm run build`. Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/bases-data-studio/`, then reload and enable the plugin.

## Roadmap

V1: import and preview; V1.5: change detection and conflict resolution; V2: synchronization; V3: reporting. Update and synchronization features are not implemented.

## Release

Before submission, test in Obsidian on supported platforms, choose the final author identity, review plugin policies, and verify the minimum app version. Create a GitHub release with a tag matching the manifest version and attach `main.js`, `manifest.json`, and `styles.css`; then follow Obsidian's community plugin submission process.
