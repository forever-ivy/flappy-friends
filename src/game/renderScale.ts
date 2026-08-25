import { computeEffectQuality, computeRenderScale, computeRenderScaleCap, DeviceHints, EffectQuality } from '../domain/game';

// 启动时按当前屏幕算一次并缓存：Phaser 的 gameSize/相机 zoom 都基于它，
// 运行中不随窗口迁移改变，避免中途重建 canvas 后备像素带来的闪烁。
let cachedRenderScale: number | null = null;
let cachedQuality: EffectQuality | null = null;

// 设备能力线索：粗指针（触屏为主）+ 可选的内存/核心数（iOS 无 deviceMemory，留空）
function readDeviceHints(): DeviceHints {
    if (typeof window === 'undefined') return { coarsePointer: false };
    const nav = window.navigator as Navigator & { deviceMemory?: number };
    return {
        coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
        deviceMemory: nav?.deviceMemory,
        hardwareConcurrency: nav?.hardwareConcurrency,
    };
}

export function getRenderScale(): number {
    if (cachedRenderScale === null) {
        cachedRenderScale = typeof window === 'undefined'
            ? 1
            : computeRenderScale(window.devicePixelRatio, window.innerHeight, computeRenderScaleCap(readDeviceHints()));
    }
    return cachedRenderScale;
}

// 特效档位：移动端/弱机 'lite'（星光减量、缺口不放闪点、菜单弹幕降密），桌面 'full'
export function getEffectQuality(): EffectQuality {
    if (cachedQuality === null) cachedQuality = computeEffectQuality(readDeviceHints());
    return cachedQuality;
}
