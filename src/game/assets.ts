export interface CharacterDefinition {
    id: string;
    name: string;
    tagline: string;
    textureKey: string;
    image: string;
    color: string;
    collisionRadius: number;
}

export const CHARACTERS: readonly CharacterDefinition[] = [
    { id: 'nova', name: 'Nova', tagline: '闪得刚刚好', textureKey: 'character-nova', image: 'game/character-nova.svg', color: '#ff5a73', collisionRadius: 14 },
    { id: 'moss', name: 'Moss', tagline: '稳稳穿过街区', textureKey: 'character-moss', image: 'game/character-moss.svg', color: '#36c6a1', collisionRadius: 14 },
    { id: 'sol', name: 'Sol', tagline: '速度就是节奏', textureKey: 'character-sol', image: 'game/character-sol.svg', color: '#ffc857', collisionRadius: 14 },
    { id: 'violet', name: 'Violet', tagline: '高分也要漂亮', textureKey: 'character-violet', image: 'game/character-violet.svg', color: '#8b78ff', collisionRadius: 14 },
];

export const getCharacter = (id: string): CharacterDefinition => CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];

// 角色贴图在 Preloader 中的逻辑加载尺寸（正方形），碰撞圆以贴图中心为圆心
export const CHARACTER_TEXTURE_SIZE = 72;

export const GAME_ASSETS = {
    sky: 'game/background-sky.svg',
    city: 'game/background-city.svg',
    street: 'game/background-street.svg',
    obstacle: 'game/obstacle.svg',
    reward: 'game/reward.svg',
} as const;

// 音效清单：当前用 WebAudio 合成，替换真实音频文件时只需改这里与 sfx.ts 的实现
export interface SfxSweep {
    from: number;
    to: number;
    duration: number;
    delay: number;
}

export interface SfxCue {
    wave: OscillatorType;
    gain: number;
    sweeps: ReadonlyArray<SfxSweep>;
}

export const SFX_CUES = {
    flap: { wave: 'triangle', gain: 0.16, sweeps: [{ from: 480, to: 760, duration: 0.09, delay: 0 }] },
    score: { wave: 'square', gain: 0.08, sweeps: [{ from: 880, to: 1240, duration: 0.07, delay: 0 }] },
    reward: {
        wave: 'triangle', gain: 0.15, sweeps: [
            { from: 720, to: 720, duration: 0.07, delay: 0 },
            { from: 1080, to: 1080, duration: 0.11, delay: 0.07 },
        ],
    },
    hit: { wave: 'sawtooth', gain: 0.2, sweeps: [{ from: 300, to: 70, duration: 0.28, delay: 0 }] },
} as const satisfies Record<string, SfxCue>;

export type SfxCueName = keyof typeof SFX_CUES;
