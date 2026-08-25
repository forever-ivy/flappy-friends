import { BGM_SRC, BGM_VOLUME } from './assets';
import { isSfxMuted, onMuteChange } from './sfx';

// 背景音乐：HTMLAudioElement 流式循环播放 public/assets/bgm.mp3（约 5MB 纯音频，
// 不走 Phaser Loader、不阻塞资源进度条）。与音效共用同一个静音开关
// （isSfxMuted / 顶栏音量按钮）。
//
// 「音乐出现时间」的三个保障：
// 1. 浏览器 autoplay 策略下页面加载后不能直接出声，initBgm 在 window 上挂
//    pointerdown/keydown 监听，首次交互（菜单里任意点击/按键）立刻开始播放——
//    音乐在菜单阶段就进入，不等开局；
// 2. 音频文件已裁剪（见 assets.ts）：开头无静音过门，出声即旋律；
// 3. 播放与对局状态完全无关：开局/结算/重开都不打断，loop 无缝续播可爱氛围。
// 切到后台（document.hidden）时暂停，回到前台且未静音时继续。

// 淡入时长（毫秒）：从 0 快速缓升到 BGM_VOLUME，入场即闻但不突兀
const FADE_IN_MS = 800;

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function stopFade() {
    if (fadeTimer !== null) {
        clearInterval(fadeTimer);
        fadeTimer = null;
    }
}

function fadeIn(element: HTMLAudioElement) {
    stopFade();
    const startedAt = Date.now();
    element.volume = 0;
    fadeTimer = setInterval(() => {
        const progress = Math.min(1, (Date.now() - startedAt) / FADE_IN_MS);
        element.volume = BGM_VOLUME * progress;
        if (progress >= 1) stopFade();
    }, 100);
}

function shouldPlay(): boolean {
    return unlocked && !isSfxMuted() && !document.hidden;
}

// 静音切换 / 前后台切换 / 首次交互后统一走这里对齐播放状态
function syncPlayback(fade = false) {
    if (!audio) return;
    if (shouldPlay()) {
        if (fade) fadeIn(audio);
        else {
            stopFade();
            audio.volume = BGM_VOLUME;
        }
        // 自动播放被浏览器拒绝时保持静默，等下一次交互重试
        void audio.play().catch(() => undefined);
    } else {
        stopFade();
        audio.pause();
    }
}

function unlock() {
    const first = !unlocked;
    unlocked = true;
    syncPlayback(first);
}

/** 挂载背景音乐（幂等）。返回清理函数供 React effect 卸载时解绑。 */
export function initBgm(): () => void {
    if (typeof document === 'undefined' || typeof Audio === 'undefined') return () => undefined;
    if (!audio) {
        audio = new Audio(BGM_SRC);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = BGM_VOLUME;
    }

    const onVisibility = () => syncPlayback();
    const offMute = onMuteChange(() => syncPlayback());
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVisibility);
    // 已解锁过（如 React StrictMode 重挂载）则立即对齐一次状态
    syncPlayback();

    return () => {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        document.removeEventListener('visibilitychange', onVisibility);
        offMute();
        stopFade();
        audio?.pause();
    };
}

/** 仅供测试：读取当前音频元素与解锁状态。 */
export function bgmDebugState() {
    return { audio, unlocked };
}

/** 仅供测试：重置模块内部状态。 */
export function resetBgmForTests() {
    stopFade();
    audio?.pause();
    audio = null;
    unlocked = false;
}
