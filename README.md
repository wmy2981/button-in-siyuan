[简体中文](./README.zh-CN.md)

# Button Block (button-in-siyuan)

Insert native SiYuan button blocks into documents. The button text, icon and click action are all
edited in a native SiYuan dialog.

![preview](https://gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@2fd4ad2/assets/preview.png)

## Features

* The button is a SiYuan custom block (`;;;button-in-siyuan/button`), so it is saved, synced,
  undone and exported with the document.
* The button uses the very same classes as SiYuan's own settings buttons
  (`b3-button b3-button--outline fn__size200`): 200px wide, UI font size, and hover/pressed
  effects all come from SiYuan's own CSS — the plugin does not restyle the button.
* The icon is picked from the SVG icons available in the current interface (the built-in icon set,
  plus icons provided by icon packages and plugins), with a search box.
* The button colour is optional: the frame, the text and the icon share one colour taken from
  SiYuan's built-in palette; the default stays SiYuan's native blue.
* A button action is optional and is one of: open a link, or run JavaScript.
* The JavaScript editor is CodeMirror, with line numbers, syntax highlighting, bracket matching and
  completion; its colors follow SiYuan's code highlighting setting.
* Every dialog, menu and form control is native SiYuan UI.

## Install

1. From the marketplace (after the plugin is listed): <kbd>Settings</kbd> > <kbd>Marketplace</kbd> >
   <kbd>Plugins</kbd> > search for "Button Block".
2. Manually: download `package.zip` from the latest Release, unzip it as
   `{workspace}/data/plugins/button-in-siyuan/`, then enable the plugin in
   <kbd>Settings</kbd> > <kbd>Marketplace</kbd> > <kbd>Downloaded</kbd>.

Requires SiYuan 3.8.6 or later.

## Usage

1. Type `/button` (or `/按钮块`) in a document and press <kbd>Enter</kbd>: a button block is
   inserted at the caret. The same menu works inside a table cell; a cell can only hold inline
   content, so the button block lands right after the table.
2. Open "Edit button block": click the block icon and choose <kbd>Plugin</kbd> >
   <kbd>Edit button block</kbd>, or right-click the button (desktop) / long-press it (mobile).
3. Set the text, the icon and the action in the dialog, then confirm.

## Settings

| Field | Description |
| --- | --- |
| Button text | Button label, plain text. Empty input falls back to the default text. |
| Button icon | One SVG icon of the current interface; can also be unset. |
| Button colour | Colours the frame, the text and the icon together, picked from SiYuan's built-in palette; the default is SiYuan's native blue. |
| Button action | `None`, `Open link` or `JavaScript`. Only one action is used. |
| Link address | Shown for `Open link`; required for that action. |
| JavaScript code | Shown for `JavaScript`; required for that action. |

## Link addresses

| Link | Behavior |
| --- | --- |
| `https://…`, `mailto:…`, other schemes | Handed to the system default handler, exactly like clicking a link in SiYuan. |
| `siyuan://blocks/<block ID>` | Opens (or zooms to) the block inside SiYuan. |
| `assets/<asset path>` | Images, audio, video and PDF open in a SiYuan tab; assets SiYuan has no tab renderer for (for example archives or txt files) open with the system default application. |

Any other value is passed to `window.open`, so protocols registered on the system (for example a
custom app scheme) work as well.

## JavaScript

The code editor is CodeMirror: line numbers, syntax highlighting, bracket matching and completion.
Its colors follow the scheme selected in <kbd>Settings</kbd> > <kbd>Appearance</kbd> >
<kbd>Code highlighting</kbd> (one scheme for light and one for dark mode), and the code block
line-wrap setting is honored as well. The font size matches SiYuan's code snippet input, the box can
be resized vertically, and right-clicking opens SiYuan's own native text menu (undo, redo, copy,
cut, paste, paste as plain text, select all).

The code runs in the page context when the button is clicked; `await` is supported. The `return`
value, everything written to `console` while it runs and any thrown error are shown in the result
dialog, which can copy the whole output as plain text.

Scripts can call every API SiYuan exposes to plugins.

Full guide with ready-to-paste examples: [docs/javascript.md](./docs/javascript.md). The
"JavaScript documentation" link inside the edit dialog renders these docs in a dialog, offline.

## Limitations

* The plugin is disabled on the publish service (`disabledInPublish`), so published pages show the
  raw block content instead of a button.
* PDF/HTML export has no custom block renderer either: exported documents contain the raw content.
* The JavaScript action is not sandboxed; it runs with the same privileges as the user's own code
  snippets. Only run code you trust.
* The icon list comes from the icons loaded in the current interface, so a third-party icon package
  changes what you can pick.

## Development

```bash
npm install          # Node.js 20+
npm run check        # i18n key check + tsc --noEmit + packaging build
npm run build        # dist/ + package.zip
```

## License

[MIT](./LICENSE)
