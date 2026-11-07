[简体中文](./README.zh-CN.md)

# Button Block (button-in-siyuan)

Insert native SiYuan buttons into documents, with text, a built-in icon and a link or JavaScript action.

![preview](https://gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@f6cae6d/assets/preview.png)

## Features

* The button is a SiYuan custom block, saved, synced, undone and exported with the document.
* The button keeps SiYuan's native styling: font size, hover and pressed effects come from SiYuan's
  CSS, and the plugin does not restyle it.
* The icon is picked with search from the SVG icons available in the current interface: the built-in
  set plus icons from icon packages and plugins.
* The button colour is optional: the frame, the text and the icon share one colour taken from
  SiYuan's built-in palette; the default stays SiYuan's native blue.
* A button action is optional and is one of: open a link, run JavaScript, or run a JavaScript file
* Top bar quick actions: clicking opens the quick action menu, each action is one JSON file and behaves
  like a button block.

## Install

1. From the marketplace: <kbd>Settings</kbd> > <kbd>Marketplace</kbd> > <kbd>Plugins</kbd> >
   search for "Button Block".
2. Manually: download `package.zip` from the latest Release, unzip it as
   `{workspace}/data/plugins/button-in-siyuan/`, then enable the plugin in
   <kbd>Settings</kbd> > <kbd>Marketplace</kbd> > <kbd>Downloaded</kbd>.

Requires SiYuan 3.8.6 or later.

## Usage

1. Type `/button` (or `/按钮块`) in a document and press <kbd>Enter</kbd>: a button block is
   inserted at the caret.
2. Open "Edit button block": click the block icon and choose <kbd>Plugin</kbd> >
   <kbd>Edit button block</kbd>, or right-click the button (desktop) / long-press it (mobile).
3. Set the text, the icon and the action in the dialog, then confirm. The run button at the bottom left executes the current form values once (exactly like clicking the block, without saving first); the delete button asks for confirmation and then removes the block from the document.

## Top bar quick actions

The desktop top bar has a lightning icon; on mobile the same entry sits in the top bar's Plugins menu (that is how the host registers icon top bar entries there). Click it to open the quick action menu: the menu only runs the actions and always ends with a "Manage quick actions" item. Creating and editing happen in that manager (the add icon in its top-right corner, a native SiYuan icon button).

## Plugin settings

Mobile has one extra switch, "Mobile safe mode", off by default and stored on this device only (it never follows SiYuan sync). When it is on, opening the editor from a manager, or the JavaScript file page from the editor, hides the full-screen window below first — on some devices two stacked full-screen windows freeze SiYuan and reload its frontend, and the switch works around that. With it off, nothing changes.

Uninstalling the plugin deletes only its settings file (`data/storage/petal/button-in-siyuan/settings`): scripts under `scripts/`, script data under `storage/` and top bar actions under `topbar/` are kept, and a reinstall starts from the default settings. If the plugin is disabled before uninstalling, there is no instance to run the cleanup, so the settings file stays.

## Link addresses

A link address behaves like the same link inside a document, because SiYuan's link handling does the work:

| Link | Behavior |
| --- | --- |
| `https://…`, `mailto:…`, other schemes | Handed to the host: the system browser on desktop, the matching app on mobile. |
| `siyuan://blocks/<block ID>` | Opened (or zoomed to) by SiYuan itself; `siyuan://plugins/…` and `siyuan://bazaar/…` work as well. |
| `assets/<asset path>`, `file://…`, an absolute path | Opened the way <kbd>Settings</kbd> > <kbd>Editor</kbd> > <kbd>Resource opening</kbd> says. |

## JavaScript

The editor's colors follow the scheme in <kbd>Settings</kbd> > <kbd>Appearance</kbd> >
<kbd>Code highlighting</kbd> (one for light, one for dark), and line wrapping and ligatures are decided by
the "JavaScript editor line wrap" and "JavaScript editor ligatures" plugin settings. The font size
matches SiYuan's code snippet input, the box resizes vertically, and right-clicking opens SiYuan's
text menu (undo, redo, copy, cut, paste, paste as plain text, select all).

The code runs in the page context when the button is clicked, and `await` works. The `return` value,
the console output and any thrown error appear in the result dialog, which can copy the output as
plain text; the plugin also passes the console lines through to the SiYuan console. When that dialog
opens is decided by the "JavaScript output dialog" setting (default: "With output").

Scripts can call every API SiYuan exposes to plugins.

Full guide with ready-to-paste examples: [docs/javascript.md](./docs/javascript.md).

## Agent skill

The plugin writes a skill for SiYuan's agent: `button-block`, installed as a directory at
`data/storage/ai/agent/skills/button-block/`

## Limitations

* The plugin is disabled on the publish service (`disabledInPublish`), so published pages show the
  raw block content instead of a button.
* PDF/HTML export has no custom block renderer: exported documents contain the raw content.
* For a button whose action runs a JavaScript file, mind the script file itself when exporting: **a script
  under `data/assets/` is copied by the HTML and Word exports to `assets/` under the export directory, at the
  relative path the block references**, while **a script under the plugin's `scripts/` directory is not an asset
  and no export carries it**, and a **Markdown `.zip` does not carry `data/assets/` scripts either** (SiYuan
  collects resources from the exported Markdown text, where block attributes take no part and a plugin cannot
  hook in). Use the HTML or Word export there, or copy the script along yourself.
* Mobile has no separate top bar icon: the quick-action entry lives in the top bar's Plugins menu. The
  data files still sync with the workspace.
* The JavaScript action is not sandboxed; it runs with the same privileges as the user's own code
  snippets. Only run code you trust.
* The icon list comes from the icons loaded in the current interface, so a third-party icon package
  changes what you can pick.
* There is **no button block entry while editing inside a table cell on desktop**: SiYuan uses a cell
  editor that does not load plugin extensions (`tableCellRichEditor` sets `pluginExtensions: false`),
  so its slash menu never lists plugin entries. This is a host limitation; insert the block in the
  normal editor. A cell holds inline content only, so a block inserted from a cell lands after the
  table.

## Bazaar Stats Graph

![Bazaar stats graph](https://siyuan-bazaar-stats-graph.sr1.cc.cd/api/chart/wmy2981/button-in-siyuan?metrics=downloads,rating,ratings&range=all&area=true&lang=en)

## Development

```bash
npm install          # Node.js 20+
npm run check        # i18n key check + tsc --noEmit + packaging build
npm run build        # dist/ + package.zip
```

## License

[MIT](./LICENSE)
