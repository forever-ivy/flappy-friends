import QRCode from 'qrcode';
import { assetUrl, CHARACTERS, GAME_TITLE, getCharacter } from '../game/assets';

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;
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

export interface ShareCardLabels {
    subtitle: string;
    site: string;
    tagline: string;
    pipesLabel: string;
    rewardsLabel: string;
    asLabel: string;
}

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

function drawBackground(ctx: CanvasRenderingContext2D) {
    const gradient = ctx.createLinearGradient(0, 0, 0, SHARE_CARD_HEIGHT);
    gradient.addColorStop(0, '#fff7f1');
    gradient.addColorStop(0.45, '#ffe4ef');
    gradient.addColorStop(1, '#f7d4e4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

    // Soft paper grain / stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let i = 0; i < 48; i += 1) {
        const x = (i * 173 + 41) % SHARE_CARD_WIDTH;
        const y = (i * 311 + 67) % SHARE_CARD_HEIGHT;
        const r = 1 + (i % 3);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Outer paper frame
    ctx.strokeStyle = 'rgba(211, 104, 139, 0.35)';
    ctx.lineWidth = 8;
    roundRect(ctx, 48, 48, SHARE_CARD_WIDTH - 96, SHARE_CARD_HEIGHT - 96, 56);
    ctx.stroke();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.3);
    ctx.bezierCurveTo(-size * 0.55, -size * 0.25, -size * 0.9, size * 0.45, 0, size);
    ctx.bezierCurveTo(size * 0.9, size * 0.45, size * 0.55, -size * 0.25, 0, size * 0.3);
    ctx.fill();
    ctx.restore();
}

function drawBow(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#f27fa5';
    ctx.beginPath();
    ctx.ellipse(-28, 0, 28, 18, -0.35, 0, Math.PI * 2);
    ctx.ellipse(28, 0, 28, 18, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, subtitle: string) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5c2440';
    ctx.font = '700 72px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
    ctx.fillText(GAME_TITLE, SHARE_CARD_WIDTH / 2, 220);

    ctx.fillStyle = '#d3688b';
    ctx.font = '600 40px Fredoka, Arial, sans-serif';
    ctx.fillText(subtitle, SHARE_CARD_WIDTH / 2, 290);

    drawBow(ctx, SHARE_CARD_WIDTH / 2, 140, 1.15);
}

async function drawFooter(
    ctx: CanvasRenderingContext2D,
    labels: ShareCardLabels,
    siteUrl: string,
) {
    const qrSize = 220;
    const qrX = SHARE_CARD_WIDTH / 2 - qrSize / 2;
    const qrY = SHARE_CARD_HEIGHT - 430;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#a2536b';
    ctx.font = '600 34px Fredoka, Arial, sans-serif';
    ctx.fillText(labels.tagline, SHARE_CARD_WIDTH / 2, qrY - 36);

    // White plate behind QR
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qrX - 18, qrY - 18, qrSize + 36, qrSize + 36, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(211, 104, 139, 0.45)';
    ctx.lineWidth = 4;
    roundRect(ctx, qrX - 18, qrY - 18, qrSize + 36, qrSize + 36, 28);
    ctx.stroke();

    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, siteUrl, {
        width: qrSize,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#5c2440', light: '#ffffff' },
    });
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = '#5c2440';
    ctx.font = '700 40px Fredoka, Arial, sans-serif';
    ctx.fillText(labels.site, SHARE_CARD_WIDTH / 2, qrY + qrSize + 58);

    drawHeart(ctx, SHARE_CARD_WIDTH / 2 - 200, qrY - 50, 16, '#ff8fb4');
    drawHeart(ctx, SHARE_CARD_WIDTH / 2 + 200, qrY - 50, 16, '#ff8fb4');
}


function drawPortrait(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    cx: number, cy: number, size: number,
) {
    const half = size / 2;
    ctx.save();
    // Soft plate behind portrait
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, half + 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(211, 104, 139, 0.4)';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.clip();

    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
}

function drawScoreNumber(ctx: CanvasRenderingContext2D, score: number) {
    const text = String(score);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = '900 220px "Arial Black", Impact, sans-serif';
    ctx.strokeStyle = '#c898d8';
    ctx.lineWidth = 28;
    ctx.strokeText(text, SHARE_CARD_WIDTH / 2, 720);
    ctx.fillStyle = '#fff6f9';
    ctx.fillText(text, SHARE_CARD_WIDTH / 2, 720);
}

function drawBadge143(ctx: CanvasRenderingContext2D) {
    const x = SHARE_CARD_WIDTH - 220;
    const y = 360;
    ctx.save();
    ctx.fillStyle = '#ffa9c8';
    roundRect(ctx, x, y, 150, 64, 32);
    ctx.fill();
    ctx.strokeStyle = '#d3688b';
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, 150, 64, 32);
    ctx.stroke();
    ctx.fillStyle = '#5c2440';
    ctx.font = '700 32px Fredoka, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('143 ♡', x + 75, y + 34);
    ctx.restore();
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('PNG encode failed'));
        }, 'image/png');
    });
}

export async function renderShareCard(options: {
    mode: ShareCardMode;
    labels: ShareCardLabels;
    score?: ShareCardScoreInput;
    siteUrl?: string;
}): Promise<{ blob: Blob; dataUrl: string; file: File }> {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const siteUrl = options.siteUrl || SHARE_SITE_URL;

    drawBackground(ctx);
    drawTitle(ctx, options.labels.subtitle);

    if (options.mode === 'game') {
        const portraits = await Promise.all(
            CHARACTERS.map((c) => loadImage(assetUrl(c.portrait))),
        );
        const centers = [
            SHARE_CARD_WIDTH / 2 - 280,
            SHARE_CARD_WIDTH / 2,
            SHARE_CARD_WIDTH / 2 + 280,
        ];
        portraits.forEach((img, index) => {
            drawPortrait(ctx, img, centers[index], 760, index === 1 ? 300 : 240);
        });
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7a4459';
        ctx.font = '600 36px Fredoka, Arial, sans-serif';
        CHARACTERS.forEach((c, index) => {
            ctx.fillText(c.name, centers[index], 960);
        });
    } else {
        const score = options.score;
        if (!score) throw new Error('score payload required');
        const character = getCharacter(score.characterId);
        const portrait = await loadImage(assetUrl(character.portrait));
        drawPortrait(ctx, portrait, SHARE_CARD_WIDTH / 2, 1000, 280);
        drawScoreNumber(ctx, score.totalScore);
        if (score.hit143) drawBadge143(ctx);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#5c2440';
        ctx.font = '700 48px Fredoka, Arial, sans-serif';
        ctx.fillText(
            [options.labels.asLabel, score.characterName].filter(Boolean).join(' '),
            SHARE_CARD_WIDTH / 2,
            1220,
        );

        ctx.fillStyle = '#a2536b';
        ctx.font = '600 36px Fredoka, Arial, sans-serif';
        ctx.fillText(
            `${score.pipeCount} ${options.labels.pipesLabel}  ·  ${score.rewardCount} ${options.labels.rewardsLabel}`,
            SHARE_CARD_WIDTH / 2,
            1290,
        );
    }

    await drawFooter(ctx, options.labels, siteUrl);

    const blob = await canvasToPngBlob(canvas);
    const dataUrl = canvas.toDataURL('image/png');
    const fileName = options.mode === 'score'
        ? `hyunlix-score-${options.score?.totalScore ?? 0}.png`
        : 'hyunlix-share.png';
    const file = new File([blob], fileName, { type: 'image/png' });
    return { blob, dataUrl, file };
}

