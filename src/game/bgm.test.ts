import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BGM_SRC, BGM_VOLUME } from './assets';
import { bgmDebugState, initBgm, resetBgmForTests } from './bgm';
import { setSfxMuted } from './sfx';

// node 环境下的最小 DOM/Audio 桩：只模拟 bgm.ts 用到的接口
class FakeAudio {
    src: string;
    loop = false;
    preload = '';
    volume = 1;
    playing = false;
    constructor(src: string) {
        this.src = src;
    }
    play() {
        this.playing = true;
        return Promise.resolve();
    }
    pause() {
        this.playing = false;
    }
}

type Handler = (event?: unknown) => void;

function makeTarget() {
    const handlers = new Map<string, Set<Handler>>();
    return {
        addEventListener: (type: string, handler: Handler) => {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type)!.add(handler);
        },
        removeEventListener: (type: string, handler: Handler) => {
            handlers.get(type)?.delete(handler);
        },
        emit: (type: string) => {
            handlers.get(type)?.forEach((handler) => handler());
        },
        handlers,
    };
}

describe('background music', () => {
    let fakeWindow: ReturnType<typeof makeTarget>;
    let fakeDocument: ReturnType<typeof makeTarget> & { hidden: boolean };

    beforeEach(() => {
        vi.useFakeTimers();
        fakeWindow = makeTarget();
        fakeDocument = Object.assign(makeTarget(), { hidden: false });
        vi.stubGlobal('window', fakeWindow);
        vi.stubGlobal('document', fakeDocument);
        vi.stubGlobal('Audio', FakeAudio);
        setSfxMuted(false);
    });

    afterEach(() => {
        resetBgmForTests();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('creates a looping audio element but waits for the first interaction (autoplay policy)', () => {
        initBgm();
        const audio = bgmDebugState().audio as unknown as FakeAudio;
        expect(audio.src).toBe(BGM_SRC);
        expect(audio.loop).toBe(true);
        expect(audio.playing).toBe(false);

        fakeWindow.emit('pointerdown');
        expect(audio.playing).toBe(true);
        // 短淡入（0.8s）：音乐在菜单首次交互后很快可闻，不再等 2 秒
        vi.advanceTimersByTime(400);
        expect(audio.volume).toBeGreaterThan(0);
        vi.advanceTimersByTime(500);
        expect(audio.volume).toBeCloseTo(BGM_VOLUME);
    });

    it('pauses and resumes with the shared mute toggle', () => {
        initBgm();
        fakeWindow.emit('pointerdown');
        const audio = bgmDebugState().audio as unknown as FakeAudio;
        expect(audio.playing).toBe(true);

        setSfxMuted(true);
        expect(audio.playing).toBe(false);

        setSfxMuted(false);
        expect(audio.playing).toBe(true);
    });

    it('pauses when the tab goes to the background and resumes when visible again', () => {
        initBgm();
        fakeWindow.emit('pointerdown');
        const audio = bgmDebugState().audio as unknown as FakeAudio;

        fakeDocument.hidden = true;
        fakeDocument.emit('visibilitychange');
        expect(audio.playing).toBe(false);

        fakeDocument.hidden = false;
        fakeDocument.emit('visibilitychange');
        expect(audio.playing).toBe(true);
    });

    it('stays silent after unlock while muted, then starts on unmute', () => {
        setSfxMuted(true);
        initBgm();
        fakeWindow.emit('pointerdown');
        const audio = bgmDebugState().audio as unknown as FakeAudio;
        expect(audio.playing).toBe(false);

        setSfxMuted(false);
        expect(audio.playing).toBe(true);
    });

    it('cleans up listeners and pauses on teardown', () => {
        const dispose = initBgm();
        fakeWindow.emit('pointerdown');
        const audio = bgmDebugState().audio as unknown as FakeAudio;
        expect(audio.playing).toBe(true);

        dispose();
        expect(audio.playing).toBe(false);
        expect(fakeWindow.handlers.get('pointerdown')?.size ?? 0).toBe(0);
        expect(fakeDocument.handlers.get('visibilitychange')?.size ?? 0).toBe(0);
    });
});
