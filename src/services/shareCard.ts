import QRCode from 'qrcode';
import { assetUrl } from '../game/assets';

/** 海报原始尺寸（主页海报与得分模板同为 941×1672） */
export const SHARE_CARD_WIDTH = 941;
export const SHARE_CARD_HEIGHT = 1672;
/** QR always points at the live site so scans work from screenshots. */
export const SHARE_SITE_URL = 'https://hyunlix.top';

export type ShareCardMode = 'game' | 'score';

export interface ShareCardScoreInput {
    totalScore: number;
    pipeCount: number;
    rewardCount: number;
    characterId: string;
    characterName: string;
    hit143: boolean;
}

// 主页分享海报池（AI 生成的整张海报，多数自带可扫二维码），每次分享随机抽一张
const POSTER_POOL: readonly string[] = Array.from(
    { length: 9 }, (_, index) => `assets/posters/poster-${index + 1}.jpg`,
);
// 得分分享模板：SCORE / PIPES / REWARDS 三个虚线框留白，数字由前端实时绘制
const SCORE_POSTER = 'assets/posters/poster-score.jpg';

// BarcodeDetector 实测扫不出的 AI 二维码海报：在原白底板上盖一枚真码。
// 矩形为海报里白色 QR 底板的像素测量值（941×1672 坐标系）。
const QR_PLATE_OVERLAYS: Record<string, { x: number; y: number; w: number; h: number }> = {
    'assets/posters/poster-1.jpg': { x: 313, y: 1232, w: 311, h: 321 },
    'assets/posters/poster-3.jpg': { x: 320, y: 1266, w: 300, h: 292 },
    'assets/posters/poster-5.jpg': { x: 324, y: 1326, w: 295, h: 262 },
    'assets/posters/poster-6.jpg': { x: 344, y: 1295, w: 244, h: 245 },
};

// 得分模板三个虚线框的内沿坐标（同上坐标系），数字画在内切区域
const SCORE_BOX = { x0: 190, x1: 756, y0: 1116, y1: 1246 };
const PIPES_BOX = { x0: 256, x1: 428, y0: 1313, y1: 1362 };
const REWARDS_BOX = { x0: 560, x1: 740, y0: 1313, y1: 1362 };

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
    });
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

/** 随机抽主页海报；randomValue 注入便于测试 */
export function pickSharePoster(randomValue: number = Math.random()): string {
    const rolled = Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * POSTER_POOL.length);
    return POSTER_POOL[rolled]!;
}

/** 海报同款泡泡字：白描边 + 下坠软阴影，粉/紫填充随海报画风 */
function drawPosterNumber(
    ctx: CanvasRenderingContext2D,
    text: string,
    box: { x0: number; x1: number; y0: number; y1: number },
    fill: string | CanvasGradient,
    maxFontSize: number,
) {
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const maxW = box.x1 - box.x0 - 32;
    const font = (size: number) => `900 ${size}px "Arial Rounded MT Bold", "Arial Black", Impact, sans-serif`;
    let size = maxFontSize;
    ctx.font = font(size);
    while (size > 24 && ctx.measureText(text).width > maxW) {
        size -= 4;
        ctx.font = font(size);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const outline = Math.max(6, size * 0.15);
    ctx.save();
    // 阴影只打在白描边上：先带阴影描白边，再补一遍白边、最后填色
    ctx.shadowColor = 'rgba(150, 62, 105, 0.38)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = outline;
    ctx.strokeText(text, cx, cy);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = outline;
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = fill;
    ctx.fillText(text, cx, cy);
}

function scoreNumberFill(ctx: CanvasRenderingContext2D, box: { y0: number; y1: number }): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, box.y0, 0, box.y1);
    gradient.addColorStop(0, '#ff9cc2');
    gradient.addColorStop(1, '#ec5f96');
    return gradient;
}

/** 143 彩蛋贴纸：贴在得分面板左上角空白处，轻微歪头 */
function drawBadge143(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(238, 1078);
    ctx.rotate(-6 * Math.PI / 180);
    ctx.fillStyle = '#ff85b0';
    roundRect(ctx, -66, -23, 132, 46, 23);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    roundRect(ctx, -66, -23, 132, 46, 23);
    ctx.stroke();
    ctx.fillStyle = '#5c2440';
    ctx.font = '900 26px "Arial Rounded MT Bold", "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('143 ♡', 0, 1);
    ctx.restore();
}

/** 盖回可扫真码：白圆角底板 + 深梅色码点，完全覆盖海报里扫不出的 AI 二维码 */
async function drawQrOverlay(
    ctx: CanvasRenderingContext2D,
    siteUrl: string,
    plate: { x: number; y: number; w: number; h: number },
) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, plate.x - 7, plate.y - 7, plate.w + 14, plate.h + 14, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 116, 148, 0.55)';
    ctx.lineWidth = 5;
    roundRect(ctx, plate.x - 7, plate.y - 7, plate.w + 14, plate.h + 14, 26);
    ctx.stroke();

    const side = Math.min(plate.w, plate.h) - 20;
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, siteUrl, {
        width: side,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#43223c', light: '#ffffff' },
    });
    ctx.drawImage(
        qrCanvas,
        plate.x + (plate.w - side) / 2,
        plate.y + (plate.h - side) / 2,
        side, side,
    );
}

async function drawPosterCard(ctx: CanvasRenderingContext2D, poster: string, siteUrl: string) {
    const img = await loadImage(assetUrl(poster));
    ctx.drawImage(img, 0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
    const plate = QR_PLATE_OVERLAYS[poster];
    if (plate) await drawQrOverlay(ctx, siteUrl, plate);
}

async function drawScoreCard(
    ctx: CanvasRenderingContext2D,
    score: ShareCardScoreInput,
) {
    const img = await loadImage(assetUrl(SCORE_POSTER));
    ctx.drawImage(img, 0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

    drawPosterNumber(ctx, String(Math.max(0, score.totalScore)), SCORE_BOX, scoreNumberFill(ctx, SCORE_BOX), 130);
    const statFill = '#8a5cd6';
    drawPosterNumber(ctx, String(Math.max(0, score.pipeCount)), PIPES_BOX, statFill, 54);
    drawPosterNumber(ctx, String(Math.max(0, score.rewardCount)), REWARDS_BOX, statFill, 54);
    if (score.hit143) drawBadge143(ctx);
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('JPEG encode failed'));
        }, 'image/jpeg', 0.92);
    });
}

export async function renderShareCard(options: {
    mode: ShareCardMode;
    score?: ShareCardScoreInput;
    siteUrl?: string;
}): Promise<{ blob: Blob; dataUrl: string; file: File }> {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const siteUrl = options.siteUrl || SHARE_SITE_URL;

    if (options.mode === 'game') {
        await drawPosterCard(ctx, pickSharePoster(), siteUrl);
    } else {
        if (!options.score) throw new Error('score payload required');
        await drawScoreCard(ctx, options.score);
    }

    const blob = await canvasToJpegBlob(canvas);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const fileName = options.mode === 'score'
        ? `hyunlix-score-${options.score?.totalScore ?? 0}.jpg`
        : 'hyunlix-share.jpg';
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    return { blob, dataUrl, file };
}
