import { Game as MainGame } from './scenes/Game';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { computeGameWidth, GAME_HEIGHT, GAME_WIDTH } from '../domain/game';
import { getRenderScale } from './renderScale';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#bfe3fb',
    antialias: true,
    physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 900 }, debug: false },
    },
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
    },
    scene: [Preloader, MainGame],
};

const StartGame = (parent: string) => {
    //  高度恒 640，宽度按当前视口比例自适应（360–960）；运行期由 Game 场景响应 resize 再调整
    const width = computeGameWidth(window.innerWidth, window.innerHeight);

    // 高分屏 / 大窗口抗糊：Phaser 4 的 Scale.FIT 下 canvas 后备像素恒等于 gameSize，
    // 所以把 gameSize 直接乘渲染倍率（1–3），各场景主相机 setZoom(同倍率) 还原逻辑坐标系；
    // CSS 显示尺寸仍由 FIT + stageSync 按逻辑宽高比布局，游戏逻辑/物理/难度零改动。
    const renderScale = getRenderScale();

    return new Game({
        ...config,
        width: width * renderScale,
        height: GAME_HEIGHT * renderScale,
        parent,
        scale: { ...config.scale, width: width * renderScale, height: GAME_HEIGHT * renderScale },
    });

}

export default StartGame;
