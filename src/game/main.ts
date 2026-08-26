import { Game as MainGame } from './scenes/Game';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { computeGameWidth, computeStageHeight, GAME_HEIGHT, GAME_WIDTH } from '../domain/game';
import { SKY_TOP_COLOR_CSS } from './assets';
import { getRenderScale } from './renderScale';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    // 启动兜底底色与天空贴图顶色一致，避免加载瞬间露出冷灰蓝
    backgroundColor: SKY_TOP_COLOR_CSS,
    antialias: true,
    physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 900 }, debug: false },
    },
    // 弱网硬化：单个资源 30 秒无响应视为失败（默认 0 = 永不超时，悬挂连接会让进度条
    // 永久卡住）；失败后 Phaser 自动重试 2 次，仍失败走 Preloader 的整批重载/点按重试
    loader: { timeout: 30000, maxRetries: 2 },
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
    },
    scene: [Preloader, MainGame],
};

const StartGame = (parent: string) => {
    //  宽度按当前视口比例自适应（360–960）；高度基准 640，竖屏时向天空侧出血扩展（640–800）
    //  以铺满视口消除上下 letterbox；运行期由 Game 场景响应 resize 再调整
    const width = computeGameWidth(window.innerWidth, window.innerHeight);
    const height = computeStageHeight(window.innerWidth, window.innerHeight);

    // 高分屏 / 大窗口抗糊：Phaser 4 的 Scale.FIT 下 canvas 后备像素恒等于 gameSize，
    // 所以把 gameSize 直接乘渲染倍率（1–3），各场景主相机 setZoom(同倍率) 还原逻辑坐标系；
    // CSS 显示尺寸仍由 FIT + stageSync 按逻辑宽高比布局，游戏逻辑/物理/难度零改动。
    const renderScale = getRenderScale();

    return new Game({
        ...config,
        width: width * renderScale,
        height: height * renderScale,
        parent,
        scale: { ...config.scale, width: width * renderScale, height: height * renderScale },
    });

}

export default StartGame;
