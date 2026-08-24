import { Scene } from 'phaser';
import {
    CHARACTERS, GAME_ASSETS,
    OBSTACLE_VARIANT_COUNT, ObstacleVariant,
    getObstacleVariantTextureKey, getObstacleVariantTopTextureKey,
    getObstacleVariantTexturePath, getObstacleVariantTopTexturePath,
} from '../assets';
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
        this.add.text(centerX, 286, 'SKYLINE HOP', { fontFamily: 'Arial Black', fontSize: 25, color: '#c05f7c' }).setOrigin(0.5);
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

        // PNG 均按逻辑 1x 尺寸交付（sky 960x640 / city 720x640 / street 720x180 / 障碍 76x480 / 奖励 48x48 / 角色 72x72）
        this.load.image('background-sky', GAME_ASSETS.sky);
        this.load.image('background-city', GAME_ASSETS.city);
        this.load.image('background-street', GAME_ASSETS.street);

        // 障碍柱多贴图变体：底柱 obstacle-{i} / 顶柱 obstacle-top-{i}
        // 仍加载旧 key（i=0），用于保持本地预览/兼容性。
        this.load.image('obstacle', GAME_ASSETS.obstacle);
        this.load.image('obstacle-top', GAME_ASSETS.obstacleTop);
        for (let i = 0; i < OBSTACLE_VARIANT_COUNT; i += 1) {
            const v = i as ObstacleVariant;
            this.load.image(getObstacleVariantTextureKey(v), getObstacleVariantTexturePath(v));
            this.load.image(getObstacleVariantTopTextureKey(v), getObstacleVariantTopTexturePath(v));
        }

        this.load.image('reward', GAME_ASSETS.reward);
        this.load.image('reward-mirror', GAME_ASSETS.rewardMirror);
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
