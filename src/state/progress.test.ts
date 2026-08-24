import { describe, expect, it } from 'vitest';
import { RunResult } from '../domain/game';
import { DEFAULT_PROGRESS, recordRun, removeSyncedRuns } from './progress';

const run: RunResult = {
    clientRunId: 'run-1', characterId: 'nova', pipeCount: 5, rewardCount: 1,
    totalScore: 10, durationMs: 5000, createdAt: '2026-08-19T00:00:00.000Z',
};

describe('local progress', () => {
    it('records each run only once', () => {
        const once = recordRun(DEFAULT_PROGRESS, run);
        const twice = recordRun(once, run);
        expect(twice).toEqual(once);
        expect(once).toMatchObject({ bestScore: 10, totalScore: 10, gamesPlayed: 1 });
    });

    it('removes only acknowledged runs', () => {
        const progress = recordRun(recordRun(DEFAULT_PROGRESS, run), { ...run, clientRunId: 'run-2' });
        expect(removeSyncedRuns(progress, ['run-1']).pendingRuns.map((item) => item.clientRunId)).toEqual(['run-2']);
    });
});
