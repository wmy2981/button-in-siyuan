/**
 * 按钮块图标：市集图标（assets/icon.svg、icon.png）与斜杠菜单里的图标都出自这里，
 * 避免同一个图形在两处各画一份。
 *
 * 图形画在 24 单位坐标系里，再放大 5 倍、平移 20 单位（画布 160×160）：
 * 圆角矩形是「按钮」，里面的短线是按钮上的文字，右下角的实心箭头是「点一下」的动作。
 * 圆角矩形的中心就是画布中心（24 单位里的 12,12），箭头压在它的右下角上 —— 这样「按钮」
 * 本身是正的，只有动作标记略微偏出。
 */
const CANVAS_SIZE = 160;
const SCALE = 5;
const OFFSET = 20;
/** 思源蓝 */
const BRAND_COLOR = "#3575F0";
/** 按钮边线的粗细（24 单位坐标系里的值） */
const STROKE = 1.2;
/** 图形在画布上的包围盒：圆角矩形加箭头，留一点描边余量，斜杠菜单按它收紧 viewBox */
const GLYPH_BOX = {x: 39, y: 54, width: 85, height: 60};

const PILL = {x: 4.5, y: 7.4, width: 15, height: 9.2, radius: 4.6};
const LABEL = "M8.6 12h5";
const POINTER = "M15.4 11.4v6l1.4-1.4.9 2.1 1.3-.6-.9-2.1 2.1-.25z";

/** 图形本体。市集图标用思源蓝线稿，斜杠菜单用当前文字色，箭头要不要白色描边也随之变化。 */
const glyph = (color: string, pointerOutline: string, labelStroke: number) => `<g transform="translate(${OFFSET} ${OFFSET}) scale(${SCALE})">
        <g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
            <rect x="${PILL.x}" y="${PILL.y}" width="${PILL.width}" height="${PILL.height}" rx="${PILL.radius}"/>
        </g>
        <path d="${LABEL}" fill="none" stroke="${color}" stroke-width="${labelStroke}" stroke-linecap="round"/>
        <path d="${POINTER}" fill="${color}"${pointerOutline ? ` stroke="${pointerOutline}" stroke-width=".9" stroke-linejoin="round"` : ""}/>
    </g>`;

/** 集市图标（160×160，白底、不切圆角）的完整 SVG 源码；scripts/render-icon.mjs 用它写 assets/icon.svg。 */
export const BUTTON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" role="img" aria-label="Button Block">
    <title>Button Block</title>
    <!-- 由 src/buttonIcon.ts 生成，勿手改；改图形请改那个文件后重跑 scripts/render-icon.mjs。
         白底不切圆角：集市卡片自己会加 border-radius。图形在 24 单位坐标系里画好再放大 5 倍，
         线宽 ${STROKE}（160 画布上约 ${STROKE * SCALE}px），与 editor-siyuan 的 24 单位线稿同构。
         箭头带白色细描边，把它和按钮边线分开。 -->
    <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="#FFFFFF"/>
    ${glyph(BRAND_COLOR, "#FFFFFF", 0.9)}
</svg>
`;

/**
 * 斜杠菜单（以及任何按思源列表图标显示的地方）用的图标：同一份图形，改成跟随主题文字色，
 * viewBox 收紧到图形本身，箭头不再描白边（列表底色可能是深色）。
 */
export const createButtonBlockIconHtml = () => {
    const box = GLYPH_BOX;
    return `<svg class="b3-list-item__graphic" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${glyph("currentColor", "", STROKE)}</svg>`;
};
