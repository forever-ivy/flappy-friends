import { describe, expect, it } from 'vitest';
import { bulletStyle, DEFAULT_MESSAGES, MESSAGE_MAX, NICKNAME_MAX, normalizeMessage } from './danmaku';

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

    it('连续 5 发落在 5 条不同轨道，轨道都在上方天空区（≤35%）', () => {
        const tops = [0, 1, 2, 3, 4].map((index) => bulletStyle(index).top);
        expect(new Set(tops).size).toBe(5);
        tops.forEach((top) => {
            expect(top).toBeGreaterThan(0);
            expect(top).toBeLessThanOrEqual(35);
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

describe('DEFAULT_MESSAGES（空库欢迎弹幕）', () => {
    it('非空且每条都符合留言规则', () => {
        expect(DEFAULT_MESSAGES.length).toBeGreaterThanOrEqual(4);
        DEFAULT_MESSAGES.forEach((message) => {
            expect(normalizeMessage(message.text)).toBe(message.text);
            expect(message.author.length).toBeGreaterThan(0);
            expect(message.author.length).toBeLessThanOrEqual(NICKNAME_MAX);
        });
    });
});
