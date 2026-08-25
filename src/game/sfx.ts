import { SFX_CUES, SFX_MASTER_VOLUME, SfxCueName } from './assets';

const MUTE_KEY = 'skyline-hop-muted-v1';

let muted = false;
try {
    muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1';
} catch {
    muted = false;
}

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
    try {
        if (!context) {
            const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;
            context = new Ctor();
        }
        if (context.state === 'suspended') void context.resume();
        return context;
    } catch {
        return null;
    }
}

export function playSfx(cueName: SfxCueName) {
    if (muted) return;
    const ctx = audioContext();
    if (!ctx) return;
    const cue = SFX_CUES[cueName];
    const now = ctx.currentTime;
    for (const sweep of cue.sweeps) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + sweep.delay;
        osc.type = cue.wave;
        osc.frequency.setValueAtTime(sweep.from, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweep.to), start + sweep.duration);
        gain.gain.setValueAtTime(cue.gain * SFX_MASTER_VOLUME, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + sweep.duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + sweep.duration + 0.02);
    }
}

export function isSfxMuted(): boolean {
    return muted;
}

// 静音开关是全局音频开关（音效 + 背景音乐共用一个持久化状态与一个 UI 按钮）；
// bgm.ts 通过订阅在开关变化时暂停/恢复背景音乐
type MuteListener = (muted: boolean) => void;
const muteListeners = new Set<MuteListener>();

export function onMuteChange(listener: MuteListener): () => void {
    muteListeners.add(listener);
    return () => { muteListeners.delete(listener); };
}

export function setSfxMuted(value: boolean) {
    muted = value;
    try {
        globalThis.localStorage?.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
        // 无 localStorage（隐身模式等）时只影响本次会话
    }
    muteListeners.forEach((listener) => listener(value));
}
