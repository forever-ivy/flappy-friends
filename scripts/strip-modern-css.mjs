// 终端模拟老引擎解析器（临时验证用）：把老引擎（Android 11 WebView / 未更新 X5，
// Chromium < 87 一档）会在解析期整条丢弃的声明从 CSS 里物理删除——svh 单位、
// inset/inset-block 简写、min()/max()/clamp()、独立 translate 属性、container-type，
// 以及它们支持不了的 @supports (height: 100svh) / @container 块。
// 用现代浏览器加载删完的 CSS，渲染结果 ≈ 老引擎加载原 CSS 的结果，可用于截图取证。
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
let css = readFileSync(input, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// 老引擎不认识的 at 块整体移除 / 展开
css = css
    .replace(/@supports\s*\(height:\s*100svh\)\s*\{([^{}]*\{[^{}]*\})*\s*\}/g, '')
    .replace(/@container[^{]*\{([^{}]*\{[^{}]*\})*\s*\}/g, '')
    // @supports not (translate: 0) 在老引擎里条件成立：保留块内容、去掉包裹
    .replace(/@supports\s*not\s*\(translate:\s*0\)\s*\{([\s\S]*?\})\s*\}/g, '$1');

// 解析期丢弃的声明特征
const dropped = (decl) => {
    const idx = decl.indexOf(':');
    if (idx === -1) return false;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1);
    return /\b\d+(\.\d+)?(svh|dvh|lvh)\b/.test(value)
        || prop === 'inset' || prop === 'inset-block' || prop === 'translate'
        || prop === 'container-type'
        || /(?:^|[\s(,:])(min|max|clamp)\(/.test(value);
};

css = css.replace(/\{([^{}]*)\}/g, (_, body) => {
    const kept = body.split(';').map((d) => d.trim()).filter(Boolean).filter((d) => !dropped(d));
    return `{ ${kept.join('; ')}${kept.length ? ';' : ''} }`;
});

writeFileSync(output, css);
console.log(`已写入老引擎模拟 CSS：${output}`);
