# SiYuan icon ids

Reference for the `icon` field of a button block: it takes the **id** of an SVG icon symbol, exactly as
written here (`iconCirclePlay`, for example). An empty string means no icon.

## How the icon set is resolved

- The button block renders the id with `<svg class="svg"><use xlink:href="#iconXxx"></use></svg>`, so the id must
  exist as `<symbol id="iconXxx">` in the page. SiYuan draws all of its own icons this way.
- The available symbols are read from the page at runtime (`collectIconNames()`), so the list below is the
  **built-in** set plus whatever the active icon pack and other plugins registered; an icon pack adds ids that
  are not listed here.
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

Every built-in id, in SiYuan's own order. Each id spells out its name (`icon` plus camel case,
`iconCirclePlay` for example), so the table is searchable by concept too; use "Picking by intent" above when you
know the purpose but not the id.

| id |
| --- |
| `iconOCR` |
| `iconZap` |
| `iconMindmap` |
| `iconRoute` |
| `iconAlignTop` |
| `iconAlignMiddle` |
| `iconAlignBottom` |
| `iconTableCellsSplit` |
| `iconTableCellsMerge` |
| `iconScale` |
| `iconDatabaseBackup` |
| `iconObsidian` |
| `iconBrain` |
| `iconAtom` |
| `iconPictureInPicture` |
| `iconPlugZap` |
| `iconSquareAsterisk` |
| `iconSquarePlus` |
| `iconSquareStop` |
| `iconSend` |
| `iconLayoutGrid` |
| `iconListFilterPlus` |
| `iconFolderClock` |
| `iconTriangleAlert` |
| `iconCirclePlay` |
| `iconCircleStop` |
| `iconListTree` |
| `iconPaintBucket` |
| `iconPaintRoller` |
| `iconLanguage` |
| `iconPanelLeft` |
| `iconPanelBottom` |
| `iconPanelRight` |
| `iconPanelLeftDashed` |
| `iconPanelBottomDashed` |
| `iconPanelRightDashed` |
| `iconSelectAll` |
| `iconUploadAssets` |
| `iconDownloadAssets` |
| `iconKeepContent` |
| `iconFullWidth` |
| `iconTurnInto` |
| `iconGlobe` |
| `iconPublish` |
| `iconDocx` |
| `iconSearchAsset` |
| `iconAddDoc` |
| `iconExpandLevel` |
| `iconWidth` |
| `iconHeight` |
| `iconAlignSettings` |
| `iconFoldUnFold` |
| `iconJumpTo` |
| `iconEnterBack` |
| `iconEnter` |
| `iconRecentDocs` |
| `iconOutline` |
| `iconCallout` |
| `iconInclude` |
| `iconGroups` |
| `iconCamera` |
| `iconGallery` |
| `iconBoard` |
| `iconTerminal` |
| `iconSoftWrap` |
| `iconLink` |
| `iconLinkOff` |
| `iconImgDown` |
| `iconArrowDown` |
| `iconPaperclip` |
| `iconUnpin` |
| `iconPin` |
| `iconOpen` |
| `iconKey` |
| `iconClock` |
| `iconAttr` |
| `iconPaste` |
| `iconCopy` |
| `iconPhone` |
| `iconEmail` |
| `iconDrag` |
| `iconCalendar` |
| `iconCalendarPlus` |
| `iconNumber` |
| `iconIndeterminateCheck` |
| `iconPlugin` |
| `iconUsers` |
| `iconZoomIn` |
| `iconZoomOut` |
| `iconFeedback` |
| `iconCloseRound` |
| `iconTabs` |
| `iconTabItem` |
| `iconLayout` |
| `iconFullscreenExit` |
| `iconFullscreen` |
| `iconScrollHoriz` |
| `iconScrollVert` |
| `iconSparkles` |
| `iconDatabase` |
| `iconBIU` |
| `iconKeyboardHide` |
| `iconWorkspace` |
| `iconCloud` |
| `iconCloudOff` |
| `iconCloudError` |
| `iconCloudSucc` |
| `iconLiandi` |
| `iconRiffCard` |
| `iconEyeoff` |
| `iconEye` |
| `iconReplace` |
| `iconRtl` |
| `iconLtr` |
| `iconBack` |
| `iconForward` |
| `iconLayoutBottom` |
| `iconLayoutRight` |
| `iconLayoutLeft` |
| `iconRef` |
| `iconFilter` |
| `iconDark` |
| `iconLight` |
| `iconMode` |
| `iconHistory` |
| `iconClear` |
| `iconEraser` |
| `iconFormat` |
| `iconQuit` |
| `iconDock` |
| `iconHideDock` |
| `iconInbox` |
| `iconGithub` |
| `iconGitHubI` |
| `iconHTML5` |
| `iconStar` |
| `iconSpreadEven` |
| `iconSpreadOdd` |
| `iconScrollWrapped` |
| `iconSelectText` |
| `iconHand` |
| `iconPan` |
| `iconShieldCheck` |
| `iconSiYuan` |
| `iconCut` |
| `iconAdd` |
| `iconUncheck` |
| `iconTaskInProgress` |
| `iconListItem` |
| `iconDot` |
| `iconUnderline` |
| `iconA` |
| `iconM` |
| `iconN` |
| `iconYuque` |
| `iconGlobalGraph` |
| `iconGraph` |
| `iconRightTop` |
| `iconLeftTop` |
| `iconLeftBottom` |
| `iconRightBottom` |
| `iconBottomLeft` |
| `iconBottomRight` |
| `iconMove` |
| `iconBazaar` |
| `iconKeymap` |
| `iconFont` |
| `iconVIP` |
| `iconSuper` |
| `iconSelect` |
| `iconSQL` |
| `iconSub` |
| `iconSup` |
| `iconMark` |
| `iconEdit` |
| `iconPDF` |
| `iconVideo` |
| `iconSplitLR` |
| `iconSplitTB` |
| `iconFocus` |
| `iconSort` |
| `iconDownload` |
| `iconUpload` |
| `iconExact` |
| `iconRegex` |
| `iconMenu` |
| `iconLeft` |
| `iconRight` |
| `iconDown` |
| `iconUp` |
| `iconTags` |
| `iconTag` |
| `iconImage` |
| `iconRefresh` |
| `iconDices` |
| `iconUnlock` |
| `iconLock` |
| `iconAccount` |
| `iconMarkdown` |
| `iconBookmarks` |
| `iconBookmark` |
| `iconH1` |
| `iconH2` |
| `iconH3` |
| `iconH4` |
| `iconH5` |
| `iconH6` |
| `iconHeadings` |
| `iconMath` |
| `iconClose` |
| `iconRestore` |
| `iconFiles` |
| `iconFilesRoot` |
| `iconNotebook` |
| `iconNewNoteBook` |
| `iconMax` |
| `iconMin` |
| `iconSettings` |
| `iconFolder` |
| `iconSearch` |
| `iconFile` |
| `iconFileText` |
| `iconHeart` |
| `iconParagraph` |
| `iconMp` |
| `iconQuote` |
| `iconAfter` |
| `iconBefore` |
| `iconInsertLeft` |
| `iconInsertRight` |
| `iconDeleteColumn` |
| `iconDeleteRow` |
| `iconLine` |
| `iconCode` |
| `iconInlineCode` |
| `iconBoth` |
| `iconTheme` |
| `iconOpenWindow` |
| `iconPause` |
| `iconPreview` |
| `iconInfo` |
| `iconHelp` |
| `iconStrike` |
| `iconContract` |
| `iconExpand` |
| `iconRecord` |
| `iconBold` |
| `iconBug` |
| `iconPlay` |
| `iconCheck` |
| `iconTrashcan` |
| `iconMore` |
| `iconEmoji` |
| `iconAlignCenter` |
| `iconAlignJustify` |
| `iconAlignLeft` |
| `iconAlignRight` |
| `iconItalic` |
| `iconOutdent` |
| `iconIndent` |
| `iconOrderedList` |
| `iconList` |
| `iconTable` |
| `iconRedo` |
| `iconUndo` |
| `iconZhihu` |

---

266 unique ids, taken from SiYuan 3.8.x's built-in `litheness` icon set
(`app/appearance/icons/litheness/icon.js`). `iconTurnInto` is declared twice in that file.
