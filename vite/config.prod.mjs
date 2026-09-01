import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { umamiHtmlPlugin } from './umami-html-plugin.mjs';

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);

            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}

export default defineConfig({
    base: './',
    plugins: [
        react(),
        umamiHtmlPlugin(),
        phasermsg()
    ],
    logLevel: 'warning',
    build: {
        // 移动端多版本适配：Vite 默认 target 'modules'（chrome87/safari14+）会在产物里保留
        // 可选链 ?. / 空值合并 ?? 等新语法，Android 老内置浏览器（X5 等未更新内核）解析即
        // SyntaxError 白屏。降到 es2018 + chrome70 + safari12，esbuild 把新语法转译掉；
        // 更早的 globalThis 差异由 index.html 内联 shim 兜底。
        target: ['es2018', 'chrome70', 'safari12'],
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    }
});
