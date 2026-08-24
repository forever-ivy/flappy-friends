import { Game as MainGame } from './scenes/Game';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { computeGameWidth, GAME_HEIGHT, GAME_WIDTH } from '../domain/game';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#c9e4dd',
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

    return new Game({
        ...config,
        width,
        parent,
        scale: { ...config.scale, width, height: GAME_HEIGHT },
    });

}

export default StartGame;
