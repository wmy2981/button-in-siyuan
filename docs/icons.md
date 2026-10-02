# SiYuan icon ids

Reference for the `icon` field of a button block: the field takes the **id** of an SVG icon symbol, exactly as
written here (for example `iconCirclePlay`). An empty string means "no icon".

## How the icon set is resolved

- The button block renders the id with `<svg class="svg"><use xlink:href="#iconXxx"></use></svg>`, so the id must
  exist as `<symbol id="iconXxx">` in the current page. That is how SiYuan itself draws every icon it ships.
- The available symbols are read from the page at runtime (`collectIconNames()`), so the list below is the
  **built-in** set plus whatever the active icon pack and other plugins have registered. Third-party icon packs
  therefore add ids that are not listed here.
- An id that is not loaded renders as nothing: the button keeps its text and loses only the icon.

## Picking by intent

| What the button does | Icon ids |
| --- | --- |
| Run / play | `iconCirclePlay`, `iconPlay` |
| Stop | `iconCircleStop`, `iconSquareStop`, `iconPause` |
| Edit / rename | `iconEdit` |
| Copy | `iconCopy` |
| Paste | `iconPaste` |
| Delete / remove | `iconTrashcan`, `iconClear`, `iconEraser` |
| Add / create | `iconAdd`, `iconSquarePlus`, `iconAddDoc`, `iconCalendarPlus`, `iconNewNoteBook` |
| Open | `iconOpen`, `iconOpenWindow`, `iconJumpTo` |
| Download / upload | `iconDownload`, `iconUpload`, `iconDownloadAssets`, `iconUploadAssets`, `iconImgDown` |
| Link / reference | `iconLink`, `iconLinkOff`, `iconRef` |
| Star / bookmark / like | `iconStar`, `iconBookmark`, `iconBookmarks`, `iconHeart` |
| Done / confirm | `iconCheck` |
| Close / cancel | `iconClose`, `iconCloseRound` |
| Settings / attributes | `iconSettings`, `iconAttr`, `iconFormat`, `iconTheme` |
| Search | `iconSearch`, `iconSearchAsset`, `iconRegex`, `iconExact` |
| Refresh / sync / cloud | `iconRefresh`, `iconCloud`, `iconCloudSucc`, `iconCloudOff`, `iconCloudError` |
| Date / time | `iconCalendar`, `iconClock` |
| Note / document | `iconFile`, `iconFileText`, `iconNotebook`, `iconNewNoteBook`, `iconFiles`, `iconAddDoc` |
| Folder | `iconFolder`, `iconFilesRoot`, `iconFolderClock` |
| Code / script | `iconCode`, `iconInlineCode`, `iconTerminal`, `iconMarkdown`, `iconSQL` |
| Tags | `iconTag`, `iconTags` |
| Undo / redo | `iconUndo`, `iconRedo` |
| Info / help / warning / bug | `iconInfo`, `iconHelp`, `iconTriangleAlert`, `iconBug` |
| Send / share | `iconSend`, `iconEmail`, `iconPhone`, `iconUsers` |
| AI / agent | `iconSparkles`, `iconBrain`, `iconAtom`, `iconGlobalGraph` |
| Web / publish | `iconGlobe`, `iconPublish`, `iconHTML5`, `iconLanguage` |
| Lock / key / security | `iconLock`, `iconUnlock`, `iconKey`, `iconShieldCheck` |
| Text formatting | `iconBold`, `iconItalic`, `iconUnderline`, `iconStrike`, `iconBIU`, `iconFont` |
| Table / database / layout | `iconTable`, `iconDatabase`, `iconLayoutGrid`, `iconLayout` |
| Zoom in / out | `iconZoomIn`, `iconZoomOut` |
| Filter / sort | `iconFilter`, `iconSort`, `iconListFilterPlus` |
| Move / drag / pan | `iconDrag`, `iconMove`, `iconHand`, `iconPan` |
| Fullscreen / size | `iconFullscreen`, `iconFullscreenExit`, `iconMax`, `iconMin`, `iconWidth`, `iconHeight` |
| Export / file types | `iconDocx`, `iconPDF`, `iconMarkdown`, `iconHTML5` |

## All built-in ids

The `name` column is the id without the `icon` prefix, split into words, so the table can be searched by
concept as well as by id. Order is SiYuan's own order inside the built-in set.

| id | name |
| --- | --- |
| `iconMindmap` | Mindmap |
| `iconRoute` | Route |
| `iconAlignTop` | Align Top |
| `iconAlignMiddle` | Align Middle |
| `iconAlignBottom` | Align Bottom |
| `iconTableCellsSplit` | Table Cells Split |
| `iconTableCellsMerge` | Table Cells Merge |
| `iconScale` | Scale |
| `iconDatabaseBackup` | Database Backup |
| `iconObsidian` | Obsidian |
| `iconBrain` | Brain |
| `iconAtom` | Atom |
| `iconPictureInPicture` | Picture In Picture |
| `iconPlugZap` | Plug Zap |
| `iconSquareAsterisk` | Square Asterisk |
| `iconSquarePlus` | Square Plus |
| `iconSquareStop` | Square Stop |
| `iconSend` | Send |
| `iconLayoutGrid` | Layout Grid |
| `iconListFilterPlus` | List Filter Plus |
| `iconFolderClock` | Folder Clock |
| `iconTriangleAlert` | Triangle Alert |
| `iconCirclePlay` | Circle Play |
| `iconCircleStop` | Circle Stop |
| `iconListTree` | List Tree |
| `iconPaintBucket` | Paint Bucket |
| `iconPaintRoller` | Paint Roller |
| `iconLanguage` | Language |
| `iconPanelLeft` | Panel Left |
| `iconPanelBottom` | Panel Bottom |
| `iconPanelRight` | Panel Right |
| `iconPanelLeftDashed` | Panel Left Dashed |
| `iconPanelBottomDashed` | Panel Bottom Dashed |
| `iconPanelRightDashed` | Panel Right Dashed |
| `iconSelectAll` | Select All |
| `iconUploadAssets` | Upload Assets |
| `iconDownloadAssets` | Download Assets |
| `iconKeepContent` | Keep Content |
| `iconFullWidth` | Full Width |
| `iconTurnInto` | Turn Into |
| `iconGlobe` | Globe |
| `iconPublish` | Publish |
| `iconDocx` | DOCX |
| `iconSearchAsset` | Search Asset |
| `iconAddDoc` | Add Doc |
| `iconExpandLevel` | Expand Level |
| `iconWidth` | Width |
| `iconHeight` | Height |
| `iconAlignSettings` | Align Settings |
| `iconFoldUnFold` | Fold Un Fold |
| `iconJumpTo` | Jump To |
| `iconEnterBack` | Enter Back |
| `iconEnter` | Enter |
| `iconRecentDocs` | Recent Docs |
| `iconOutline` | Outline |
| `iconCallout` | Callout |
| `iconInclude` | Include |
| `iconGroups` | Groups |
| `iconCamera` | Camera |
| `iconGallery` | Gallery |
| `iconBoard` | Board |
| `iconTerminal` | Terminal |
| `iconSoftWrap` | Soft Wrap |
| `iconLink` | Link |
| `iconLinkOff` | Link Off |
| `iconImgDown` | Img Down |
| `iconArrowDown` | Arrow Down |
| `iconPaperclip` | Paperclip |
| `iconUnpin` | Unpin |
| `iconPin` | Pin |
| `iconOpen` | Open |
| `iconKey` | Key |
| `iconClock` | Clock |
| `iconAttr` | Attr |
| `iconPaste` | Paste |
| `iconCopy` | Copy |
| `iconPhone` | Phone |
| `iconEmail` | Email |
| `iconDrag` | Drag |
| `iconCalendar` | Calendar |
| `iconCalendarPlus` | Calendar Plus |
| `iconNumber` | Number |
| `iconIndeterminateCheck` | Indeterminate Check |
| `iconPlugin` | Plugin |
| `iconUsers` | Users |
| `iconZoomIn` | Zoom In |
| `iconZoomOut` | Zoom Out |
| `iconFeedback` | Feedback |
| `iconCloseRound` | Close Round |
| `iconTabs` | Tabs |
| `iconTabItem` | Tab Item |
| `iconLayout` | Layout |
| `iconFullscreenExit` | Fullscreen Exit |
| `iconFullscreen` | Fullscreen |
| `iconScrollHoriz` | Scroll Horiz |
| `iconScrollVert` | Scroll Vert |
| `iconSparkles` | Sparkles |
| `iconDatabase` | Database |
| `iconBIU` | B I U |
| `iconKeyboardHide` | Keyboard Hide |
| `iconWorkspace` | Workspace |
| `iconCloud` | Cloud |
| `iconCloudOff` | Cloud Off |
| `iconCloudError` | Cloud Error |
| `iconCloudSucc` | Cloud Succ |
| `iconLiandi` | Liandi |
| `iconRiffCard` | Riff Card |
| `iconEyeoff` | Eyeoff |
| `iconEye` | Eye |
| `iconReplace` | Replace |
| `iconRtl` | RTL |
| `iconLtr` | LTR |
| `iconBack` | Back |
| `iconForward` | Forward |
| `iconLayoutBottom` | Layout Bottom |
| `iconLayoutRight` | Layout Right |
| `iconLayoutLeft` | Layout Left |
| `iconRef` | Ref |
| `iconFilter` | Filter |
| `iconDark` | Dark |
| `iconLight` | Light |
| `iconMode` | Mode |
| `iconHistory` | History |
| `iconClear` | Clear |
| `iconEraser` | Eraser |
| `iconFormat` | Format |
| `iconQuit` | Quit |
| `iconDock` | Dock |
| `iconHideDock` | Hide Dock |
| `iconInbox` | Inbox |
| `iconGithub` | Github |
| `iconGitHubI` | Git Hub I |
| `iconHTML5` | H T M L5 |
| `iconStar` | Star |
| `iconSpreadEven` | Spread Even |
| `iconSpreadOdd` | Spread Odd |
| `iconScrollWrapped` | Scroll Wrapped |
| `iconSelectText` | Select Text |
| `iconHand` | Hand |
| `iconPan` | Pan |
| `iconShieldCheck` | Shield Check |
| `iconSiYuan` | Si Yuan |
| `iconCut` | Cut |
| `iconAdd` | Add |
| `iconUncheck` | Uncheck |
| `iconTaskInProgress` | Task In Progress |
| `iconListItem` | List Item |
| `iconDot` | Dot |
| `iconUnderline` | Underline |
| `iconA` | A |
| `iconM` | M |
| `iconN` | N |
| `iconYuque` | Yuque |
| `iconGlobalGraph` | Global Graph |
| `iconGraph` | Graph |
| `iconRightTop` | Right Top |
| `iconLeftTop` | Left Top |
| `iconLeftBottom` | Left Bottom |
| `iconRightBottom` | Right Bottom |
| `iconBottomLeft` | Bottom Left |
| `iconBottomRight` | Bottom Right |
| `iconMove` | Move |
| `iconBazaar` | Bazaar |
| `iconKeymap` | Keymap |
| `iconFont` | Font |
| `iconVIP` | V I P |
| `iconSuper` | Super |
| `iconSelect` | Select |
| `iconSQL` | S Q L |
| `iconSub` | Sub |
| `iconSup` | Sup |
| `iconMark` | Mark |
| `iconEdit` | Edit |
| `iconPDF` | P D F |
| `iconVideo` | Video |
| `iconSplitLR` | Split L R |
| `iconSplitTB` | Split T B |
| `iconFocus` | Focus |
| `iconSort` | Sort |
| `iconDownload` | Download |
| `iconUpload` | Upload |
| `iconExact` | Exact |
| `iconRegex` | Regex |
| `iconMenu` | Menu |
| `iconLeft` | Left |
| `iconRight` | Right |
| `iconDown` | Down |
| `iconUp` | Up |
| `iconTags` | Tags |
| `iconTag` | Tag |
| `iconImage` | Image |
| `iconRefresh` | Refresh |
| `iconDices` | Dices |
| `iconUnlock` | Unlock |
| `iconLock` | Lock |
| `iconAccount` | Account |
| `iconMarkdown` | Markdown |
| `iconBookmarks` | Bookmarks |
| `iconBookmark` | Bookmark |
| `iconH1` | H1 |
| `iconH2` | H2 |
| `iconH3` | H3 |
| `iconH4` | H4 |
| `iconH5` | H5 |
| `iconH6` | H6 |
| `iconHeadings` | Headings |
| `iconMath` | Math |
| `iconClose` | Close |
| `iconRestore` | Restore |
| `iconFiles` | Files |
| `iconFilesRoot` | Files Root |
| `iconNotebook` | Notebook |
| `iconNewNoteBook` | New Note Book |
| `iconMax` | Max |
| `iconMin` | Min |
| `iconSettings` | Settings |
| `iconFolder` | Folder |
| `iconSearch` | Search |
| `iconFile` | File |
| `iconFileText` | File Text |
| `iconHeart` | Heart |
| `iconParagraph` | Paragraph |
| `iconMp` | MP |
| `iconQuote` | Quote |
| `iconAfter` | After |
| `iconBefore` | Before |
| `iconInsertLeft` | Insert Left |
| `iconInsertRight` | Insert Right |
| `iconDeleteColumn` | Delete Column |
| `iconDeleteRow` | Delete Row |
| `iconLine` | Line |
| `iconCode` | Code |
| `iconInlineCode` | Inline Code |
| `iconBoth` | Both |
| `iconTheme` | Theme |
| `iconOpenWindow` | Open Window |
| `iconPause` | Pause |
| `iconPreview` | Preview |
| `iconInfo` | Info |
| `iconHelp` | Help |
| `iconStrike` | Strike |
| `iconContract` | Contract |
| `iconExpand` | Expand |
| `iconRecord` | Record |
| `iconBold` | Bold |
| `iconBug` | Bug |
| `iconPlay` | Play |
| `iconCheck` | Check |
| `iconTrashcan` | Trashcan |
| `iconMore` | More |
| `iconEmoji` | Emoji |
| `iconAlignCenter` | Align Center |
| `iconAlignJustify` | Align Justify |
| `iconAlignLeft` | Align Left |
| `iconAlignRight` | Align Right |
| `iconItalic` | Italic |
| `iconOutdent` | Outdent |
| `iconIndent` | Indent |
| `iconOrderedList` | Ordered List |
| `iconList` | List |
| `iconTable` | Table |
| `iconRedo` | Redo |
| `iconUndo` | Undo |
| `iconZhihu` | Zhihu |

---

264 unique ids, taken from SiYuan 3.8.x's built-in `litheness` icon set
(`app/appearance/icons/litheness/icon.js`). `iconTurnInto` is declared twice in that file.
