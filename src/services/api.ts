import PocketBase, { RecordModel } from 'pocketbase';
import { RunResult } from '../domain/game';
import { signInOrRegister } from './authFlow';

export { PasswordMismatchError } from './authFlow';

export interface PlayerProfile {
    id: string;
    username: string;
    characterId: string;
    bestScore: number;
    totalScore: number;
    gamesPlayed: number;
}

export interface LeaderboardEntry {
    rank: number;
    playerId: string;
    username: string;
    characterId: string;
    score: number;
}

export interface LeaderboardResponse {
    type: 'best' | 'total';
    entries: LeaderboardEntry[];
    me: LeaderboardEntry | null;
}

export interface SyncResponse {
    syncedIds: string[];
    profile: PlayerProfile;
}

// 弹幕留言板：菜单天空区飘过的玩家短留言（见 services/danmaku.ts 的纯逻辑部分）。
// seed=true 是服务端预置的垫场假留言；真留言足够多时前端不再循环种子
export interface DanmakuMessage {
    id: string;
    text: string;
    author: string;
    seed?: boolean;
    createdAt: string;
}

export interface DanmakuResponse {
    messages: DanmakuMessage[];
}

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL || window.location.origin);
pb.autoCancellation(false);

const toProfile = (record: RecordModel | null): PlayerProfile | null => record ? {
    id: record.id,
    username: record.username,
    characterId: record.characterId || 'nova',
    bestScore: record.bestScore || 0,
    totalScore: record.totalScore || 0,
    gamesPlayed: record.gamesPlayed || 0,
} : null;

export function currentPlayer(): PlayerProfile | null {
    return pb.authStore.isValid ? toProfile(pb.authStore.record) : null;
}

export function onAuthChange(callback: (player: PlayerProfile | null) => void): () => void {
    return pb.authStore.onChange(() => callback(currentPlayer()), true);
}

export async function register(username: string, password: string, characterId: string): Promise<PlayerProfile> {
    await pb.collection('players').create({
        username, password, passwordConfirm: password, characterId,
        bestScore: 0, totalScore: 0, gamesPlayed: 0,
    });
    const result = await pb.collection('players').authWithPassword(username, password);
    return toProfile(result.record)!;
}

export async function signIn(username: string, password: string): Promise<PlayerProfile> {
    const result = await pb.collection('players').authWithPassword(username, password);
    return toProfile(result.record)!;
}

// 登录注册合一：先登录，账号不存在则自动注册；账号存在但密码错误时
// 抛出 PasswordMismatchError（见 authFlow.ts 的完整规则说明）。
export async function enter(username: string, password: string, characterId: string): Promise<PlayerProfile> {
    return signInOrRegister(
        () => signIn(username, password),
        () => register(username, password, characterId),
    );
}

export function signOut() {
    pb.authStore.clear();
}

export async function syncRuns(runs: RunResult[]): Promise<SyncResponse> {
    return pb.send('/api/game/runs', { method: 'POST', body: { runs } });
}

export async function getLeaderboard(type: 'best' | 'total'): Promise<LeaderboardResponse> {
    return pb.send(`/api/game/leaderboards?type=${type}&limit=50`, { method: 'GET' });
}

export async function updateCharacter(characterId: string): Promise<PlayerProfile> {
    return pb.send('/api/game/profile', { method: 'POST', body: { characterId } });
}

export async function getDanmaku(): Promise<DanmakuResponse> {
    return pb.send('/api/game/messages?limit=50', { method: 'GET' });
}

// 留言与账号完全解绑：署名只看这里的可选昵称，留空署「路过的碗」，登录与否不影响
export async function postDanmaku(text: string, nickname?: string): Promise<DanmakuMessage> {
    return pb.send('/api/game/messages', { method: 'POST', body: { text, nickname } });
}
