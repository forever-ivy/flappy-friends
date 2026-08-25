import { describe, expect, it } from 'vitest';
import { computeWingPose, FLUTTER_DURATION_MS, WING_ANCHORS, WING_BEATS, WING_SIZE } from './flutter';

describe('wing flutter pose math（扑腾小翅膀）', () => {
    it('keeps the wings fully hidden at both ends of a flutter', () => {
        ([0, 1] as const).forEach((wingIndex) => {
            expect(computeWingPose(0, wingIndex).alpha).toBeCloseTo(0, 5);
            expect(computeWingPose(1, wingIndex).alpha).toBeCloseTo(0, 5);
        });
    });

    it('spreads the wings fully at mid-flutter', () => {
        const wing = computeWingPose(0.5, 0);
        expect(wing.alpha).toBeCloseTo(1, 5);
        expect(wing.scale).toBeCloseTo(1, 5);
    });

    it('keeps both wings behind the character (facing right) at every phase', () => {
        for (let t = 0.05; t < 1; t += 0.05) {
            ([0, 1] as const).forEach((wingIndex) => {
                expect(computeWingPose(t, wingIndex).x).toBeLessThan(0);
            });
        }
    });

    it('beats up and down like a tiny bird wing (raised → lowered → raised)', () => {
        // WING_BEATS=2 时主翅：t=0 扬起（后上方，y 更小），t=0.25 拍到最低，t=0.5 又扬起
        const raised = computeWingPose(0.5, 0);
        const lowered = computeWingPose(0.25, 0);
        expect(lowered.y).toBeGreaterThan(raised.y);
        expect(lowered.rotation).not.toBeCloseTo(raised.rotation, 3);
        expect(WING_BEATS).toBeGreaterThanOrEqual(2);
    });

    it('staggers the far wing so the two wings never move in lockstep', () => {
        expect(WING_ANCHORS[1].beatOffset).not.toBe(WING_ANCHORS[0].beatOffset);
        const near = computeWingPose(0.5, 0);
        const far = computeWingPose(0.5, 1);
        expect(far.rotation).not.toBeCloseTo(near.rotation, 3);
    });

    it('clamps out-of-range phases so stale tween values can never leave wings stuck out', () => {
        ([0, 1] as const).forEach((wingIndex) => {
            expect(computeWingPose(-0.4, wingIndex)).toEqual(computeWingPose(0, wingIndex));
            expect(computeWingPose(1.7, wingIndex)).toEqual(computeWingPose(1, wingIndex));
        });
    });

    it('stays cute and compact: short duration, small wings anchored on the upper back', () => {
        // 短促可连按：一次扑腾不超过 400ms
        expect(FLUTTER_DURATION_MS).toBeLessThanOrEqual(400);
        // 小翅膀不超过角色显示尺寸的 1/3，锚点在身后（-x）偏上（-y）
        expect(WING_SIZE.width).toBeLessThanOrEqual(72 / 3);
        WING_ANCHORS.forEach((anchor) => {
            expect(anchor.x).toBeLessThan(0);
            expect(anchor.y).toBeLessThan(0);
        });
    });
});
