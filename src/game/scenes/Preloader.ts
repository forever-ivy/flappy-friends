import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { BACKGROUNDS, CHARACTERS, GAME_ASSETS, OBSTACLE_VARIANTS, phaserAsset } from '../assets';
import { GAME_HEIGHT } from '../../domain/game';
import { getRenderScale } from '../renderScale';
import { syncStageVars } from '../stageSync';

// 弱网硬化：Phaser 对单个文件已按 loader.maxRetries 自动重试，仍失败的文件在
// complete 后整批延迟重载（瞬时断流/抖动下立即重试大概率还会失败）；自动轮次
// 用尽则显示「点按重试」提示——绝不让首屏无声卡在进度条
const RETRY_ROUND_DELAY_MS = 1200;
const MAX_AUTO_RETRY_ROUNDS = 2;

export class Preloader extends Scene
{
    // 本轮彻底失败（自动重试也没救回来）的文件：key → 带 path 前缀的 url
    private failedFiles = new Map<string, string>();
    private retryRound = 0;

    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        // 启动即同步画布显示尺寸给 DOM（并跟随加载期的视口变化，如手机地址栏收起）：
        // 否则覆盖层/画布 CSS 用 9:16 回退值，加载进度条阶段画布两侧会露出背景渐变色条
        const syncNow = () => syncStageVars(this.scale.displaySize.width, this.scale.displaySize.height);
        syncNow();
        this.scale.on('resize', syncNow);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', syncNow));

        // canvas 后备像素 = 逻辑尺寸 × renderScale，相机按同倍率 zoom 还原逻辑坐标系；
        // 取景与 Game 场景一致：可视区底部对齐世界 y=640（竖屏出血加在天空一侧）
        const renderScale = getRenderScale();
        const logicalWidth = this.scale.gameSize.width / renderScale;
        const logicalHeight = this.scale.gameSize.height / renderScale;
        const centerX = logicalWidth / 2;
        const centerY = GAME_HEIGHT - logicalHeight / 2;
        this.cameras.main.setZoom(renderScale).centerOn(centerX, centerY);

        // 画布尺寸随视口自适应（宽 360–960 / 高 640–800），进度条放在取景中心
        this.cameras.main.setBackgroundColor('#fcf1e4');
        this.add.rectangle(centerX, centerY, 184, 8, 0xf3cdda);
        const bar = this.add.rectangle(centerX - 92, centerY, 0, 8, 0xef7fa6).setOrigin(0, 0.5);

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

        // loaderror 只在该文件的自动重试（loader.maxRetries）全部失败后触发：
        // 记下来等 complete 后整批重载，见 create()
        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
            this.failedFiles.set(file.key, String(file.url));
        });

        // 背景/障碍按逻辑 1x 尺寸交付（sky 960x640 / city 720x640 / street 720x180 / 障碍 76x480）；
        // 角色（216x216）与奖励（144x144）为高清位图，按实际像素原生加载（不降采样），
        // Game 场景用 setDisplaySize 分别缩到逻辑 72 / 48
        // 背景音乐不在此加载：约 3.1MB mp3 由 src/game/bgm.ts 用 HTMLAudioElement 流式播放，不阻塞进度条
        BACKGROUNDS.forEach((background) => this.load.image(background.textureKey, phaserAsset(background.image)));
        this.load.image('reward', phaserAsset(GAME_ASSETS.reward));
        this.load.image('reward-mirror', phaserAsset(GAME_ASSETS.rewardMirror));
        this.load.image('fx-sparkle', phaserAsset(GAME_ASSETS.sparkle));
        OBSTACLE_VARIANTS.forEach((variant) => {
            this.load.image(variant.bottomKey, phaserAsset(variant.bottomImage));
            this.load.image(variant.topKey, phaserAsset(variant.topImage));
        });
        CHARACTERS.forEach((character) => this.load.image(character.textureKey, phaserAsset(character.image)));
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so it can be used in other scenes.

        // 有彻底失败的文件：先整批延迟重载（最多 MAX_AUTO_RETRY_ROUNDS 轮），
        // 轮次用尽再给出可点按的重试提示，而不是带着缺失素材硬开局
        if (this.failedFiles.size > 0) {
            if (this.retryRound < MAX_AUTO_RETRY_ROUNDS) this.retryFailedFiles();
            else this.showRetryNotice();
            return;
        }

        // 尽早把画布显示尺寸同步给 DOM，避免覆盖层短暂按 9:16 回退值布局
        syncStageVars(this.scale.displaySize.width, this.scale.displaySize.height);

        //  Move to the Game scene. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('Game');
    }

    // 整批重载失败文件：file.url 入队时已带上 setPath('assets') 前缀，
    // 重载前把 path 清空避免二次拼接；完成后回到 create() 重新裁决
    private retryFailedFiles ()
    {
        this.retryRound += 1;
        const entries = Array.from(this.failedFiles.entries());
        this.failedFiles.clear();
        this.time.delayedCall(RETRY_ROUND_DELAY_MS, () => {
            this.load.setPath('');
            entries.forEach(([key, url]) => this.load.image(key, url));
            this.load.once(Phaser.Loader.Events.COMPLETE, () => this.create());
            this.load.start();
        });
    }

    // 自动重试轮次用尽：画布上给出明确提示，点按后重置轮次再来（弱网恢复后可救回），
    // 不再让玩家对着满进度条死等
    private showRetryNotice ()
    {
        const renderScale = getRenderScale();
        const logicalWidth = this.scale.gameSize.width / renderScale;
        const logicalHeight = this.scale.gameSize.height / renderScale;
        const notice = this.add.text(
            logicalWidth / 2,
            GAME_HEIGHT - logicalHeight / 2 + 36,
            '素材加载失败，点按屏幕重试',
            { fontFamily: 'sans-serif', fontSize: '16px', color: '#d9598a' },
        ).setOrigin(0.5);
        this.input.once('pointerdown', () => {
            notice.destroy();
            this.retryRound = 0;
            this.create();
        });
    }
}
