// 扑腾小翅膀动效的纯数学部分：给定 0–1 的动画进度，输出两片翅膀的局部姿态。
// 用户反馈「脚气其实是扑腾的动画」——flap 时不再是探出两只脚，而是身后两片
// 奶白小翅膀像小鸟一样上下扇动，卡通可爱。渲染由 Game 场景每帧按角色当前
// 位置/俯仰角合成（翅膀是独立装饰图形，无物理体，不触碰角色贴图、scale 基准
// （#15）与任何物理/碰撞参数）。独立成模块便于单元测试。

// 一次扑腾的时长：短促可读，连按时每次从 phase=0 重新播放，无累积状态
export const FLUTTER_DURATION_MS = 320;

// 一次扑腾内翅膀完整上下扇动的拍数（2 拍 ≈ 每拍 160ms，轻快的卡通扑打感）
export const WING_BEATS = 2;

// 翅膀在角色 72×72 逻辑坐标系（中心为原点，+y 向下，角色朝右）里的肩部锚点：
// 两片都在身后（-x）偏上；远翅略低略靠后，beatOffset 让它滞后 1/4 拍，扇动更活
export const WING_ANCHORS: readonly { x: number; y: number; beatOffset: number }[] = [
    { x: -16, y: -12, beatOffset: 0 },
    { x: -22, y: -5, beatOffset: 0.25 },
];

// 小翅膀外观：奶白瓣形 + 墨色描边，与两位角色的粉彩+描边画风一致
export const WING_SIZE = { width: 20, height: 11 } as const;
export const WING_FILL = 0xfff8fb;
export const WING_OUTLINE = 0x4a4550;

// 翅根钉在肩部锚点，椭圆中心沿扇动方向外推半长，看起来像绕肩关节扇动
const WING_HALF_LENGTH = WING_SIZE.width / 2;
// 扇动方向以「正后方」为中线上下摆 ±SWEEP_RANGE（弧度，≈±49°）
const SWEEP_RANGE = 0.85;

export interface WingPose {
    x: number;          // 局部 x 偏移（椭圆中心 = 肩部锚点 + 扇动方向 × 半长）
    y: number;          // 局部 y 偏移
    rotation: number;   // 翅膀长轴朝向（弧度），随扇动方向摆动
    alpha: number;      // 展开/收拢包络（0 = 完全隐藏）
    scale: number;      // 展开时到 1，收拢时缩小
}

// envelope = sin(πt)：0→1→0，翅膀展开再收拢，两端完全隐藏（连按安全）；
// beat = cos(2π·BEATS·t − 相位差)：t=0 时翅膀高扬随即下拍（扑打的可读起手），
// +1 = 扬到最高（后上方），−1 = 拍到最低（后下方）。
// t 在 [0,1] 之外时钳制到端点（alpha=0，翅膀不可见），保证任意输入都安全。
export function computeWingPose(phase: number, wingIndex: 0 | 1): WingPose {
    const t = Math.min(1, Math.max(0, phase));
    const envelope = Math.sin(Math.PI * t);
    const anchor = WING_ANCHORS[wingIndex];
    const beat = Math.cos(Math.PI * 2 * WING_BEATS * t - anchor.beatOffset * Math.PI * 2);
    // 扇动方向角：-π 指向正后方，beat 为正时抬向后上方（屏幕坐标 +y 向下）
    const direction = -Math.PI + beat * SWEEP_RANGE;
    return {
        x: anchor.x + Math.cos(direction) * WING_HALF_LENGTH,
        y: anchor.y + Math.sin(direction) * WING_HALF_LENGTH,
        rotation: direction,
        alpha: envelope,
        scale: 0.6 + envelope * 0.4,
    };
}
