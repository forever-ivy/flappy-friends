import { describe, expect, it } from 'vitest';
import { calculateScore, createSeededRandom, getDifficulty, isOutOfBounds, KILL_BOTTOM, KILL_TOP, shouldSpawnReward } from './game';

describe('game rules', () => {
    it('calculates pipe and reward points', () => {
        expect(calculateScore(7, 2)).toBe(17);
        expect(calculateScore(-1, 1.9)).toBe(5);
    });

    it('selects difficulty at score boundaries', () => {
        expect(getDifficulty(9)).toEqual({ minScore: 0, speed: 150, gap: 190 });
        expect(getDifficulty(10)).toEqual({ minScore: 10, speed: 165, gap: 175 });
        expect(getDifficulty(25)).toEqual({ minScore: 25, speed: 180, gap: 165 });
        expect(getDifficulty(50)).toEqual({ minScore: 50, speed: 195, gap: 155 });
    });

    it('uses an exclusive 35 percent reward threshold', () => {
        expect(shouldSpawnReward(0)).toBe(true);
        expect(shouldSpawnReward(0.3499)).toBe(true);
        expect(shouldSpawnReward(0.35)).toBe(false);
    });

    it('ends the run only outside the vertical kill bounds', () => {
        expect(isOutOfBounds(KILL_TOP - 0.1)).toBe(true);
        expect(isOutOfBounds(KILL_TOP)).toBe(false);
        expect(isOutOfBounds(KILL_TOP + 1)).toBe(false);
        expect(isOutOfBounds(KILL_BOTTOM - 1)).toBe(false);
        expect(isOutOfBounds(KILL_BOTTOM)).toBe(false);
        expect(isOutOfBounds(KILL_BOTTOM + 0.1)).toBe(true);
    });

    it('produces a deterministic random sequence', () => {
        const first = createSeededRandom(42);
        const second = createSeededRandom(42);
        expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    });
});
