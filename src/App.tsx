import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CircleUserRound, Home, LogIn, LogOut, Play, RotateCcw, Sparkles, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { PhaserGame } from './PhaserGame';
import { RunResult } from './domain/game';
import { CHARACTERS, getCharacter } from './game/assets';
import { EventBus } from './game/EventBus';
import { isSfxMuted, setSfxMuted } from './game/sfx';
import { currentPlayer, getLeaderboard, LeaderboardResponse, onAuthChange, PlayerProfile, register, signIn, signOut, syncRuns, updateCharacter } from './services/api';
import { loadProgress, Progress, recordRun, removeSyncedRuns, saveProgress, selectCharacter } from './state/progress';

type Screen = 'menu' | 'playing' | 'gameover';
type Overlay = 'none' | 'auth' | 'leaderboard';

interface ScoreState {
    total: number;
    pipeCount: number;
    rewardCount: number;
}

const initialScore: ScoreState = { total: 0, pipeCount: 0, rewardCount: 0 };

function App() {
    const [screen, setScreen] = useState<Screen>('menu');
    const [overlay, setOverlay] = useState<Overlay>('none');
    const [progress, setProgress] = useState<Progress>(() => loadProgress());
    const [player, setPlayer] = useState<PlayerProfile | null>(() => currentPlayer());
    const [score, setScore] = useState<ScoreState>(initialScore);
    const [lastRun, setLastRun] = useState<RunResult | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [muted, setMuted] = useState(() => isSfxMuted());
    const selected = useMemo(() => getCharacter(progress.selectedCharacter), [progress.selectedCharacter]);

    useEffect(() => onAuthChange(setPlayer), []);

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
        const onReady = () => EventBus.emit('character:selected', progress.selectedCharacter);
        const onScore = (next: ScoreState) => setScore(next);
        const onOver = (run: RunResult) => {
            const next = saveProgress(recordRun(progress, run));
            setProgress(next);
            setLastRun(run);
            setScreen('gameover');
        };
        EventBus.on('game:ready', onReady);
        EventBus.on('score:changed', onScore);
        EventBus.on('game:over', onOver);
        return () => {
            EventBus.off('game:ready', onReady);
            EventBus.off('score:changed', onScore);
            EventBus.off('game:over', onOver);
        };
    }, [progress]);

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
        setScore(initialScore);
        setLastRun(null);
        setOverlay('none');
        setScreen('playing');
        EventBus.emit('game:start', { characterId: progress.selectedCharacter });
    };

    const toggleMute = () => {
        setSfxMuted(!muted);
        setMuted(!muted);
    };

    const localStats = player ?? progress;

    return (
        <main className="game-shell">
            <PhaserGame />

            <header className="topbar">
                <div className="brand-lockup">
                    <span className="brand-mark" aria-hidden="true">S</span>
                    <span>SKYLINE HOP</span>
                </div>
                {screen !== 'playing' && (
                    <nav className="top-actions" aria-label="账户与排名">
                        <button className="icon-button" onClick={toggleMute} title={muted ? '开启音效' : '关闭音效'} aria-label={muted ? '开启音效' : '关闭音效'}>
                            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                        </button>
                        <button className="icon-button" onClick={() => setOverlay('leaderboard')} title="排行榜" aria-label="打开排行榜">
                            <Trophy size={19} />
                        </button>
                        {player ? (
                            <button className="icon-button account-active" onClick={signOut} title={`退出 ${player.username}`} aria-label="退出登录">
                                <LogOut size={19} />
                            </button>
                        ) : (
                            <button className="icon-button" onClick={() => setOverlay('auth')} title="登录保存进度" aria-label="登录">
                                <CircleUserRound size={20} />
                            </button>
                        )}
                    </nav>
                )}
            </header>

            {screen === 'menu' && (
                <section className="menu-layer" aria-label="开始游戏">
                    <div className="title-block">
                        <p className="eyebrow">穿过樱花花海</p>
                        <h1>SKYLINE<br />HOP</h1>
                    </div>

                    <div className="menu-controls">
                        <div className="selected-copy">
                            <div>
                                <span>当前角色</span>
                                <strong style={{ color: selected.color }}>{selected.name}</strong>
                            </div>
                            <p>{selected.tagline}</p>
                        </div>

                        <div className="character-rail" role="list" aria-label="选择角色">
                            {CHARACTERS.map((character) => (
                                <button
                                    key={character.id}
                                    className={`character-choice ${character.id === selected.id ? 'selected' : ''}`}
                                    onClick={() => chooseCharacter(character.id)}
                                    aria-pressed={character.id === selected.id}
                                    title={`选择 ${character.name}`}
                                >
                                    <img src={`/assets/${character.image}`} alt="" />
                                    <span>{character.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="stats-line" aria-label="游戏进度">
                            <span><b>{localStats.bestScore}</b> 最高</span>
                            <span><b>{localStats.totalScore}</b> 累计</span>
                            <span><b>{localStats.gamesPlayed}</b> 局</span>
                        </div>

                        <p className="key-hint" aria-hidden="true"><kbd>空格</kbd>/<kbd>↑</kbd> 起飞 · <kbd>Enter</kbd> 开始 / 重开</p>

                        <button className="primary-button" onClick={play}>
                            <Play size={21} fill="currentColor" /> 开始游戏
                        </button>
                    </div>
                </section>
            )}

            {screen === 'playing' && (
                <section className="hud" aria-live="polite">
                    <div className="score-number" key={score.total}>{score.total}</div>
                    <div className="reward-count"><Sparkles size={15} /> {score.rewardCount}</div>
                </section>
            )}

            {screen === 'gameover' && lastRun && (
                <section className="result-layer" aria-label="本局结果">
                    <div className="result-sheet">
                        <p className="eyebrow">GAME OVER</p>
                        <div className="result-score">{lastRun.totalScore}</div>
                        <p className="result-breakdown">穿越 {lastRun.pipeCount} · 奖励 {lastRun.rewardCount} × 5</p>
                        <div className="result-best">
                            <span>历史最高</span><b>{localStats.bestScore}</b>
                            <span>累计积分</span><b>{localStats.totalScore}</b>
                        </div>
                        {!player && (
                            <button className="save-button" onClick={() => setOverlay('auth')}>
                                <LogIn size={18} /> 登录并保存
                            </button>
                        )}
                        {player && syncing && <p className="sync-status">正在保存成绩…</p>}
                        <div className="result-actions">
                            <button className="secondary-button" onClick={() => setScreen('menu')}><Home size={19} /> 选角色</button>
                            <button className="primary-button compact" onClick={play}><RotateCcw size={19} /> 再来一局</button>
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
        </main>
    );
}

function AuthDialog({ characterId, onClose, onSuccess }: { characterId: string; onClose: () => void; onSuccess: (player: PlayerProfile) => void }) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        if (mode === 'register' && !/^[A-Za-z0-9_\-\u4E00-\u9FFF]{3,16}$/.test(username)) {
            setError('用户名需为 3–16 位中英文、数字、_ 或 -');
            return;
        }
        if (password.length < 8 || password.length > 72) {
            setError('密码需为 8–72 位');
            return;
        }
        setBusy(true);
        try {
            onSuccess(mode === 'register' ? await register(username, password, characterId) : await signIn(username, password));
        } catch {
            setError(mode === 'register' ? '注册失败，用户名可能已被使用' : '用户名或密码不正确');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="dialog-backdrop" role="presentation">
            <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
                <button className="dialog-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
                <p className="eyebrow">保存游戏进度</p>
                <h2 id="auth-title">{mode === 'login' ? '欢迎回来' : '创建账户'}</h2>
                <div className="segmented" role="tablist">
                    <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button>
                    <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>注册</button>
                </div>
                <form onSubmit={submit}>
                    <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={16} /></label>
                    <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} maxLength={72} /></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <button className="primary-button" disabled={busy}>{busy ? '请稍候…' : mode === 'login' ? '登录并保存' : '注册并保存'}</button>
                </form>
                {mode === 'register' && <p className="auth-note">不收集邮箱，也不提供密码找回。</p>}
            </section>
        </div>
    );
}

function LeaderboardDialog({ onClose }: { onClose: () => void }) {
    const [type, setType] = useState<'best' | 'total'>('best');
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        setData(null);
        setError(false);
        void getLeaderboard(type).then(setData).catch(() => setError(true));
    }, [type]);

    return (
        <div className="dialog-backdrop" role="presentation">
            <section className="dialog leaderboard-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
                <button className="dialog-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
                <p className="eyebrow">全服排名</p>
                <h2 id="leaderboard-title">排行榜</h2>
                <div className="segmented" role="tablist">
                    <button className={type === 'best' ? 'active' : ''} onClick={() => setType('best')}>最高分</button>
                    <button className={type === 'total' ? 'active' : ''} onClick={() => setType('total')}>累计分</button>
                </div>
                <div className="leaderboard-list">
                    {!data && !error && <p className="empty-state">读取中…</p>}
                    {error && <p className="empty-state">排行榜暂时不可用</p>}
                    {data?.entries.length === 0 && <p className="empty-state">还没人上榜</p>}
                    {data?.entries.map((entry) => {
                        const character = getCharacter(entry.characterId);
                        return (
                            <div className="leaderboard-row" key={entry.playerId}>
                                <b className="rank">{entry.rank}</b>
                                <img src={`/assets/${character.image}`} alt="" />
                                <span>{entry.username}</span>
                                <strong>{entry.score}</strong>
                            </div>
                        );
                    })}
                </div>
                {data?.me && !data.entries.some((entry) => entry.playerId === data.me?.playerId) && (
                    <div className="my-rank"><span>我的排名 #{data.me.rank}</span><b>{data.me.score}</b></div>
                )}
            </section>
        </div>
    );
}

export default App;
