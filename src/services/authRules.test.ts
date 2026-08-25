import { describe, expect, it } from 'vitest';
import { normalizeUsername, PASSWORD_MAX, USERNAME_MAX, validateCredentials } from './authRules';

describe('normalizeUsername（用户名规范化）', () => {
    it('去除首尾空格，保留内部空格与任意字符', () => {
        expect(normalizeUsername('  碗碗 与 盆盆  ')).toBe('碗碗 与 盆盆');
        expect(normalizeUsername('a')).toBe('a');
    });
});

describe('validateCredentials（宽松规则：用户名不重复即可，密码随便设）', () => {
    it('1 个字符的用户名 + 1 位密码即可通过', () => {
        expect(validateCredentials('碗', '1')).toBeNull();
    });

    it('中文、内部空格、符号等用户名均合法', () => {
        expect(validateCredentials('碗碗 loves 盆盆', 'pw')).toBeNull();
        expect(validateCredentials('user@home!', 'pw')).toBeNull();
    });

    it('边界长度合法：24 字符用户名与 71 字符密码', () => {
        expect(validateCredentials('u'.repeat(USERNAME_MAX), 'p'.repeat(PASSWORD_MAX))).toBeNull();
    });

    it('空用户名被拒绝', () => {
        expect(validateCredentials('', 'pw')).toBe('请输入用户名');
    });

    it('超长用户名被拒绝', () => {
        expect(validateCredentials('u'.repeat(USERNAME_MAX + 1), 'pw')).toBe(`用户名最长 ${USERNAME_MAX} 个字符`);
    });

    it('空密码被拒绝', () => {
        expect(validateCredentials('碗碗', '')).toBe('请输入密码');
    });

    it('超过平台上限的密码被拒绝', () => {
        expect(validateCredentials('碗碗', 'p'.repeat(PASSWORD_MAX + 1))).toBe(`密码最长 ${PASSWORD_MAX} 个字符`);
    });
});
