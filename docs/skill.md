---
name: button-block
description: Create, edit and debug button blocks - the custom block whose info string is button-in-siyuan/button. Use this whenever a note needs a clickable button, or an existing button has to be changed or explained.
---

# SiYuan button blocks

This document is the button block itself: what it is, how its payload is shaped, and how to create, read and
change one through SiYuan's own tools. The *script* side of the action has its own document,
`references/javascript.md`, which is written for you and for the user who opens it inside the plugin.

A button block is an ordinary SiYuan **custom block**: the kernel stores it, syncs it, exports it and
indexes it like any other block, so nothing is lost when the plugin is disabled. Only the *rendering*
comes from the plugin — with the plugin enabled the block is drawn as a native SiYuan button
(`b3-button b3-button--outline fn__size200`); with the plugin disabled or removed, SiYuan falls back to
showing the raw block content in a `<pre>`.

Do all of this through SiYuan's own tools — the `block` and `sql` tools, or the kernel HTTP API under
`/api/*`. Never hand-edit `data-content` on a rendered block and never build the button's DOM: the block
data is the source of truth.

## Reference documents

This skill ships two documents next to this file. Load one with the `skill` tool by naming the skill and the
path inside it:

| Resource | What it holds |
| --- | --- |
| `references/javascript.md` | The script action: which SiYuan APIs a script may call, what `return`, `console` and `showMessage` each do, where the official endpoint reference lives, runnable examples. **Read it before writing any script.** |
| `references/icons.md` | Every built-in SiYuan icon id plus a "pick by intent" table. **Read it before setting `icon`** so you never invent an id. |

```text
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

```text
;;;button-in-siyuan/button
{"text":"Open home","icon":"iconCirclePlay","action":{"type":"link","link":"siyuan://blocks/20240101000000-abcdefg"}}
;;;
```

| Field | Meaning |
| --- | --- |
| `text` | Button label. Empty falls back to the plugin's default label. |
| `icon` | One icon id from `references/icons.md`, for example `iconCirclePlay`. Empty string = no icon. A typo only shows up as a silently missing icon. |
| `color` | Optional. Index 1–12 of SiYuan's built-in text colours (`--b3-font-colorN`), which colours the frame, the label and the icon together and follows the theme in light and dark mode. Omit it for SiYuan's native blue; the editor's palette offers 1–5 and 7–12, because 6 is that same theme primary colour. |
| `action` | Optional. Exactly one of the four forms below; omit it for a button that does nothing. |

| `action` | Meaning |
| --- | --- |
| `{"type":"link","link":"…"}` | Opens the address the way SiYuan opens a link in a document: `https://…`, `mailto:…` and other schemes go to the system, `siyuan://blocks/<block ID>` (also `siyuan://plugins|bazaar/…`) is handled by SiYuan itself, and a local `assets/<path>` follows the user's "Resource opening" setting. |
| `{"type":"script","script":"…"}` | Runs the code inline in the SiYuan frontend page, wrapped in an async function (`await` and `return` work). Suits roughly a dozen lines. |
| `{"type":"file","file":"assets/my-script.js"}` | Runs a JavaScript file under `assets/`, read again on every click. Maintain it with the `file` tool — see the path note below. |
| `{"type":"file","file":"https://example.com/x.js"}` | Downloads and runs that URL on every click. Prefer a local file: the remote content can change unnoticed, and the script can read and write the user's notes. |

Write the payload as one line of JSON — that is what the plugin's editor always does, and the only hard rule is
that no line of the block content may be exactly `;;;`. Content that is not valid JSON, or that carries none of
the fields above, is *not* treated as a button block: the plugin renders it as raw text and offers no edit
entry, so never store anything else in this block type.

### Asset paths: `assets/…` in the payload, `data/assets/…` in your tools

A script file is named in two different ways, and mixing them up does not fail loudly — it writes to the
wrong directory:

| Where | Path | Relative to |
| --- | --- | --- |
| The `file` field of the payload, and every asset link inside a document | `assets/my-script.js` | the data directory (`data/`) |
| The `file` tool (`read` / `write` / `rename` / `delete` / `stat`) and `/api/file/*` | `data/assets/my-script.js` | the workspace root |

So the file the payload calls `assets/my-script.js` is `data/assets/my-script.js` for every tool you use to
touch it, and keep a local `file` value to `assets/<name>.js`: the plugin resolves it under the data directory,
and it only offers create, edit, rename and delete for `assets/` `.js` files. A local `assets/` script file a
button uses is also marked on the block with the `custom-data-assets-button-in-siyuan` attribute, so SiYuan
counts it as referenced and never offers it for cleanup (a remote URL is not marked); the plugin maintains that
attribute itself, just do not remove it. If you write through `/api/file/putFile` with the payload form
(`assets/my-script.js`), the kernel happily creates a second `assets/` directory at the workspace root — and the
button then breaks: the plugin resolves the payload path against `data/`, so it looks for
`data/assets/my-script.js`, fails to load the script and only shows a toast on every click. A file outside
`data/` is also neither indexed by SiYuan nor synced, so a button whose script file lives there stays on one
device. When a button's script file cannot be found, check this first.

Creating or editing these files with the `file` tool makes the user confirm each write, and SiYuan describes
that tool as debugging and log reading only: use it for script files, nothing else in the workspace.

## Creating a button block

Insert it with the `block` tool, writing the whole fence as Markdown:

- `insert` with `dataType: "markdown"`, `data` = the fence text, plus `parentID`, or `previousID` /
  `nextID` to say where it goes (`parentID` must be a container block — a document, list item, quote…).
- `append` / `prepend` with `parentID` to put it at the end / start of that container instead.
- Keep the block ID the call returns: it is what you need to find and change the button later.

```text
block action=insert previousID=<block ID to insert after> dataType=markdown
data=;;;button-in-siyuan/button
{"text":"Play","icon":"iconCirclePlay","action":{"type":"script","script":"console.log(\"clicked\"); return 1 + 1;"}}
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

## Reporting from a script

A button is clicked again and again, so decide *per button* what the user should see each time. Three
channels are available, and they are not interchangeable:

| Channel | What the user gets | Reach for it when |
| --- | --- | --- |
| `return <value>` and `console.log / info / debug / warn / error` | The plugin's JavaScript output dialog: every console line, the return value and the thrown error, as copyable plain text. It stays open until it is closed. | You are working the script out and want to see everything it produced, or the value is long. |
| `showMessage(text, timeout?, type?, id?)` | SiYuan's own toast in the corner; it goes away by itself. | The button will stay on the note: a short confirmation per click, with no window to close. |
| `new Dialog({…})` | A window you build yourself. | The click cannot act before it knows something — a question, a few fields, a choice. §3.7 of `references/javascript.md` has a full example. |

There is no default to fall back on: pick the one that fits, and say which one you picked when you report
back. The plugin's "JavaScript output dialog" setting only decides whether the *output dialog* opens (default
`With output`: it opens when there is console output, a return value or an error) — a toast and your own
window are unaffected by it.

```javascript
// The usual shape of a finished button: a toast per click, and nothing to close.
showMessage("done");

// While you are still working the script out, keep the output instead: one window with everything in it.
// console.log("done");
// return "done";
```

A thrown error always reaches the output dialog unless the user chose the `Console output only` or `Never`
policy, so a failure does not go unnoticed.

## Before you report back

- `get_kramdown` gives back the `;;;` fence, the payload line inside it parses with `JSON.parse`, and
  `action.type` is one of `link`, `script`, `file` (and, for `file`, the target really is readable).
- Every `icon` id exists in `references/icons.md`, and `color`, if present, is an integer between 1 and 12.
- For a script: you have decided what each click should show — the output dialog while working it out, a toast
  for a button that stays, your own window when the click needs input (see "Reporting from a script") — rather
  than leaving output that opens a window on every click. A button runs its script on every click, so keep
  writes idempotent, and remind the user to back up before a script that creates or deletes notes. The script
  scope also contains `exitSiYuan()` and `lockScreen()`, which quit SiYuan or lock the screen: only use them
  when the user asked for exactly that, and wrap the call in `confirm(...)`.
- When a script has to remember something, keep it in an object (`plugin.saveData("click-count", {count: n})`):
  a plugin storage file has no extension, and a bare number or string comes back from `plugin.loadData` as
  text, so `count + 1` would concatenate digits.
- The click itself can only be confirmed by the user inside SiYuan.
