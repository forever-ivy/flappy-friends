export interface CharacterDefinition {
    id: string;
    tagline: string;
    textureKey: string;
    image: string;
    portrait: string;
    collisionRadius: number;
}

// 仅两位角色，均为 pictures/ 2048² HD 原素材的原色（无任何改色/滤镜/重绘）：
// nova = IMG_5246.PNG（藏青条纹衫），moss = IMG_5247.PNG（浅蓝番茄衫）。
// 处理仅限：alpha bbox 裁切本体 + 保持用户确认的伸手朝右方向 + 等比缩放。
// UI 不显示角色名，卡片仅靠头像区分；image 为局内精灵（216²），portrait 为菜单头像（256²）。
export const CHARACTERS: readonly CharacterDefinition[] = [
    { id: 'nova', tagline: '叉子在手，说走就走', textureKey: 'character-nova', image: 'game/character-nova-hand-right.png', portrait: 'game/portrait-nova-hand-right.png', collisionRadius: 14 },
    { id: 'moss', tagline: '镜子照亮好心情', textureKey: 'character-moss', image: 'game/character-moss-hand-right.png', portrait: 'game/portrait-moss-hand-right.png', collisionRadius: 14 },
];

// 旧存档/后端可能出现已下架的 sol / violet 等 id，统一回退到第一位角色，不报错
export const getCharacter = (id: string): CharacterDefinition => CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];

// 局内精灵位图实际像素（Preloader 按此原生尺寸加载，保证高清）
export const CHARACTER_SPRITE_SIZE = 216;
export const CHARACTER_BITMAP_SIZE = CHARACTER_SPRITE_SIZE;
// 角色在画布上的逻辑显示尺寸（Game 里 setDisplaySize 缩放），碰撞半径按此坐标系定义
export const CHARACTER_TEXTURE_SIZE = 72;

// 菜单头像位图边长（正方形），独立于局内精灵
export const CHARACTER_PORTRAIT_SIZE = 256;

// 奖励物位图实际像素（Preloader 按此原生尺寸加载，144 = 逻辑 48 的 3x，匹配 renderScale 上限）
export const REWARD_BITMAP_SIZE = 144;
// 奖励物在画布上的逻辑显示尺寸（Game 里 setDisplaySize 缩放），碰撞体随缩放同步收缩，物理零改动
export const REWARD_TEXTURE_SIZE = 48;

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

// 背景音乐（public/assets/bgm.mp3，17MB 流式播放不走 Phaser Loader）；
// 由 src/game/bgm.ts 用 HTMLAudioElement 循环播放，与音效共用同一个静音开关
export const BGM_SRC = 'assets/bgm.mp3';
// 轻柔偏低的音量，贴合少女梦幻氛围（1 为原始响度）
export const BGM_VOLUME = 0.3;

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

// 跳跃、得分、奖励和碰撞音效统一降至原音量的 50%；不影响 BGM_VOLUME。
export const SFX_MASTER_VOLUME = 0.5;

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
