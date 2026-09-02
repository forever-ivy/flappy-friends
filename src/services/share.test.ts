import { describe, expect, it } from 'vitest';
import { buildShareUrl } from './share';
import { pickSharePoster, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, SHARE_SITE_URL } from './shareCard';

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
    it('matches the poster resolution', () => {
        expect(SHARE_CARD_WIDTH).toBe(941);
        expect(SHARE_CARD_HEIGHT).toBe(1672);
    });

    it('QR targets the live site', () => {
        expect(SHARE_SITE_URL).toBe('https://hyunlix.top');
    });
});

describe('share poster pool', () => {
    it('picks deterministically from the poster pool', () => {
        expect(pickSharePoster(0)).toBe('assets/posters/poster-1.jpg');
        expect(pickSharePoster(0.5)).toBe('assets/posters/poster-5.jpg');
        expect(pickSharePoster(0.999999)).toBe('assets/posters/poster-9.jpg');
        // 非法输入回退到第一张
        expect(pickSharePoster(-1)).toBe('assets/posters/poster-1.jpg');
    });
});

