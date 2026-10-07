# JavaScript actions in button blocks

A button block runs a piece of JavaScript in the SiYuan frontend page, and it can call every API SiYuan exposes
to plugins (petal). Section 1 explains how it runs, **section 2 is the complete list of injected APIs**, and
section 3 contains a few full examples.

---

## 1. How a script runs

- **When**: on every click of the button.
- **Where the code comes from**: written inline in the button, or the button's action points at a "JavaScript
  file" (a local file under `assets/`, or an http(s) URL). The latter re-reads the file on every click, so
  editing the file changes the button's behaviour.
- **async wrapper**: the whole script is wrapped in an async function, so `await` works and `return` ends it.
- **Output**: the `return` value, whatever `console.log / info / debug / warn / error / table / dir` writes, and
  any thrown error appear in the result dialog, which can copy the text as plain text; the console lines are also
  passed through to the SiYuan console by the plugin (`console.debug` only once the plugin's "Debug mode"
  setting is on). With none of the three, **no dialog opens** (a silent run); when it opens is decided in
  section 4. Two other channels exist — a toast (`showMessage`, 2.2) and a window you build yourself (3.7) — and
  which one a button should use is a decision per button: the output dialog is for seeing everything, a toast for
  a button that stays on the note, a window when the click has to ask something first.
- **Fresh on every click**: the script keeps no state; use `plugin.saveData()` or write into a note when you need
  to remember something.
- **Calling the kernel**: `const response = await fetchPost("/api/…", {…})`; `code === 0` means success.

## 2. The injected APIs

The names below are injected as the parameters of that async function, so they are directly usable; any SiYuan
API not listed here is out of reach. The signatures match SiYuan's `petal` plugin API declarations and the host
implementation. Entries marked "desktop only" exist there only — `getActiveTab` / `getAllModels` / `getAllTabs`
are `undefined` on mobile, and the dock helpers of 2.4 return `false` there.

### 2.1 Kernel HTTP API

The three functions below are the calling convention. **The endpoint catalogue itself is not maintained here**:
every route SiYuan serves is registered in the kernel's `kernel/api/router.go`, and the ones with a stable
contract are documented in its `docs/API.md`. Read those for the endpoint you are about to call — the plugin
writes the tag of the SiYuan version you are running into the addresses below, so they describe your build:

| What you need | Where to read it |
| --- | --- |
| An endpoint's path, parameters and response body | `https://gcore.jsdelivr.net/gh/siyuan-note/siyuan@{{siyuan-ref}}/docs/API.md` |
| Whether a route exists, and which method and middleware it carries | `https://gcore.jsdelivr.net/gh/siyuan-note/siyuan@{{siyuan-ref}}/kernel/api/router.go` |

When the jsdelivr CDN is unreachable or cannot serve the file, use the GitHub raw addresses instead: `https://raw.githubusercontent.com/siyuan-note/siyuan/{{siyuan-ref}}/` and leave the rest of the path unchanged.

Fetch them with the `http_request` tool — `action` is the HTTP method and `url` the address, so a plain read is
`http_request(action: "get", url: "…")`.

| Name | Signature | Notes |
| --- | --- | --- |
| `fetchPost` | `fetchPost(url, data?, cb?, headers?)` | Without `cb` you can `await` the kernel response, with `cb` it uses SiYuan's own callback style |
| `fetchSyncPost` | `fetchSyncPost(url, data?, headers?)` | POST over a synchronous XHR, resolving with the kernel response |
| `fetchGet` | `fetchGet(url, cb?)` | GET; without `cb` it is awaitable too |

Responses have the shape `{code, msg, data}`, and `code === 0` means success.

### 2.2 Messages, dialogs and pickers

| Name | Signature | Notes |
| --- | --- | --- |
| `showMessage` | `showMessage(text, timeout?, type?, id?)` | Native toast; `type` is `"info"` or `"error"`, and it returns the message id |
| `hideMessage` | `hideMessage(id?)` | Hides a toast |
| `confirm` | `confirm(title, text, onConfirm?, onCancel?)` | Confirmation dialog |
| `openInputDialog` | `openInputDialog({title, value, label?, type?, onConfirm, …})` | Asks the user for a piece of text |
| `Dialog` | class | Build your own window: `new Dialog({title, width, content})`, then use `dialog.element` |
| `Menu` | class | Build your own menu: `new Menu()`, `menu.addItem({...})`, `menu.open({x, y})` |
| `Setting` | class | The settings-panel component |
| `openSetting` | `openSetting(app)` | Opens SiYuan's **Settings** (starting on the Editor tab); open **this plugin's** panel with `plugin.openSetting()` |
| `openEmoji` | `openEmoji({position, selectedCB?})` | Icon panel; `selectedCB(emoji)` receives the picked icon |
| `openAssetPicker` | `openAssetPicker({exts?, match?})` | Asset picker; resolves with `{path}` or `null` when cancelled |
| `openAttributePanel` | `openAttributePanel({data?, nodeElement?, focusName, protyle?})` | Block attribute panel; pass either `data` or `nodeElement` |

### 2.3 Tabs, windows and layout

| Name | Signature | Notes |
| --- | --- | --- |
| `openTab` | `openTab({app, doc?, asset?, pdf?, search?, card?, custom?, position?, …})` | Opens a document / asset / PDF / search / card / custom tab |
| `openWindow` | `openWindow({doc?, width?, height?, alwaysOnTop?, …})` | Opens a new desktop window; a no-op on mobile |
| `openMobileFileById` | `openMobileFileById(app, id, action?)` | Opens a document by block ID on mobile |
| `getActiveEditor` | `getActiveEditor(wndActive?)` | The current editor instance |
| `getActiveTab` | `getActiveTab(wndActive?)` | The current tab; desktop only |
| `getAllEditor` | `getAllEditor()` | Every editor instance |
| `getAllTabs` | `getAllTabs(type?)` | Every tab, optionally filtered by kind; desktop only |
| `getAllModels` | `getAllModels()` | Every tab model grouped by kind; desktop only |
| `getModelByDockType` | `getModelByDockType(type)` | Looks up a dock by type |
| `saveLayout` | `saveLayout(cb)` | Saves the current layout |

### 2.4 Docks and the document tree

| Name | Signature | Notes |
| --- | --- | --- |
| `toggleLeftDock` / `toggleRightDock` / `toggleBottomDock` | `toggleXxxDock(visible?)` | Shows / hides / toggles a whole dock bar; desktop only |
| `isLeftDockVisible` / `isRightDockVisible` / `isBottomDockVisible` | `isXxxDockVisible()` | Whether that dock bar is visible; desktop only |
| `expandDocTree` | `expandDocTree({id, isSetCurrent?})` | Expands and selects in the document tree (a notebook ID or a document ID) |

### 2.5 Editor, hotkeys and export

| Name | Signature | Notes |
| --- | --- | --- |
| `setEditorFontSize` | `setEditorFontSize(fontSize, options?)` | Sets the editor font size, returning the effective one |
| `adjustEditorFontSize` | `adjustEditorFontSize(action, options?)` | Steps the font size up / down / back to default, returning the effective one |
| `globalCommand` | `globalCommand(command, app)` | Runs a global command (`globalSearch`, `fileTree`…); the supported set differs per frontend |
| `adaptHotkey` | `adaptHotkey(hotkey)` | Adapts hotkey text to the current platform (`⌘` on macOS) |
| `saveExportFile` | `saveExportFile(uri, msgId?)` | Hands a kernel export to the user to save |

### 2.6 Platform

| Name | Signature | Notes |
| --- | --- | --- |
| `getFrontend` | `getFrontend()` | `"desktop"` / `"desktop-window"` / `"mobile"` / `"browser-desktop"` / `"browser-mobile"` |
| `getBackend` | `getBackend()` | `"windows"` / `"linux"` / `"darwin"` / `"docker"` / `"android"` / `"ios"` / `"harmony"` |

### 2.7 Quitting and locking

| Name | Signature | Notes |
| --- | --- | --- |
| `exitSiYuan` | `exitSiYuan(setCurrentWorkspace?)` | Quits SiYuan; `setCurrentWorkspace` defaults to `true`, remembering the current workspace |
| `lockScreen` | `lockScreen()` | Locks the screen; does nothing in read-only mode or on a publish service |

Neither can be undone, so ask with `confirm` first — see 3.6.

### 2.8 Host objects, classes and constants

| Name | Notes |
| --- | --- |
| `app` | The SiYuan app object; `openTab`, `openSetting` and friends need it |
| `plugin` | This plugin instance — see 2.10 |
| `siyuan` | `window.siyuan`: config, notebooks, current language |
| `Lute` | The Lute parser |
| `Constants` | SiYuan's constants (asset extensions, channel names) |
| `platformUtils` | Platform helpers: `copyPlainText` / `writeText` / `readText`, `getStorageVal` / `setStorageVal` / `getLocalStorage`, `isMac` / `isIPhone` / `isIPad` / `isInIOS` / `isInAndroid` / `isHuawei` / `isOnlyMeta` / `isNotCtrl`, `openByMobile`, `sendNotification` / `cancelNotification`, `updateHotkeyTip` |
| `Protyle` / `ProtyleMethod` / `Plugin` | SiYuan's classes: editor, render helpers, plugin objects |

### 2.9 Context of this click (injected by this plugin)

| Name | Notes |
| --- | --- |
| `protyle` | The editor instance that contains this button block, `undefined` when it cannot be found |
| `blockID` | The block ID of the button block itself |
| `isMobile` | Whether this is the mobile frontend |
| `i18n` | This plugin's strings (for example `i18n.copied`) |

### 2.10 What else `plugin.` gives you

- **Storage**: `plugin.saveData` / `loadData` / `removeData`, under `/data/storage/petal/button-in-siyuan/`;
  names may contain subdirectories but cannot escape with `..`.
- **Secrets and variables**: `plugin.getSecret(name)` / `plugin.getVariable(name)` — see 3.5.
- **Settings and identity**: `plugin.openSetting()`, `plugin.name` / `displayName` / `i18n` / `app`.
- **Events**: `plugin.eventBus.on / once / off / emit(...)`.
- **Lookups**: `plugin.models` / `docks` / `commands` / `getOpenedTab()`.
- **Registration methods** (`addTab` / `addDock` / `addCommand` / `addTopBar` and friends): what they register
  lives until the plugin unloads, so a button script should not call them.

## 3. Examples

Paste any of these into "edit the button block → button action → JavaScript".

### 3.1 Smallest example: return value + console

```javascript
console.log("the button was clicked");
return 1 + 1;   // the dialog shows: return value: 2
```

### 3.2 Calling the kernel and handling errors

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

### 3.3 Appending a paragraph to the current document

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

### 3.4 Remembering how often the button was clicked (plugin data)

```javascript
// Store an object: the storage file has no extension, a bare number is served as text and loadData
// resolves with a string ("1" + 1 gives "11").
const saved = (await plugin.loadData("click-count")) || {};
const next = (Number(saved.count) || 0) + 1;
await plugin.saveData("click-count", {count: next});
showMessage(`this button was clicked ${next} times`);
return next;
```

### 3.5 Reading a SiYuan secret or variable

The entries of <kbd>Settings</kbd> > <kbd>Secrets and Variables</kbd> are readable from a script; a name that is
not configured, or a non-administrator role, gives an empty string. SiYuan stores secrets encrypted, but the
frontend receives them as plain text, and the per-secret allow-list only limits the kernel's own HTTP requests.

```javascript
const token = plugin.getSecret("api_token");
const host = plugin.getVariable("api_host");
if (!token || !host) {
    return "configure api_token and api_host in Settings - Secrets and Variables";
}
const response = await fetch(`https://${host}/ping`, {headers: {Authorization: `Bearer ${token}`}});
return response.status;
```

### 3.6 Quitting SiYuan or locking the screen

```javascript
confirm("Quit SiYuan?", "Unsaved input may be lost.", () => exitSiYuan());
// locking works the same way: confirm("Lock the screen?", "", () => lockScreen());
return "waiting for confirmation";
```

### 3.7 Building a window

A toast cannot carry a question and the output dialog is not an input: when a click needs more than a message,
build the window yourself out of SiYuan's own classes. `new Dialog({…})` returns an object whose `element` is
the dialog's DOM; close it with `dialog.destroy()`, and give your nodes `data-bis` attributes so the lookups
never collide with SiYuan's own `data-type` dispatch.

```javascript
const dialog = new Dialog({
    title: "Append a line",
    width: "520px",
    content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">Text to append</div>
    <div class="fn__hr--small"></div>
    <input class="b3-text-field fn__block" data-bis="text" value="from the button">
    <div class="fn__hr"></div>
    <label class="fn__flex">
        <span class="fn__flex-1 ft__on-surface">Show a toast when it is done</span>
        <input type="checkbox" class="b3-switch fn__flex-center" data-bis="toast" checked>
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="cancel">Cancel</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-bis="confirm">Append</button>
</div>`,
});
const field = (type) => dialog.element.querySelector(`[data-bis="${type}"]`);
field("cancel").addEventListener("click", () => dialog.destroy());
field("confirm").addEventListener("click", async () => {
    const rootID = (protyle || getActiveEditor())?.protyle?.block?.rootID;
    if (!rootID) {
        showMessage("no current document", 7000, "error");
        return;
    }
    const response = await fetchPost("/api/block/appendBlock", {
        dataType: "markdown",
        data: field("text").value,
        parentID: rootID,
    });
    dialog.destroy();
    if (response.code !== 0) {
        showMessage(response.msg, 7000, "error");
        return;
    }
    if (field("toast").checked) {
        showMessage("appended");
    }
});
```

The click handler returns before the user has answered: the script's own "result" is the window, not a value.
This is the one case where a button legitimately leaves something on screen every time it is clicked — the
plugin's "JavaScript output dialog" setting does not touch it.

## 4. Caveats

- **Keep writes idempotent**: the script runs on every click, so appending or creating should be guarded by a
  timestamp or a check.
- **`exitSiYuan` / `lockScreen` cannot be undone**: `confirm` first; `lockScreen` does nothing in read-only mode
  or on a publish service.
- **Result dialog**: the plugin setting "JavaScript output dialog" defaults to `With output`, and can be changed
  to always / console only / warning / error / never; it only decides whether the dialog opens.
- **Two ways to call `fetchPost`**: `await fetchPost(url, data)` resolves with the response; `fetchPost(url, data, cb)`
  uses the callback, which only fires when `code >= 0`.
- **Read-only state**: write APIs are rejected in publish mode and read-only documents (`code` is not 0); check
  `window.siyuan.config.readonly` first.
- **Cross-origin**: on desktop with a local kernel `fetch("https://…")` works directly; with a remote kernel the
  usual same-origin rules apply.
- **Mobile**: `openTab` and `openWindow` are no-ops, and `getActiveTab` / `getAllModels` / `getAllTabs` plus the
  dock helpers of 2.4 are unavailable.
- **Plugin storage**: `plugin.loadData` may resolve with a string instead of an object — see 3.4.
- **Destructive calls**: `/api/block/deleteBlock`, `/api/filetree/removeDoc` and friends cannot be undone.
- **Debugging**: the plugin passes `console` output through to the SiYuan console while it still appears in the
  result dialog; `console.debug` only prints once the plugin's "Debug mode" setting is on. Add a `debugger`
  statement when you need DevTools itself.
