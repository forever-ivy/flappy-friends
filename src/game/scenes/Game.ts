import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import {
    advanceEmojiTriggerState, calculateScore, computeGameWidth, computePlayerX, computeStageHeight,
    createEmojiTriggerState, createRunId, createSeededRandom, EASTER_EGG_143_DANMAKU_BURST,
    EASTER_EGG_143_DANMAKU_BURST_LITE, EASTER_EGG_143_DANMAKU_MESSAGES, EASTER_EGG_143_DANMAKU_MS,
    EASTER_EGG_143_DANMAKU_SPAWN_MS, EMOJI_FADE_MS, EMOJI_HOLD_MS,
    FIRST_PIPE_EXTRA, GAME_HEIGHT, GAME_WIDTH, getDifficulty, isOutOfBounds, pickRandomEmoji,
    pickRewardKind, resetEmojiTriggerAfterEmit, RunResult, shouldEmitPlayerEmoji, shouldTrigger143EasterEgg,
    shouldSpawnReward, SPAWN_OFFSCREEN_X, SPAWN_TRIGGER_FROM_RIGHT,
} from '../../domain/game';
import { BACKGROUNDS, BACKGROUND_SLIDE_FADE_MS, BACKGROUND_SLIDE_INTERVAL_MS, CHARACTER_SPRITE_SIZE, CHARACTER_TEXTURE_SIZE, getCharacter, getObstacleVariant, type ObstacleVariant, OBSTACLE_VARIANTS, REWARD_TEXTURE_SIZE } from '../assets';
import { getEffectQuality, getRenderScale } from '../renderScale';
import { playSfx } from '../sfx';
import { syncStageVars } from '../stageSync';
import { EventBus } from '../EventBus';

type GamePhase = 'idle' | 'countdown' | 'playing' | 'over';

interface EmojiFollower {
    container: Phaser.GameObjects.Container;
    offsetX: number;
    offsetY: number;
    floatY: number;
}

interface ObstaclePair {
    top: Phaser.Physics.Arcade.Image;
    bottom: Phaser.Physics.Arcade.Image;
    reward?: Phaser.Physics.Arcade.Image;
    scored: boolean;
}

const COUNTDOWN_TEXT_Y = 264;

// 漂浮星光（少女梦幻氛围）：白色星光贴图 tint 成粉彩色，缓慢向左上飘并闪烁。
// 移动端/弱机（lite 档）减量到 8 颗并去掉旋转 tween，降低每帧绘制与补间开销。
const SPARKLE_COUNT_FULL = 14;
const SPARKLE_COUNT_LITE = 8;
const SPARKLE_TINTS = [0xffffff, 0xfff0e0, 0xe8dff5, 0xdce8ff, 0xffe8d0];

export class Game extends Scene {
    private phase: GamePhase = 'idle';
    private selectedCharacter = 'snow';
    private player!: Phaser.Physics.Arcade.Sprite;
    private obstacles!: Phaser.Physics.Arcade.Group;
    private rewards!: Phaser.Physics.Arcade.Group;
    private pairs: ObstaclePair[] = [];
    private sky!: Phaser.GameObjects.Image;
    // 竖屏出血区（画布高 >640）用当前背景顶行同色矩形向上续接
    private skyExtension!: Phaser.GameObjects.Rectangle;
    private backgroundIndex = 0;
    private backgroundSlideTimer?: Phaser.Time.TimerEvent;
    private backgroundCrossfading = false;
    private backgroundFadeTween?: Phaser.Tweens.Tween;
    private idleTween?: Phaser.Tweens.Tween;
    private countdownText?: Phaser.GameObjects.Text;
    private pipeCount = 0;
    private rewardCount = 0;
    private startedAt = 0;
    private random = createSeededRandom(Date.now());
    private sparkles: Phaser.GameObjects.Image[] = [];
    // canvas 后备像素 = 逻辑尺寸 × renderScale；相机 setZoom(renderScale) 还原逻辑坐标系
    private renderScale = getRenderScale();
    // 移动端/弱机走 lite 特效档：星光减量、障碍缺口不放闪点粒子
    private effectsLite = getEffectQuality() === 'lite';
    // 当前已下发给柱子/奖励的横向速度：只在难度跳档时批量更新，不再每帧 setVelocityX
    private appliedSpeed = 0;
    // 角色等比基准 scale（setDisplaySize 72/216 后记录）：扑翼挤压动画必须从它出发并回到它
    private playerBaseScale = CHARACTER_TEXTURE_SIZE / CHARACTER_SPRITE_SIZE;
    private lastGapSkewSign = 0;
    private lastVariantIndex = -1;
    private emojiTrigger = createEmojiTriggerState(0.5);
    private emojiFollowers: EmojiFollower[] = [];
    private lastEmittedScore = 0;
    private easterEgg143Shown = false;
    private forceOne43Obstacle = false;
    private easterEgg143Text?: Phaser.GameObjects.Text;
    private invincibleRainUntil = 0;
    private danmakuRainTimer?: Phaser.Time.TimerEvent;
    private danmakuRainEndTimer?: Phaser.Time.TimerEvent;
    private danmakuRainSpawnIndex = 0;
    private flapKeyHandler = () => this.flap();
    private resizeHandler = () => {
        this.maybeApplyStageSize();
        this.layout();
    };

    constructor() {
        super('Game');
    }

    create() {
        this.sky = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUNDS[0].textureKey);
        this.skyExtension = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 0, BACKGROUNDS[0].topColor).setOrigin(0.5, 1);
        this.applyBackground(this.backgroundIndex);
        this.scheduleBackgroundSlideshow();
        this.createAmbientSparkles();
        this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
        this.rewards = this.physics.add.group({ allowGravity: false, immovable: true });

        this.player = this.physics.add.sprite(computePlayerX(this.logicalWidth()), 300, getCharacter(this.selectedCharacter).textureKey).setDepth(10);
        this.player.setCollideWorldBounds(false);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);

        this.physics.add.overlap(this.player, this.obstacles, () => this.finishRun());
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
            this.backgroundSlideTimer?.remove(false);
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
        if (this.countdownText?.active) this.countdownText.setPosition(width / 2, COUNTDOWN_TEXT_Y);
        if (this.easterEgg143Text?.active) this.easterEgg143Text.setX(width / 2);
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
        this.driftSparkles(scrollSpeed, seconds);

        if (this.phase !== 'playing') return;
        // 速度只在难度跳档时批量下发（旧实现每帧对全部柱子/奖励 setVelocityX）
        if (scrollSpeed !== this.appliedSpeed) this.applyScrollSpeed(scrollSpeed);
        this.emojiTrigger = advanceEmojiTriggerState(this.emojiTrigger, delta);
        this.syncEmojiFollowers();
        if (shouldEmitPlayerEmoji(this.emojiTrigger, this.emojiFollowers.length)) {
            this.emitPlayerEmoji();
            this.emojiTrigger = resetEmojiTriggerAfterEmit(this.emojiTrigger, this.random());
        }

        // 计分 + 出屏销毁用单次就地压缩遍历完成：热路径零数组/闭包分配
        let write = 0;
        for (let read = 0; read < this.pairs.length; read += 1) {
            const pair = this.pairs[read];
            if (!pair.scored && pair.top.x + pair.top.displayWidth / 2 < this.player.x) {
                pair.scored = true;
                this.pipeCount += 1;
                this.emojiTrigger = { ...this.emojiTrigger, pipesSinceLast: this.emojiTrigger.pipesSinceLast + 1 };
                playSfx('score');
                this.emitScore();
            }
            if (pair.top.x < -70) {
                pair.top.destroy();
                pair.bottom.destroy();
                pair.reward?.destroy();
            } else {
                this.pairs[write] = pair;
                write += 1;
            }
        }
        this.pairs.length = write;

        const latest = this.pairs[this.pairs.length - 1];
        if (!latest || latest.top.x < this.logicalWidth() - SPAWN_TRIGGER_FROM_RIGHT) this.spawnPair();

        this.player.setAngle(Phaser.Math.Clamp((this.player.body?.velocity.y ?? 0) * 0.08, -22, 72));
        if (this.isInvincible()) {
            this.clampInvinciblePlayer();
        } else if (isOutOfBounds(this.player.y)) {
            this.finishRun();
        }
    }

    private isInvincible(): boolean {
        return this.invincibleRainUntil > 0 && this.time.now < this.invincibleRainUntil;
    }

    /** 无敌时穿过柱子，但不能飞出杀线，否则计时一结束会立刻死亡 */
    private clampInvinciblePlayer() {
        const body = this.playerBody();
        if (this.player.y < 48) {
            this.player.setY(48);
            if (body.velocity.y < 0) body.setVelocityY(0);
        } else if (this.player.y > GAME_HEIGHT - 56) {
            this.player.setY(GAME_HEIGHT - 56);
            if (body.velocity.y > 0) body.setVelocityY(-260);
        }
    }

    // 把当前难度速度一次性下发给场上全部柱子与未收集奖励；新生成的对在 spawnPair 里单独赋速
    private applyScrollSpeed(speed: number) {
        this.appliedSpeed = speed;
        for (const pair of this.pairs) {
            pair.top.setVelocityX(-speed);
            pair.bottom.setVelocityX(-speed);
            if (pair.reward?.active && pair.reward.body) pair.reward.setVelocityX(-speed);
        }
    }

    // 星光只做氛围装饰：用 Math.random 布点与闪烁，不消耗对局的种子随机序列
    private createAmbientSparkles() {
        const width = this.logicalWidth();
        // 竖屏出血时星光同步铺到扩展出的天空区（topEdge ≤0），保持整屏梦幻氛围
        const topEdge = GAME_HEIGHT - this.logicalHeight();
        const count = this.effectsLite ? SPARKLE_COUNT_LITE : SPARKLE_COUNT_FULL;
        for (let index = 0; index < count; index += 1) {
            const sparkle = this.add.image(Math.random() * width, topEdge + 30 + Math.random() * (510 - topEdge), 'fx-sparkle')
                .setDepth(4)
                .setScale(0.45 + Math.random() * 0.65)
                .setAlpha(0.15)
                .setTint(SPARKLE_TINTS[index % SPARKLE_TINTS.length]);
            this.tweens.add({
                targets: sparkle,
                alpha: { from: 0.12, to: 0.85 },
                // lite 档只做透明度呼吸，省掉旋转带来的逐帧变换更新
                ...(this.effectsLite ? {} : { angle: { from: -14, to: 14 } }),
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
        for (let index = 0; index < this.sparkles.length; index += 1) {
            const sparkle = this.sparkles[index];
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
        }
    }

    private applyBackground(index: number) {
        const frame = BACKGROUNDS[index % BACKGROUNDS.length];
        this.backgroundIndex = index % BACKGROUNDS.length;
        this.sky.setTexture(frame.textureKey).setAlpha(1).setScale(1);
        this.skyExtension.setFillStyle(frame.topColor);
    }

    private lerpColor(from: number, to: number, t: number): number {
        const fr = (from >> 16) & 0xff;
        const fg = (from >> 8) & 0xff;
        const fb = from & 0xff;
        const tr = (to >> 16) & 0xff;
        const tg = (to >> 8) & 0xff;
        const tb = to & 0xff;
        const r = Math.round(fr + (tr - fr) * t);
        const g = Math.round(fg + (tg - fg) * t);
        const b = Math.round(fb + (tb - fb) * t);
        return (r << 16) | (g << 8) | b;
    }

    private scheduleBackgroundSlideshow() {
        this.backgroundSlideTimer?.remove(false);
        this.backgroundSlideTimer = this.time.addEvent({
            delay: BACKGROUND_SLIDE_INTERVAL_MS,
            loop: true,
            callback: () => this.cycleBackground(),
        });
    }

    private cycleBackground() {
        if (this.backgroundCrossfading) return;
        const current = BACKGROUNDS[this.backgroundIndex];
        const nextIndex = (this.backgroundIndex + 1) % BACKGROUNDS.length;
        const next = BACKGROUNDS[nextIndex];
        const width = this.logicalWidth();
        const incoming = this.add.image(width / 2, GAME_HEIGHT / 2, next.textureKey)
            .setDepth(0)
            .setAlpha(0)
            .setScale(1.028);
        this.backgroundCrossfading = true;
        this.backgroundFadeTween?.stop();
        const fade = { progress: 0 };
        this.backgroundFadeTween = this.tweens.add({
            targets: fade,
            progress: 1,
            duration: BACKGROUND_SLIDE_FADE_MS,
            ease: 'Cubic.easeInOut',
            onUpdate: () => {
                const p = fade.progress;
                const eased = Phaser.Math.Easing.Cubic.InOut(p);
                incoming.setAlpha(eased).setScale(1.028 - eased * 0.028);
                this.sky.setAlpha(1 - eased).setScale(1 - eased * 0.022);
                this.skyExtension.setFillStyle(this.lerpColor(current.topColor, next.topColor, eased));
            },
            onComplete: () => {
                this.applyBackground(nextIndex);
                incoming.destroy();
                this.backgroundCrossfading = false;
                this.backgroundFadeTween = undefined;
            },
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

    private startRun = (payload: { characterId: string; seed?: number; countdownSequence?: readonly string[] }) => {
        if (this.phase === 'countdown' || this.phase === 'playing') return;
        this.time.removeAllEvents();
        this.scheduleBackgroundSlideshow();
        this.clearWorld();
        this.phase = 'countdown';
        this.selectedCharacter = payload.characterId;
        this.random = createSeededRandom(payload.seed ?? Date.now());
        this.lastGapSkewSign = 0;
        this.lastVariantIndex = -1;
        this.pipeCount = 0;
        this.rewardCount = 0;
        this.emojiTrigger = createEmojiTriggerState(this.random());
        this.clearEmojiFollowers();
        this.lastEmittedScore = 0;
        this.easterEgg143Shown = false;
        this.forceOne43Obstacle = false;
        this.clearEasterEgg143Text();
        this.stop143DanmakuRain();
        // 清零已下发速度：开局第一帧会按当前难度重新批量下发
        this.appliedSpeed = 0;
        // 连同待机浮动与上一局可能残留的挤压 tween 一起清掉，防止旧 tween 覆盖刚复位的基准 scale
        this.idleTween?.stop();
        this.tweens.killTweensOf(this.player);
        this.player.clearTint().setPosition(computePlayerX(this.logicalWidth()), 300).setAngle(0).setVelocity(0, 0);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);
        this.emitScore();

        this.showCountdown('3');
        const sequence = payload.countdownSequence ?? ['3', '2', '1', 'GO!'];
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
        EventBus.emit('game:flap');
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
        const { gap, speed } = getDifficulty(this.currentScore());
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
        // 速度在生成时赋值（update 只在难度跳档时批量更新，不再每帧下发）
        top.setVelocityX(-speed);
        bottom.setVelocityX(-speed);
        const pair: ObstaclePair = { top, bottom, scored: false };

        // 轻微粉彩粒子/光晕（樱花粉）：只增强视觉，不改碰撞与计分。
        const topEdgeY = topY + obstacleHeight / 2;
        const bottomEdgeY = bottomY - obstacleHeight / 2;
        this.spawnObstacleGlow(x, topEdgeY, true);
        this.spawnObstacleGlow(x, bottomEdgeY, false);

        if (shouldSpawnReward(this.random())) {
            const safeOffset = Math.min(42, gap / 2 - 30);
            // 奖励需要落在“缺口中线”附近；中线随 gapSkew 一起偏移。
            const rewardY = (center - gapSkew) + (this.random() * 2 - 1) * safeOffset;
            // 两种奖励概率不同：主奖励蝴蝶结叉子 70%，稀有款蝴蝶结镜子 30%
            // （见 domain/game.ts 的 pickRewardKind；仅贴图差异，碰撞与计分一致）
            const rewardTexture = pickRewardKind(this.random()) === 'mirror' ? 'reward-mirror' : 'reward';
            // 高清位图（144²）缩到逻辑 48² 显示；Arcade Body 随缩放同步收缩，世界坐标碰撞体仍是 48×48
            const reward = this.physics.add.image(x + 4, rewardY, rewardTexture).setDepth(7)
                .setDisplaySize(REWARD_TEXTURE_SIZE, REWARD_TEXTURE_SIZE);
            reward.body!.allowGravity = false;
            reward.setData('collected', false);
            this.rewards.add(reward);
            reward.setVelocityX(-speed);
            this.tweens.add({ targets: reward, angle: 360, duration: 2400, repeat: -1 });
            pair.reward = reward;
        }
        this.pairs.push(pair);
    }

    // 十套标语按对局种子随机轮换；相邻两对不重复。143 彩蛋会强制下一对为 one43。
    private pickObstacleVariant(): ObstacleVariant {
        if (this.forceOne43Obstacle) {
            this.forceOne43Obstacle = false;
            const forced = getObstacleVariant('one43') ?? OBSTACLE_VARIANTS[1];
            this.lastVariantIndex = OBSTACLE_VARIANTS.findIndex((variant) => variant.id === forced.id);
            return forced;
        }
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

    private spawnObstacleGlow(x: number, y: number, flip: boolean) {
        // 光晕固定樱花粉，与统一的粉色柱身呼应
        const c0 = 0xffb3e1;
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

        // 小闪点（沿缺口边缘轻微发散）：lite 档跳过——每对柱子省 12 个临时
        // GameObject + tween 的创建/销毁，只保留一圈柔光维持观感
        const count = this.effectsLite ? 0 : 6;
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

    private syncEmojiFollowers() {
        for (let index = this.emojiFollowers.length - 1; index >= 0; index -= 1) {
            const follower = this.emojiFollowers[index];
            if (!follower.container.active) {
                this.emojiFollowers.splice(index, 1);
                continue;
            }
            follower.container.setPosition(
                this.player.x + follower.offsetX,
                this.player.y + follower.offsetY + follower.floatY,
            );
        }
    }

    private clearEmojiFollowers() {
        for (const follower of this.emojiFollowers) follower.container.destroy();
        this.emojiFollowers = [];
    }

    private emitPlayerEmoji() {
        const emoji = pickRandomEmoji(this.random());
        const offsetX = 14 + this.random() * 18;
        const offsetY = -22 - this.random() * 14;
        const fontSize = 22 + Math.floor(this.random() * 8);
        const follower: EmojiFollower = {
            container: this.add.container(this.player.x + offsetX, this.player.y + offsetY).setDepth(15).setAlpha(0),
            offsetX,
            offsetY,
            floatY: 0,
        };
        const bubble = this.add.text(0, 0, emoji, {
            fontFamily: 'Arial, Apple Color Emoji, Segoe UI Emoji, sans-serif',
            fontSize: `${fontSize}px`,
            resolution: this.renderScale,
        }).setOrigin(0.5).setScale(0.82);
        follower.container.add(bubble);
        this.emojiFollowers.push(follower);

        this.tweens.add({
            targets: follower.container,
            alpha: 1,
            duration: 180,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: bubble,
                    scale: 1,
                    duration: 120,
                    ease: 'Back.easeOut',
                });
                this.time.delayedCall(EMOJI_HOLD_MS, () => {
                    if (!follower.container.active) return;
                    this.tweens.add({
                        targets: follower,
                        floatY: -24 - this.random() * 12,
                        duration: EMOJI_FADE_MS,
                        ease: 'Sine.easeOut',
                    });
                    this.tweens.add({
                        targets: follower.container,
                        alpha: 0,
                        duration: EMOJI_FADE_MS,
                        ease: 'Cubic.easeIn',
                        onComplete: () => {
                            follower.container.destroy();
                            const slot = this.emojiFollowers.indexOf(follower);
                            if (slot >= 0) this.emojiFollowers.splice(slot, 1);
                        },
                    });
                });
            },
        });
    }

    private spawnSpark(x: number, y: number) {
        for (let index = 0; index < 8; index += 1) {
            const angle = (Math.PI * 2 * index) / 8;
            const dot = this.add.circle(x, y, 3, index % 2 ? 0xe8dff5 : 0xc9b0e0).setDepth(20);
            this.tweens.add({
                targets: dot, x: x + Math.cos(angle) * 34, y: y + Math.sin(angle) * 34,
                alpha: 0, scale: 0.2, duration: 420, onComplete: () => dot.destroy(),
            });
        }
    }

    private finishRun() {
        if (this.phase !== 'playing' || this.isInvincible()) return;
        this.phase = 'over';
        playSfx('hit');
        this.playerBody().setAllowGravity(false);
        this.player.setVelocity(0, 0).setTint(0xff97a6);
        this.applyScrollSpeed(0);
        // createRunId 在非安全上下文（http://IP）下也可用：直接用 crypto.randomUUID 会抛
        // TypeError，导致 game:over 发不出去、死亡后卡死在对局画面（线上手机端事故根因）
        const result: RunResult = {
            clientRunId: createRunId(), characterId: this.selectedCharacter,
            pipeCount: this.pipeCount, rewardCount: this.rewardCount, totalScore: this.currentScore(),
            durationMs: Math.max(0, Date.now() - this.startedAt), createdAt: new Date().toISOString(),
        };
        EventBus.emit('game:over', result);
    }

    private emitScore() {
        const previous = this.lastEmittedScore;
        const total = this.currentScore();
        this.lastEmittedScore = total;
        EventBus.emit('score:changed', { total, pipeCount: this.pipeCount, rewardCount: this.rewardCount });
        if (shouldTrigger143EasterEgg(previous, total, this.easterEgg143Shown)) {
            this.trigger143EasterEgg();
        }
    }

    private trigger143EasterEgg() {
        this.easterEgg143Shown = true;
        this.forceOne43Obstacle = true;
        playSfx('easter143');
        this.show143Celebration();
        this.spawnSpark(this.player.x, this.player.y - 8);
    }

    private show143Celebration() {
        this.clearEasterEgg143Text();
        const centerY = GAME_HEIGHT * 0.42;
        this.easterEgg143Text = this.add.text(this.logicalWidth() / 2, centerY, '143 ♡', {
            fontFamily: 'Arial Black',
            fontSize: 78,
            color: '#fff6f9',
            stroke: '#e87898',
            strokeThickness: 10,
            resolution: this.renderScale,
        }).setOrigin(0.5).setDepth(35).setAlpha(0).setScale(0.72);

        this.tweens.add({
            targets: this.easterEgg143Text,
            alpha: 1,
            scale: 1.08,
            duration: 320,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.start143DanmakuRain();
                this.time.delayedCall(1200, () => {
                    if (!this.easterEgg143Text?.active) return;
                    this.tweens.add({
                        targets: this.easterEgg143Text,
                        alpha: 0,
                        scale: 1.2,
                        y: centerY - 28,
                        duration: 680,
                        ease: 'Cubic.easeIn',
                        onComplete: () => this.clearEasterEgg143Text(),
                    });
                });
            },
        });
    }

    private clearEasterEgg143Text() {
        this.easterEgg143Text?.destroy();
        this.easterEgg143Text = undefined;
    }

    private start143DanmakuRain() {
        this.stop143DanmakuRain(false);
        this.invincibleRainUntil = this.time.now + EASTER_EGG_143_DANMAKU_MS;
        this.player.setTint(0xffd0e4);
        this.danmakuRainSpawnIndex = 0;
        const spawnMs = this.effectsLite ? 140 : EASTER_EGG_143_DANMAKU_SPAWN_MS;
        this.spawn143DanmakuBurst();
        this.danmakuRainTimer = this.time.addEvent({
            delay: spawnMs,
            loop: true,
            callback: () => this.spawn143DanmakuBurst(),
        });
        this.danmakuRainEndTimer = this.time.delayedCall(EASTER_EGG_143_DANMAKU_MS, () => this.stop143DanmakuRain());
    }

    private spawn143DanmakuBurst() {
        if (!(this.invincibleRainUntil > 0 && this.time.now < this.invincibleRainUntil)) return;
        const burst = this.effectsLite ? EASTER_EGG_143_DANMAKU_BURST_LITE : EASTER_EGG_143_DANMAKU_BURST;
        for (let lane = 0; lane < burst; lane += 1) this.spawn143DanmakuBullet(lane, burst);
    }

    private spawn143DanmakuBullet(lane: number, burst: number) {
        const index = this.danmakuRainSpawnIndex;
        this.danmakuRainSpawnIndex += 1;
        const message = EASTER_EGG_143_DANMAKU_MESSAGES[index % EASTER_EGG_143_DANMAKU_MESSAGES.length];
        const width = this.logicalWidth();
        const top = GAME_HEIGHT - this.logicalHeight() + 10;
        const bottom = GAME_HEIGHT - 10;
        const span = Math.max(56, bottom - top);
        const laneY = top + ((lane + 0.5) / burst) * span;
        const jitter = (this.random() - 0.5) * (span / burst) * 0.85;
        const y = Phaser.Math.Clamp(laneY + jitter, top, bottom);
        const fontSize = 15 + Math.floor(this.random() * 10);
        const speed = 130 + this.random() * 130;
        const startX = width + 36 + lane * 22 + this.random() * 48;
        const travelMs = ((startX + 160) / speed) * 1000;
        const label = this.add.text(startX, y, message, {
            fontFamily: 'Arial, Apple Color Emoji, Segoe UI Emoji, sans-serif',
            fontSize: `${fontSize}px`,
            color: '#d9598a',
            backgroundColor: '#fff9fccc',
            padding: { x: 10, y: 4 },
            resolution: this.renderScale,
        }).setDepth(24).setAlpha(0.92 + this.random() * 0.06);

        this.tweens.add({
            targets: label,
            x: -180,
            duration: travelMs,
            ease: 'Linear',
            onComplete: () => label.destroy(),
        });
    }

    private stop143DanmakuRain(clearTint = true) {
        this.invincibleRainUntil = 0;
        this.danmakuRainTimer?.remove(false);
        this.danmakuRainTimer = undefined;
        this.danmakuRainEndTimer?.remove(false);
        this.danmakuRainEndTimer = undefined;
        if (clearTint && this.player?.active) this.player.clearTint();
    }

    private playerBody(): Phaser.Physics.Arcade.Body {
        return this.player.body as Phaser.Physics.Arcade.Body;
    }

    private currentScore() {
        return calculateScore(this.pipeCount, this.rewardCount);
    }

    private clearWorld() {
        this.clearEmojiFollowers();
        this.clearEasterEgg143Text();
        this.stop143DanmakuRain();
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
