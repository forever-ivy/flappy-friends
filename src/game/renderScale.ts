import { computeRenderScale } from '../domain/game';

// 启动时按当前屏幕算一次并缓存：Phaser 的 gameSize/相机 zoom 都基于它，
// 运行中不随窗口迁移改变，避免中途重建 canvas 后备像素带来的闪烁。
let cachedRenderScale: number | null = null;

export function getRenderScale(): number {
    if (cachedRenderScale === null) {
        cachedRenderScale = typeof window === 'undefined'
            ? 1
            : computeRenderScale(window.devicePixelRatio, window.innerHeight);
    }
    return cachedRenderScale;
}
