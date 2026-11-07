/**
 * `siyuan` 模块的测试替身。
 *
 * 插件运行在思源页面里，宿主提供的 `Plugin` / `Dialog` / `Menu` / `fetchPost` 等只能在真实思源里跑。
 * 测试通过 vitest.config.ts 的 alias 把 `siyuan` 指到这里：所有被 `src/` 导入的运行时值都有一份可控实现，
 * 每个测试还能用 `vi.mocked(...)` 改它的行为。类型检查仍用 npm 包里真实的 `.d.ts`。
 */
import {vi} from "vitest";

type TAny = any;

// ---- 内核与宿主接口 ----
export const showMessage = vi.fn((_text?: string, _timeout?: number, _type?: string): void => undefined);
export const hideMessage = vi.fn((_text?: string): void => undefined);
export const fetchSyncPost = vi.fn(async (
    _url: string,
    _data?: unknown,
    _headers?: Record<string, string>,
    _processMessage?: boolean,
): Promise<TAny> => ({code: 0, data: undefined}));
export const fetchPost = vi.fn((
    _url: string,
    _data?: unknown,
    _callback?: (response: TAny) => void,
    _headers?: Record<string, string>,
): void => undefined);
export const fetchGet = vi.fn((_url: string, _callback?: (response: TAny) => void): void => undefined);
export const openTab = vi.fn((_options: TAny): void => undefined);
export const saveExportFile = vi.fn((_path: string): void => undefined);
export const openInputDialog = vi.fn((..._args: TAny[]): void => undefined);
export const confirm = vi.fn((_text?: string, _detail?: string, _callback?: () => void): void => undefined);
export const getFrontend = vi.fn((): string => "desktop");
export const getBackend = vi.fn((): string => "windows");
export const getActiveEditor = vi.fn((..._args: TAny[]): TAny => undefined);
export const getActiveTab = vi.fn((..._args: TAny[]): TAny => undefined);
export const getAllEditor = vi.fn((..._args: TAny[]): TAny[] => []);
export const getAllModels = vi.fn((..._args: TAny[]): TAny => undefined);
export const getAllTabs = vi.fn((..._args: TAny[]): TAny => undefined);
export const getModelByDockType = vi.fn((..._args: TAny[]): TAny => undefined);
export const globalCommand = vi.fn((..._args: TAny[]): void => undefined);
export const adaptHotkey = vi.fn((..._args: TAny[]): void => undefined);
export const adjustEditorFontSize = vi.fn((..._args: TAny[]): void => undefined);
export const exitSiYuan = vi.fn((..._args: TAny[]): void => undefined);
export const expandDocTree = vi.fn((..._args: TAny[]): void => undefined);
export const isBottomDockVisible = vi.fn((): boolean => false);
export const isLeftDockVisible = vi.fn((): boolean => false);
export const isRightDockVisible = vi.fn((): boolean => false);
export const lockScreen = vi.fn((..._args: TAny[]): void => undefined);
export const openAssetPicker = vi.fn((..._args: TAny[]): void => undefined);
export const openAttributePanel = vi.fn((..._args: TAny[]): void => undefined);
export const openEmoji = vi.fn((..._args: TAny[]): void => undefined);
export const openMobileFileById = vi.fn((..._args: TAny[]): void => undefined);
export const openSetting = vi.fn((..._args: TAny[]): void => undefined);
export const openWindow = vi.fn((..._args: TAny[]): void => undefined);
export const saveLayout = vi.fn((..._args: TAny[]): void => undefined);
export const setEditorFontSize = vi.fn((..._args: TAny[]): void => undefined);
export const toggleBottomDock = vi.fn((..._args: TAny[]): void => undefined);
export const toggleLeftDock = vi.fn((..._args: TAny[]): void => undefined);
export const toggleRightDock = vi.fn((..._args: TAny[]): void => undefined);

export const platformUtils = {
    openByMobile: vi.fn((_url?: string): void => undefined),
    copyPlainText: vi.fn((_text?: string): void => undefined),
};

export const Constants = {
    SIYUAN_ASSETS_EXTS: [
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico",
        ".pdf", ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".mov",
        ".txt", ".md", ".html", ".css", ".js", ".json",
    ],
    SIYUAN_CMD: "siyuan",
    SIYUAN_CONTEXT_MENU: "siyuan-context-menu",
};

export const ProtyleMethod = {
    highlightRender: vi.fn(),
};

export class Protyle {
}

/**
 * 宿主对话框的替身：按 `options.content` 造出与真实结构一致的外壳，测试就能用
 * `dialog.element.querySelector('[data-bis="…"]')` 找到插件自己写进去的节点。
 */
export class Dialog {
    static instances: Dialog[] = [];

    element: HTMLElement;
    options: TAny;
    destroyed = false;

    constructor(options: TAny = {}) {
        this.options = options;
        const element = document.createElement("div");
        element.innerHTML = `<div class="b3-dialog">
    <div class="b3-dialog__scrim"></div>
    <div class="b3-dialog__container">
        <svg class="b3-dialog__close"><use xlink:href="#iconCloseRound"></use></svg>
        <div class="resize__move b3-dialog__header">${options.title || ""}</div>
        <div class="b3-dialog__body">${options.content || ""}</div>
        <div class="resize__rd"></div><div class="resize__ld"></div><div class="resize__lt"></div>
        <div class="resize__rt"></div><div class="resize__r"></div><div class="resize__d"></div>
        <div class="resize__t"></div><div class="resize__l"></div>
    </div>
</div>`;
        this.element = element;
        document.body.append(element);
        Dialog.instances.push(this);
    }

    destroy(_options?: unknown) {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.element.remove();
        this.options.destroyCallback?.();
    }
}

/** 宿主菜单的替身：记录 addItem / addSeparator / open 的调用，供菜单相关断言使用。 */
export class Menu {
    static instances: Menu[] = [];

    id?: string;
    items: TAny[] = [];
    separators = 0;
    opened?: TAny;

    constructor(id?: string) {
        this.id = id;
        Menu.instances.push(this);
    }

    addItem(item: TAny) {
        this.items.push(item);
        return document.createElement("div");
    }

    addSeparator() {
        this.separators += 1;
    }

    open(options: TAny) {
        this.opened = options;
    }
}

/** 宿主设置面板的替身：只记录条目，面板本身由宿主渲染。 */
export class Setting {
    static instances: Setting[] = [];

    items: TAny[] = [];
    options: TAny;

    constructor(options: TAny = {}) {
        this.options = options;
        Setting.instances.push(this);
    }

    addItem(item: TAny) {
        this.items.push(item);
        return document.createElement("div");
    }
}

/**
 * 宿主 `Plugin` 基类的替身。`src/index.ts` 继承它，测试用 `new ButtonInSiYuan({...})` 构造实例；
 * 数据读写方法都是 mock，便于断言设置与脚本存储的行为。
 */
export class Plugin {
    app: TAny;
    name: string;
    displayName: string;
    i18n: TAny;
    eventBus = {on: vi.fn(), off: vi.fn(), emit: vi.fn(() => true)};
    customBlockRenders: Record<string, TAny> = {};
    protyleSlash: TAny[] = [];
    setting?: Setting;
    data: Record<string, unknown> = {};
    addTopBar = vi.fn((_options: TAny): void => undefined);
    removeTopBar = vi.fn((_id: string): void => undefined);
    loadData = vi.fn(async (_name: string): Promise<TAny> => undefined);
    saveData = vi.fn(async (_name: string, _value?: unknown): Promise<TAny> => undefined);
    removeData = vi.fn(async (_name: string): Promise<TAny> => ({code: 0}));

    constructor(options: TAny = {}) {
        this.app = options.app ?? {};
        this.name = options.name ?? "button-in-siyuan";
        this.displayName = options.displayName ?? "Button in SiYuan";
        this.i18n = options.i18n ?? {};
    }
}

/** 把模块级 mock 恢复到测试开始时的默认行为。 */
export const resetSiyuanMock = () => {
    vi.clearAllMocks();
    getFrontend.mockReturnValue("desktop");
    getBackend.mockReturnValue("windows");
    getAllEditor.mockReturnValue([]);
    isBottomDockVisible.mockReturnValue(false);
    isLeftDockVisible.mockReturnValue(false);
    isRightDockVisible.mockReturnValue(false);
    fetchSyncPost.mockResolvedValue({code: 0, data: undefined});
    fetchPost.mockImplementation(() => undefined);
    fetchGet.mockImplementation(() => undefined);
    Dialog.instances.length = 0;
    Menu.instances.length = 0;
    Setting.instances.length = 0;
};
