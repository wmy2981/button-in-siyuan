/**
 * 按钮块图标：界面里显示这个图形的地方（斜杠菜单等）都用这里画的线稿。
 * 集市图标不在这里 —— 它是手绘的 assets/icon.svg，两者各自独立（见 docs/development.md）。
 *
 * 图形画在 24 单位坐标系里，再放大 5 倍、平移 20 单位（画布 160×160）：
 * 圆角矩形是「按钮」，里面的短线是按钮上的文字。
 * 按钮两端都是半圆（rx 取高度的一半），中心就是画布中心（24 单位里的 12,12），
 * 图形在画布上居中，四周留出相近的余量。
 *
 * 带磨砂底的变体（`BUTTON_ICON_SVG`）在图形下面垫三层凑出磨砂质感：浅灰渐变底、图形自己模糊出来的
 * 柔光、一层极淡的噪点颗粒；
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
/** 图形在画布上的包围盒：圆角矩形外扩描边后再留 1 单位余量，斜杠菜单按它收紧 viewBox */
const GLYPH_BOX = {x: 33, y: 48, width: 94, height: 64};

const PILL = {x: 3.4, y: 6.4, width: 17.2, height: 11.2, radius: 5.6};
const LABEL = "M9 12h5.6";

type GlyphOptions = {
    color: string;
    /** 按钮内部的面板色：带磨砂底的变体填半透明白，斜杠菜单不填 */
    panelFill?: string;
    /** 「文字」短线的粗细：带磨砂底的变体比边线略细，斜杠菜单与边线同粗 */
    labelStroke?: number;
};

/** 图形本体。颜色、面板、文字线宽三处随用途变化，几何只写一份。 */
const glyph = ({color, panelFill = "", labelStroke = STROKE}: GlyphOptions) => `<g transform="translate(${OFFSET} ${OFFSET}) scale(${SCALE})">
${panelFill ? `        <rect x="${PILL.x}" y="${PILL.y}" width="${PILL.width}" height="${PILL.height}" rx="${PILL.radius}" fill="${panelFill}" fill-opacity="${PANEL_OPACITY}"/>\n` : ""}        <g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
            <rect x="${PILL.x}" y="${PILL.y}" width="${PILL.width}" height="${PILL.height}" rx="${PILL.radius}"/>
            <path d="${LABEL}" stroke-width="${labelStroke}"/>
        </g>
    </g>`;

/** 柔光层：把同一份图形模糊一份垫在下面 —— 磨砂玻璃那种从底下透出来的光 */
const glow = (color: string) => `<g opacity="${GLOW_OPACITY}" filter="url(#bis-icon-glow)">
        ${glyph({color, labelStroke: LABEL_STROKE})}
    </g>`;

/** 160×160、方形满版（不切圆角）、带磨砂底的完整 SVG 源码；目前没有脚本消费，留作备用。 */
export const BUTTON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" role="img" aria-label="Button Block">
    <title>Button Block</title>
    <!-- 由 src/buttonIcon.ts 生成；集市图标是手绘的 assets/icon.svg，不经这里。
         方形满版底、不切圆角：集市卡片自己会加 border-radius。图形在 24 单位坐标系里画好再放大 5 倍，
         线宽 ${STROKE}（160 画布上约 ${STROKE * SCALE}px），与 editor-siyuan 的 24 单位线稿同构。
         磨砂质感来自三层：浅灰渐变底、图形模糊出来的柔光、极淡的噪点；按钮内部另填一层半透明白。 -->
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
    ${glyph({color: BRAND_COLOR, panelFill: "#FFFFFF", labelStroke: LABEL_STROKE})}
    <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" filter="url(#bis-icon-grain)" opacity="${GRAIN_OPACITY}"/>
</svg>
`;

/**
 * 斜杠菜单（以及任何按思源列表图标显示的地方）用的图标：同一份图形，改成跟随主题文字色，
 * viewBox 收紧到图形本身，不填面板（列表底色可能是深色，填了会露馅）。
 */
export const createButtonBlockIconHtml = () => {
    const box = GLYPH_BOX;
    return `<svg class="b3-list-item__graphic" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${glyph({color: "currentColor"})}</svg>`;
};
