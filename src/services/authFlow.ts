// 「登录注册合一」编排逻辑（与 PocketBase 客户端解耦，便于单元测试）。
//
// 产品规则：界面只有「登录」。先尝试登录：
// - 登录成功 → 直接进入；
// - 登录被拒（400）→ 账号不存在或密码错误，无法直接区分，于是尝试注册：
//   - 注册成功 → 说明账号原本不存在，自动完成注册并登录；
//   - 注册也被拒（400，用户名唯一性冲突）→ 说明账号已存在，即密码错误，
//     抛出 PasswordMismatchError，绝不静默覆盖已有账号。
// 网络异常等非 400 错误原样抛出，由调用方展示通用错误提示。

export class PasswordMismatchError extends Error {
    constructor() {
        super('账号已存在，密码不正确');
        this.name = 'PasswordMismatchError';
    }
}

// PocketBase JS SDK 的 ClientResponseError 带 status 字段；400 表示请求被服务端拒绝
// （登录凭据错误 / 注册字段校验失败），status 0 或缺失则是网络层异常。
const isRejectedByServer = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 400;

export async function signInOrRegister<Profile>(
    signIn: () => Promise<Profile>,
    register: () => Promise<Profile>,
): Promise<Profile> {
    try {
        return await signIn();
    } catch (error) {
        if (!isRejectedByServer(error)) throw error;
    }
    try {
        return await register();
    } catch (error) {
        if (isRejectedByServer(error)) throw new PasswordMismatchError();
        throw error;
    }
}
