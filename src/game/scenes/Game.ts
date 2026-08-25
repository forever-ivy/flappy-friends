import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import {
    calculateScore, computeGameWidth, computePlayerX, computeStageHeight, createSeededRandom,
    FIRST_PIPE_EXTRA, GAME_HEIGHT, GAME_WIDTH, getDifficulty, isOutOfBounds, RunResult,
    shouldSpawnReward, SPAWN_OFFSCREEN_X, SPAWN_TRIGGER_FROM_RIGHT,
} from '../../domain/game';
import { CHARACTER_SPRITE_SIZE, CHARACTER_TEXTURE_SIZE, getCharacter, OBSTACLE_VARIANTS, ObstacleVariant, REWARD_TEXTURE_SIZE, SKY_TOP_COLOR } from '../assets';
import { getRenderScale } from '../renderScale';
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
    // 竖屏出血区（画布高 >640）用天空顶行同色矩形向上续接，消除顶部 letterbox
    private skyExtension!: Phaser.GameObjects.Rectangle;
    private city!: Phaser.GameObjects.TileSprite;
    private street!: Phaser.GameObjects.TileSprite;
    private idleTween?: Phaser.Tweens.Tween;
    private countdownText?: Phaser.GameObjects.Text;
    private pipeCount = 0;
    private rewardCount = 0;
    private startedAt = 0;
    private random = createSeededRandom(Date.now());
    private sparkles: Phaser.GameObjects.Image[] = [];
    // canvas 后备像素 = 逻辑尺寸 × renderScale；相机 setZoom(renderScale) 还原逻辑坐标系
    private renderScale = getRenderScale();
    // 角色等比基准 scale（setDisplaySize 72/216 后记录）：扑翼挤压动画必须从它出发并回到它
    private playerBaseScale = CHARACTER_TEXTURE_SIZE / CHARACTER_SPRITE_SIZE;
    private lastVariantIndex = -1;
    private lastGapSkewSign = 0;
    private flapKeyHandler = () => this.flap();
    private resizeHandler = () => {
        this.maybeApplyStageSize();
        this.layout();
    };

    constructor() {
        super('Game');
    }

    create() {
        this.sky = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background-sky');
        // 底边锚在世界 y=0（origin 0.5,1），layout 里按出血量拉高，与天空贴图顶行颜色无缝相接
        this.skyExtension = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 0, SKY_TOP_COLOR).setOrigin(0.5, 1);
        this.city = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'background-city');
        this.street = this.add.tileSprite(GAME_WIDTH / 2, 565, GAME_WIDTH, 180, 'background-street').setDepth(2);
        this.createAmbientSparkles();
        this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
        this.rewards = this.physics.add.group({ allowGravity: false, immovable: true });

        this.player = this.physics.add.sprite(computePlayerX(this.logicalWidth()), 300, getCharacter(this.selectedCharacter).textureKey).setDepth(10);
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

        // 视口变化时先校正画布逻辑尺寸（宽 360–960 / 高 640–800），再按新尺寸重排版
        this.scale.on('resize', this.resizeHandler);
        this.maybeApplyStageSize();
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

    // gameSize 是乘过 renderScale 的 canvas 后备像素，除回倍率即游戏逻辑宽度
    private logicalWidth() {
        return this.scale.gameSize.width / this.renderScale;
    }

    // 画布逻辑高度：640 基准，竖屏时含向上出血（640–800，见 computeStageHeight）
    private logicalHeight() {
        return this.scale.gameSize.height / this.renderScale;
    }

    // 画布逻辑宽高随视口比例自适应；与当前一致时不重复 setGameSize，避免事件回环
    private maybeApplyStageSize() {
        const desiredWidth = computeGameWidth(this.scale.parentSize.width, this.scale.parentSize.height);
        const desiredHeight = computeStageHeight(this.scale.parentSize.width, this.scale.parentSize.height);
        if (desiredWidth !== this.logicalWidth() || desiredHeight !== this.logicalHeight()) {
            this.scale.setGameSize(desiredWidth * this.renderScale, desiredHeight * this.renderScale);
            this.scale.refresh();
        }
    }

    // 按当前画布尺寸重排背景与锚点；可安全重复调用
    private layout() {
        const width = this.logicalWidth();
        const height = this.logicalHeight();
        // 相机放大 renderScale 倍，可视区底部对齐玩法区（世界 y∈[0,640]），竖屏出血只加在天空一侧：
        // 世界坐标（物理/难度/碰撞）保持 360–960 × 640 不变
        this.cameras.main.setZoom(this.renderScale);
        this.cameras.main.centerOn(width / 2, GAME_HEIGHT - height / 2);
        this.sky.setPosition(width / 2, GAME_HEIGHT / 2);
        this.skyExtension.setPosition(width / 2, 0).setSize(width, Math.max(0, height - GAME_HEIGHT));
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
        if (!latest || latest.top.x < this.logicalWidth() - SPAWN_TRIGGER_FROM_RIGHT) this.spawnPair();

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
        const width = this.logicalWidth();
        // 竖屏出血时星光同步铺到扩展出的天空区（topEdge ≤0），保持整屏梦幻氛围
        const topEdge = GAME_HEIGHT - this.logicalHeight();
        for (let index = 0; index < SPARKLE_COUNT; index += 1) {
            const sparkle = this.add.image(Math.random() * width, topEdge + 30 + Math.random() * (510 - topEdge), 'fx-sparkle')
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
        const width = this.logicalWidth();
        const topEdge = GAME_HEIGHT - this.logicalHeight();
        this.sparkles.forEach((sparkle, index) => {
            // 视差介于中景（0.18x）与街面（1x）之间，另加缓慢上飘
            sparkle.x -= scrollSpeed * 0.3 * seconds;
            sparkle.y -= (5 + (index % 3) * 3) * seconds;
            if (sparkle.x < -16) {
                sparkle.x = width + 16;
                sparkle.y = topEdge + 30 + Math.random() * (510 - topEdge);
            }
            if (sparkle.y < topEdge - 16) {
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
        // 高清位图（216²）缩放到逻辑 72² 显示；碰撞圆在贴图坐标系定义，
        // Arcade Body 会随缩放同步收缩，世界坐标下半径仍是 collisionRadius（14），物理零改动
        this.player.setTexture(character.textureKey);
        this.player.setDisplaySize(CHARACTER_TEXTURE_SIZE, CHARACTER_TEXTURE_SIZE);
        this.playerBaseScale = this.player.scaleX;
        const textureRadius = character.collisionRadius * (CHARACTER_SPRITE_SIZE / CHARACTER_TEXTURE_SIZE);
        const offset = CHARACTER_SPRITE_SIZE / 2 - textureRadius;
        this.player.setCircle(textureRadius, offset, offset);
    }

    private startRun = (payload: { characterId: string; seed?: number }) => {
        this.time.removeAllEvents();
        this.clearWorld();
        this.phase = 'countdown';
        this.selectedCharacter = payload.characterId;
        this.random = createSeededRandom(payload.seed ?? Date.now());
        this.lastGapSkewSign = 0;
        this.pipeCount = 0;
        this.rewardCount = 0;
        this.lastVariantIndex = -1;
        // 连同待机浮动与上一局可能残留的挤压 tween 一起清掉，防止旧 tween 覆盖刚复位的基准 scale
        this.idleTween?.stop();
        this.tweens.killTweensOf(this.player);
        this.player.clearTint().setPosition(computePlayerX(this.logicalWidth()), 300).setAngle(0).setVelocity(0, 0);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);
        this.emitScore();

        this.showCountdown('3');
        const sequence = ['3', '2', '1', '开始'];
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
                        this.spawnPair(this.logicalWidth() + FIRST_PIPE_EXTRA);
                        EventBus.emit('game:phase', 'playing');
                    });
                }
            },
        });
    };

    private showCountdown(text: string, scale = 1) {
        this.countdownText?.destroy();
        this.countdownText = this.add.text(this.logicalWidth() / 2, COUNTDOWN_TEXT_Y, text, {
            // resolution 跟随渲染倍率：文字位图按 canvas 实际像素密度绘制，相机 zoom 后仍锐利
            fontFamily: 'Arial Black', fontSize: 66, color: '#fff6f9', stroke: '#d97a99', strokeThickness: 8, resolution: this.renderScale,
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
        // 连点保护：先终止上一发未结束的挤压 tween 并复位到等比基准 scale，再从基准做挤压。
        // 若以“挤压中”的当前 scale 为起点，新 tween 的起点与 yoyo 回归点都是已变形的值，
        // 连按会不断叠乘（scaleX ×1.1、scaleY ×0.9），角色越来越宽扁且不再复原。
        this.tweens.killTweensOf(this.player);
        this.player.setScale(this.playerBaseScale);
        this.tweens.add({
            targets: this.player,
            scaleX: this.playerBaseScale * 1.1,
            scaleY: this.playerBaseScale * 0.9,
            duration: 80,
            yoyo: true,
        });
    }

    private spawnPair(x = this.logicalWidth() + SPAWN_OFFSCREEN_X) {
        const { gap } = getDifficulty(this.currentScore());
        const topLimit = 108 + gap / 2;
        const bottomLimit = GAME_HEIGHT - 86 - gap / 2 - 108;
        // 不规则缺口：保持 gap 不变，但让 top/bottom 相对中心的偏移不再严格对称。
        const skewMax = Math.min(45, Math.floor(gap / 3));
        let gapSkew = (this.random() * 2 - 1) * skewMax;
        if (this.lastGapSkewSign !== 0 && this.random() < 0.45) {
            gapSkew = this.lastGapSkewSign * Math.abs(gapSkew);
        }
        this.lastGapSkewSign = gapSkew === 0 ? 0 : gapSkew > 0 ? 1 : -1;

        const centerBase = topLimit + this.random() * (bottomLimit - topLimit);
        const center = Phaser.Math.Clamp(centerBase, topLimit + gapSkew, bottomLimit + gapSkew);
        const obstacleHeight = 480;
        const variant = this.pickObstacleVariant();
        const topY = center - gap / 2 - gapSkew - obstacleHeight / 2;
        const bottomY = center + gap / 2 - gapSkew + obstacleHeight / 2;

        const top = this.createObstacle(x, topY, variant.topKey);
        const bottom = this.createObstacle(x, bottomY, variant.bottomKey);
        const pair: ObstaclePair = { top, bottom, scored: false };

        // 轻微粉彩粒子/光晕（色调跟随变体配色）：只增强视觉，不改碰撞与计分。
        const topEdgeY = topY + obstacleHeight / 2;
        const bottomEdgeY = bottomY - obstacleHeight / 2;
        this.spawnObstacleGlow(x, topEdgeY, true, variant);
        this.spawnObstacleGlow(x, bottomEdgeY, false, variant);

        if (shouldSpawnReward(this.random())) {
            const safeOffset = Math.min(42, gap / 2 - 30);
            // 奖励需要落在“缺口中线”附近；中线随 gapSkew 一起偏移。
            const rewardY = (center - gapSkew) + (this.random() * 2 - 1) * safeOffset;
            // 叉子与镜子两种奖励贴图交替出现（仅视觉差异，碰撞与计分一致）
            const rewardTexture = this.pairs.length % 2 === 0 ? 'reward' : 'reward-mirror';
            // 高清位图（144²）缩到逻辑 48² 显示；Arcade Body 随缩放同步收缩，世界坐标碰撞体仍是 48×48
            const reward = this.physics.add.image(x + 4, rewardY, rewardTexture).setDepth(7)
                .setDisplaySize(REWARD_TEXTURE_SIZE, REWARD_TEXTURE_SIZE);
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

    private spawnObstacleGlow(x: number, y: number, flip: boolean, variant: ObstacleVariant) {
        // 光晕色跟随变体粉彩配色（樱花粉 / 薰衣草 / 晴空蓝 / 蜜桃橘）
        const glowTints: Record<string, number> = { classic: 0xffb3e1, wish: 0xd9c8ff, rain: 0xbcd9ff, aim: 0xffd0b3 };
        const c0 = glowTints[variant.id] ?? 0xffb3e1;
        const c1 = 0xffffff;
        const dir = flip ? -1 : 1;

        // 外圈“光晕”
        const glow = this.add.circle(x + 3, y, 18, c0).setAlpha(0.14).setDepth(5);
        this.tweens.add({
            targets: glow,
            alpha: 0,
            scale: 1.15,
            duration: 520,
            onComplete: () => glow.destroy(),
        });

        // 小闪点（沿缺口边缘轻微发散）
        const count = 6;
        for (let i = 0; i < count; i += 1) {
            const t = i / count;
            const angle = (Math.PI * 2 * t) + (dir > 0 ? 0.2 : -0.2);
            const dot = this.add.circle(
                x + Math.cos(angle) * 10,
                y + Math.sin(angle) * 10,
                3,
                c1,
            ).setAlpha(0.55).setDepth(6);
            this.tweens.add({
                targets: dot,
                x: x + Math.cos(angle) * (22 + this.random() * 22),
                y: y + Math.sin(angle) * (16 + this.random() * 18),
                alpha: 0,
                scale: 0.1,
                duration: 520 + this.random() * 220,
                onComplete: () => dot.destroy(),
            });
        }
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
