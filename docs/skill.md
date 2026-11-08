---
name: button-block
description: Create, edit and debug button blocks - the custom block whose info string is button-in-siyuan/button. Use this whenever a note needs a clickable button, or an existing button has to be changed or explained.
---

# SiYuan button blocks

This document is the button block itself: what it is, how its payload is shaped, and how to create, read and
change one through SiYuan's own tools. The *script* side of the action has its own document,
`references/javascript.md`.

A button block is an ordinary SiYuan **custom block**: the kernel stores it, syncs it, exports it and
indexes it like any other block, so nothing is lost when the plugin is disabled. The block content is the
source of truth; the plugin only renders it.

Do all of this through SiYuan's own tools — the `block` and `sql` tools, or the kernel HTTP API under
`/api/*`. Never hand-edit `data-content` on a rendered block and never build the button's DOM: the block
data is the source of truth.

## Reference documents

This skill ships two documents in a `references/` subdirectory next to this file. Load one with the `skill` tool
by naming the skill and the path inside it:

| Resource | What it holds |
| --- | --- |
| `references/javascript.md` | The script action: which SiYuan APIs a script may call, what `return`, `console` and `showMessage` each do, where the official endpoint reference lives, runnable examples. **Read it before writing any script.** |
| `references/icons.md` | Every built-in SiYuan icon id plus a "pick by intent" table. **Read it before setting `icon`** so you never invent an id. |

```
skill action=load name=button-block/references/javascript.md
```

SiYuan also lists these files as `<skill_resources>` when it loads this skill, and gives the skill directory as
a workspace path that the `file` tool can read
(`data/storage/ai/agent/skills/button-block/references/javascript.md`). Prefer the `skill` tool's locator: it
needs no absolute path.

## The block payload

In Markdown and in `get_kramdown` output the block is a `;;;` fence whose info string is the plugin name and
the block type, with a **single-line JSON payload** as its body (in the database the same fence is the block's
`markdown`, while its `content` is just that payload):

```
;;;button-in-siyuan/button
{"text":"Open home","icon":"iconCirclePlay","action":{"type":"link","link":"siyuan://blocks/20240101000000-abcdefg"}}
;;;
```

| Field | Meaning |
| --- | --- |
| `text` | Button label. Empty falls back to the plugin's default label. |
| `icon` | One exact id from `references/icons.md` (or one the active icon pack provides), for example `iconCirclePlay`. Empty string = no icon. An unknown id is silently dropped. |
| `color` | Optional. Index 1–12 of SiYuan's built-in text colours (`--b3-font-colorN`). Omit it for the theme's primary colour; index 6 equals that colour, so it is indistinguishable from omitting it. |
| `action` | Optional. Exactly one of the forms below; omit it for a button that does nothing. |

| `action` | Meaning |
| --- | --- |
| `{"type":"link","link":"…"}` | Opens the address the way SiYuan opens a link in a document: `https://…`, `mailto:…` and other schemes go to the system, `siyuan://blocks/<block ID>` (also `siyuan://plugins|bazaar/…`) is handled by SiYuan itself, and a local `assets/<path>` follows the user's "Resource opening" setting. |
| `{"type":"script","script":"…"}` | Runs the code inline in the SiYuan frontend page, wrapped in an async function (`await` and `return` work). Suits roughly a dozen lines. |
| `{"type":"file","file":"data/assets/my-script.js"}` | Runs a local JavaScript file from the asset directory, read again on every click. Maintain it with the `file` tool — see the path note below. |
| `{"type":"file","file":"data/storage/petal/button-in-siyuan/scripts/my-script.js"}` | Same, but the file lives in the plugin's own `scripts/` directory instead of the user's asset directory. |
| `{"type":"file","file":"https://example.com/x.js"}` | Downloads and runs that URL on every click. Prefer a local file: the remote content can change unnoticed, and the script can read and write the user's notes. |
| `{"type":"command","command":"globalSearch"}` | Runs a SiYuan command: either a core one (its id is the name under `keymap.general` in `conf.json`, for example `globalSearch`, `dailyNote`, `config`) or one another plugin registered (`plugin/<plugin name>/<langKey>`, the id SiYuan's command panel uses). `config.command` is the id, never the label. When the command is gone (its plugin was disabled) or cannot run in the current environment, the click only shows a toast — nothing else happens. |
| `{"type":"prompt","prompt":"…","newChat":true,"autoSend":true}` | Hands the Markdown in `prompt` to SiYuan's AI agent chat, formatting kept as it is. `newChat` is optional and off unless it is `true`: then a new conversation is started before the prompt goes in. `autoSend` is optional and off unless it is `true`: then the prompt is sent right away. Use it for a button that gives the agent one fixed instruction. |

Write the payload as one line of JSON. The only hard rule is that no line of the block content may be exactly
`;;;`. Content that is not valid JSON, or that carries none of the fields above, is *not* a button block, so
never store anything else in this block type.

### Script paths are workspace paths

The `file` field of the payload uses **the same path form as the `file` tool and `/api/file/*`**: a full path
from the workspace root. There are exactly two directories the plugin manages:

| Directory | Example value of `file` | Why choose it |
| --- | --- | --- |
| Asset directory | `data/assets/my-script.js` | The file is indexed as a SiYuan asset, follows asset sync, and the plugin marks it on the block with `custom-data-assets-button-in-siyuan` so "clean unreferenced assets" leaves it alone. |
| Plugin `scripts/` | `data/storage/petal/button-in-siyuan/scripts/my-script.js` | Keeps the user's asset directory clean; still inside `data/`, so it is synced with the workspace. Not an asset, so it has no reference attribute. |

An old button may still carry `assets/my-script.js`, which the plugin reads as `data/assets/my-script.js`;
do not write that short form yourself. If you write through `/api/file/putFile`, use the full workspace path —
the short form creates a second `assets/` directory at the workspace root, where the button will never find it
and where SiYuan neither indexes nor syncs it. When a button's script file cannot be found, check the path
first. For an asset-directory file, the block attribute holds `assets/my-script.js` (the kernel's asset scanner
only recognizes that prefix), while the payload holds `data/assets/my-script.js`; the plugin maintains that
attribute itself, just do not remove it.

SiYuan describes the `file` tool as debugging and log reading only: use it for script files and for reading this
skill's `references/` documents, nothing else in the workspace.

## Creating a button block

Insert it with the `block` tool, writing the whole fence as Markdown:

- `insert` with `dataType: "markdown"`, `data` = the fence text, plus `parentID`, or `previousID` /
  `nextID` to say where it goes (`parentID` must be a container block — a document, list item, quote…).
- `append` / `prepend` with `parentID` to put it at the end / start of that container instead.
- Keep the block ID the call returns: it is what you need to find and change the button later.

The fence text — newlines and all — is the value of `data`; the other arguments say where it goes:

```json
{
    "action": "insert",
    "dataType": "markdown",
    "previousID": "<block ID to insert after>",
    "data": "<the fence below, as one string>"
}
```

```
;;;button-in-siyuan/button
{"text":"Play","icon":"iconCirclePlay","action":{"type":"script","script":"showMessage(\"clicked\");"}}
;;;
```

The `;;;` fence is Lute's custom-block syntax and the kernel enables it for every Markdown entry API, so
this works through the block tool and through `/api/block/insertBlock` alike.

## Reading and changing an existing button block

1. Find the block ID: the `sql` tool can list them — `sql` with `action: "query"` and
   `stmt: "SELECT id, content, markdown FROM blocks WHERE type = 'custom' AND markdown LIKE ';;;button-in-siyuan/%'"`
   (custom blocks are indexed with `type = 'custom'`) — and `block` `get_children` / `breadcrumb` work when
   walking a document.
2. Read the payload: `block` `get_kramdown` with the block ID returns the `;;;` fence; parse the JSON in
   the middle.
3. Change the fields you need and re-serialise as **one line**.
4. Write it back with `block` `update` (`id`, `dataType: "markdown"`, `data` = the whole fence again). The
   plugin re-renders the button as soon as the transaction lands.

Read it back once afterwards: the kernel may normalise content, so confirm what actually landed.

## Top bar quick actions

Quick actions are not button blocks and do not live in a document: each one is a JSON file under

```
data/storage/petal/button-in-siyuan/topbar/<name>.json
```

The plugin reads that directory on every use, so creating or editing a file takes effect without reloading the
plugin. Files are used in **file name order**: prefix names with `01-`, `02-` to control the order. A file's
content is the same payload as a button block, minus `color`:

```json
{
    "text": "Daily note",
    "icon": "iconCalendar",
    "action": {"type": "link", "link": "siyuan://blocks/20240101000000-abcdefg"}
}
```

| Field | Meaning |
| --- | --- |
| `text` | Label. Empty falls back to the plugin's default label. |
| `icon` | Optional exact id from `references/icons.md`; omit or use `""` for no icon. |
| `action` | Optional, exactly the same forms as the block payload (`link`, `script`, `file`, `command`, `prompt`). |

A quick action carries only text, icon and action: **`color` is ignored**, so do not add it. Write the file as
one JSON object with indentation; invalid JSON, or an object with none of `text` / `icon` / `action`, is skipped
and logged. Use the `file` tool or `/api/file/putFile` with the full path above; the parent directory is created
on the first write. Deleting the file removes the action. A quick action has no block context, so in an inline
script `blockID` is an empty string and `protyle` is `undefined`; use a script file or a link when you need the
current document.

## Reporting from a script

A button is clicked again and again, so decide *per button* what the user should see each time. Three
channels are available, and they are not interchangeable:

| Channel | What the user gets | Reach for it when |
| --- | --- | --- |
| `return <value>` and `console.log / info / debug / warn / error` | One result window holding every console line, the return value and the thrown error, as copyable plain text. | You are working the script out and want to see everything it produced, or the value is long. |
| `showMessage(text, timeout?, type?, id?)` | SiYuan's own toast; it goes away by itself. | The button will stay on the note: a short confirmation per click, with no window to close. |
| `new Dialog({…})` | A window you build yourself. | The click cannot act before it knows something — a question, a few fields, a choice. §3.7 of `references/javascript.md` has a full example. |

There is no default to fall back on: pick the one that fits, and say which one you picked when you report
back. The result window opens only when the script produces console output, a return value or an error; a toast
and a window you build yourself are not affected by that rule.

A script can override when that window opens and restrict where it runs with declarations at the very top,
before the first line of code:

```javascript
// @bis-output error
// @bis-frontends desktop, mobile
// @bis-backends windows, linux, darwin
```

`@bis-output` takes `always`, `output`, `console`, `warn`, `error` or `never`. `@bis-frontends` / `@bis-backends`
take the marketplace plugin values (`all`, `desktop`, `desktop-window`, `mobile`, `browser-desktop`,
`browser-mobile`; `all`, `windows`, `linux`, `darwin`, `docker`, `android`, `ios`, `harmony`), comma- or
space-separated. Omitting a declaration means `all`. When the current environment is not declared, the code does
not run and the user is told with a toast, so use it for scripts that only make sense on one platform.

```javascript
// The usual shape of a finished button: a toast per click, and nothing to close.
showMessage("done");

// While you are still working the script out, keep the output instead: one window with everything in it.
// console.log("done");
// return "done";
```

A thrown error always reaches the result window unless the script declares the `console` or `never` output
mode, so a failure does not go unnoticed.

## Before you report back

- `get_kramdown` gives back the `;;;` fence, the payload line inside it parses with `JSON.parse`, and
  `action.type` is one of `link`, `script`, `file`, `command`, `prompt` (and, for `file`, the target really is readable).
- Every `icon` id is listed in `references/icons.md` or comes from the active icon pack, and `color`, if present,
  is an integer between 1 and 12.
- For a script: you have decided what each click should show — the result window while working it out, a toast
  for a button that stays, your own window when the click needs input (see "Reporting from a script") — rather
  than leaving output that opens a window on every click. A button runs its script on every click, so keep
  writes idempotent, and remind the user to back up before a script that creates or deletes notes. The script
  scope also contains `exitSiYuan()` and `lockScreen()`, which quit SiYuan or lock the screen: only use them
  when the user asked for exactly that, and wrap the call in `confirm(...)`.
- When a script has to remember something, keep it in an object (`plugin.saveData("click-count", {count: n})`).
  These files land in `data/storage/petal/button-in-siyuan/storage/`; a plugin storage file has no extension,
  and a bare number or string comes back from `plugin.loadData` as text, so `count + 1` would concatenate
  digits. Older files still at the plugin directory root are migrated on the next read.
