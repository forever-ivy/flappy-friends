// React 组件、HTML 与 Phaser 场景之间的事件总线。
// 故意不 import phaser：本文件处于首屏关键链路（App.tsx 静态引用），一旦依赖 phaser
// 会把整个引擎包提前拉进主 chunk，落地页的惰性加载就失效了。
// 语义对齐 Phaser.Events.EventEmitter：on/off 支持可选 context，
// removeListener(event) 不带 handler 时移除该事件的全部监听。
type Handler = (payload?: any) => void;

interface Registration {
    handler: Handler;
    context?: unknown;
}

class EventBusImpl {
    private listeners = new Map<string, Registration[]>();

    constructor() {
        // 非 DOM 环境（测试/SSR）直接跳过
        if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return;
        const dispatch = window.dispatchEvent.bind(window);
        const CustomEventCtor = window.CustomEvent;
        this.afterEmit = (event, payload) => {
            // 同步镜像到 window 事件：index.html 里的非 React 静态层（如玩法说明入口）
            // 由此感知游戏状态，无需暴露总线实例或引入模块依赖。
            dispatch(new CustomEventCtor(`hyunlix:${event}`, { detail: payload }));
        };
    }

    private afterEmit?: (event: string, payload?: unknown) => void;

    on(event: string, handler: Handler, context?: unknown): void {
        const list = this.listeners.get(event) ?? [];
        if (!list.some((l) => l.handler === handler && l.context === context)) {
            list.push({ handler, context });
        }
        this.listeners.set(event, list);
    }

    off(event: string, handler?: Handler, context?: unknown): void {
        if (handler === undefined) {
            this.listeners.delete(event);
            return;
        }
        const list = this.listeners.get(event);
        if (!list) return;
        const next = list.filter(
            (l) => !(l.handler === handler && (context === undefined || l.context === context)),
        );
        if (next.length) this.listeners.set(event, next);
        else this.listeners.delete(event);
    }

    removeListener(event: string, handler?: Handler, context?: unknown): void {
        this.off(event, handler, context);
    }

    emit(event: string, payload?: unknown): void {
        const list = this.listeners.get(event);
        if (list?.length) {
            // 快照迭代：回调里 off 自己不会跳过后续监听
            for (const { handler, context } of [...list]) {
                handler.call(context, payload);
            }
        }
        this.afterEmit?.(event, payload);
    }
}

export const EventBus = new EventBusImpl();
