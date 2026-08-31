import { describe, expect, it } from 'vitest';
import { buildPool, bulletStyle, MESSAGE_MAX, NICKNAME_MAX, normalizeMessage, REAL_POOL_TARGET } from './danmaku';

const real = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `真留言${i}`, author: `玩家${i}`, seed: false }));
const seeds = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `种子${i}`, author: '路过的碗', seed: true }));

const FALLBACK = [{ text: 'Welcome!', author: 'Guest' }];

describe('buildPool（真留言优先的弹幕池策略）', () => {
    it('真留言足够（≥6 条）时只循环真留言，种子全部退场', () => {
        const pool = buildPool([...real(REAL_POOL_TARGET), ...seeds(8)], FALLBACK);
        expect(pool).toHaveLength(REAL_POOL_TARGET);
        expect(pool.every((message) => message.text.startsWith('真留言'))).toBe(true);
    });

    it('真留言不足时用种子补足到目标条数，真留言仍在最前', () => {
        const pool = buildPool([...real(2), ...seeds(8)], FALLBACK);
        expect(pool).toHaveLength(REAL_POOL_TARGET);
        expect(pool.slice(0, 2).every((message) => message.text.startsWith('真留言'))).toBe(true);
        expect(pool.slice(2).every((message) => message.text.startsWith('种子'))).toBe(true);
    });

    it('空库时全用种子；种子也不够就有多少用多少', () => {
        expect(buildPool(seeds(8), FALLBACK)).toHaveLength(REAL_POOL_TARGET);
        expect(buildPool([...real(1), ...seeds(2)], FALLBACK)).toHaveLength(3);
    });

    it('离线（完全没有服务器数据）退回 fallback', () => {
        expect(buildPool([], FALLBACK)).toEqual(FALLBACK);
    });

    it('缺 seed 字段的旧数据按真留言处理', () => {
        const pool = buildPool([{ text: '老留言', author: '老玩家' }, ...seeds(8)], FALLBACK);
        expect(pool[0]).toEqual({ text: '老留言', author: '老玩家' });
    });
});

describe('normalizeMessage（留言规范化）', () => {
    it('去首尾空格并压缩连续空白', () => {
        expect(normalizeMessage('  碗碗  加油   ！ ')).toBe('碗碗 加油 ！');
    });

    it('1 个字符即可通过，空串/纯空白被拒绝', () => {
        expect(normalizeMessage('飞')).toBe('飞');
        expect(normalizeMessage('')).toBeNull();
        expect(normalizeMessage('   ')).toBeNull();
    });

    it('长度上限：32 字通过、33 字拒绝', () => {
        expect(normalizeMessage('好'.repeat(MESSAGE_MAX))).toBe('好'.repeat(MESSAGE_MAX));
        expect(normalizeMessage('好'.repeat(MESSAGE_MAX + 1))).toBeNull();
    });

    it('昵称走同一套规则（上限 24）', () => {
        expect(normalizeMessage(' 路过的盆 ', NICKNAME_MAX)).toBe('路过的盆');
        expect(normalizeMessage('云'.repeat(NICKNAME_MAX + 1), NICKNAME_MAX)).toBeNull();
    });
});

describe('bulletStyle（弹幕轨道/速度/字号确定性取样）', () => {
    it('同一序号永远返回同一样式（可复现）', () => {
        expect(bulletStyle(7)).toEqual(bulletStyle(7));
    });

    it('连续 5 发落在 5 条不同轨道，轨道都在天空带内（≤70%，弹幕不穿标题）', () => {
        const tops = [0, 1, 2, 3, 4].map((index) => bulletStyle(index).top);
        expect(new Set(tops).size).toBe(5);
        tops.forEach((top) => {
            expect(top).toBeGreaterThan(0);
            expect(top).toBeLessThanOrEqual(70);
        });
    });

    it('速度/字号/透明度都有多档且落在温和范围内', () => {
        const styles = Array.from({ length: 60 }, (_, index) => bulletStyle(index));
        expect(new Set(styles.map((style) => style.duration)).size).toBeGreaterThanOrEqual(3);
        expect(new Set(styles.map((style) => style.fontSize)).size).toBeGreaterThanOrEqual(3);
        expect(new Set(styles.map((style) => style.opacity)).size).toBeGreaterThanOrEqual(3);
        styles.forEach((style) => {
            expect(style.duration).toBeGreaterThanOrEqual(8);
            expect(style.duration).toBeLessThanOrEqual(18);
            expect(style.fontSize).toBeGreaterThanOrEqual(11);
            expect(style.fontSize).toBeLessThanOrEqual(16);
            expect(style.opacity).toBeGreaterThan(0.5);
            expect(style.opacity).toBeLessThanOrEqual(1);
        });
    });

    it('非法序号回退到 0 号样式，不会崩', () => {
        expect(bulletStyle(-3)).toEqual(bulletStyle(0));
        expect(bulletStyle(Number.NaN)).toEqual(bulletStyle(0));
    });
});
