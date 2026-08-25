import { describe, expect, it } from 'vitest';
import { computeFootPose, FOOT_BASE, FOOT_SIZE, KICK_DURATION_MS } from './footKick';

describe('foot kick pose math', () => {
    it('keeps the feet fully retracted (invisible) at both ends of the kick', () => {
        ([0, 1] as const).forEach((footIndex) => {
            expect(computeFootPose(0, footIndex).alpha).toBeCloseTo(0, 5);
            expect(computeFootPose(1, footIndex).alpha).toBeCloseTo(0, 5);
        });
    });

    it('extends the feet furthest at mid-kick with full visibility', () => {
        const front = computeFootPose(0.5, 0);
        expect(front.alpha).toBeCloseTo(1, 5);
        expect(front.y).toBeCloseTo(FOOT_BASE[0].y + 8, 5);
        expect(front.scale).toBeCloseTo(1, 5);
    });

    it('scissors the two feet in opposite directions', () => {
        // t=0.25 时 swing 达到正峰：前脚向前（+x）后脚向后（-x），摆角方向也相反
        const front = computeFootPose(0.25, 0);
        const back = computeFootPose(0.25, 1);
        expect(front.x - FOOT_BASE[0].x).toBeGreaterThan(0);
        expect(back.x - FOOT_BASE[1].x).toBeLessThan(0);
        expect(Math.sign(front.rotation)).toBe(-Math.sign(back.rotation));
        // 后半程摆向反转（yoyo 剪刀感）
        expect(computeFootPose(0.75, 0).x - FOOT_BASE[0].x).toBeLessThan(0);
    });

    it('clamps out-of-range phases so stale tween values can never leave feet stuck out', () => {
        ([0, 1] as const).forEach((footIndex) => {
            expect(computeFootPose(-0.4, footIndex)).toEqual(computeFootPose(0, footIndex));
            expect(computeFootPose(1.7, footIndex)).toEqual(computeFootPose(1, footIndex));
        });
    });

    it('anchors both feet at the lower edge of the 72-logical-px character', () => {
        FOOT_BASE.forEach((base) => {
            expect(base.y).toBeGreaterThan(20);
            // 最大探出量（+8）也不越出 72² 显示区下缘太多（≤ 半高 36）
            expect(base.y + 8).toBeLessThanOrEqual(36);
        });
        // 短促可连按：一次蹬腿不超过 300ms
        expect(KICK_DURATION_MS).toBeLessThanOrEqual(300);
        expect(FOOT_SIZE.width).toBeLessThan(72 / 3);
    });
});
