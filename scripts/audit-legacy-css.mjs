// 终端模拟「老引擎解析 CSS」的审查脚本（临时验证用，也可在 CI 里跑）：
// 按老引擎的解析规则丢弃它们不认识的声明——svh 单位、inset/inset-block 简写、
// min()/max()/clamp() 数学函数、独立 translate 属性——然后断言关键布局规则
// 仍然保留可用的回退值。任何一条失败都意味着 Android 11 WebView / 未更新 X5
// 这类内核上会出现「壳高度塌 0 只剩渐变背景（卡进场）」级别的故障。
import { readFileSync } from 'node:fs';

const cssPath = process.argv[2] ?? 'dist/style.css';
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// 提取 selector -> 声明列表（简化解析：跳过 @keyframes，@media/@supports/@container
// 内的规则按「老引擎不支持 @supports (height: 100svh) / @container」处理）
const rules = [];
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
// 老引擎视角：去掉 @supports (height: 100svh) 块（不匹配）与 @container 块（不认识）。
// @supports not (translate: 0) 在老引擎里匹配成立，保留其内容。
let legacyCss = css
    .replace(/@supports\s*\(height:\s*100svh\)\s*\{([^{}]*\{[^{}]*\})*\s*\}/g, '')
    .replace(/@container[^{]*\{([^{}]*\{[^{}]*\})*\s*\}/g, '')
    .replace(/@supports\s*not\s*\(translate:\s*0\)\s*\{/g, '')
    .replace(/@keyframes[^{]*\{([^{}]*\{[^{}]*\})*\s*\}/g, '')
    .replace(/@media[^{]*\{/g, '');

let match;
while ((match = ruleRe.exec(legacyCss)) !== null) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    const declarations = match[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
        const idx = d.indexOf(':');
        return { prop: d.slice(0, idx).trim(), value: d.slice(idx + 1).trim() };
    });
    rules.push({ selector, declarations });
}

// 老引擎丢弃规则：值里有这些特征的声明整条无效
const isDropped = ({ prop, value }) =>
    /\b\d+(\.\d+)?(svh|dvh|lvh)\b/.test(value)
    || prop === 'inset' || prop === 'inset-block' || prop === 'translate'
    || /(?:^|[\s(,:])(min|max|clamp)\(/.test(value)
    || prop === 'container-type';

// 声明含 var() 时老引擎（Chromium 49+ 支持 var）不丢弃，但引用未定义回退里含
// min()/svh 时会「计算期失效」；这里保守地把含 min(/svh 的 var 回退也当作失效，
// 检验前面必须存在纯回退声明
const survives = (declarations, prop) => {
    const alive = declarations.filter((d) => d.prop === prop && !isDropped(d));
    return alive.length > 0 ? alive[alive.length - 1].value : null;
};

const checks = [
    ['.game-shell', 'height', (v) => v === '100vh'],
    ['.menu-layer, .hud', 'top', (v) => v === '0'],
    ['.menu-layer, .hud', 'bottom', (v) => v === '0'],
    ['#game-container', 'top', (v) => v === '0'],
    ['#game-container', 'left', (v) => v === '0'],
    ['.result-layer', 'top', (v) => v === '0'],
    ['.result-layer', 'left', (v) => v === '0'],
    ['.dialog-backdrop', 'top', (v) => v === '0'],
    ['.dialog-backdrop', 'left', (v) => v === '0'],
    ['.topbar', 'top', (v) => v != null],
    ['.hud', 'padding-top', (v) => v != null],
    ['.menu-layer', 'gap', (v) => v != null],
    ['.menu-controls', 'width', (v) => v != null && v.includes('calc')],
    ['.result-sheet', 'width', (v) => v != null && v.includes('calc')],
    ['.result-sheet', 'transform', (v) => v != null && v.includes('translate(-50%, -50%)')],
    ['#game-container canvas', 'width', (v) => v != null],
    ['#game-container canvas', 'height', (v) => v != null],
    ['.danmaku-layer', 'top', (v) => v === '0'],
];

let failed = 0;
for (const [selector, prop, assert] of checks) {
    const rule = rules.filter((r) => r.selector === selector);
    const declarations = rule.flatMap((r) => r.declarations);
    const value = survives(declarations, prop);
    const ok = declarations.length > 0 && assert(value);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${selector} { ${prop} }  →  老引擎生效值: ${value ?? '（无 — 声明全被丢弃）'}`);
    if (!ok) failed += 1;
}

console.log(failed === 0
    ? '\n✓ 老引擎（无 svh/inset/min/clamp/translate 支持）下所有关键布局仍有有效回退'
    : `\n✗ ${failed} 项关键布局在老引擎下会失效`);
process.exit(failed === 0 ? 0 : 1);
