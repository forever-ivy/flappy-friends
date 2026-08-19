import { Game as MainGame } from './scenes/Game';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { GAME_HEIGHT, GAME_WIDTH } from '../domain/game';

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

    return new Game({ ...config, parent });

}

export default StartGame;
