/**
 * 按钮块图标：市集图标（assets/icon.svg、icon.png）与斜杠菜单里的图标都出自这里，
 * 避免同一个图形在两处各画一份。
 *
 * 图形画在 24 单位坐标系里，再放大 5 倍、平移 20 单位（画布 160×160）：
 * 圆角矩形是「按钮」，里面的短线是按钮上的文字，右下角的实心箭头是「点一下」的动作。
 * 按钮两端都是半圆（rx 取高度的一半），中心就是画布中心（24 单位里的 12,12），尺寸顶到画布的大半；
 * 箭头压在它的右下角上 —— 这样「按钮」本身是正的，只有动作标记略微偏出，
 * 两者之间留着一圈浅色空隙，不会糊在一起。
 *
 * 市集图标在图形下面垫三层凑出磨砂质感：浅灰渐变底、图形自己模糊出来的柔光、一层极淡的噪点颗粒；
 * 按钮内部再填一层半透明白，看着像一块磨砂玻璃面板。斜杠菜单里的图标不用这些，
 * 只取同一份图形的线稿，跟着主题文字色走。
 */
const CANVAS_SIZE = 160;
const SCALE = 5;
const OFFSET = 20;
/** 思源蓝 */
const BRAND_COLOR = "#3575F0";
/** 市集图标的底色：自上而下略微变深的浅灰面 */
const SURFACE_TOP = "#FAFBFC";
const SURFACE_BOTTOM = "#EDF0F5";
/** 柔光：模糊半径按 160 画布的像素算（24 单位里约 0.9），浓度按视觉调 */
const GLOW_BLUR = 4.5;
const GLOW_OPACITY = 0.5;
/** 磨砂面上的噪点浓度：再重就显脏 */
const GRAIN_OPACITY = 0.06;
const GRAIN_FREQUENCY = 0.85;
/** 按钮内部那层磨砂面板的浓度 */
const PANEL_OPACITY = 0.72;
/** 按钮边线的粗细（24 单位坐标系里的值） */
const STROKE = 1.2;
/** 按钮上那句「文字」的粗细：比边线略细一点 */
const LABEL_STROKE = 1.05;
/** 箭头外圈的浅色：比底色略白一点，压在按钮内外都说得过去 */
const POINTER_OUTLINE_COLOR = "#F6F9FC";
/** 箭头浅色外圈的宽度：连同 1.0 的箭头本体，在箭头两侧各留出 0.7 的空隙 */
const POINTER_OUTLINE = 2.4;
/** 箭头本体的描边宽度：与填充同色，纯粹为了让箭头的尖角变圆 */
const POINTER_ROUND = 1.0;
/** 箭头的微调：以尖端（15.4,11.4）为中心缩到 0.95 再往右下挪 0.3，别把按钮的右下角盖满 */
const POINTER_NUDGE = "translate(.3 .3) translate(15.4 11.4) scale(.95) translate(-15.4 -11.4)";
/** 图形在画布上的包围盒：圆角矩形加箭头，留一点描边余量，斜杠菜单按它收紧 viewBox */
const GLYPH_BOX = {x: 33, y: 48, width: 94, height: 66};

const PILL = {x: 3.4, y: 6.4, width: 17.2, height: 11.2, radius: 5.6};
const LABEL = "M9 12h5.6";
const POINTER = "M15.4 11.4v6.2l1.5-1.5.95 2.2 1.35-.62-.95-2.2 2.15-.25z";

type GlyphOptions = {
    color: string;
    /** 按钮内部的面板色：市集图标填半透明白，斜杠菜单不填 */
    panelFill?: string;
    /** 箭头外圈色：市集图标用它把箭头从按钮边线上切开，斜杠菜单不描 */
    pointerOutline?: string;
    /** 「文字」短线的粗细：市集图标比边线略细，斜杠菜单与边线同粗 */
    labelStroke?: number;
};

/** 图形本体。颜色、面板、箭头外圈、文字线宽四处随用途变化，几何只写一份。 */
const glyph = ({color, panelFill = "", pointerOutline = "", labelStroke = STROKE}: GlyphOptions) => `<g transform="translate(${OFFSET} ${OFFSET}) scale(${SCALE})">
${panelFill ? `        <rect x="${PILL.x}" y="${PILL.y}" width="${PILL.width}" height="${PILL.height}" rx="${PILL.radius}" fill="${panelFill}" fill-opacity="${PANEL_OPACITY}"/>\n` : ""}        <g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
            <rect x="${PILL.x}" y="${PILL.y}" width="${PILL.width}" height="${PILL.height}" rx="${PILL.radius}"/>
            <path d="${LABEL}" stroke-width="${labelStroke}"/>
            <g transform="${POINTER_NUDGE}">${pointerOutline ? `\n                <path d="${POINTER}" fill="${color}" stroke="${pointerOutline}" stroke-width="${POINTER_OUTLINE}"/>` : ""}
                <path d="${POINTER}" fill="${color}" stroke="${color}" stroke-width="${POINTER_ROUND}"/>
            </g>
        </g>
    </g>`;

/** 柔光层：把同一份图形模糊一份垫在下面 —— 磨砂玻璃那种从底下透出来的光 */
const glow = (color: string) => `<g opacity="${GLOW_OPACITY}" filter="url(#bis-icon-glow)">
        ${glyph({color, labelStroke: LABEL_STROKE})}
    </g>`;

/** 集市图标（160×160，方形满版、不切圆角）的完整 SVG 源码；scripts/render-icon.mjs 用它写 assets/icon.svg。 */
export const BUTTON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" role="img" aria-label="Button Block">
    <title>Button Block</title>
    <!-- 由 src/buttonIcon.ts 生成，勿手改；改图形请改那个文件后重跑 scripts/render-icon.mjs。
         方形满版底、不切圆角：集市卡片自己会加 border-radius。图形在 24 单位坐标系里画好再放大 5 倍，
         线宽 ${STROKE}（160 画布上约 ${STROKE * SCALE}px），与 editor-siyuan 的 24 单位线稿同构。
         磨砂质感来自三层：浅灰渐变底、图形模糊出来的柔光、极淡的噪点；按钮内部另填一层半透明白。
         箭头带浅色外圈，把它和按钮边线切开。 -->
    <defs>
        <linearGradient id="bis-icon-surface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${SURFACE_TOP}"/>
            <stop offset="1" stop-color="${SURFACE_BOTTOM}"/>
        </linearGradient>
        <filter id="bis-icon-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="${GLOW_BLUR}"/>
        </filter>
        <filter id="bis-icon-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="${GRAIN_FREQUENCY}" numOctaves="2" stitchTiles="stitch"/>
            <feColorMatrix type="saturate" values="0"/>
        </filter>
    </defs>
    <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="url(#bis-icon-surface)"/>
    ${glow(BRAND_COLOR)}
    ${glyph({color: BRAND_COLOR, panelFill: "#FFFFFF", pointerOutline: POINTER_OUTLINE_COLOR, labelStroke: LABEL_STROKE})}
    <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" filter="url(#bis-icon-grain)" opacity="${GRAIN_OPACITY}"/>
</svg>
`;

/**
 * 斜杠菜单（以及任何按思源列表图标显示的地方）用的图标：同一份图形，改成跟随主题文字色，
 * viewBox 收紧到图形本身，不填面板也不用外圈（列表底色可能是深色，浅色描边会露馅）。
 */
export const createButtonBlockIconHtml = () => {
    const box = GLYPH_BOX;
    return `<svg class="b3-list-item__graphic" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${glyph({color: "currentColor"})}</svg>`;
};
