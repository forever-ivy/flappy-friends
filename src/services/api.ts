import PocketBase, { RecordModel } from 'pocketbase';
import { RunResult } from '../domain/game';

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
