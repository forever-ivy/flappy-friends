// 扑翼蹬腿动效的纯数学部分：给定 0–1 的动画进度，输出两只小脚的局部姿态。
// 渲染由 Game 场景每帧按角色当前位置/俯仰角合成（脚是独立装饰图形，无物理体，
// 不触碰角色贴图、scale 基准（#15）与任何物理/碰撞参数）。独立成模块便于单元测试。

// 一次蹬腿的时长：短促可读，连按时每次从 phase=0 重新播放，无累积状态
export const KICK_DURATION_MS = 260;

// 脚部在角色 72×72 逻辑坐标系（中心为原点，+y 向下）里的基准位置：身体下缘、略分前后
export const FOOT_BASE: readonly { x: number; y: number }[] = [
    { x: 10, y: 26 },   // 前脚（朝行进方向）
    { x: -4, y: 28 },   // 后脚
];

// 小脚（鞋）外观：纸白鞋面 + 墨色描边，与两位角色的粉彩+描边画风一致
export const FOOT_SIZE = { width: 13, height: 8 } as const;
export const FOOT_FILL = 0xfff4f7;
export const FOOT_OUTLINE = 0x4a4550;

export interface FootPose {
    x: number;          // 局部 x 偏移（基准位 + 前后剪刀摆）
    y: number;          // 局部 y 偏移（基准位 + 向下探出量）
    rotation: number;   // 脚自身摆角（弧度），随蹬摆方向倾斜
    alpha: number;      // 出现/收回包络（0 = 完全收起）
    scale: number;      // 探出时略放大，收回时缩小
}

// envelope = sin(πt)：0→1→0，脚从身体下方探出再收回；
// swing = sin(2πt)：一次完整的前后剪刀摆，两脚相位相反（前脚向前蹬时后脚向后摆）。
// t 在 [0,1] 之外时钳制到端点（alpha=0，脚不可见），保证任意输入都安全。
export function computeFootPose(phase: number, footIndex: 0 | 1): FootPose {
    const t = Math.min(1, Math.max(0, phase));
    const envelope = Math.sin(Math.PI * t);
    const swing = Math.sin(Math.PI * 2 * t) * (footIndex === 0 ? 1 : -1);
    const base = FOOT_BASE[footIndex];
    return {
        x: base.x + swing * 7,
        y: base.y + envelope * 8,
        rotation: swing * 0.5,
        alpha: envelope,
        scale: 0.55 + envelope * 0.45,
    };
}
