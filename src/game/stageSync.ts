// 把 Phaser 实际显示尺寸同步给 DOM 层（style.css 的 --stage-width/--stage-height），
// 使菜单/HUD 等覆盖层与画布严格对齐。displaySize 允许小数，保持 1:1 不取整。
export function syncStageVars(displayWidth: number, displayHeight: number): void {
    const style = document.documentElement.style;
    style.setProperty('--stage-width', `${displayWidth}px`);
    style.setProperty('--stage-height', `${displayHeight}px`);
    // 桌面超宽屏两侧留白（pillarbox）时开启画布左右的羽化过渡条（style.css 的
    // .game-shell::before/::after），把画布硬边融进同色系梦幻背景；
    // 画布已铺满视口宽度时关闭，避免边缘出现多余雾化（留 2px 容差吸收 FIT 取整误差）
    const pillarboxed = displayWidth < window.innerWidth - 2;
    style.setProperty('--edge-feather', pillarboxed ? '1' : '0');
}
