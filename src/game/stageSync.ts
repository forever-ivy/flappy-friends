// 把 Phaser 实际显示尺寸同步给 DOM 层（style.css 的 --stage-width/--stage-height），
// 使菜单/HUD 等覆盖层与画布严格对齐。displaySize 允许小数，保持 1:1 不取整。
export function syncStageVars(displayWidth: number, displayHeight: number): void {
    const style = document.documentElement.style;
    style.setProperty('--stage-width', `${displayWidth}px`);
    style.setProperty('--stage-height', `${displayHeight}px`);
}
