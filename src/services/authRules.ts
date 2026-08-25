// 宽松账号规则（前端侧）。
//
// 产品要求：不设“安全问题式”的复杂校验，唯一的硬规则是用户名不与
// 已有账号重复——这由服务端唯一索引 + signInOrRegister 的
// PasswordMismatchError 兜底，前端无需（也无法）提前判断。
// 因此这里只做最基础的输入检查：用户名去首尾空格后非空、不超长；
// 密码非空即可，不限最短长度与字符种类。

export const USERNAME_MAX = 24;

// PocketBase 密码字段的平台上限：bcrypt 只取前 72 字节，PB 按 71 个字符封顶
export const PASSWORD_MAX = 71;

export function normalizeUsername(raw: string): string {
    return raw.trim();
}

// 校验规范化后的用户名与密码；合法返回 null，否则返回给用户看的错误文案。
export function validateCredentials(username: string, password: string): string | null {
    if (username.length === 0) return '请输入用户名';
    if (username.length > USERNAME_MAX) return `用户名最长 ${USERNAME_MAX} 个字符`;
    if (password.length === 0) return '请输入密码';
    if (password.length > PASSWORD_MAX) return `密码最长 ${PASSWORD_MAX} 个字符`;
    return null;
}
