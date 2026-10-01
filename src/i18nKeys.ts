/**
 * 插件文案键，与 src/i18n/zh-CN.json、src/i18n/en.json 一一对应。
 *
 * 思源只会加载当前语言的那一份（缺失时按 en、zh-CN 依次回落），所以两份文件必须保持同键。
 */
export type II18n = {
    insertButtonBlock: string;
    editButtonBlock: string;
    defaultButtonText: string;
    buttonText: string;
    buttonIcon: string;
    chooseIcon: string;
    chooseIconTitle: string;
    searchIcon: string;
    noMatchedIcon: string;
    clearIcon: string;
    buttonAction: string;
    actionNone: string;
    actionLink: string;
    actionScript: string;
    actionContentRequired: string;
    linkAddress: string;
    linkAddressPlaceholder: string;
    linkAddressTip: string;
    assetOpenFailed: string;
    scriptCode: string;
    scriptCodePlaceholder: string;
    scriptCodeTip: string;
    scriptOutput: string;
    returnValue: string;
    errorValue: string;
    noOutput: string;
    blockNotEditable: string;
    save: string;
    cancel: string;
    close: string;
};
