import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REVIVE_STATE, noteReviveOfferShown, noteTrueDeath, normalizeReviveState,
    REVIVE_BASE_CHANCE, REVIVE_COOLDOWN_MS, REVIVE_MAX_PER_DAY, REVIVE_NEAR_BEST_CHANCE,
    REVIVE_NEW_BEST_CHANCE, REVIVE_PITY_DEATHS, reviveChanceFor, reviveDayKey,
    shouldOfferShareRevive,
} from './revive';

const NOW = new Date('2026-09-02T12:00:00').getTime();

function decide(overrides: Partial<Parameters<typeof shouldOfferShareRevive>[0]> = {}) {
    return shouldOfferShareRevive({
        score: 20, bestScore: 30, reviveUsedThisRun: false,
        state: { ...DEFAULT_REVIVE_STATE }, now: NOW, randomValue: 0.99, ...overrides,
    });
}

describe('share-revive gating', () => {
    it('never offers twice in the same run', () => {
        expect(decide({ reviveUsedThisRun: true, randomValue: 0 })).toBe(false);
    });

    it('skips low-score deaths where retrying beats reviving', () => {
        expect(decide({ score: -1, randomValue: 0 })).toBe(false);
        expect(decide({ score: 4, randomValue: 0 })).toBe(false);
        expect(decide({ score: 5, randomValue: 0 })).toBe(true);
    });

    it('respects the daily cap and resets it on a new calendar day', () => {
        const today = reviveDayKey(NOW);
        const capped = { ...DEFAULT_REVIVE_STATE, offersDay: today, offersToday: REVIVE_MAX_PER_DAY };
        expect(decide({ state: capped, randomValue: 0 })).toBe(false);
        const yesterday = { ...capped, offersDay: '2026-09-01' };
        expect(decide({ state: yesterday, randomValue: 0 })).toBe(true);
    });

    it('enforces the cooldown since the last offer', () => {
        const recent = { ...DEFAULT_REVIVE_STATE, lastOfferAt: NOW - REVIVE_COOLDOWN_MS + 1 };
        expect(decide({ state: recent, randomValue: 0 })).toBe(false);
        const cooled = { ...DEFAULT_REVIVE_STATE, lastOfferAt: NOW - REVIVE_COOLDOWN_MS };
        expect(decide({ state: cooled, randomValue: 0 })).toBe(true);
        // 从未弹过（lastOfferAt=0）不受冷却影响
        expect(decide({ randomValue: 0 })).toBe(true);
    });

    it('guarantees an offer once the pity counter fills up', () => {
        const pity = { ...DEFAULT_REVIVE_STATE, deathsSinceOffer: REVIVE_PITY_DEATHS };
        // 保底可以越过基础概率（0.99 远高于任何概率阈值），但不能越过冷却/上限
        expect(decide({ state: pity })).toBe(true);
        expect(decide({ state: pity, score: 2 })).toBe(false);
    });

    it('rolls the score-dependent probability', () => {
        expect(decide({ randomValue: 0.19 })).toBe(true);
        expect(decide({ randomValue: 0.2 })).toBe(false);
    });
});

describe('reviveChanceFor', () => {
    it('ramps up as the run approaches the personal best', () => {
        expect(reviveChanceFor(10, 0)).toBe(REVIVE_BASE_CHANCE);
        expect(reviveChanceFor(20, 30)).toBe(REVIVE_BASE_CHANCE);
        expect(reviveChanceFor(21, 30)).toBe(REVIVE_NEAR_BEST_CHANCE);
        expect(reviveChanceFor(30, 30)).toBe(REVIVE_NEW_BEST_CHANCE);
        expect(reviveChanceFor(31, 30)).toBe(REVIVE_NEW_BEST_CHANCE);
    });
});

describe('revive rhythm state', () => {
    it('counts offers per local day and resets the pity counter', () => {
        const after = noteReviveOfferShown({ ...DEFAULT_REVIVE_STATE, deathsSinceOffer: 4 }, NOW);
        expect(after).toEqual({ lastOfferAt: NOW, offersDay: reviveDayKey(NOW), offersToday: 1, deathsSinceOffer: 0 });
        const twice = noteReviveOfferShown(after, NOW + 60_000);
        expect(twice.offersToday).toBe(2);
    });

    it('starts a fresh daily count when the calendar day changes', () => {
        const today = noteReviveOfferShown({ ...DEFAULT_REVIVE_STATE, offersDay: reviveDayKey(NOW), offersToday: 3 }, NOW);
        expect(today.offersToday).toBe(4);
        const nextDay = new Date(NOW + 24 * 60 * 60 * 1000).getTime();
        expect(noteReviveOfferShown(today, nextDay).offersToday).toBe(1);
    });

    it('accumulates and caps true deaths for the pity guarantee', () => {
        let state = DEFAULT_REVIVE_STATE;
        for (let index = 0; index < 10; index += 1) state = noteTrueDeath(state);
        expect(state.deathsSinceOffer).toBe(REVIVE_PITY_DEATHS);
    });

    it('normalizes corrupted persisted state', () => {
        expect(normalizeReviveState(undefined)).toEqual(DEFAULT_REVIVE_STATE);
        expect(normalizeReviveState('junk')).toEqual(DEFAULT_REVIVE_STATE);
        expect(normalizeReviveState({ lastOfferAt: 'x', offersToday: -3, deathsSinceOffer: 2.9, offersDay: 7 }))
            .toEqual({ lastOfferAt: 0, offersDay: '', offersToday: 0, deathsSinceOffer: 2 });
    });
});
