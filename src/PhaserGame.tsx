import { forwardRef, useEffect, useRef } from 'react';
import type { Game as PhaserGameType, Scene as PhaserSceneType } from 'phaser';
import { EventBus } from './game/EventBus';

export interface IRefPhaserGame
{
    game: PhaserGameType | null;
    scene: PhaserSceneType | null;
}

interface IProps
{
    currentActiveScene?: (scene_instance: PhaserSceneType) => void
}

// phaser 主包 1.35MB（gzip ~349KB），原先随落地页同步加载执行，是移动端 TBT 的主要来源。
// 改为首次用户交互（pointerdown/keydown）时才动态 import 引擎：落地页本身是纯 DOM/CSS
// （天空渐变、云朵、弹幕都在 DOM 层），不依赖 canvas；就绪前的点击由 App 的
// wantsPlay → game:ready 握手在场景 create 后补发（见 App.tsx onReady），不丢操作。
// 不用空闲定时器预启动：空闲启动只是把长任务挪出 FCP，仍落在 TTI 测量窗口里，
// 且晚启动的 canvas 会成为新的 LCP 元素，实测分数反而更差。
const BOOT_RETRY_DELAY_MS = 4000;
const BOOT_MAX_ATTEMPTS = 3;

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref)
{
    const game = useRef<PhaserGameType | null>(null);

    useEffect(() =>
    {
        let cancelled = false;
        let booting = false;

        const boot = async (attempt = 0): Promise<void> =>
        {
            if (booting || cancelled) return;
            booting = true;
            try
            {
                const startGame = (await import('./game/main')).default;
                if (cancelled) return;
                game.current = startGame('game-container');

                if (typeof ref === 'function')
                {
                    ref({ game: game.current, scene: null });
                } else if (ref)
                {
                    ref.current = { game: game.current, scene: null };
                }
            }
            catch
            {
                // 弱网下 chunk 拉取失败：退避重试，与 Preloader 的资源重试节奏一致；
                // 重试耗尽则点亮 index.html 的 boot-error 兜底 UI（旧行为：模块加载失败必提示）
                booting = false;
                if (cancelled || attempt + 1 >= BOOT_MAX_ATTEMPTS) return;
                if (attempt + 2 >= BOOT_MAX_ATTEMPTS)
                {
                    window.dispatchEvent(new ErrorEvent('error', { error: new Error('game chunk load failed') }));
                    return;
                }
                window.setTimeout(() =>
                {
                    if (!cancelled) boot(attempt + 1);
                }, BOOT_RETRY_DELAY_MS);
            }
        };

        const bootOnIntent = () => boot();
        // click 兜底：程序化 click() 与部分无障碍路径只派发 click，不产生 pointerdown
        const options = { once: true, capture: true } as AddEventListenerOptions;
        window.addEventListener('pointerdown', bootOnIntent, options);
        window.addEventListener('keydown', bootOnIntent, options);
        window.addEventListener('click', bootOnIntent, options);

        return () =>
        {
            cancelled = true;
            window.removeEventListener('pointerdown', bootOnIntent, { capture: true });
            window.removeEventListener('keydown', bootOnIntent, { capture: true });
            window.removeEventListener('click', bootOnIntent, { capture: true });
            if (game.current)
            {
                game.current.destroy(true);
                game.current = null;
            }
        };
    }, [ref]);

    useEffect(() =>
    {
        EventBus.on('current-scene-ready', (scene_instance: PhaserSceneType) =>
        {
            if (currentActiveScene && typeof currentActiveScene === 'function')
            {

                currentActiveScene(scene_instance);

            }

            if (typeof ref === 'function')
            {
                ref({ game: game.current, scene: scene_instance });
            } else if (ref)
            {
                ref.current = { game: game.current, scene: scene_instance };
            }

        });
        return () =>
        {
            EventBus.removeListener('current-scene-ready');
        }
    }, [currentActiveScene, ref]);

    return (
        <div id="game-container"></div>
    );

});
