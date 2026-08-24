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
    { id: 'nova', name: 'Nova', tagline: '叉子在手，说走就走', textureKey: 'character-nova', image: 'game/character-nova.png', color: '#5b7ca8', collisionRadius: 14 },
    { id: 'moss', name: 'Moss', tagline: '镜子照亮好心情', textureKey: 'character-moss', image: 'game/character-moss.png', color: '#8fb7e8', collisionRadius: 14 },
    { id: 'sol', name: 'Sol', tagline: '张开手臂去飞', textureKey: 'character-sol', image: 'game/character-sol.png', color: '#4f9e72', collisionRadius: 14 },
    { id: 'violet', name: 'Violet', tagline: '稳稳飘过花海', textureKey: 'character-violet', image: 'game/character-violet.png', color: '#7a5aa8', collisionRadius: 14 },
];

export const getCharacter = (id: string): CharacterDefinition => CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];

// 角色贴图在 Preloader 中的逻辑加载尺寸（正方形），碰撞圆以贴图中心为圆心
export const CHARACTER_TEXTURE_SIZE = 72;

// 天空贴图逻辑尺寸：960 宽以覆盖最大画布宽度，窄屏时左右对称裁切
export const SKY_TEXTURE_SIZE = { width: 960, height: 640 } as const;

export const GAME_ASSETS = {
    sky: 'game/background-sky.png',
    city: 'game/background-city.png',
    street: 'game/background-street.png',
    reward: 'game/reward.png',
    // 副奖励贴图（蝴蝶结镜子），与主奖励（蝴蝶结叉子）在生成时交替出现，玩法与计分完全一致
    rewardMirror: 'game/reward-mirror.png',
    // 漂浮星光贴图（白色基底，游戏内 tint 成粉彩色），仅氛围装饰不参与碰撞
    sparkle: 'game/fx-sparkle.png',
} as const;

// 障碍变体清单：每个变体是一对底柱 / 顶柱贴图（柱身竖排文字不同，不能翻转复用），
// 生成时按种子随机选取且相邻两对不重复；物理体参数全部一致（改这里只影响视觉）
export interface ObstacleVariant {
    id: string;
    palette: string;
    bottomKey: string;
    bottomImage: string;
    topKey: string;
    topImage: string;
}

export const OBSTACLE_VARIANTS: readonly ObstacleVariant[] = [
    { id: 'classic', palette: '樱花粉', bottomKey: 'obstacle', bottomImage: 'game/obstacle.png', topKey: 'obstacle-top', topImage: 'game/obstacle-top.png' },
    { id: 'wish', palette: '薰衣草', bottomKey: 'obstacle-wish', bottomImage: 'game/obstacle-wish.png', topKey: 'obstacle-wish-top', topImage: 'game/obstacle-wish-top.png' },
    { id: 'rain', palette: '晴空蓝', bottomKey: 'obstacle-rain', bottomImage: 'game/obstacle-rain.png', topKey: 'obstacle-rain-top', topImage: 'game/obstacle-rain-top.png' },
    { id: 'aim', palette: '蜜桃橘', bottomKey: 'obstacle-aim', bottomImage: 'game/obstacle-aim.png', topKey: 'obstacle-aim-top', topImage: 'game/obstacle-aim-top.png' },
];

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
