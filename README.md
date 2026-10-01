[简体中文](./README.zh-CN.md)

# Button Block (button-in-siyuan)

Insert native SiYuan button blocks into documents. The button text, icon and click action are all
edited in a native SiYuan dialog.

![preview](https://gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@d75c77e/assets/preview.png)

## Features

* The button is a SiYuan custom block (`;;;button-in-siyuan/button`), so it is saved, synced,
  undone and exported with the document.
* The button uses the very same classes as SiYuan's own settings buttons
  (`b3-button b3-button--outline fn__size200`): 200px wide, UI font size, and hover/pressed
  effects all come from SiYuan's own CSS — the plugin does not restyle the button.
* The icon is picked from the SVG icons available in the current interface (the built-in icon set,
  plus icons provided by icon packages and plugins), with a search box.
* A button action is optional and is one of: open a link, or run JavaScript.
* The JavaScript editor is CodeMirror, with line numbers, syntax highlighting, bracket matching and
  completion; its colors follow SiYuan's code highlighting setting.
* Every dialog, menu and form control is native SiYuan UI.

## Install

1. From the marketplace (after the plugin is listed): <kbd>Settings</kbd> > <kbd>Marketplace</kbd> >
   <kbd>Download</kbd> > search for "Button Block".
2. Manually: download `package.zip` from the latest Release, unzip it as
   `{workspace}/data/plugins/button-in-siyuan/`, then enable the plugin in
   <kbd>Settings</kbd> > <kbd>Marketplace</kbd> > <kbd>Downloaded</kbd>.

Requires SiYuan 3.8.5 or later.

## Usage

1. Type `/button` (or `/按钮块`) in a document and press <kbd>Enter</kbd>: a button block is
   inserted at the caret.
2. Click the block icon of the button block, then <kbd>Plugin</kbd> > <kbd>Edit button block</kbd>.
3. Set the text, the icon and the action in the dialog, then confirm.

The block content itself is plain JSON; the button only renders while the plugin is enabled.

## Settings

| Field | Description |
| --- | --- |
| Button text | Button label, plain text. Empty input falls back to the default text. |
| Button icon | One SVG icon of the current interface; can also be unset. |
| Button action | `None`, `Open link` or `JavaScript`. Only one action is used. |
| Link address | Shown for `Open link`; required for that action. |
| JavaScript code | Shown for `JavaScript`; required for that action. |

## Link addresses

| Link | Behavior |
| --- | --- |
| `https://…`, `mailto:…`, other schemes | Handed to the system default handler, exactly like clicking a link in SiYuan. |
| `siyuan://blocks/<block ID>` | Opens (or zooms to) the block inside SiYuan. |
| `assets/<asset path>` | Images, audio, video and PDF open in a SiYuan tab; assets SiYuan has no tab renderer for (for example archives) are handed to the system. |

Any other value is passed to `window.open`, so protocols registered on the system (for example a
custom app scheme) work as well.

## JavaScript

The code editor is CodeMirror: line numbers, syntax highlighting, bracket matching and completion.
Its colors follow the scheme selected in <kbd>Settings</kbd> > <kbd>Appearance</kbd> >
<kbd>Code highlighting</kbd> (one scheme for light and one for dark mode), and the code block
line-wrap setting is honored as well.

The code runs in the page context when the button is clicked, with the same capabilities as a
SiYuan JavaScript snippet (`window.siyuan`, the editor DOM and the kernel HTTP APIs are reachable).
`await` is supported, `return` values are shown in the result dialog, and everything written to
`console.log/info/warn/error` while the code runs is captured into the same dialog.

## Shortcuts

| Operation | Shortcut |
| --- | --- |
| Insert a button block | `/button` or `/按钮块` in the slash menu (no dedicated shortcut) |
| Edit a button block | None (block icon menu > <kbd>Plugin</kbd> > <kbd>Edit button block</kbd>) |

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
npm run typecheck    # tsc --noEmit
npm run build        # dist/ + package.zip
```

`npm run dev` writes a watch build to the repository root (`index.js`, `index.css`, `i18n/`) for a
local `data/plugins/button-in-siyuan` symlink; `npm run build` is the packaging build.
Icons and the preview image are rendered with `node scripts/render-icon.mjs` and
`node scripts/render-preview.mjs` (the latter needs `npx playwright install chromium` once).
After changing the look of the code editor, run `node scripts/snapshot-editor.mjs` first: it writes the
real CodeMirror CSS and DOM back into `assets/preview.html`.

## License

[MIT](./LICENSE)
