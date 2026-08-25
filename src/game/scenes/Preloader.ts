import { Scene } from 'phaser';
import { CHARACTERS, GAME_ASSETS, OBSTACLE_VARIANTS } from '../assets';
import { GAME_HEIGHT } from '../../domain/game';
import { getRenderScale } from '../renderScale';
import { syncStageVars } from '../stageSync';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        // canvas 后备像素 = 逻辑尺寸 × renderScale，相机按同倍率 zoom 还原逻辑坐标系
        const renderScale = getRenderScale();
        const logicalWidth = this.scale.gameSize.width / renderScale;
        this.cameras.main.setZoom(renderScale).centerOn(logicalWidth / 2, GAME_HEIGHT / 2);

        // 画布宽度随视口自适应（360–960），加载界面按当前宽度居中
        const centerX = logicalWidth / 2;
        this.cameras.main.setBackgroundColor('#fdeef4');
        this.add.rectangle(centerX, 320, 184, 8, 0xf3cdda);
        const bar = this.add.rectangle(centerX - 92, 320, 0, 8, 0xef7fa6).setOrigin(0, 0.5);

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

        // 背景/障碍按逻辑 1x 尺寸交付（sky 960x640 / city 720x640 / street 720x180 / 障碍 76x480）；
        // 角色（216x216）与奖励（144x144）为高清位图，按实际像素原生加载（不降采样），
        // Game 场景用 setDisplaySize 分别缩到逻辑 72 / 48
        // 背景音乐不在此加载：17MB mp3 由 src/game/bgm.ts 用 HTMLAudioElement 流式播放，不阻塞进度条
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
