// 极简 HTTP 压测脚本（零依赖）：keep-alive 连接池按并发数各自串行打请求，
// 统计 QPS 与延迟分位数。用于验证排行榜/留言等热点接口的并发能力。
//
// 用法：node scripts/loadtest.mjs <url> [并发=50] [秒数=10]
// 例：  node scripts/loadtest.mjs "http://127.0.0.1:8090/api/game/leaderboards?type=best&limit=50" 100 10

import http from 'node:http';

const target = process.argv[2];
if (!target) {
    console.error('用法：node scripts/loadtest.mjs <url> [并发=50] [秒数=10]');
    process.exit(1);
}
const connections = Number(process.argv[3] || 50);
const seconds = Number(process.argv[4] || 10);

const url = new URL(target);
const agent = new http.Agent({ keepAlive: true, maxSockets: connections });
const latencies = [];
let ok = 0;
let bad = 0;
const statusCounts = {};

function request() {
    return new Promise((resolve) => {
        const start = process.hrtime.bigint();
        const req = http.request(url, { agent }, (res) => {
            res.resume();
            res.on('end', () => {
                latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
                statusCounts[res.statusCode] = (statusCounts[res.statusCode] || 0) + 1;
                if (res.statusCode === 200) ok += 1; else bad += 1;
                resolve();
            });
        });
        req.on('error', () => { bad += 1; resolve(); });
        req.end();
    });
}

const deadline = Date.now() + seconds * 1000;
async function worker() {
    while (Date.now() < deadline) await request();
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: connections }, worker));
const elapsed = (Date.now() - startedAt) / 1000;

latencies.sort((a, b) => a - b);
const pct = (p) => (latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0).toFixed(1);
console.log(`目标        ${target}`);
console.log(`并发/时长   ${connections} 连接 × ${elapsed.toFixed(1)}s`);
console.log(`完成请求    ${ok + bad}（200：${ok}，非 200/错误：${bad}）`);
console.log(`吞吐        ${((ok + bad) / elapsed).toFixed(0)} req/s`);
console.log(`延迟 ms     p50=${pct(0.5)}  p95=${pct(0.95)}  p99=${pct(0.99)}  max=${(latencies[latencies.length - 1] ?? 0).toFixed(1)}`);
console.log(`状态分布    ${JSON.stringify(statusCounts)}`);
