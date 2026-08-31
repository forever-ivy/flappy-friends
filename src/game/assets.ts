// 游戏名（品牌）：Hyunjin × Felix / Hyunlix 双人 fan game
export const GAME_TITLE = 'Hyunjin × Felix';
export const GAME_TITLE_EN = 'Hyunjin × Felix';

export interface CharacterDefinition {
    id: string;
    // 展示名：菜单角色卡与无障碍标签使用（左碗碗 / 右盆盆）
    name: string;
    tagline: string;
    textureKey: string;
    image: string;
    portrait: string;
    collisionRadius: number;
}

// 三位角色：展示名与 slogan 由 i18n 提供；此处保留英文默认值供测试与后备。
export const CHARACTERS: readonly CharacterDefinition[] = [
    { id: 'snow', name: 'Hyunjin', tagline: 'Dancing through the sky', textureKey: 'character-snow', image: 'game/character-snow-hand-right.png', portrait: 'game/portrait-snow-hand-right.png', collisionRadius: 14 },
    { id: 'stripe', name: 'Felix', tagline: 'Stay with me, fly high', textureKey: 'character-stripe', image: 'game/character-stripe-hand-right.png', portrait: 'game/portrait-stripe-hand-right.png', collisionRadius: 14 },
    { id: 'duo', name: 'Hyunlix', tagline: 'Side by side, just us two', textureKey: 'character-duo', image: 'game/character-duo-hand-right.png', portrait: 'game/portrait-duo-hand-right.png', collisionRadius: 16 },
];

// 旧存档/后端可能出现 nova / moss / sol / violet 等历史 id，统一回退到第一位角色，不报错
export const getCharacter = (id: string): CharacterDefinition => CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];

// 局内精灵位图实际像素（Preloader 按此原生尺寸加载，保证高清）
export const CHARACTER_SPRITE_SIZE = 216;
export const CHARACTER_BITMAP_SIZE = CHARACTER_SPRITE_SIZE;
// 角色在画布上的逻辑显示尺寸（Game 里 setDisplaySize 缩放），碰撞半径按此坐标系定义
export const CHARACTER_TEXTURE_SIZE = 88;

// 菜单头像位图边长（正方形），独立于局内精灵
export const CHARACTER_PORTRAIT_SIZE = 256;

// 奖励物位图实际像素（Preloader 按此原生尺寸加载，144 = 逻辑 48 的 3x，匹配 renderScale 上限）
export const REWARD_BITMAP_SIZE = 144;
// 奖励物在画布上的逻辑显示尺寸（Game 里 setDisplaySize 缩放），碰撞体随缩放同步收缩，物理零改动
export const REWARD_TEXTURE_SIZE = 48;

// 天空贴图逻辑尺寸：960 宽以覆盖最大画布宽度，窄屏时左右对称裁切
export const SKY_TEXTURE_SIZE = { width: 960, height: 640 } as const;

export interface BackgroundDefinition {
    id: string;
    textureKey: string;
    image: string;
    topColor: number;
}

// 三张全屏背景轮播：同一时刻只显示一张，按间隔自动淡入切换（不叠加视差层）
export const BACKGROUNDS: readonly BackgroundDefinition[] = [
    { id: 'cream', textureKey: 'background-0', image: 'game/background-0.png', topColor: 0xfcf1e4 },
    { id: 'lavender', textureKey: 'background-1', image: 'game/background-1.png', topColor: 0xf8eefc },
    { id: 'sky', textureKey: 'background-2', image: 'game/background-2.png', topColor: 0xebf2ff },
];

// 局内背景自动轮播：间隔更长、交叉淡入更慢，过渡更自然
export const BACKGROUND_SLIDE_INTERVAL_MS = 20_000;
export const BACKGROUND_SLIDE_FADE_MS = 2_400;

export const SKY_TOP_COLOR = BACKGROUNDS[0].topColor;
export const SKY_TOP_COLOR_CSS = '#fcf1e4';

export const GAME_ASSETS = {
    reward: 'game/reward.png',
    // 副奖励贴图（BbokAri 小鸡，自 BG_SKY 抠图），与主奖励（Jiniret 雪貂）交替出现，玩法与计分完全一致
    rewardMirror: 'game/reward-mirror.png',
    // 漂浮星光贴图（白色基底，游戏内 tint 成粉彩色），仅氛围装饰不参与碰撞
    sparkle: 'game/fx-sparkle.png',
} as const;

// 背景音乐（public/assets/bgm.mp3）：HoliznaCC0「Lucid (Lofi, Dreamy, Chill)」CC0 公域，
// 详见 public/assets/BGM_CREDITS.txt。约 2.5MB 流式播放不走 Phaser Loader。
// 由 src/game/bgm.ts 用 HTMLAudioElement 循环播放，与音效共用同一个静音开关。
// 文件已裁剪为纯音频 MP3（原文件是 17MB 的 MP4 视频容器，且开头 1.44s /
// 结尾 8.3s 是静音）：现在从第一声旋律开始、结尾 2s 淡出，loop 回绕无静音空洞。
// 2026-08-26 出口带宽打满事件后由 192kbps 重编码为 112kbps joint stereo
// （5.3MB→3.1MB，手机外放 0.22 音量下无感知差异），bgm 是首包流量大头，勿再调高码率
export const BGM_SRC = 'assets/bgm.mp3';
// 轻柔背景：低于音效存在感，不抢操作反馈（1 为原始响度）
export const BGM_VOLUME = 0.22;

// 十张标语柱各生成一对底柱 / 顶柱贴图；pastel 八色系轮换，对齐背景与 UI。
export interface ObstacleVariant {
    id: string;
    palette: string;
    bottomKey: string;
    bottomImage: string;
    topKey: string;
    topImage: string;
}

export const OBSTACLE_PALETTES = ['Cream', 'Lavender', 'Peach', 'Sky', 'Sakura', 'Butter', 'Mint', 'Rose'] as const;

export const OBSTACLE_VARIANTS: readonly ObstacleVariant[] = [
    { id: 'stay', palette: 'Cream', bottomKey: 'obstacle', bottomImage: 'game/obstacle.png', topKey: 'obstacle-top', topImage: 'game/obstacle-top.png' },
    { id: 'one43', palette: 'Sakura', bottomKey: 'obstacle-cry', bottomImage: 'game/obstacle-cry.png', topKey: 'obstacle-cry-top', topImage: 'game/obstacle-cry-top.png' },
    { id: 'hyunlix', palette: 'Lavender', bottomKey: 'obstacle-aim', bottomImage: 'game/obstacle-aim.png', topKey: 'obstacle-aim-top', topImage: 'game/obstacle-aim-top.png' },
    { id: 'bbokari', palette: 'Butter', bottomKey: 'obstacle-wish', bottomImage: 'game/obstacle-wish.png', topKey: 'obstacle-wish-top', topImage: 'game/obstacle-wish-top.png' },
    { id: 'dear', palette: 'Rose', bottomKey: 'obstacle-rain', bottomImage: 'game/obstacle-rain.png', topKey: 'obstacle-rain-top', topImage: 'game/obstacle-rain-top.png' },
    { id: 'jiniret', palette: 'Sky', bottomKey: 'obstacle-jini', bottomImage: 'game/obstacle-jini.png', topKey: 'obstacle-jini-top', topImage: 'game/obstacle-jini-top.png' },
    { id: 'lalala', palette: 'Peach', bottomKey: 'obstacle-lala', bottomImage: 'game/obstacle-lala.png', topKey: 'obstacle-lala-top', topImage: 'game/obstacle-lala-top.png' },
    { id: 'lisgo', palette: 'Mint', bottomKey: 'obstacle-lisgo', bottomImage: 'game/obstacle-lisgo.png', topKey: 'obstacle-lisgo-top', topImage: 'game/obstacle-lisgo-top.png' },
    { id: 'yongbok', palette: 'Cream', bottomKey: 'obstacle-yong', bottomImage: 'game/obstacle-yong.png', topKey: 'obstacle-yong-top', topImage: 'game/obstacle-yong-top.png' },
    { id: 'withu', palette: 'Lavender', bottomKey: 'obstacle-withu', bottomImage: 'game/obstacle-withu.png', topKey: 'obstacle-withu-top', topImage: 'game/obstacle-withu-top.png' },
];

export function getObstacleVariant(id: string): ObstacleVariant | undefined {
    return OBSTACLE_VARIANTS.find((variant) => variant.id === id);
}

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
    easter143: {
        wave: 'sine', gain: 0.11, sweeps: [
            { from: 523, to: 523, duration: 0.14, delay: 0 },
            { from: 659, to: 659, duration: 0.14, delay: 0.11 },
            { from: 784, to: 784, duration: 0.22, delay: 0.22 },
        ],
    },
} as const satisfies Record<string, SfxCue>;

export type SfxCueName = keyof typeof SFX_CUES;
