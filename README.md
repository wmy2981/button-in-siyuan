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
  (a local file under `assets/`, or an http(s) address).
* The JavaScript editor is CodeMirror with line numbers, syntax highlighting, bracket matching and
  completion; its colors follow SiYuan's code highlighting scheme.

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
3. Set the text, the icon and the action in the dialog, then confirm.

## Settings

| Field | Description |
| --- | --- |
| Button text | Button label, plain text. Empty input falls back to the default text. |
| Button icon | One SVG icon of the current interface; can also be unset. |
| Button colour | Colours the frame, the text and the icon together, picked from SiYuan's built-in palette; the default is SiYuan's native blue. |
| Button action | `None`, `Open link`, `JavaScript` or `JavaScript file`. Only one action is used. |
| Link address | Shown for `Open link`; required for that action. |
| JavaScript code | Shown for `JavaScript`; required for that action. |
| JavaScript file path | Shown for `JavaScript file`; required for that action. It can be a local `.js` file under `assets/` or an http(s) address. |

## Plugin settings

| Setting | Description |
| --- | --- |
| JavaScript output dialog | When the result dialog opens after a script runs: `Always`, `With output` (default), `Console output only`, `On warning (and error)`, `On error`, `Never`. |
| Provide the button block skill to the agent | On by default: writes a skill explaining button blocks into the workspace skill directory; switching it off deletes that skill. |
| Download the skill file | The "Download SKILL.md" button saves the bundled skill text to disk through SiYuan's own save dialog. |

## Link addresses

A link address behaves like the same link inside a document, because SiYuan's link handling does the work:

| Link | Behavior |
| --- | --- |
| `https://…`, `mailto:…`, other schemes | Handed to the host: the system browser on desktop, the matching app on mobile. |
| `siyuan://blocks/<block ID>` | Opened (or zoomed to) by SiYuan itself; `siyuan://plugins/…` and `siyuan://bazaar/…` work as well. |
| `assets/<asset path>`, `file://…`, an absolute path | Opened the way <kbd>Settings</kbd> > <kbd>Editor</kbd> > <kbd>Resource opening</kbd> says. |

## JavaScript

The editor's colors follow the scheme in <kbd>Settings</kbd> > <kbd>Appearance</kbd> >
<kbd>Code highlighting</kbd> (one for light, one for dark), and it honors the code block line-wrap
setting. The font size matches SiYuan's code snippet input, the box resizes vertically, and
right-clicking opens SiYuan's text menu (undo, redo, copy, cut, paste, paste as plain text, select
all).

The code runs in the page context when the button is clicked, and `await` works. The `return` value,
the console output and any thrown error appear in the result dialog, which can copy the output as
plain text. When that dialog opens is decided by the "JavaScript output dialog" setting (default:
"With output").

Scripts can call every API SiYuan exposes to plugins.

Full guide with ready-to-paste examples: [docs/javascript.md](./docs/javascript.md).

## Limitations

* The plugin is disabled on the publish service (`disabledInPublish`), so published pages show the
  raw block content instead of a button.
* PDF/HTML export has no custom block renderer: exported documents contain the raw content.
* The JavaScript action is not sandboxed; it runs with the same privileges as the user's own code
  snippets. Only run code you trust.
* The icon list comes from the icons loaded in the current interface, so a third-party icon package
  changes what you can pick.
* There is **no button block entry while editing inside a table cell on desktop**: SiYuan uses a cell
  editor that does not load plugin extensions (`tableCellRichEditor` sets `pluginExtensions: false`),
  so its slash menu never lists plugin entries. This is a host limitation; insert the block in the
  normal editor. A cell holds inline content only, so a block inserted from a cell lands after the
  table.

## Agent skill

The plugin writes a skill for SiYuan's agent: `button-block`, installed at
`data/storage/ai/agent/skills/button-block/SKILL.md`. It explains what a button block is, how the
block payload (`{"text","icon","color","action"}`) is filled in, how to create and change one through
SiYuan's block APIs, and it points at the two documents shipped with the plugin:

* [docs/javascript.md](./docs/javascript.md) — the SiYuan APIs a script may call, how output and errors
  are shown, and ready-to-run examples;
* [docs/icons.md](./docs/icons.md) — every built-in SiYuan icon id, plus a table for picking one by intent.

Every plugin load rewrites that file from the copy bundled in the package, so a hand edit or an older
version cannot leave a stale skill behind. The skill is written by default; switching it off in the plugin
settings removes it again, and so does disabling the plugin or removing it from the workspace — an agent
never picks up a skill whose plugin is not running. Those APIs need SiYuan's AI features to be enabled.

## Development

```bash
npm install          # Node.js 20+
npm run check        # i18n key check + tsc --noEmit + packaging build
npm run build        # dist/ + package.zip
```

## License

[MIT](./LICENSE)
