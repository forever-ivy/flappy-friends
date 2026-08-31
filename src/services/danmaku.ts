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

// 拉不到服务器（离线/接口报错）时的兜底欢迎弹幕；文案由 App 按当前语言注入
export const DEFAULT_MESSAGES: readonly { text: string; author: string }[] = [];

// 真留言达到这个条数后，弹幕池只循环真留言，不再混入服务端种子
export const REAL_POOL_TARGET = 6;

export interface PoolMessage {
    text: string;
    author: string;
    seed?: boolean;
}

// 弹幕池策略：真实用户留言永远全量优先；真留言不足 REAL_POOL_TARGET 条时
// 才用服务端种子补足到目标条数；连种子都没有（离线）就退回 fallbackMessages
export function buildPool(messages: readonly PoolMessage[], fallbackMessages: readonly { text: string; author: string }[]): { text: string; author: string }[] {
    const real = messages.filter((message) => message.seed !== true);
    if (real.length >= REAL_POOL_TARGET) {
        return real.map(({ text, author }) => ({ text, author }));
    }
    const seeds = messages.filter((message) => message.seed === true);
    const pool = [...real, ...seeds.slice(0, REAL_POOL_TARGET - real.length)];
    if (pool.length === 0) return [...fallbackMessages];
    return pool.map(({ text, author }) => ({ text, author }));
}

// 弹幕轨道：百分比相对「标题上方的天空带」（App 的 .menu-sky，由 flex 撑出
// 标题以上的全部空白）而非整个舞台——弹幕结构上只会在标题上方飘，
// 不可能穿过「飞天碗盆」主标题或下方面板。最低轨 70% 保证弹幕药丸
// （约 28px 高）在常见带高下完整落在带内，不探进标题装饰区
const LANES = [6, 22, 38, 54, 70] as const;
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
