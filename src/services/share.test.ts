import { describe, expect, it } from 'vitest';
import { buildShareUrl } from './share';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, SHARE_SITE_URL } from './shareCard';

describe('buildShareUrl', () => {
    it('tags game and score share links', () => {
        const game = new URL(buildShareUrl('game'));
        expect(game.searchParams.get('from')).toBe('share');
        expect(game.searchParams.get('kind')).toBe('game');

        const score = new URL(buildShareUrl('score'));
        expect(score.searchParams.get('kind')).toBe('score');
    });
});

describe('share card size', () => {
    it('uses 9:16 stories resolution', () => {
        expect(SHARE_CARD_WIDTH).toBe(1080);
        expect(SHARE_CARD_HEIGHT).toBe(1920);
        expect(SHARE_CARD_WIDTH / SHARE_CARD_HEIGHT).toBeCloseTo(9 / 16, 5);
    });

    it('QR targets the live site', () => {
        expect(SHARE_SITE_URL).toBe('https://hyunlix.top');
    });
});
