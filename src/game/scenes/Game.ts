import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { calculateScore, createSeededRandom, GAME_HEIGHT, GAME_WIDTH, getDifficulty, isOutOfBounds, RunResult, shouldSpawnReward } from '../../domain/game';
import { CHARACTER_TEXTURE_SIZE, getCharacter } from '../assets';
import { playSfx } from '../sfx';
import { EventBus } from '../EventBus';

type GamePhase = 'idle' | 'countdown' | 'playing' | 'over';

interface ObstaclePair {
    top: Phaser.Physics.Arcade.Image;
    bottom: Phaser.Physics.Arcade.Image;
    reward?: Phaser.Physics.Arcade.Image;
    scored: boolean;
}

export class Game extends Scene {
    private phase: GamePhase = 'idle';
    private selectedCharacter = 'nova';
    private player!: Phaser.Physics.Arcade.Sprite;
    private obstacles!: Phaser.Physics.Arcade.Group;
    private rewards!: Phaser.Physics.Arcade.Group;
    private pairs: ObstaclePair[] = [];
    private city!: Phaser.GameObjects.TileSprite;
    private street!: Phaser.GameObjects.TileSprite;
    private idleTween?: Phaser.Tweens.Tween;
    private pipeCount = 0;
    private rewardCount = 0;
    private startedAt = 0;
    private random = createSeededRandom(Date.now());

    constructor() {
        super('Game');
    }

    create() {
        this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background-sky');
        this.city = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'background-city');
        this.street = this.add.tileSprite(GAME_WIDTH / 2, 565, GAME_WIDTH, 180, 'background-street').setDepth(2);
        this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
        this.rewards = this.physics.add.group({ allowGravity: false, immovable: true });

        this.player = this.physics.add.sprite(88, 300, getCharacter(this.selectedCharacter).textureKey).setDepth(10);
        this.player.setCollideWorldBounds(false);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);

        this.physics.add.collider(this.player, this.obstacles, () => this.finishRun());
        this.physics.add.overlap(this.player, this.rewards, (_player, reward) => this.collectReward(reward as Phaser.Physics.Arcade.Image));
        this.input.on('pointerdown', () => this.flap());
        this.input.keyboard?.on('keydown-SPACE', () => this.flap());
        EventBus.on('game:start', this.startRun, this);
        EventBus.on('character:selected', this.selectCharacter, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            EventBus.off('game:start', this.startRun, this);
            EventBus.off('character:selected', this.selectCharacter, this);
        });

        this.startIdleTween();
        EventBus.emit('game:ready');
        EventBus.emit('current-scene-ready', this);
    }

    update(_time: number, delta: number) {
        const seconds = delta / 1000;
        const scrollSpeed = this.phase === 'playing' ? getDifficulty(this.currentScore()).speed : 22;
        this.city.tilePositionX += scrollSpeed * 0.18 * seconds;
        this.street.tilePositionX += scrollSpeed * seconds;

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
        if (!latest || latest.top.x < 180) this.spawnPair();

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
        this.player.clearTint().setPosition(88, 300).setAngle(0).setVelocity(0, 0);
        this.applyCharacterBody(this.selectedCharacter);
        this.playerBody().setAllowGravity(false);
        this.idleTween?.stop();
        this.emitScore();

        const countdownStyle = {
            fontFamily: 'Arial Black', fontSize: 66, color: '#f7f1df', stroke: '#142436', strokeThickness: 8,
        };
        let countdown = this.add.text(180, 264, '3', countdownStyle).setOrigin(0.5).setDepth(30);
        const sequence = ['3', '2', '1', 'GO'];
        let index = 0;
        this.time.addEvent({
            delay: 620,
            repeat: sequence.length - 1,
            callback: () => {
                index += 1;
                const nextText = sequence[index] ?? '';
                countdown.destroy();
                countdown = this.add.text(180, 264, nextText, countdownStyle).setOrigin(0.5).setDepth(30).setScale(1.2);
                this.tweens.add({ targets: countdown, scale: 1, alpha: 0.86, duration: 260 });
                if (index === sequence.length - 1) {
                    this.time.delayedCall(360, () => {
                        countdown.destroy();
                        this.phase = 'playing';
                        this.startedAt = Date.now();
                        this.playerBody().setAllowGravity(true);
                        this.spawnPair(480);
                        EventBus.emit('game:phase', 'playing');
                    });
                }
            },
        });
    };

    private flap() {
        if (this.phase !== 'playing') return;
        playSfx('flap');
        this.player.setVelocityY(-330);
        this.tweens.add({ targets: this.player, scaleX: 1.1, scaleY: 0.9, duration: 80, yoyo: true });
    }

    private spawnPair(x = 420) {
        const { gap } = getDifficulty(this.currentScore());
        const topLimit = 108 + gap / 2;
        const bottomLimit = GAME_HEIGHT - 86 - gap / 2 - 108;
        const center = topLimit + this.random() * (bottomLimit - topLimit);
        const obstacleHeight = 480;
        const top = this.createObstacle(x, center - gap / 2 - obstacleHeight / 2, true);
        const bottom = this.createObstacle(x, center + gap / 2 + obstacleHeight / 2, false);
        const pair: ObstaclePair = { top, bottom, scored: false };

        if (shouldSpawnReward(this.random())) {
            const safeOffset = Math.min(42, gap / 2 - 30);
            const rewardY = center + (this.random() * 2 - 1) * safeOffset;
            const reward = this.physics.add.image(x + 4, rewardY, 'reward').setDepth(7);
            reward.body!.allowGravity = false;
            reward.setData('collected', false);
            this.rewards.add(reward);
            this.tweens.add({ targets: reward, angle: 360, duration: 2400, repeat: -1 });
            pair.reward = reward;
        }
        this.pairs.push(pair);
    }

    private createObstacle(x: number, y: number, flip: boolean): Phaser.Physics.Arcade.Image {
        const obstacle = this.physics.add.image(x, y, 'obstacle').setDepth(6);
        obstacle.setFlipY(flip).setImmovable(true);
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
            const dot = this.add.circle(x, y, 3, index % 2 ? 0xffc857 : 0xff5a73).setDepth(20);
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
        this.player.setVelocity(0, 0).setTint(0xffd3d8);
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
