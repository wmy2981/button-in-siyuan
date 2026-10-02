# JavaScript actions for button blocks

A button block runs a piece of JavaScript: the script runs in the SiYuan frontend page, can call every API
SiYuan exposes to plugins, and can read or write kernel data. This document explains how a script runs,
which APIs are available, and gives examples you can paste as-is.

---

## 1. How a script runs

- **Trigger**: it runs when the button is clicked.
- **Where the code comes from**: everything below holds whether the button carries the code inline or its action is
  "JavaScript file" — then the code is read from an `assets/` file (or downloaded from an http(s) URL) again on
  every click, so editing that file is enough to change what the button does.
- **Wrapped in async**: the code is placed inside an async function, so `await` works and `return` ends it.
- **Return value**: the returned value is shown as the "Return value" line of the result dialog (objects are
  JSON-serialised). With **no `return`, no `console` output and no error the dialog does not open at all**
  (silent run, see 4.15); the plugin setting "JavaScript output dialog" decides when the dialog opens.
- **Calling the kernel**: `const response = await fetchPost("/api/…", {…})` gives you the kernel response directly
  (`code === 0` means success). The `fetchPost` SiYuan hands to plugins is callback-style; this plugin makes the
  no-callback form awaitable and leaves the callback form exactly as SiYuan behaves. Same for `fetchSyncPost`
  and `fetchGet`.
- **console output**: `console.log / info / debug / warn / error / table / dir` is collected and listed per level.
- **Errors**: a thrown exception is shown as the "Error" line; it never breaks SiYuan.
- **Colour**: the output understands ANSI colour escapes (see section 3).
- **Copy**: the "Copy" button in the dialog copies plain text with the colour escapes stripped.
- **Runs every time**: the script keeps no state between clicks; use `plugin.saveData()` or write into a note.

## 2. What the environment provides

### 2.1 Injected APIs

| Name | Purpose |
| --- | --- |
| `app` | The SiYuan app object (needed by `openTab` and friends) |
| `plugin` | This plugin instance: `loadData / saveData / removeData` for plugin-private data |
| `siyuan` | `window.siyuan`: config, notebooks, current language |
| `Lute` | The Lute parser (`Lute.New().Md2BlockDOM(md)` and so on) |
| `Constants` | SiYuan constants (asset extensions, channel names) |
| `platformUtils` | Platform helpers: `copyPlainText`, `readText`, `isMac`, `openByMobile`, … |
| `fetchPost` / `fetchSyncPost` / `fetchGet` | Kernel HTTP API — the one you will use most; without a callback you can `await` the response |
| `showMessage` / `hideMessage` | SiYuan's native toast |
| `confirm` | Confirmation dialog |
| `openInputDialog` | A dialog that asks the user for a piece of text |
| `openSetting` | Opens the plugin's settings page |
| `openTab` | Opens a document / asset / search / card tab |
| `openWindow` | Opens a new desktop window |
| `openMobileFileById` | Opens a block by ID on mobile |
| `openAssetPicker` | Asset picker |
| `openEmoji` | Emoji/icon panel |
| `openAttributePanel` | Block attribute panel |
| `getActiveEditor` / `getAllEditor` | Current / all editor instances (Protyle) |
| `getActiveTab` / `getAllTabs` / `getAllModels` / `getModelByDockType` | Tabs and panels |
| `toggleLeftDock` / `toggleRightDock` / `toggleBottomDock`, `isLeftDockVisible` / `isRightDockVisible` / `isBottomDockVisible` | Docks |
| `globalCommand` / `adaptHotkey` | Hotkeys and global commands |
| `saveExportFile` / `saveLayout` / `expandDocTree` | Export, save layout, expand the doc tree |
| `setEditorFontSize` / `adjustEditorFontSize` | Editor font size |
| `getFrontend` / `getBackend` | Frontend (desktop/mobile/browser) and backend platform |
| `Dialog` / `Menu` / `Setting` / `Protyle` / `ProtyleMethod` / `Plugin` | SiYuan classes, for custom dialogs and menus |
| `protyle` | **The editor instance that contains this button block** (`undefined` if it cannot be found) |
| `blockID` | The block ID of the button block itself |
| `isMobile` | Whether this is the mobile frontend |
| `i18n` | This plugin's strings (for example `i18n.copied`) |

### 2.2 Page globals

The script runs in SiYuan's page context, so `window`, `document`, `fetch`, `setTimeout`, `localStorage`,
`window.siyuan` (config, `languages`) and `window.Lute` are all available as usual.

### 2.3 What is deliberately not injected

- `exitSiYuan()` (quit SiYuan) and `lockScreen()`: a script must not be able to shut down the app.
- On desktop you can still reach Electron through `window.require("electron")`, but mobile and browser frontends
  do not have it, so such a button would break there. Not recommended.

## 3. Output and colour

| console method | Prefix in the dialog | Colour |
| --- | --- | --- |
| `console.log` / `console.info` | `log:` / `info:` | body grey |
| `console.debug` | `debug:` | light grey |
| `console.warn` | `warn:` | SiYuan warning colour |
| `console.error` | `error:` | SiYuan error colour |
| `console.table` / `console.dir` | `table:` / `dir:` | body grey |

Text may carry ANSI escapes (`\u001b`, i.e. ESC):

| Escape | Effect |
| --- | --- |
| `\u001b[31m` … `\u001b[37m` | red, green, yellow, blue, magenta, cyan, grey (standard 8) |
| `\u001b[90m` … `\u001b[97m` | bright variants |
| `\u001b[1m` `[2m` `[3m` `[4m` `[9m` | bold, dim, italic, underline, strikethrough |
| `\u001b[38;5;<0-255>m` | 256 colours (xterm indexes) |
| `\u001b[38;2;<r>;<g>;<b>m` | true colour |
| `\u001b[40m`…`[47m`, `[100m`…`[107m`, `[48;5;n`, `[48;2;r;g;b` | background colours |
| `\u001b[0m` | reset |

The palette uses mid-tones so it stays readable on both light and dark themes; the "black/white" slots are tuned
for readability rather than being pure black/white. Copying strips these escapes.

## 4. Examples

Paste any of these into "Edit button block → Button action → JavaScript" and replace the block IDs and paths.

### 4.1 Minimal: return value + console

```javascript
console.log("the button was clicked");
return 1 + 1;   // the dialog shows: Return value: 2
```

### 4.2 Coloured output

```javascript
console.log("\u001b[32m✓\u001b[0m done");
console.log("\u001b[1;33mheads up\u001b[0m: this is only a demo");
console.log("\u001b[38;5;208m256 colours\u001b[0m and \u001b[38;2;10;200;30mtrue colour\u001b[0m");
console.warn("warn gets the warning colour automatically");
console.error("error gets the error colour automatically");
return "colour demo finished";
```

### 4.3 How many characters does this document have (read-only)

```javascript
const editor = protyle || getActiveEditor();
if (!editor) {
    return "no editor found";
}
const response = await fetchPost("/api/block/getTreeStat", {id: editor.protyle.block.rootID});
if (response.code !== 0) {
    return `failed: ${response.msg}`;
}
const stat = response.data.stat;
console.log(`runes ${stat.runeCount}, words ${stat.wordCount}, blocks ${stat.blockCount}`);
showMessage(`${stat.runeCount} characters`);
return stat.runeCount;
```

### 4.4 Append a paragraph to the end of the document

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "no current document";
}
const response = await fetchPost("/api/block/appendBlock", {
    dataType: "markdown",
    data: `> appended by a button at ${new Date().toLocaleString()}`,
    parentID: rootID,   // the document is the parent block, so this appends at its end
});
if (response.code !== 0) {
    return `append failed: ${response.msg}`;
}
showMessage("appended to the end of the document");
return "appended";
```

### 4.5 List unfinished tasks (read-only)

SiYuan stores task list items as blocks with `subtype = 't'`; an open task's markdown looks like `- [ ] text`.
Note that the surrounding list block (`type = 'l'`) carries `subtype = 't'` as well, so filter on `type = 'i'`
to get list items only — otherwise every task is counted twice.

```javascript
const response = await fetchPost("/api/query/sql", {
    stmt: "SELECT content, id FROM blocks WHERE type = 'i' AND subtype = 't' AND markdown LIKE '%- [ ]%' ORDER BY updated DESC LIMIT 10",
});
if (response.code !== 0) {
    return `query failed: ${response.msg}`;
}
console.log(`open tasks: ${response.data.length}`);
response.data.forEach((row, index) => console.log(`${index + 1}. ${row.content}`));
return response.data.length;
```

### 4.6 Create a document and open it

`createDocWithMd` never overwrites a document with the same path, so a timestamped path is the safe choice.

```javascript
const notebooks = await fetchPost("/api/notebook/lsNotebooks", {});
const notebook = notebooks.data?.notebooks?.find((item) => item && !item.closed);
if (!notebook) {
    return "no open notebook";
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const title = `Created by a button ${stamp}`;
const response = await fetchPost("/api/filetree/createDocWithMd", {
    notebook: notebook.id,
    path: `/${title}`,
    markdown: `# ${title}\n\nCreated by a button block.\n`,
});
if (response.code !== 0) {
    return `create failed: ${response.msg}`;
}
openTab({app, doc: {id: response.data}});
return response.data;
```

### 4.7 Open a block

```javascript
// replace with your own block ID (right-click a block → Copy → Copy block ID)
openTab({app, doc: {id: "20240101000000-abcdefg"}});
return "opened";
```

### 4.8 Copy the document Markdown to the clipboard

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "no current document";
}
const response = await fetchPost("/api/export/exportMdContent", {id: rootID});
platformUtils.copyPlainText(response.data.content);
showMessage(`copied ${response.data.hPath} (${response.data.content.length} characters)`);
return "copied";
```

### 4.9 Add a custom attribute to the document

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "no current document";
}
const response = await fetchPost("/api/attr/setBlockAttrs", {
    id: rootID,
    attrs: {"custom-last-button-click": new Date().toISOString()},
});
return response.code === 0 ? "click time recorded" : `failed: ${response.msg}`;
```

### 4.10 Call a kernel API and handle errors

`fetchPost` resolves with the kernel response; only `code === 0` means success. Network and permission problems
throw, so wrapping in `try / catch` is the safe pattern.

```javascript
try {
    const response = await fetchPost("/api/block/getBlockInfo", {id: blockID});
    if (response.code !== 0) {
        showMessage(response.msg || "read failed", 7000, "error");
        return "read failed";
    }
    console.log("document:", response.data.rootTitle);
    return response.data.rootTitle;
} catch (error) {
    console.error("API call threw", error);
    return `threw: ${error.message}`;
}
```

### 4.11 Make a network request

The desktop main window disables the same-origin restriction, so cross-origin requests work directly; failures
show up as the error line of the dialog.

```javascript
try {
    const response = await fetch("https://api.github.com/repos/siyuan-note/siyuan");
    const data = await response.json();
    showMessage(`siyuan stars: ${data.stargazers_count}`);
    return data.stargazers_count;
} catch (error) {
    console.error("request failed", error);
    return `request failed: ${error.message}`;
}
```

### 4.12 Remember how often the button was clicked (plugin data)

```javascript
// Store an object: a plugin storage file has no extension, so the kernel guesses the Content-Type from the
// bytes and only `{…}` / `[…]` are parsed back as JSON. A bare number is served as text and `loadData`
// resolves with a string, where "1" + 1 gives "11".
const saved = (await plugin.loadData("click-count")) || {};
const next = (Number(saved.count) || 0) + 1;
await plugin.saveData("click-count", {count: next});
showMessage(`clicked ${next} times`);
return next;
```

### 4.13 Show your own dialog

```javascript
const dialog = new Dialog({
    title: "A dialog built by a button",
    width: "min(560px, 92vw)",
    content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">This UI is built by the script, using SiYuan's own style classes.</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--text" data-role="close">Close</button>
</div>`,
});
dialog.element.querySelector('[data-role="close"]').addEventListener("click", () => dialog.destroy());
return "dialog shown";
```

### 4.14 Ask the user, then jump

```javascript
openInputDialog({
    title: "Open block",
    label: "Block ID",
    value: blockID,
    onConfirm: (value) => {
        const id = value.trim();
        if (!id) {
            showMessage("block ID cannot be empty");
            return;
        }
        openTab({app, doc: {id}});
    },
});
return "waiting for input";
```

### 4.15 Silent run: no return value, no dialog

This is the default policy, the "With output" option of the plugin setting **JavaScript output dialog**
(<kbd>Settings</kbd> > <kbd>Marketplace</kbd> > <kbd>Downloaded</kbd> > the plugin's gear icon). The other
options are `Always`, `Console output only`, `On warning (and error)`, `On error` and `Never`; they only
change whether the dialog opens, never whether the script runs.

```javascript
showMessage("done, no dialog");
// no return: the result dialog stays closed
```

## 5. Caveats

- **Keep writes idempotent**: the script runs on every click, so appending or creating should be guarded by a
  timestamp or a check.
- **Two ways to call `fetchPost`**: `await fetchPost(url, data)` resolves with the response; `fetchPost(url, data, cb)`
  behaves exactly like SiYuan's own and uses the callback. The callback only fires when `code >= 0` (SiYuan itself
  just shows a toast for `code < 0`), so use the `await` form when you want to handle error responses yourself.
- **Read-only state**: in publish mode or a read-only document, write APIs are rejected by the kernel
  (`code` is not 0). You can check `window.siyuan.config.readonly` or `protyle.disabled` first.
- **Mobile differences**: `getActiveTab`, `getAllModels` and `getAllTabs` only exist on desktop (`undefined` on
  mobile), and anything relying on Electron is unavailable on mobile and browser frontends.
- **`plugin.loadData` does not always give you an object**: a plugin storage file has no extension, so the
  kernel sniffs its Content-Type (`getFile` in `kernel/api/file.go`) and only `{…}` or `[…]` are parsed back
  as JSON; a bare number, string or `true` is served as text, and `loadData` resolves with a **string** —
  `"1" + 1` gives `"11"`, so a counter runs 1, 11, 111… Store plugin data as an object (`{count: next}`), or
  coerce with `Number()` / `JSON.parse()` yourself.
- **Destructive calls**: the kernel also exposes `/api/block/deleteBlock`, `/api/filetree/removeDoc` and
  friends. A wrong click cannot be undone, so write them with care.
- **Debugging**: `console` output is captured by the dialog and does not stay in DevTools; use `showMessage`,
  or a `debugger` statement, when you need to see something there.
