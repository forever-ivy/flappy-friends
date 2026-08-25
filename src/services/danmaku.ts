// 弹幕留言板的纯逻辑部分（与网络层解耦，便于单元测试）。
//
// 玩法：菜单天空区有一条条留言像弹幕一样从右往左飘过；玩家可在菜单里发一句
// 短留言，发出后立刻加入飘动。视觉参数（轨道/速度/字号/透明度）由 bulletStyle
// 按发射序号确定性给出：多轨道彼此错开，周期互质保证组合长时间不重复。

// 留言长度上限（字符数，与后端 pb_hooks 的校验保持一致）
export const MESSAGE_MAX = 32;
// 游客昵称上限（与用户名上限一致）；留空时后端署名「路过的碗」
export const NICKNAME_MAX = 24;

// 规范化留言/昵称：去首尾空格、压缩连续空白；空串或超长返回 null
export function normalizeMessage(raw: string, max = MESSAGE_MAX): string | null {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (text.length < 1 || text.length > max) return null;
    return text;
}

// 空库/离线时的默认欢迎弹幕，保证留言板永远不冷场
export const DEFAULT_MESSAGES: readonly { text: string; author: string }[] = [
    { text: '欢迎来到飞天碗盆 ♡', author: '一只云' },
    { text: '碗碗加油！', author: '路过的碗' },
    { text: '盆盆冲鸭～', author: '路过的盆' },
    { text: '今天也要开心地飞呀', author: '碗碗' },
    { text: '小心粉粉的柱子哦', author: '盆盆' },
    { text: '点「留言」写下你的一句话 ✿', author: '一只云' },
];

// 弹幕轨道：停留在菜单上方的天空区（相对舞台高度的百分比），
// 不下探到角色面板与开始按钮，可爱但不挡操作
const LANES = [8, 14, 20, 26, 32] as const;
const DURATIONS = [12, 15.5, 9.5] as const;       // 三档速度（横穿一屏的秒数）
const FONT_SIZES = [13, 15, 12] as const;         // 三档字号（px）
const OPACITIES = [0.85, 0.62, 0.94, 0.72] as const;

export interface BulletStyle {
    top: number;        // 轨道纵向位置（% 相对舞台高度）
    duration: number;   // 横穿时长（秒）
    fontSize: number;   // px
    opacity: number;
}

// 按发射序号确定性取样：轨道 5 / 速度 3 / 字号 3 / 透明度 4 周期互质，
// 组合每 60 发才重复一次；字号与速度错相位，避免「同轨同款」扎堆
export function bulletStyle(index: number): BulletStyle {
    const safe = Number.isInteger(index) && index >= 0 ? index : 0;
    return {
        top: LANES[safe % LANES.length],
        duration: DURATIONS[safe % DURATIONS.length],
        fontSize: FONT_SIZES[(safe + 1) % FONT_SIZES.length],
        opacity: OPACITIES[safe % OPACITIES.length],
    };
}
