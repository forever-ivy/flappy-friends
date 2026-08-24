import { Scene } from 'phaser';
import { CHARACTERS, GAME_ASSETS, SKY_TEXTURE_SIZE } from '../assets';
import { syncStageVars } from '../stageSync';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        // 画布宽度随视口自适应（360–960），加载界面按当前宽度居中
        const centerX = this.scale.gameSize.width / 2;
        this.cameras.main.setBackgroundColor('#142436');
        this.add.text(centerX, 286, 'SKYLINE HOP', { fontFamily: 'Arial Black', fontSize: 25, color: '#f7f1df' }).setOrigin(0.5);
        this.add.rectangle(centerX, 330, 184, 8, 0x2b4054);
        const bar = this.add.rectangle(centerX - 92, 330, 0, 8, 0xff5a73).setOrigin(0, 0.5);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 184px wide, so 100% = 184px)
            bar.width = 184 * progress;

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.svg('background-sky', GAME_ASSETS.sky, SKY_TEXTURE_SIZE);
        this.load.svg('background-city', GAME_ASSETS.city, { width: 720, height: 640 });
        this.load.svg('background-street', GAME_ASSETS.street, { width: 720, height: 180 });
        this.load.svg('obstacle', GAME_ASSETS.obstacle, { width: 76, height: 480 });
        this.load.svg('reward', GAME_ASSETS.reward, { width: 48, height: 48 });
        CHARACTERS.forEach((character) => this.load.svg(character.textureKey, character.image, { width: 72, height: 72 }));
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so it can be used in other scenes.

        // 尽早把画布显示尺寸同步给 DOM，避免覆盖层短暂按 9:16 回退值布局
        syncStageVars(this.scale.displaySize.width, this.scale.displaySize.height);

        //  Move to the Game scene. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('Game');
    }
}
