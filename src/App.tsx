import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CircleUserRound, Cloud, Flower, Heart, Home, LogIn, LogOut, MessageCircle, Play, Ribbon, RotateCcw, Send, Sparkles, Star, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { PhaserGame } from './PhaserGame';
import { RunResult } from './domain/game';
import { CHARACTERS, GAME_TITLE, getCharacter } from './game/assets';
import { getCharacterCopy, getCountdownSequence, LOCALE_OPTIONS, type Locale, useI18n } from './i18n';
import { initBgm } from './game/bgm';
import { EventBus } from './game/EventBus';
import { getEffectQuality } from './game/renderScale';
import { isSfxMuted, setSfxMuted } from './game/sfx';
import { currentPlayer, DanmakuMessage, enter, getDanmaku, getLeaderboard, LeaderboardResponse, onAuthChange, PasswordMismatchError, PlayerProfile, postDanmaku, signOut, syncRuns, updateCharacter } from './services/api';
import { normalizeUsername, PASSWORD_MAX, USERNAME_MAX, validateCredentials } from './services/authRules';
import { buildPool, bulletStyle, BulletStyle, MESSAGE_MAX, NICKNAME_MAX, normalizeMessage } from './services/danmaku';
import { loadProgress, Progress, recordRun, removeSyncedRuns, saveProgress, selectCharacter } from './state/progress';

type Screen = 'menu' | 'playing' | 'gameover';
type Overlay = 'none' | 'auth' | 'leaderboard' | 'note';

// 发出去的留言立刻作为一发弹幕飘起来；nonce 区分同文本的多次发送
interface DanmakuBurst {
    text: string;
    author: string;
    nonce: number;
}

function TitleLetters({ word, className }: { word: string; className: string }) {
    return (
        <span className={`title-name ${className}`}>
            {word.split('').map((ch, index) => (
                <span key={`${className}-${index}`} className="title-letter" style={{ '--i': index } as React.CSSProperties}>
                    {ch}
                </span>
            ))}
        </span>
    );
}

interface ScoreState {
    total: number;
    pipeCount: number;
    rewardCount: number;
}

const initialScore: ScoreState = { total: 0, pipeCount: 0, rewardCount: 0 };

function App() {
    const { locale, setLocale, t } = useI18n();
    const [screen, setScreen] = useState<Screen>('menu');
    const [overlay, setOverlay] = useState<Overlay>('none');
    const [progress, setProgress] = useState<Progress>(() => loadProgress());
    const [player, setPlayer] = useState<PlayerProfile | null>(() => currentPlayer());
    const [score, setScore] = useState<ScoreState>(initialScore);
    const [lastRun, setLastRun] = useState<RunResult | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [muted, setMuted] = useState(() => isSfxMuted());
    // 弹幕留言板：菜单时拉取最近留言；发送成功后 burst 让新留言立刻飘出
    const [messages, setMessages] = useState<DanmakuMessage[]>([]);
    const [burst, setBurst] = useState<DanmakuBurst | null>(null);
    const selected = useMemo(() => getCharacter(progress.selectedCharacter), [progress.selectedCharacter]);
    const wantsPlayRef = useRef(false);
    const progressRef = useRef(progress);
    const localeRef = useRef(locale);
    progressRef.current = progress;
    localeRef.current = locale;

    const emitGameStart = () => {
        if (!wantsPlayRef.current) return;
        EventBus.emit('game:start', {
            characterId: progressRef.current.selectedCharacter,
            countdownSequence: getCountdownSequence(localeRef.current),
        });
    };

    const stopPlayRequest = () => {
        wantsPlayRef.current = false;
    };

    useEffect(() => onAuthChange(setPlayer), []);

    // 每局结束回菜单不重复拉留言（1000 在线时会变成持续读洪峰）：
    // 至少间隔 60 秒才重新请求，期间弹幕循环用已有列表；自己刚发的留言
    // 已在发送成功时本地插入，无需回源。
    const danmakuFetchedAt = useRef(0);
    useEffect(() => {
        if (screen !== 'menu') return;
        if (Date.now() - danmakuFetchedAt.current < 60000) return;
        danmakuFetchedAt.current = Date.now();
        void getDanmaku()
            .then((response) => {
                if (Array.isArray(response?.messages)) setMessages(response.messages);
            })
            .catch(() => undefined);
    }, [screen]);

    // React 挂载成功即移除 index.html 的静态启动兜底层（「载入中/加载失败」提示）：
    // 老浏览器解析产物失败或脚本加载失败时它才留在页面上给出可重试的错误提示
    useEffect(() => {
        document.getElementById('boot-fallback')?.remove();
    }, []);

    // 背景音乐：首次用户交互后循环播放，与音效共用静音按钮，切后台自动暂停
    useEffect(() => initBgm(), []);

    // 桌面端键盘快捷键：菜单 空格/回车 开始，结算 回车 重开。
    // 忽略按住重复、修饰键、输入框与按钮焦点（避免与原生按钮激活双触发）以及弹窗打开时。
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
                || target.tagName === 'BUTTON' || target.isContentEditable)) return;
            if (overlay !== 'none') return;
            const start = screen === 'menu' && (event.code === 'Space' || event.code === 'Enter');
            const restart = screen === 'gameover' && event.code === 'Enter';
            if (start || restart) {
                event.preventDefault();
                play();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [screen, overlay, progress]);

    useEffect(() => {
        const onReady = () => {
            EventBus.emit('character:selected', progressRef.current.selectedCharacter);
            // Phaser 场景 create 前按开始会丢 game:start；用 ref 记录意图，就绪后补发。
            emitGameStart();
        };
        const onScore = (next: ScoreState) => setScore(next);
        const onOver = (run: RunResult) => {
            wantsPlayRef.current = false;
            const next = recordRun(progress, run);
            setProgress(next);
            setLastRun(run);
            setScreen('gameover');
            // 持久化放最后并兜底：隐私模式禁写 localStorage / 配额满时只丢存档，
            // 绝不阻断结算面板展示（死亡必出结算）
            try {
                saveProgress(next);
            } catch {
                // 忽略：进度同步仍可在登录后走 pendingRuns 内存态
            }
        };
        EventBus.on('game:ready', onReady);
        EventBus.on('score:changed', onScore);
        EventBus.on('game:over', onOver);
        return () => {
            EventBus.off('game:ready', onReady);
            EventBus.off('score:changed', onScore);
            EventBus.off('game:over', onOver);
        };
    }, [progress, locale]);

    useEffect(() => {
        if (!player || progress.pendingRuns.length === 0 || syncing) return;
        setSyncing(true);
        void syncRuns(progress.pendingRuns)
            .then((response) => {
                const next = saveProgress(removeSyncedRuns(progress, response.syncedIds));
                setProgress(next);
                setPlayer(response.profile);
            })
            .catch(() => undefined)
            .finally(() => setSyncing(false));
    }, [player, progress, syncing]);

    const chooseCharacter = (characterId: string) => {
        const next = saveProgress(selectCharacter(progress, characterId));
        setProgress(next);
        EventBus.emit('character:selected', characterId);
        if (player) void updateCharacter(characterId).then(setPlayer).catch(() => undefined);
    };

    const play = () => {
        wantsPlayRef.current = true;
        setScore(initialScore);
        setLastRun(null);
        setOverlay('none');
        setScreen('playing');
        emitGameStart();
    };

    const toggleMute = () => {
        setSfxMuted(!muted);
        setMuted(!muted);
    };

    return (
        <main className="game-shell">
            <PhaserGame />

            {screen !== 'playing' && (
                <header className="topbar">
                    <label className="lang-select-wrap">
                        <span className="sr-only">{t.languageLabel}</span>
                        <select
                            className="lang-select"
                            value={locale}
                            aria-label={t.languageLabel}
                            onChange={(event) => setLocale(event.target.value as Locale)}
                        >
                            {LOCALE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <nav className="top-actions" aria-label={t.accountNav}>
                        <button className="icon-button" onClick={toggleMute} aria-label={muted ? t.muteOn : t.muteOff}>
                            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                        </button>
                        <button className="icon-button" onClick={() => setOverlay('leaderboard')} aria-label={t.openLeaderboard}>
                            <Trophy size={19} />
                        </button>
                        {player ? (
                            <button className="icon-button account-active" onClick={signOut} aria-label={t.signOut}>
                                <LogOut size={19} />
                            </button>
                        ) : (
                            <button className="icon-button" onClick={() => setOverlay('auth')} aria-label={t.signIn}>
                                <CircleUserRound size={20} />
                            </button>
                        )}
                    </nav>
                </header>
            )}

            {screen === 'menu' && (
                <section className="menu-layer" aria-label={t.startMenu}>
                    <div className="menu-sky" aria-hidden="true">
                        <MenuDanmaku messages={messages} burst={burst} fallbackMessages={t.defaultMessages} />
                    </div>

                    <header className="game-title">
                        <div className="title-decor" aria-hidden="true">
                            <Ribbon className="title-trim ribbon" size={32} />
                            <Cloud className="title-trim cloud-left" size={32} fill="currentColor" />
                            <Flower className="title-trim flower-right" size={27} />
                            <Star className="title-trim star-left" size={16} fill="currentColor" />
                            <Sparkles className="title-trim spark-right" size={15} />
                            <Heart className="title-trim heart-bottom" size={13} fill="currentColor" />
                        </div>
                        <h1 aria-label={GAME_TITLE}>
                            <TitleLetters word={t.gameTitleWords[0]} className="title-name--hyunjin" />
                            <span className="title-x" aria-hidden="true">{t.gameTitleWords[1]}</span>
                            <TitleLetters word={t.gameTitleWords[2]} className="title-name--felix" />
                        </h1>
                        <p className="title-sub">{t.gameSubtitle}</p>
                    </header>
                    <div className="menu-controls">
                        <button className="note-button" onClick={() => setOverlay('note')} aria-label={t.leaveMessage}>
                            <MessageCircle size={14} /> {t.leaveMessage}
                        </button>
                        <div className="character-rail" role="list" aria-label={t.chooseCharacter}>
                            {CHARACTERS.map((character) => {
                                const copy = getCharacterCopy(locale, character.id);
                                return (
                                <button
                                    key={character.id}
                                    className={`character-choice ${character.id === selected.id ? 'selected' : ''}`}
                                    onClick={() => chooseCharacter(character.id)}
                                    aria-pressed={character.id === selected.id}
                                    aria-label={t.chooseCharacterNamed(copy.name)}
                                >
                                    <img src={`/assets/${character.portrait}`} alt="" />
                                    <span className="character-name">{copy.name}</span>
                                </button>
                                );
                            })}
                        </div>

                        <button className="primary-button" onClick={play} aria-label={t.startGame}>
                            <Play size={21} fill="currentColor" />
                        </button>
                    </div>

                    <div className="menu-sky-spacer" aria-hidden="true" />
                </section>
            )}

            {screen === 'playing' && (
                <section className="hud" aria-live="polite">
                    <div className="score-number" key={score.total}>{score.total}</div>
                    <div className="reward-count"><Sparkles size={15} /> {score.rewardCount}</div>
                </section>
            )}

            {screen === 'gameover' && lastRun && (
                <section className="result-layer" aria-label={t.playAgain}>
                    <div className="result-sheet">
                        <div className="result-score">{lastRun.totalScore}</div>
                        {!player && (
                            <button className="save-button" onClick={() => setOverlay('auth')} aria-label={t.loginToSave}>
                                <LogIn size={18} />
                            </button>
                        )}
                        <div className="result-actions">
                            <button className="secondary-button" onClick={() => { stopPlayRequest(); setScreen('menu'); }} aria-label={t.pickCharacter}><Home size={19} /></button>
                            <button className="primary-button compact" onClick={play} aria-label={t.playAgain}><RotateCcw size={19} /></button>
                        </div>
                    </div>
                </section>
            )}

            {overlay === 'auth' && (
                <AuthDialog
                    characterId={progress.selectedCharacter}
                    onClose={() => setOverlay('none')}
                    onSuccess={(profile) => { setPlayer(profile); setOverlay('none'); }}
                />
            )}
            {overlay === 'leaderboard' && <LeaderboardDialog onClose={() => setOverlay('none')} />}
            {overlay === 'note' && (
                <MessageDialog
                    onClose={() => setOverlay('none')}
                    onPosted={(message) => {
                        setMessages((current) => [message, ...current].slice(0, 50));
                        setBurst({ text: message.text, author: message.author, nonce: Date.now() });
                        setOverlay('none');
                    }}
                />
            )}

        </main>
    );
}

// 菜单弹幕层：留言在「标题上方的天空带」（.menu-sky）内循环飘过，轨道是带高的
// 百分比，绝不下探到标题与面板。轨道/速度/字号由 bulletStyle 按发射序号确定性
// 给出；弹幕池由 buildPool 决定——真实留言全量优先，不足 6 条才混入服务端种子
// 垫场，离线退回本地欢迎语。
// 整层 pointer-events:none，只做氛围不挡角色选择与开始按钮；对局中整层不渲染。
// 弹幕密度按设备档位（加载时定一次）：移动端/弱机 lite 档同屏更少、发射更疏，
// 减少菜单里持续做 transform 动画的 DOM 数量
const DANMAKU_MAX_ON_SCREEN = getEffectQuality() === 'lite' ? 6 : 9;
const DANMAKU_INTERVAL_MS = getEffectQuality() === 'lite' ? 2600 : 1800;

function MenuDanmaku({ messages, burst, fallbackMessages }: { messages: DanmakuMessage[]; burst: DanmakuBurst | null; fallbackMessages: readonly { text: string; author: string }[] }) {
    const [bullets, setBullets] = useState<{ id: number; text: string; author: string; style: BulletStyle }[]>([]);
    const counter = useRef(0);
    const cursor = useRef(0);
    const pool = useRef<{ text: string; author: string }[]>([]);
    pool.current = buildPool(messages, fallbackMessages);

    useEffect(() => {
        const emit = () => {
            const list = pool.current;
            const message = list[cursor.current % list.length];
            cursor.current += 1;
            const id = (counter.current += 1);
            // 同屏上限防止长留言列表下弹幕过密（lite 档 6 条 / full 档 9 条）
            setBullets((current) => (current.length >= DANMAKU_MAX_ON_SCREEN ? current : [...current, { id, ...message, style: bulletStyle(id) }]));
        };
        emit();
        const timer = setInterval(emit, DANMAKU_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    // 刚发出的留言插队立刻飘（不等轮询节奏），给「发出去了」的即时反馈
    useEffect(() => {
        if (!burst) return;
        const id = (counter.current += 1);
        setBullets((current) => [...current, { id, text: burst.text, author: burst.author, style: bulletStyle(id) }]);
    }, [burst]);

    return (
        <div className="danmaku-layer" aria-hidden="true">
            {bullets.map((bullet) => (
                <span
                    key={bullet.id}
                    className="danmaku-bullet"
                    style={{
                        top: `${bullet.style.top}%`,
                        fontSize: bullet.style.fontSize,
                        opacity: bullet.style.opacity,
                        animationDuration: `${bullet.style.duration}s`,
                    }}
                    onAnimationEnd={() => setBullets((current) => current.filter((item) => item.id !== bullet.id))}
                >
                    {bullet.text}
                    <i>{bullet.author}</i>
                </span>
            ))}
        </div>
    );
}

// 弹幕留言弹窗：一句话 + 可选昵称。留言与账号完全解绑——登录与否都是同一套
// 表单，署名只看昵称，留空由服务端署「路过的碗」。
function MessageDialog({ onClose, onPosted }: { onClose: () => void; onPosted: (message: DanmakuMessage) => void }) {
    const { t } = useI18n();
    const [text, setText] = useState('');
    const [nickname, setNickname] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        const normalized = normalizeMessage(text);
        if (!normalized) {
            setError(t.noteErrorEmpty);
            return;
        }
        setBusy(true);
        try {
            onPosted(await postDanmaku(normalized, nickname));
        } catch {
            setError(t.noteErrorSend);
            setBusy(false);
        }
    };

    return (
        <div className="dialog-backdrop" role="presentation">
            <section className="dialog note-dialog" role="dialog" aria-modal="true" aria-labelledby="note-title">
                <button className="dialog-close" onClick={onClose} aria-label={t.close}><X size={20} /></button>
                <p className="eyebrow">{t.noteEyebrow}</p>
                <h2 id="note-title">{t.noteTitle}</h2>
                <form onSubmit={submit}>
                    <label>{t.noteLabel}<input value={text} onChange={(event) => setText(event.target.value)} maxLength={MESSAGE_MAX} placeholder={t.notePlaceholder} /></label>
                    <label>{t.nicknameLabel}<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={NICKNAME_MAX} placeholder={t.nicknamePlaceholder} /></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <button className="primary-button" disabled={busy}>
                        {busy ? t.noteSending : <><Send size={17} /> {t.noteSubmit}</>}
                    </button>
                </form>
            </section>
        </div>
    );
}

function AuthDialog({ characterId, onClose, onSuccess }: { characterId: string; onClose: () => void; onSuccess: (player: PlayerProfile) => void }) {
    const { t } = useI18n();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        // 宽松规则：唯一的硬规则是用户名不与他人重复（由服务端唯一索引兜底），
        // 前端只做非空与超长这类最基础检查，密码不设长度与复杂度要求。
        const name = normalizeUsername(username);
        const invalid = validateCredentials(name, password);
        if (invalid) {
            setError(invalid);
            return;
        }
        setBusy(true);
        try {
            onSuccess(await enter(name, password, characterId));
        } catch (submitError) {
            setError(submitError instanceof PasswordMismatchError ? t.authErrorTaken : t.authErrorGeneric);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="dialog-backdrop" role="presentation">
            <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
                <button className="dialog-close" onClick={onClose} aria-label={t.close}><X size={20} /></button>
                <p className="eyebrow">{t.saveProgressEyebrow}</p>
                <h2 id="auth-title">{t.signInTitle}</h2>
                <form onSubmit={submit}>
                    <label>{t.username}<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={USERNAME_MAX} /></label>
                    <label>{t.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" maxLength={PASSWORD_MAX} /></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <button className="primary-button" disabled={busy}>{busy ? t.signInBusy : t.signInSubmit}</button>
                </form>
            </section>
        </div>
    );
}

function LeaderboardDialog({ onClose }: { onClose: () => void }) {
    const { locale, t } = useI18n();
    const [type, setType] = useState<'best' | 'total'>('best');
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        setData(null);
        setError(false);
        // 渲染层守卫：后端缺失/返回异常载荷时显示不可用状态，而不是整棵组件树崩溃
        void getLeaderboard(type)
            .then((response) => {
                if (!response || !Array.isArray(response.entries)) throw new Error('bad leaderboard payload');
                setData(response);
            })
            .catch(() => setError(true));
    }, [type]);

    return (
        <div className="dialog-backdrop" role="presentation">
            <section className="dialog leaderboard-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
                <button className="dialog-close" onClick={onClose} aria-label={t.close}><X size={20} /></button>
                <p className="eyebrow">{t.leaderboardEyebrow}</p>
                <h2 id="leaderboard-title">{t.leaderboardTitle}</h2>
                <div className="segmented" role="tablist">
                    <button className={type === 'best' ? 'active' : ''} onClick={() => setType('best')}>{t.tabBest}</button>
                    <button className={type === 'total' ? 'active' : ''} onClick={() => setType('total')}>{t.tabTotal}</button>
                </div>
                <div className="leaderboard-list">
                    {!data && !error && <p className="empty-state">{t.leaderboardLoading}</p>}
                    {error && <p className="empty-state">{t.leaderboardUnavailable}</p>}
                    {data?.entries.length === 0 && <p className="empty-state">{t.leaderboardEmpty}</p>}
                    {data?.entries.map((entry) => {
                        const character = getCharacter(entry.characterId);
                        const copy = getCharacterCopy(locale, character.id);
                        return (
                            <div className="leaderboard-row" key={entry.playerId}>
                                <b className="rank">{entry.rank}</b>
                                <img src={`/assets/${character.portrait}`} alt={copy.name} />
                                <span>{entry.username}</span>
                                <strong>{entry.score}</strong>
                            </div>
                        );
                    })}
                </div>
                {data?.me && !data.entries.some((entry) => entry.playerId === data.me?.playerId) && (
                    <div className="my-rank"><span>{t.myRank(data.me.rank)}</span><b>{data.me.score}</b></div>
                )}
            </section>
        </div>
    );
}

export default App;
