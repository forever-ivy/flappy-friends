import { describe, expect, it, vi } from 'vitest';
import { PasswordMismatchError, signInOrRegister } from './authFlow';

// 模拟 PocketBase ClientResponseError：登录凭据错误 / 注册字段冲突均为 status 400
const rejected = () => Object.assign(new Error('rejected'), { status: 400 });
const networkError = () => Object.assign(new Error('offline'), { status: 0 });

describe('signInOrRegister（登录注册合一）', () => {
    it('登录成功时直接返回，不会尝试注册', async () => {
        const signIn = vi.fn().mockResolvedValue('profile-a');
        const register = vi.fn();
        await expect(signInOrRegister(signIn, register)).resolves.toBe('profile-a');
        expect(register).not.toHaveBeenCalled();
    });

    it('账号不存在（登录被拒且注册成功）时自动注册', async () => {
        const signIn = vi.fn().mockRejectedValue(rejected());
        const register = vi.fn().mockResolvedValue('profile-new');
        await expect(signInOrRegister(signIn, register)).resolves.toBe('profile-new');
        expect(register).toHaveBeenCalledTimes(1);
    });

    it('账号已存在但密码错误（登录与注册都被拒）时抛出 PasswordMismatchError，不覆盖账号', async () => {
        const signIn = vi.fn().mockRejectedValue(rejected());
        const register = vi.fn().mockRejectedValue(rejected());
        await expect(signInOrRegister(signIn, register)).rejects.toBeInstanceOf(PasswordMismatchError);
    });

    it('登录阶段的网络异常原样抛出，不会误触发注册', async () => {
        const failure = networkError();
        const signIn = vi.fn().mockRejectedValue(failure);
        const register = vi.fn();
        await expect(signInOrRegister(signIn, register)).rejects.toBe(failure);
        expect(register).not.toHaveBeenCalled();
    });

    it('注册阶段的网络异常原样抛出，不误报密码错误', async () => {
        const failure = networkError();
        const signIn = vi.fn().mockRejectedValue(rejected());
        const register = vi.fn().mockRejectedValue(failure);
        await expect(signInOrRegister(signIn, register)).rejects.toBe(failure);
    });
});
