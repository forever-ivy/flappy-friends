// PocketBase 后端集成测试：针对真实运行的服务验证注册登录、无邮箱认证、
// 宽松账号规则（用户名不重复即可、密码最短 1 位）、成绩事务更新、
// 重复提交幂等、防篡改、双榜排序与个人名次。
//
// 用法：先启动服务（本地二进制或 docker compose），然后
//   PB_URL=http://127.0.0.1:8090 npm run test:backend
//
// 机制账号保榜（查询层影子分注入）的用例需要服务端与本脚本设置同一个
// MECH_PLAYER_ID（合法的 15 位记录 id，如 mechlovetest001）：
//   MECH_PLAYER_ID=mechlovetest001 ./pocketbase serve ...
//   MECH_PLAYER_ID=mechlovetest001 PB_URL=... npm run test:backend
// 不设置时只验证特性关闭（榜单无 official 条目）。

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const MECH_ID = process.env.MECH_PLAYER_ID || '';
const STAMP = Date.now().toString(36);

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${name}`);
    } else {
        failures.push(name);
        console.log(`  ✗ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
    }
}

async function api(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(PB_URL + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
        json = await response.json();
    } catch {
        // 非 JSON 响应（如静态文件）
    }
    return { status: response.status, json };
}

async function waitForServer(seconds = 60) {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${PB_URL}/api/health`);
            if (response.ok) return true;
        } catch {
            // 尚未启动
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}

async function registerPlayer(name, { username, password = 'password-123', characterId = 'nova' } = {}) {
    const created = await api('/api/collections/players/records', {
        method: 'POST',
        body: { username, password, passwordConfirm: password, characterId },
    });
    const auth = await api('/api/collections/players/auth-with-password', {
        method: 'POST',
        body: { identity: username, password },
    });
    return { created, auth };
}

const run = (clientRunId, characterId, pipeCount, rewardCount, durationMs = 30000) => ({
    clientRunId,
    characterId,
    pipeCount,
    rewardCount,
    durationMs,
    createdAt: new Date().toISOString(),
});

async function main() {
    console.log(`PocketBase 集成测试 → ${PB_URL}`);
    if (!(await waitForServer())) {
        console.error('服务在 60 秒内未就绪，中止。');
        process.exit(1);
    }

    // ---- 注册 / 登录（无邮箱认证） ----
    console.log('\n[注册与登录]');
    const ada = await registerPlayer('ada', { username: `ada_${STAMP}` });
    check('无邮箱注册成功（username-only）', ada.created.status === 200, ada.created);
    check('用户名密码登录成功', ada.auth.status === 200 && !!ada.auth.json?.token, ada.auth);
    const adaToken = ada.auth.json?.token;
    const adaId = ada.auth.json?.record?.id;

    // 宽松规则：唯一硬规则是用户名不与他人重复。1 个字符的用户名 + 1 位密码
    // 即可建号，中文与内部空格也合法。（1 字符用户名按时间取汉字，避免多次运行撞名）
    const tiny = await registerPlayer('tiny', {
        username: String.fromCharCode(0x4e00 + (Date.now() % 20000)),
        password: '1',
    });
    check('1 字符用户名 + 1 位密码可注册', tiny.created.status === 200, tiny.created);
    check('1 位密码可正常登录', tiny.auth.status === 200 && !!tiny.auth.json?.token, tiny.auth);
    const casual = await registerPlayer('casual', { username: `碗碗 与 盆盆 ${STAMP}` });
    check('中文与内部空格用户名可注册登录', casual.created.status === 200 && casual.auth.status === 200, casual.created);

    // 仍然拒绝的仅剩最基础的输入问题：空、首尾空格、超过 24 个字符
    const badUsernames = ['', `  padded_${STAMP}  `, `way-too-long-username-${STAMP}-overflow`];
    for (const username of badUsernames) {
        const result = await api('/api/collections/players/records', {
            method: 'POST',
            body: { username, password: 'password-123', passwordConfirm: 'password-123' },
        });
        check(`拒绝非法用户名 ${JSON.stringify(username.slice(0, 16))}`, result.status === 400, result.json);
    }
    const emptyPassword = await api('/api/collections/players/records', {
        method: 'POST',
        body: { username: `nopw_${STAMP}`, password: '', passwordConfirm: '' },
    });
    check('拒绝空密码', emptyPassword.status === 400, emptyPassword.json);

    const duplicate = await api('/api/collections/players/records', {
        method: 'POST',
        body: { username: `ADA_${STAMP}`, password: 'password-123', passwordConfirm: 'password-123' },
    });
    check('拒绝重复用户名（大小写不敏感）', duplicate.status === 400, duplicate.json);

    // ---- 成绩提交与事务更新 ----
    console.log('\n[成绩提交]');
    const unauthed = await api('/api/game/runs', { method: 'POST', body: { runs: [run(`nope-${STAMP}`, 'nova', 1, 0)] } });
    check('未登录不能提交成绩', unauthed.status === 400 || unauthed.status === 401, unauthed.json);

    // 'sol' 为已下架的历史角色 id：后端须继续接受（旧客户端/旧存档兼容），前端渲染时回退到 nova
    const firstSubmit = await api('/api/game/runs', {
        method: 'POST', token: adaToken,
        body: { runs: [run(`ada-a-${STAMP}`, 'nova', 10, 0), run(`ada-b-${STAMP}`, 'sol', 16, 4)] },
    });
    check('批量提交两局成功', firstSubmit.status === 200, firstSubmit.json);
    check(
        '事务统计正确（best=36 total=46 局数=2）',
        firstSubmit.json?.profile?.bestScore === 36
        && firstSubmit.json?.profile?.totalScore === 46
        && firstSubmit.json?.profile?.gamesPlayed === 2,
        firstSubmit.json?.profile,
    );
    check('总分由服务端计算（pipe 16 + reward 4×5）', firstSubmit.json?.profile?.bestScore === 36, firstSubmit.json?.profile);

    const resubmit = await api('/api/game/runs', {
        method: 'POST', token: adaToken,
        body: { runs: [run(`ada-a-${STAMP}`, 'nova', 10, 0)] },
    });
    check('重复 clientRunId 幂等（不重复计数）', resubmit.status === 200
        && resubmit.json?.profile?.gamesPlayed === 2
        && resubmit.json?.profile?.totalScore === 46
        && resubmit.json?.syncedIds?.length === 1, resubmit.json?.profile);

    const invalidPayloads = [
        ['负数穿越数', { runs: [run(`bad1-${STAMP}`, 'nova', -1, 0)] }],
        ['非法角色', { runs: [run(`bad2-${STAMP}`, 'hacker', 1, 0)] }],
        ['过短 runId', { runs: [run('x', 'nova', 1, 0)] }],
        ['空数组', { runs: [] }],
        ['非数组', { runs: 'nope' }],
        ['非法日期', { runs: [{ ...run(`bad3-${STAMP}`, 'nova', 1, 0), createdAt: 'not-a-date' }] }],
    ];
    for (const [label, body] of invalidPayloads) {
        const result = await api('/api/game/runs', { method: 'POST', token: adaToken, body });
        check(`拒绝非法负载：${label}`, result.status === 400, result.json);
    }
    const tooMany = { runs: Array.from({ length: 51 }, (_, index) => run(`bulk-${STAMP}-${index}`, 'nova', 1, 0)) };
    const bulkResult = await api('/api/game/runs', { method: 'POST', token: adaToken, body: tooMany });
    check('拒绝一次超过 50 局', bulkResult.status === 400, bulkResult.json);

    // ---- 禁止代他人提交 / 防篡改 ----
    console.log('\n[权限与防篡改]');
    const bo = await registerPlayer('bo', { username: `bo_${STAMP}`, characterId: 'moss' });
    const boToken = bo.auth.json?.token;
    const boId = bo.auth.json?.record?.id;

    const stealAttempt = await api('/api/game/runs', {
        method: 'POST', token: boToken,
        body: { runs: [run(`ada-a-${STAMP}`, 'nova', 10, 0)] },
    });
    check('他人重放 clientRunId 只计入自己', stealAttempt.status === 200, stealAttempt.json);
    check(
        '重放者自己的统计变为 best=10 total=10 局数=1',
        stealAttempt.json?.profile?.bestScore === 10
        && stealAttempt.json?.profile?.totalScore === 10
        && stealAttempt.json?.profile?.gamesPlayed === 1,
        stealAttempt.json?.profile,
    );
    const adaProfile = await api(`/api/collections/players/records/${adaId}`, { token: adaToken });
    check(
        '原玩家统计未被影响',
        adaProfile.json?.bestScore === 36 && adaProfile.json?.totalScore === 46 && adaProfile.json?.gamesPlayed === 2,
        adaProfile.json,
    );

    const tamper = await api(`/api/collections/players/records/${adaId}`, {
        method: 'PATCH', token: adaToken, body: { bestScore: 9999 },
    });
    check('玩家不能直接改自己的统计字段', tamper.status >= 400, tamper.json);

    const runsList = await api('/api/collections/runs/records', { token: adaToken });
    check('玩家不能读取原始对局列表', runsList.status >= 400, runsList.json);

    const otherPlayer = await api(`/api/collections/players/records/${boId}`, { token: adaToken });
    check('玩家不能读取他人档案', otherPlayer.status === 404, otherPlayer.json);

    // ---- 角色档案接口 ----
    // 历史 id（sol）仍可写入档案：保证旧客户端不因角色下架而报错
    const profileUpdate = await api('/api/game/profile', { method: 'POST', token: boToken, body: { characterId: 'sol' } });
    check('角色选择同步到服务端', profileUpdate.status === 200 && profileUpdate.json?.characterId === 'sol', profileUpdate.json);
    const badCharacter = await api('/api/game/profile', { method: 'POST', token: boToken, body: { characterId: 'hacker' } });
    check('拒绝非法角色更新', badCharacter.status === 400, badCharacter.json);

    // ---- 双榜与个人名次 ----
    console.log('\n[排行榜]');
    // 期望数据（ada 的两局已提交：best 36 / total 46；bo 靠重放得到 best 10 / total 10）：
    //   cy:  [15, 15]  → best 15, total 30
    //   dee: [36]       → best 36, total 36（与 ada 最高分并列但更晚达成 → best 榜排 ada 后）
    //   elu: [20, 10]   → best 20, total 30（与 cy 总分并列但 best 更高 → total 榜排 cy 前）
    // best 榜：ada(36) dee(36) elu(20) cy(15) bo(10)
    // total 榜：ada(46) dee(36) elu(30) cy(30) bo(10)
    const cy = await registerPlayer('cy', { username: `cy_${STAMP}` });
    await api('/api/game/runs', {
        method: 'POST', token: cy.auth.json?.token,
        body: { runs: [run(`cy-a-${STAMP}`, 'violet', 15, 0), run(`cy-b-${STAMP}`, 'violet', 15, 0)] },
    });
    const dee = await registerPlayer('dee', { username: `dee_${STAMP}` });
    await api('/api/game/runs', {
        method: 'POST', token: dee.auth.json?.token,
        body: { runs: [run(`dee-a-${STAMP}`, 'nova', 36, 0)] },
    });
    const elu = await registerPlayer('elu', { username: `elu_${STAMP}` });
    await api('/api/game/runs', {
        method: 'POST', token: elu.auth.json?.token,
        body: { runs: [run(`elu-a-${STAMP}`, 'sol', 20, 0), run(`elu-b-${STAMP}`, 'sol', 10, 0)] },
    });

    const mine = (entries) => entries
        .filter((entry) => entry.username?.includes(STAMP))
        .map((entry) => entry.username.split('_')[0]);

    const bestBoard = await api('/api/game/leaderboards?type=best&limit=50');
    check('最高分榜公开可读', bestBoard.status === 200, bestBoard.json);
    check(
        '最高分榜排序：同分先达成者优先',
        JSON.stringify(mine(bestBoard.json?.entries || [])) === JSON.stringify(['ada', 'dee', 'elu', 'cy', 'bo']),
        mine(bestBoard.json?.entries || []),
    );
    const bestScores = (bestBoard.json?.entries || []).filter((entry) => entry.username?.includes(STAMP)).map((entry) => entry.score);
    check('最高分榜分数取单局最高', bestScores.join(',') === '36,36,20,15,10', bestScores);

    const totalBoard = await api('/api/game/leaderboards?type=total&limit=50');
    check(
        '累计榜排序：同分时最高单局分高者优先',
        JSON.stringify(mine(totalBoard.json?.entries || [])) === JSON.stringify(['ada', 'dee', 'elu', 'cy', 'bo']),
        mine(totalBoard.json?.entries || []),
    );
    check(
        '累计榜分数取总积分',
        (totalBoard.json?.entries || []).filter((entry) => entry.username?.includes(STAMP)).map((entry) => entry.score).join(',') === '46,36,30,30,10',
        totalBoard.json?.entries,
    );

    const myBoard = await api('/api/game/leaderboards?type=best&limit=50', { token: boToken });
    const boEntry = (myBoard.json?.entries || []).find((entry) => entry.username === `bo_${STAMP}`);
    check('返回自己的名次且与榜单一致', myBoard.json?.me?.username === `bo_${STAMP}` && boEntry && myBoard.json?.me?.rank === boEntry.rank, myBoard.json?.me);

    const eve = await registerPlayer('eve', { username: `eve_${STAMP}` });
    const eveBoard = await api('/api/game/leaderboards?type=best', { token: eve.auth.json?.token });
    check('未上榜玩家 me 为空', eveBoard.json?.me === null, eveBoard.json?.me);
    check('匿名访问不返回 me', (await api('/api/game/leaderboards?type=best')).json?.me === null);
    const slicedBoard = await api('/api/game/leaderboards?type=best&limit=2');
    check('排行榜 limit 生效', slicedBoard.json?.entries?.length === 2, slicedBoard.json?.entries);

    // ---- 机制账号保榜（查询层影子分注入） ----
    console.log('\n[机制账号保榜]');
    if (MECH_ID) {
        // 固定用户名/密码：首次运行创建（显式指定与服务端一致的 id），
        // 对同一数据库重复运行时直接登录复用
        const mechPassword = 'mech-password-123';
        const mechCreated = await api('/api/collections/players/records', {
            method: 'POST',
            body: { id: MECH_ID, username: '机制号测试', password: mechPassword, passwordConfirm: mechPassword },
        });
        const mechAuth = await api('/api/collections/players/auth-with-password', {
            method: 'POST', body: { identity: '机制号测试', password: mechPassword },
        });
        check('机制号已就绪（新建或复用登录）', mechAuth.status === 200 && !!mechAuth.json?.token, mechCreated.json ?? mechAuth.json);

        const mechSubmit = await api('/api/game/runs', {
            method: 'POST', token: mechAuth.json?.token,
            body: { runs: [run(`mech-${STAMP}`, 'nova', 10, 0)] },
        });
        check('机制号提交成绩被拒（403）', mechSubmit.status === 403, mechSubmit.json);

        // 建号不会触发榜单缓存失效，等 3 秒 TTL 过期后再读注入结果
        await new Promise((resolve) => setTimeout(resolve, 3100));

        const injectedTotal = await api('/api/game/leaderboards?type=total&limit=50');
        const totalEntries = injectedTotal.json?.entries || [];
        const mechTotalEntry = totalEntries.find((entry) => entry.playerId === MECH_ID);
        check('total 榜机制号钉第 1 且带 official 标记', mechTotalEntry?.rank === 1 && mechTotalEntry?.official === true, totalEntries.slice(0, 3));
        check(
            'total 榜展示分领先真实榜首 ≥500 且为整百',
            !!mechTotalEntry && !!totalEntries[1] && mechTotalEntry.score >= totalEntries[1].score + 500 && mechTotalEntry.score % 100 === 0,
            { mech: mechTotalEntry?.score, real1: totalEntries[1]?.score },
        );
        check('total 榜机制号只出现一次', totalEntries.filter((entry) => entry.playerId === MECH_ID).length === 1, null);

        const injectedBest = await api('/api/game/leaderboards?type=best&limit=50');
        const bestEntries = injectedBest.json?.entries || [];
        const mechBestEntry = bestEntries.find((entry) => entry.playerId === MECH_ID);
        check('best 榜机制号钉第 3 且带 official 标记', mechBestEntry?.rank === 3 && mechBestEntry?.official === true, bestEntries.slice(0, 5));
        check(
            'best 榜展示分对齐真实第 3 名（注入后列第 4）',
            !!mechBestEntry && !!bestEntries[3] && mechBestEntry.score === bestEntries[3].score,
            bestEntries.slice(0, 5),
        );
        check('真实玩家条目不带 official 标记', bestEntries.every((entry) => entry.playerId === MECH_ID || entry.official === undefined), null);

        const mechMe = await api('/api/game/leaderboards?type=best&limit=50', { token: mechAuth.json?.token });
        check('机制号自己的 me 与注入条目一致', mechMe.json?.me?.playerId === MECH_ID && mechMe.json?.me?.rank === 3, mechMe.json?.me);
    } else {
        const plainBoard = await api('/api/game/leaderboards?type=total&limit=50');
        check(
            '未设置 MECH_PLAYER_ID 时特性关闭：榜单无 official 条目',
            (plainBoard.json?.entries || []).every((entry) => entry.official === undefined),
            null,
        );
        console.log('  （设置 MECH_PLAYER_ID 环境变量可覆盖机制号注入用例，见文件头注释）');
    }

    // ---- 弹幕留言板 ----
    console.log('\n[弹幕留言板]');
    const pause = () => new Promise((resolve) => setTimeout(resolve, 30));

    const anonPost = await api('/api/game/messages', { method: 'POST', body: { text: `  碗碗加油   ${STAMP} ` } });
    check(
        '匿名留言成功：默认署名「路过的碗」且空白被规范化',
        anonPost.status === 200 && anonPost.json?.author === '路过的碗' && anonPost.json?.text === `碗碗加油 ${STAMP}`,
        anonPost.json,
    );
    await pause();
    const nickPost = await api('/api/game/messages', { method: 'POST', body: { text: `盆盆冲鸭 ${STAMP}`, nickname: ' 云朵 ' } });
    check('游客可署短昵称', nickPost.status === 200 && nickPost.json?.author === '云朵', nickPost.json);
    await pause();
    // 留言与账号解绑：带 token 发留言也只看请求里的昵称，不署账号用户名
    const authedNickPost = await api('/api/game/messages', {
        method: 'POST', token: adaToken,
        body: { text: `登录带昵称 ${STAMP}`, nickname: '隐身猫' },
    });
    check(
        '登录用户发留言署自定义昵称而非账号名',
        authedNickPost.status === 200 && authedNickPost.json?.author === '隐身猫' && authedNickPost.json?.author !== `ada_${STAMP}`,
        authedNickPost.json,
    );
    await pause();
    const authedAnonPost = await api('/api/game/messages', {
        method: 'POST', token: adaToken,
        body: { text: `登录不填昵称 ${STAMP}` },
    });
    check('登录用户不填昵称也默认「路过的碗」', authedAnonPost.status === 200 && authedAnonPost.json?.author === '路过的碗', authedAnonPost.json);

    const emptyMessage = await api('/api/game/messages', { method: 'POST', body: { text: '    ' } });
    check('拒绝空留言', emptyMessage.status === 400, emptyMessage.json);
    const longMessage = await api('/api/game/messages', { method: 'POST', body: { text: '好'.repeat(33) } });
    check('拒绝超过 32 字的留言', longMessage.status === 400, longMessage.json);

    const messageList = await api('/api/game/messages?limit=50');
    const listed = messageList.json?.messages || [];
    const texts = listed.map((message) => message.text);
    check('留言列表公开可读且新留言在前', messageList.status === 200 && texts[0] === `登录不填昵称 ${STAMP}`, texts.slice(0, 3));
    check(
        '列表包含本轮全部四条留言',
        [`碗碗加油 ${STAMP}`, `盆盆冲鸭 ${STAMP}`, `登录带昵称 ${STAMP}`, `登录不填昵称 ${STAMP}`].every((expected) => texts.includes(expected)),
        texts.slice(0, 6),
    );
    check(
        '空库时迁移预置的种子留言存在且带 seed=true 标记',
        listed.some((message) => message.seed === true),
        listed.filter((message) => message.seed === true).slice(0, 2),
    );
    check(
        '真实发表的留言 seed=false（前端据此让真留言优先）',
        listed.filter((message) => message.text.includes(STAMP)).every((message) => message.seed === false),
        null,
    );
    const limitedList = await api('/api/game/messages?limit=2');
    check('limit 参数生效', limitedList.json?.messages?.length === 2, limitedList.json?.messages);

    // 发留言按 IP 限流 12 次/分钟（见 concurrency 迁移）。本套件此前已发 6 次，
    // 这里连发最多 10 次，应在其中触发 429。注意：60 秒内重复跑本套件会因
    // 限流窗口未过而误报，请像 CI 一样对全新 PocketBase 进程运行。
    let limited = null;
    for (let i = 0; i < 10 && !limited; i += 1) {
        const result = await api('/api/game/messages', { method: 'POST', body: { text: `刷屏测试 ${STAMP} ${i}` } });
        if (result.status === 429) limited = result;
    }
    check('高频发留言触发限流（429）', limited !== null, limited?.json ?? '10 次内未触发');

    console.log(`\n结果：${passed} 通过，${failures.length} 失败`);
    if (failures.length > 0) {
        console.error('失败项：', failures);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('测试执行异常：', error);
    process.exit(1);
});
