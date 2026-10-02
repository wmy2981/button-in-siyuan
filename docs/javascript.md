# JavaScript actions in button blocks

A button block runs a piece of JavaScript. The script runs in the SiYuan frontend page and can call every API
SiYuan exposes to plugins (petal), and read or write kernel data. Section 1 explains how it runs, **section 2 is
the complete list of injected APIs** (look things up there), and section 4 keeps only a few full examples.

---

## 1. How a script runs

- **When**: on every click of the button.
- **Where the code comes from**: written inline in the button, or the button's action points at a "JavaScript
  file" (a local file under `assets/`, or an http(s) URL). The latter re-reads the file on every click
  (re-downloads it for a URL), so editing the file changes the button's behaviour.
- **async wrapper**: the whole script is wrapped in an async function, so `await` works and `return` ends it.
- **Return value**: what you `return` shows up on the "return value" line of the result dialog (objects are
  JSON-serialised).
- **Result dialog**: with no `return`, no `console` output and no error, **no dialog opens** (a silent run).
  When it opens is decided by the plugin setting "JavaScript output dialog" — the choices are listed in
  section 5.
- **console output**: `console.log / info / debug / warn / error / table / dir` is collected and shown in the
  dialog, tagged by level.
- **Errors**: an exception thrown by the script is shown on the "error" line of the dialog and does not affect
  SiYuan.
- **Colours**: the output understands ANSI escapes — see section 3.
- **Fresh on every click**: the script keeps no state; use `plugin.saveData()` or write into a note when you
  need to remember something.
- **Calling the kernel**: `const response = await fetchPost("/api/…", {…})`; `code === 0` means success.

## 2. The injected APIs

The script is wrapped in an async function that takes these names as parameters, so every name below is
directly usable in the script; any SiYuan API that is not listed here is out of reach. The signatures match
SiYuan's `petal` plugin API declarations and the host implementation. Entries marked "desktop" exist on desktop
only: `getActiveTab` / `getAllModels` / `getAllTabs` are `undefined` on mobile (calling them throws), while the
dock helpers of 2.4 are no-ops that return `false`.

### 2.1 Kernel HTTP API

| Name | Signature | Notes |
| --- | --- | --- |
| `fetchPost` | `fetchPost(url, data?, cb?, headers?)` | The one you will use most. Without `cb` you can `await` the kernel response; with `cb` it behaves exactly like SiYuan's own callback-style call |
| `fetchSyncPost` | `fetchSyncPost(url, data?, headers?)` | POST over a synchronous XHR, resolving with the kernel response |
| `fetchGet` | `fetchGet(url, cb?)` | GET; without `cb` it is awaitable too, resolving with an object for JSON and text otherwise |

Responses have the shape `{code, msg, data}`. SiYuan's own `fetchPost` / `fetchGet` are callback-style; this
plugin adds the awaitable form for calls that pass no callback (see section 5), so both styles work.

### 2.2 Messages, dialogs and pickers

| Name | Signature | Notes |
| --- | --- | --- |
| `showMessage` | `showMessage(text, timeout?, type?, id?)` | SiYuan's native toast; `type` is `"info"` or `"error"`, `timeout` is in milliseconds, and it returns the id of that message (the petal declaration says `void`) |
| `hideMessage` | `hideMessage(id?)` | Hides a toast; passing an `id` hides just that one |
| `confirm` | `confirm(title, text, onConfirm?, onCancel?)` | Confirmation dialog; both callbacks receive the `Dialog` instance |
| `openInputDialog` | `openInputDialog({title, value, label?, type?, multiline?, placeholder?, maxLength?, actions?, onConfirm, …})` | Asks the user for a piece of text; `onConfirm(value, dialog)` receives it |
| `Dialog` | class | Build your own window: `new Dialog({title, width, content})`, then `dialog.element` and `dialog.destroy()` |
| `Menu` | class | Build your own menu: `new Menu()`, `menu.addItem({...})`, `menu.open({x, y})` |
| `Setting` | class | SiYuan's settings-panel component (the plugin's own settings panel is built with it) |
| `openSetting` | `openSetting(app)` | Opens SiYuan's **Settings** dialog (it starts on the Editor tab). To open *this plugin's* settings panel use `plugin.openSetting()` |
| `openEmoji` | `openEmoji({position, selectedCB?, …})` | Emoji/icon panel; `selectedCB(emoji)` receives the picked icon |
| `openAssetPicker` | `openAssetPicker({exts?, match?})` | Asset picker; resolves with `{path}` (an `assets/`-relative path) or `null` when cancelled |
| `openAttributePanel` | `openAttributePanel({data?, nodeElement?, focusName, protyle?})` | Opens the block attribute panel; pass either `data` or `nodeElement`, `focusName` picks the field to focus |

### 2.3 Tabs, windows and layout

| Name | Signature | Notes |
| --- | --- | --- |
| `openTab` | `openTab({app, doc?, asset?, pdf?, search?, card?, custom?, position?, keepCursor?, removeCurrentTab?, afterOpen?})` | Opens a document / asset / PDF / search / card / custom tab; `position` is `"right"` or `"bottom"` |
| `openWindow` | `openWindow({doc?, position?, width?, height?, alwaysOnTop?, tab?})` | Opens a new desktop window; a no-op on mobile |
| `openMobileFileById` | `openMobileFileById(app, id, action?)` | Opens a document by block ID on mobile |
| `getActiveEditor` | `getActiveEditor(wndActive?)` | The current editor instance (Protyle) |
| `getActiveTab` | `getActiveTab(wndActive?)` | The current tab (Tab) | desktop |
| `getAllEditor` | `getAllEditor()` | Every editor instance, including those in search, backlink and custom tabs |
| `getAllTabs` | `getAllTabs(type?)` | Every tab; pass `type` to get one kind (`"Editor"`, `"Search"`, a custom tab's type name…) | desktop |
| `getAllModels` | `getAllModels()` | Every tab model grouped by kind (`editor` / `search` / `backlink` / `custom` …) | desktop |
| `getModelByDockType` | `getModelByDockType(type)` | Looks up a dock by type (`"file"`, `"outline"`, or `<plugin name><type>` for a plugin dock) |
| `saveLayout` | `saveLayout(cb)` | Saves the current layout; `cb` runs once it is saved |

### 2.4 Docks and the document tree

| Name | Signature | Notes |
| --- | --- | --- |
| `toggleLeftDock` / `toggleRightDock` / `toggleBottomDock` | `toggleXxxDock(visible?)` | Shows / hides / toggles a whole dock bar; without `visible` it toggles, and the return value says whether the bar has an active tool | desktop |
| `isLeftDockVisible` / `isRightDockVisible` / `isBottomDockVisible` | `isXxxDockVisible()` | Whether that dock bar is currently visible | desktop |
| `expandDocTree` | `expandDocTree({id, isSetCurrent?})` | Expands and selects in the document tree (pass a notebook ID or a document ID); works on desktop and mobile |

### 2.5 Editor, hotkeys and export

| Name | Signature | Notes |
| --- | --- | --- |
| `setEditorFontSize` | `setEditorFontSize(fontSize, options?)` | Sets the editor font size, returning the effective one |
| `adjustEditorFontSize` | `adjustEditorFontSize(action, options?)` | Steps the font size up / down / back to default, returning the effective one |
| `globalCommand` | `globalCommand(command, app)` | Runs a global command; the name matches SiYuan's shortcut table (`globalSearch`, `recentDocs`, `fileTree`…), and the supported set differs per frontend |
| `adaptHotkey` | `adaptHotkey(hotkey)` | Adapts hotkey text such as `Ctrl+…` to the current platform (becomes `⌘` on macOS) |
| `saveExportFile` | `saveExportFile(uri, msgId?)` | Hands a kernel-produced export (the path returned by `/api/export/*`) to the user to save |

### 2.6 Platform

| Name | Signature | Notes |
| --- | --- | --- |
| `getFrontend` | `getFrontend()` | `"desktop"` / `"desktop-window"` / `"mobile"` / `"browser-desktop"` / `"browser-mobile"` |
| `getBackend` | `getBackend()` | `"windows"` / `"linux"` / `"darwin"` / `"docker"` / `"android"` / `"ios"` / `"harmony"` |

### 2.7 Quitting and locking (handle with care)

| Name | Signature | Notes |
| --- | --- | --- |
| `exitSiYuan` | `exitSiYuan(setCurrentWorkspace?)` | Quits SiYuan: on desktop it flushes every window and the workspace first, then calls `/api/system/exit`. A failed flush, or a pending update package, only shows a message / confirmation instead of quitting. `setCurrentWorkspace` defaults to `true`, meaning the current workspace is remembered |
| `lockScreen` | `lockScreen()` | Locks the screen: saves the layout and logs the session out (back to the lock / login screen). It returns immediately in read-only mode and on a publish service. The implementation takes no argument |

Both are immediately visible to the user and cannot be undone, so ask with `confirm(...)` first — see 4.6.

### 2.8 Host objects, classes and constants

| Name | Notes |
| --- | --- |
| `app` | The SiYuan app object; `openTab`, `openWindow`, `openSetting` and friends need it |
| `plugin` | This plugin instance: `loadData / saveData / removeData`, `getSecret / getVariable`, `openSetting()`, `eventBus`, `name` and more — see 2.10 |
| `siyuan` | `window.siyuan`: config, notebooks, current language |
| `Lute` | The Lute parser (`Lute.New().Md2BlockDOM(md)` and so on) |
| `Constants` | SiYuan's constants (asset extensions, channel names) |
| `platformUtils` | Platform helpers: `copyPlainText` / `writeText` / `readText`, `getStorageVal` / `setStorageVal` / `getLocalStorage`, `isMac` / `isIPhone` / `isIPad` / `isInIOS` / `isInAndroid` / `isHuawei` / `isOnlyMeta` / `isNotCtrl`, `openByMobile`, `sendNotification` / `cancelNotification`, `updateHotkeyTip`, `getEventName` |
| `Protyle` / `ProtyleMethod` / `Plugin` | SiYuan's classes: build an editor, call render helpers, construct plugin objects |

### 2.9 Context of this click (injected by this plugin)

| Name | Notes |
| --- | --- |
| `protyle` | **The editor instance that contains this button block** (Protyle), `undefined` when it cannot be found |
| `blockID` | The block ID of the button block itself |
| `isMobile` | Whether this is the mobile frontend |
| `i18n` | This plugin's strings (for example `i18n.copied`) |

### 2.10 What else `plugin.` gives you

- **Storage**: `plugin.saveData(name, value)` / `plugin.loadData(name)` / `plugin.removeData(name)`, stored
  under `/data/storage/petal/button-in-siyuan/`. Names may contain subdirectories but cannot escape with `..`.
- **Secrets and variables**: `plugin.getSecret(name)` / `plugin.getVariable(name)` — see 4.5.
- **Settings panel**: `plugin.openSetting()` opens this plugin's own settings panel.
- **Identity and events**: `plugin.name` / `plugin.displayName` / `plugin.i18n` / `plugin.app`, and
  `plugin.eventBus.on / once / off / emit(...)`.
- **Registered entries**: `plugin.models` / `plugin.docks` / `plugin.commands` / `plugin.getOpenedTab()`.
- **Registration methods** (`addTab` / `addDock` / `addCommand` / `addTopBar` and friends): anything they
  register lives until the plugin unloads, so a button script should not call them — register permanent
  entries in the plugin's own `onload` instead.

### 2.11 Page globals and objects without a contract

The script runs in SiYuan's page context, so `window`, `document`, `fetch`, `setTimeout`, `localStorage`,
`window.siyuan` and `window.Lute` are all available.

`window.siyuan.layout`, `app.plugins` and `window.require("electron")` are SiYuan internals rather than plugin
APIs: reachable, but without a version contract, so an upgrade may change them. `app.plugins` is the array of
plugin instances loaded in the current window and is how you act on another plugin (open its settings window, a
custom tab or a dock). `window.require("electron")` exists on desktop only — mobile and browser frontends do not
have it.

## 3. Output and colours

| console method | Prefix in the dialog | Colour |
| --- | --- | --- |
| `console.log` / `console.info` | `log:` / `info:` | body grey |
| `console.debug` | `debug:` | light grey |
| `console.warn` | `warn:` | SiYuan's warning colour |
| `console.error` | `error:` | SiYuan's error colour |
| `console.table` / `console.dir` | `table:` / `dir:` | body grey |

The text may carry ANSI escape sequences (write `\u001b`, the ESC character):

| Form | Effect |
| --- | --- |
| `\u001b[31m` … `\u001b[37m` | red, green, yellow, blue, magenta, cyan, grey (the standard 8) |
| `\u001b[90m` … `\u001b[97m` | the bright version of those 8 |
| `\u001b[1m` `[2m` `[3m` `[4m` `[7m` `[9m` | bold, dim, italic, underline, inverse, strike-through |
| `\u001b[38;5;<0-255>m` | 256 colours (the xterm colour numbers) |
| `\u001b[38;2;<r>;<g>;<b>m` | true colour |
| `\u001b[40m`…`[47m`, `[100m`…`[107m`, `[48;5;n`, `[48;2;r;g;b` | background colours |
| `\u001b[0m` | reset (`[22m` / `[23m` / `[24m` / `[27m` / `[29m` reset the matching attribute, `[39m` / `[49m` reset the foreground / background colour) |

The palette is mid-tone so it stays readable in both light and dark themes; the "black" and "white" steps were
tuned for readability and are not the pure black and white of a terminal. The dialog's Copy button copies plain
text with the escapes stripped.

## 4. Examples

Paste any of these into "edit the button block → button action → JavaScript", replacing IDs and paths with your
own.

### 4.1 Smallest example: return value + console

```javascript
console.log("the button was clicked");
return 1 + 1;   // the dialog shows: return value: 2
```

### 4.2 Calling the kernel and handling errors

`fetchPost` resolves with the kernel response, where `code === 0` means success; network or permission problems
throw, so wrap the call in `try / catch`.

```javascript
try {
    const response = await fetchPost("/api/block/getBlockInfo", {id: blockID});
    if (response.code !== 0) {
        showMessage(response.msg || "read failed", 7000, "error");
        return "read failed";
    }
    console.log("in document:", response.data.rootTitle);
    return response.data.rootTitle;
} catch (error) {
    console.error("kernel call failed", error);
    return `error: ${error.message}`;
}
```

### 4.3 Appending a paragraph to the current document

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "no current document";
}
const response = await fetchPost("/api/block/appendBlock", {
    dataType: "markdown",
    data: `> appended by a button at ${new Date().toLocaleString()}`,
    parentID: rootID,   // the document itself is the parent block, so this lands at the end
});
if (response.code !== 0) {
    return `append failed: ${response.msg}`;
}
showMessage("appended to the end of the document");
return "appended";
```

### 4.4 Remembering how often the button was clicked (plugin data)

```javascript
// Store an object: a plugin storage file has no extension, so the kernel guesses the Content-Type from the
// content and only `{…}` / `[…]` is parsed back as JSON. A bare number is served as text, so loadData
// resolves with a string ("1" + 1 gives "11").
const saved = (await plugin.loadData("click-count")) || {};
const next = (Number(saved.count) || 0) + 1;
await plugin.saveData("click-count", {count: next});
showMessage(`this button was clicked ${next} times`);
return next;
```

### 4.5 Reading a SiYuan secret or variable

The entries of <kbd>Settings</kbd> > <kbd>Secrets and Variables</kbd> are readable from a script:
`plugin.getSecret(name)` and `plugin.getVariable(name)` return the value, or an empty string when the name is
not configured or the current role is not an administrator. SiYuan stores secrets encrypted, but the frontend
receives them as plain text, so a script that reads one can send it anywhere — the per-secret allow-list only
limits the kernel's own HTTP requests.

```javascript
const token = plugin.getSecret("api_token");
const host = plugin.getVariable("api_host");
if (!token || !host) {
    return "configure api_token and api_host in Settings - Secrets and Variables";
}
const response = await fetch(`https://${host}/ping`, {headers: {Authorization: `Bearer ${token}`}});
return response.status;
```

### 4.6 Quitting SiYuan or locking the screen

Neither can be undone, so ask first:

```javascript
confirm("Quit SiYuan?", "Unsaved input may be lost.", () => exitSiYuan());
// locking works the same way: confirm("Lock the screen?", "", () => lockScreen());
return "waiting for confirmation";
```

## 5. Caveats

- **Keep writes idempotent**: the script runs on every click, so appending or creating should be guarded by a
  timestamp or a check.
- **`exitSiYuan` / `lockScreen` cannot be undone**: quitting interrupts whatever the user is doing, and locking
  asks for the password again (when an access authorization code is set), so always `confirm` first. In
  read-only mode and on a publish service `lockScreen` does nothing, while `exitSiYuan` still tries to quit.
- **Result dialog policy**: the plugin setting "JavaScript output dialog" defaults to `With output` — it opens
  when there is console output, a return value or an error. The other choices are `Always`, `Console output
  only`, `On warning (and error)`, `On error` and `Never`; they only change whether the dialog opens, never
  whether the script runs.
- **Two ways to call `fetchPost`**: `await fetchPost(url, data)` resolves with the response; `fetchPost(url, data, cb)`
  behaves exactly like SiYuan's own and uses the callback. The callback only fires when `code >= 0` (SiYuan itself
  just shows a toast for `code < 0`), so use the `await` form when you want to handle error responses yourself.
- **Read-only state**: in publish mode or a read-only document, write APIs are rejected by the kernel
  (`code` is not 0). You can check `window.siyuan.config.readonly` or `protyle.disabled` first.
- **Cross-origin requests**: on desktop with a local kernel the main window has same-origin checks disabled, so
  `fetch("https://…")` works directly; with a remote kernel the usual same-origin rules apply and the target
  site has to allow the request.
- **Mobile differences**: `openTab` and `openWindow` are no-ops on mobile, `getActiveTab`, `getAllModels` and
  `getAllTabs` do not exist there (they are `undefined`), and the dock helpers of 2.4 are no-ops returning
  `false`. Anything relying on Electron is unavailable on mobile and browser frontends.
- **`plugin.loadData` does not always give you an object**: a plugin storage file has no extension, so the
  kernel sniffs its Content-Type (`getFile` in `kernel/api/file.go`: the file extension first, then
  `mimetype.Detect`) and only `{…}` or `[…]` are parsed back as JSON; a bare number, string or `true` is served
  as text, and `loadData` resolves with a **string** — `"1" + 1` gives `"11"`, so a counter runs 1, 11, 111…
  Store plugin data as an object (`{count: next}`), or coerce with `Number()` / `JSON.parse()` yourself.
- **Destructive calls**: the kernel also exposes `/api/block/deleteBlock`, `/api/filetree/removeDoc` and
  friends. A wrong click cannot be undone, so write them with care.
- **Debugging**: `console` output is captured by the dialog and does not stay in DevTools; use `showMessage`,
  or a `debugger` statement, when you need to see something there.
