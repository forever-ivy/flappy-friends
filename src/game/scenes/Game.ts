import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import {
    calculateScore, computeGameWidth, computePlayerX, createSeededRandom,
    FIRST_PIPE_EXTRA, GAME_HEIGHT, GAME_WIDTH, getDifficulty, isOutOfBounds, RunResult,
    shouldSpawnReward, SPAWN_OFFSCREEN_X, SPAWN_TRIGGER_FROM_RIGHT,
} from '../../domain/game';
import { CHARACTER_TEXTURE_SIZE, getCharacter, OBSTACLE_VARIANTS, ObstacleVariant } from '../assets';
import { playSfx } from '../sfx';
import { syncStageVars } from '../stageSync';
import { EventBus } from '../EventBus';

type GamePhase = 'idle' | 'countdown' | 'playing' | 'over';

interface ObstaclePair {
    top: Phaser.Physics.Arcade.Image;
    bottom: Phaser.Physics.Arcade.Image;
    reward?: Phaser.Physics.Arcade.Image;
    scored: boolean;
}

const COUNTDOWN_TEXT_Y = 264;

// 漂浮星光（少女梦幻氛围）：白色星光贴图 tint 成粉彩色，缓慢向左上飘并闪烁
const SPARKLE_COUNT = 14;
const SPARKLE_TINTS = [0xffffff, 0xffd3e8, 0xd9c8ff, 0xbcd9ff, 0xfff0c9];

export class Game extends Scene {
    private phase: GamePhase = 'idle';
    private selectedCharacter = 'nova';
    private player!: Phaser.Physics.Arcade.Sprite;
    private obstacles!: Phaser.Physics.Arcade.Group;
    private rewards!: Phaser.Physics.Arcade.Group;
    private pairs: ObstaclePair[] = [];
    private sky!: Phaser.GameObjects.Image;
    private city!: Phaser.GameObjects.TileSprite;
    private street!: Phaser.GameObjects.TileSprite;
    private idleTween?: Phaser.Tweens.Tween;
    private countdownText?: Phaser.GameObjects.Text;
    private pipeCount = 0;
    private rewardCount = 0;
    private startedAt = 0;
    private random = createSeededRandom(Date.now());
    private sparkles: Phaser.GameObjects.Image[] = [];
    private lastVariantIndex = -1;
    private flapKeyHandler = () => this.flap();
    private resizeHandler = () => {
        this.maybeApplyGameWidth();
        this.layout();
    };

    constructor() {
        super('Game');
    }

    create() {
        this.sky = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background-sky');
        this.city = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'background-city');
        this.street = this.add.tileSprite(GAME_WIDTH / 2, 565, GAME_WIDTH, 180, 'background-street').setDepth(2);
        this.createAmbientSparkles();
        this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
        this.rewards = this.physics.add.group({ allowGravity: false, immovable: true });

        this.player = this.physics.add.sprite(computePlayerX(this.scale.gameSize.width), 300, getCharacter(this.selectedCharacter).textureKey).setDepth(10);
        this.player.setCollideWorldBounds(false);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);

        this.physics.add.collider(this.player, this.obstacles, () => this.finishRun());
        this.physics.add.overlap(this.player, this.rewards, (_player, reward) => this.collectReward(reward as Phaser.Physics.Arcade.Image));
        this.input.on('pointerdown', () => this.flap());
        this.input.keyboard?.on('keydown-SPACE', this.flapKeyHandler);
        this.input.keyboard?.on('keydown-UP', this.flapKeyHandler);
        this.input.keyboard?.on('keydown-W', this.flapKeyHandler);
        EventBus.on('game:start', this.startRun, this);
        EventBus.on('character:selected', this.selectCharacter, this);

        // 视口变化时先校正画布逻辑宽度（360–960），再按新宽度重排版
        this.scale.on('resize', this.resizeHandler);
        this.maybeApplyGameWidth();
        this.layout();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.resizeHandler);
            this.input.keyboard?.off('keydown-SPACE', this.flapKeyHandler);
            this.input.keyboard?.off('keydown-UP', this.flapKeyHandler);
            this.input.keyboard?.off('keydown-W', this.flapKeyHandler);
            EventBus.off('game:start', this.startRun, this);
            EventBus.off('character:selected', this.selectCharacter, this);
        });

        this.startIdleTween();
        EventBus.emit('game:ready');
        EventBus.emit('current-scene-ready', this);
    }

    // 画布高度恒 640，宽度跟随视口宽高比；与当前一致时不重复 setGameSize，避免事件回环
    private maybeApplyGameWidth() {
        const desired = computeGameWidth(this.scale.parentSize.width, this.scale.parentSize.height);
        if (desired !== this.scale.gameSize.width) {
            this.scale.setGameSize(desired, GAME_HEIGHT);
            this.scale.refresh();
        }
    }

    // 按当前画布宽度重排背景与锚点；可安全重复调用
    private layout() {
        const width = this.scale.gameSize.width;
        this.sky.setPosition(width / 2, GAME_HEIGHT / 2);
        this.city.setSize(width, GAME_HEIGHT).setPosition(width / 2, GAME_HEIGHT / 2);
        this.street.setSize(width, 180).setPosition(width / 2, 565);
        if (this.countdownText?.active) this.countdownText.setPosition(width / 2, COUNTDOWN_TEXT_Y);
        // 画布变窄时把滞留在右侧画外的星光挪回可见区
        this.sparkles.forEach((sparkle) => {
            if (sparkle.x > width + 16) sparkle.x = Math.random() * width;
        });
        // 对局中途窗口缩放时把角色重新锚定到新宽度的目标位置
        this.player.setX(computePlayerX(width));
        syncStageVars(this.scale.displaySize.width, this.scale.displaySize.height);
    }

    update(_time: number, delta: number) {
        const seconds = delta / 1000;
        const scrollSpeed = this.phase === 'playing' ? getDifficulty(this.currentScore()).speed : 22;
        this.city.tilePositionX += scrollSpeed * 0.18 * seconds;
        this.street.tilePositionX += scrollSpeed * seconds;
        this.driftSparkles(scrollSpeed, seconds);

        if (this.phase !== 'playing') return;
        const difficulty = getDifficulty(this.currentScore());
        this.pairs.forEach((pair) => {
            pair.top.setVelocityX(-difficulty.speed);
            pair.bottom.setVelocityX(-difficulty.speed);
            if (pair.reward?.active && pair.reward.body) pair.reward.setVelocityX(-difficulty.speed);
            if (!pair.scored && pair.top.x + pair.top.displayWidth / 2 < this.player.x) {
                pair.scored = true;
                this.pipeCount += 1;
                playSfx('score');
                this.emitScore();
            }
        });

        const latest = this.pairs[this.pairs.length - 1];
        if (!latest || latest.top.x < this.scale.gameSize.width - SPAWN_TRIGGER_FROM_RIGHT) this.spawnPair();

        const removed = this.pairs.filter((pair) => pair.top.x < -70);
        removed.forEach((pair) => {
            pair.top.destroy();
            pair.bottom.destroy();
            pair.reward?.destroy();
        });
        this.pairs = this.pairs.filter((pair) => pair.top.x >= -70);

        this.player.setAngle(Phaser.Math.Clamp((this.player.body?.velocity.y ?? 0) * 0.08, -22, 72));
        if (isOutOfBounds(this.player.y)) this.finishRun();
    }

    // 星光只做氛围装饰：用 Math.random 布点与闪烁，不消耗对局的种子随机序列
    private createAmbientSparkles() {
        const width = this.scale.gameSize.width;
        for (let index = 0; index < SPARKLE_COUNT; index += 1) {
            const sparkle = this.add.image(Math.random() * width, 30 + Math.random() * 510, 'fx-sparkle')
                .setDepth(4)
                .setScale(0.45 + Math.random() * 0.65)
                .setAlpha(0.15)
                .setTint(SPARKLE_TINTS[index % SPARKLE_TINTS.length]);
            this.tweens.add({
                targets: sparkle,
                alpha: { from: 0.12, to: 0.85 },
                angle: { from: -14, to: 14 },
                duration: 1100 + Math.random() * 1400,
                delay: Math.random() * 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.inOut',
            });
            this.sparkles.push(sparkle);
        }
    }

    private driftSparkles(scrollSpeed: number, seconds: number) {
        const width = this.scale.gameSize.width;
        this.sparkles.forEach((sparkle, index) => {
            // 视差介于中景（0.18x）与街面（1x）之间，另加缓慢上飘
            sparkle.x -= scrollSpeed * 0.3 * seconds;
            sparkle.y -= (5 + (index % 3) * 3) * seconds;
            if (sparkle.x < -16) {
                sparkle.x = width + 16;
                sparkle.y = 30 + Math.random() * 510;
            }
            if (sparkle.y < -16) {
                sparkle.y = 570;
                sparkle.x = Math.random() * width;
            }
        });
    }

    private selectCharacter(characterId: string) {
        this.selectedCharacter = characterId;
        if (this.phase === 'idle' || this.phase === 'over') this.applyCharacterBody(characterId);
    }

    private applyCharacterBody(characterId: string) {
        const character = getCharacter(characterId);
        this.player.setTexture(character.textureKey);
        const offset = CHARACTER_TEXTURE_SIZE / 2 - character.collisionRadius;
        this.player.setCircle(character.collisionRadius, offset, offset);
    }

    private startRun = (payload: { characterId: string; seed?: number }) => {
        this.time.removeAllEvents();
        this.clearWorld();
        this.phase = 'countdown';
        this.selectedCharacter = payload.characterId;
        this.random = createSeededRandom(payload.seed ?? Date.now());
        this.pipeCount = 0;
        this.rewardCount = 0;
        this.lastVariantIndex = -1;
        this.player.clearTint().setPosition(computePlayerX(this.scale.gameSize.width), 300).setAngle(0).setVelocity(0, 0);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);
        this.idleTween?.stop();
        this.emitScore();

        this.showCountdown('3');
        const sequence = ['3', '2', '1', 'GO'];
        let index = 0;
        this.time.addEvent({
            delay: 620,
            repeat: sequence.length - 1,
            callback: () => {
                index += 1;
                const nextText = sequence[index] ?? '';
                this.showCountdown(nextText, 1.2);
                this.tweens.add({ targets: this.countdownText, scale: 1, alpha: 0.86, duration: 260 });
                if (index === sequence.length - 1) {
                    this.time.delayedCall(360, () => {
                        this.clearCountdown();
                        this.phase = 'playing';
                        this.startedAt = Date.now();
                        this.playerBody().setAllowGravity(true);
                        this.spawnPair(this.scale.gameSize.width + FIRST_PIPE_EXTRA);
                        EventBus.emit('game:phase', 'playing');
                    });
                }
            },
        });
    };

    private showCountdown(text: string, scale = 1) {
        this.countdownText?.destroy();
        this.countdownText = this.add.text(this.scale.gameSize.width / 2, COUNTDOWN_TEXT_Y, text, {
            fontFamily: 'Arial Black', fontSize: 66, color: '#fff6f9', stroke: '#d97a99', strokeThickness: 8,
        }).setOrigin(0.5).setDepth(30).setScale(scale);
    }

    private clearCountdown() {
        this.countdownText?.destroy();
        this.countdownText = undefined;
    }

    private flap() {
        if (this.phase !== 'playing') return;
        playSfx('flap');
        this.player.setVelocityY(-330);
        this.tweens.add({ targets: this.player, scaleX: 1.1, scaleY: 0.9, duration: 80, yoyo: true });
    }

    private spawnPair(x = this.scale.gameSize.width + SPAWN_OFFSCREEN_X) {
        const { gap } = getDifficulty(this.currentScore());
        const topLimit = 108 + gap / 2;
        const bottomLimit = GAME_HEIGHT - 86 - gap / 2 - 108;
        const center = topLimit + this.random() * (bottomLimit - topLimit);
        const obstacleHeight = 480;
        const variant = this.pickObstacleVariant();
        const top = this.createObstacle(x, center - gap / 2 - obstacleHeight / 2, variant.topKey);
        const bottom = this.createObstacle(x, center + gap / 2 + obstacleHeight / 2, variant.bottomKey);
        const pair: ObstaclePair = { top, bottom, scored: false };

        if (shouldSpawnReward(this.random())) {
            const safeOffset = Math.min(42, gap / 2 - 30);
            const rewardY = center + (this.random() * 2 - 1) * safeOffset;
            // 叉子与镜子两种奖励贴图交替出现（仅视觉差异，碰撞与计分一致）
            const rewardTexture = this.pairs.length % 2 === 0 ? 'reward' : 'reward-mirror';
            const reward = this.physics.add.image(x + 4, rewardY, rewardTexture).setDepth(7);
            reward.body!.allowGravity = false;
            reward.setData('collected', false);
            this.rewards.add(reward);
            this.tweens.add({ targets: reward, angle: 360, duration: 2400, repeat: -1 });
            pair.reward = reward;
        }
        this.pairs.push(pair);
    }

    // 障碍多样性：按种子随机选变体（可复现），且相邻两对强制不同色增强变化感
    private pickObstacleVariant(): ObstacleVariant {
        let index = Math.floor(this.random() * OBSTACLE_VARIANTS.length) % OBSTACLE_VARIANTS.length;
        if (OBSTACLE_VARIANTS.length > 1 && index === this.lastVariantIndex) {
            index = (index + 1) % OBSTACLE_VARIANTS.length;
        }
        this.lastVariantIndex = index;
        return OBSTACLE_VARIANTS[index];
    }

    private createObstacle(x: number, y: number, textureKey: string): Phaser.Physics.Arcade.Image {
        // 顶柱与底柱是两张独立贴图（柱身竖排文字不能翻转），所有变体碰撞体参数完全一致
        const obstacle = this.physics.add.image(x, y, textureKey).setDepth(6);
        obstacle.setImmovable(true);
        obstacle.body!.allowGravity = false;
        obstacle.body!.setSize(58, 470).setOffset(9, 5);
        this.obstacles.add(obstacle);
        return obstacle;
    }

    private collectReward(reward: Phaser.Physics.Arcade.Image) {
        if (this.phase !== 'playing' || reward.getData('collected')) return;
        reward.setData('collected', true);
        this.rewardCount += 1;
        playSfx('reward');
        this.emitScore();
        this.spawnSpark(reward.x, reward.y);
        reward.destroy();
        const pair = this.pairs.find((candidate) => candidate.reward === reward);
        if (pair) pair.reward = undefined;
    }

    private spawnSpark(x: number, y: number) {
        for (let index = 0; index < 8; index += 1) {
            const angle = (Math.PI * 2 * index) / 8;
            const dot = this.add.circle(x, y, 3, index % 2 ? 0xffd3e3 : 0xf27fa5).setDepth(20);
            this.tweens.add({
                targets: dot, x: x + Math.cos(angle) * 34, y: y + Math.sin(angle) * 34,
                alpha: 0, scale: 0.2, duration: 420, onComplete: () => dot.destroy(),
            });
        }
    }

    private finishRun() {
        if (this.phase !== 'playing') return;
        this.phase = 'over';
        playSfx('hit');
        this.playerBody().setAllowGravity(false);
        this.player.setVelocity(0, 0).setTint(0xff97a6);
        this.pairs.forEach((pair) => {
            pair.top.setVelocityX(0);
            pair.bottom.setVelocityX(0);
            if (pair.reward?.active && pair.reward.body) pair.reward.setVelocityX(0);
        });
        const result: RunResult = {
            clientRunId: crypto.randomUUID(), characterId: this.selectedCharacter,
            pipeCount: this.pipeCount, rewardCount: this.rewardCount, totalScore: this.currentScore(),
            durationMs: Math.max(0, Date.now() - this.startedAt), createdAt: new Date().toISOString(),
        };
        EventBus.emit('game:over', result);
    }

    private emitScore() {
        EventBus.emit('score:changed', { total: this.currentScore(), pipeCount: this.pipeCount, rewardCount: this.rewardCount });
    }

    private playerBody(): Phaser.Physics.Arcade.Body {
        return this.player.body as Phaser.Physics.Arcade.Body;
    }

    private currentScore() {
        return calculateScore(this.pipeCount, this.rewardCount);
    }

    private clearWorld() {
        this.pairs.forEach((pair) => {
            pair.top.destroy();
            pair.bottom.destroy();
            pair.reward?.destroy();
        });
        this.pairs = [];
        this.obstacles.clear(true, true);
        this.rewards.clear(true, true);
    }

    private startIdleTween() {
        this.idleTween = this.tweens.add({ targets: this.player, y: 314, angle: 4, duration: 1200, ease: 'Sine.inOut', yoyo: true, repeat: -1 });
    }
}
