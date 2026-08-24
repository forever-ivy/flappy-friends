import { Scene } from 'phaser';
import { CHARACTERS, GAME_ASSETS, OBSTACLE_VARIANTS } from '../assets';
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
        this.cameras.main.setBackgroundColor('#fdeef4');
        this.add.text(centerX, 286, '天际跳跳', { fontFamily: 'Arial Black', fontSize: 25, color: '#c05f7c' }).setOrigin(0.5);
        this.add.rectangle(centerX, 330, 184, 8, 0xf3cdda);
        const bar = this.add.rectangle(centerX - 92, 330, 0, 8, 0xef7fa6).setOrigin(0, 0.5);

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

        // 背景/障碍/奖励按逻辑 1x 尺寸交付（sky 960x640 / city 720x640 / street 720x180 / 障碍 76x480 / 奖励 48x48）；
        // 角色为 216x216 高清位图，按实际像素原生加载（不降采样），Game 场景用 setDisplaySize 缩到逻辑 72
        this.load.image('background-sky', GAME_ASSETS.sky);
        this.load.image('background-city', GAME_ASSETS.city);
        this.load.image('background-street', GAME_ASSETS.street);
        this.load.image('reward', GAME_ASSETS.reward);
        this.load.image('reward-mirror', GAME_ASSETS.rewardMirror);
        this.load.image('fx-sparkle', GAME_ASSETS.sparkle);
        OBSTACLE_VARIANTS.forEach((variant) => {
            this.load.image(variant.bottomKey, variant.bottomImage);
            this.load.image(variant.topKey, variant.topImage);
        });
        CHARACTERS.forEach((character) => this.load.image(character.textureKey, character.image));
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
