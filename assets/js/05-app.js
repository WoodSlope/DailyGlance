/* DailyGlance [5] - split from dailyglance.html. Keep classic script order. */
// ==========================================
// [5] 交互与生命周期 (Events & Lifecycle)
// ==========================================

function calculateBacktestSummary(full, options = {}) {
    const initialCapital = options.initialCapital || 10000;
    const costRate = options.costRate ?? 0.001;
    const startIdx = Math.max(1, options.startIdx ?? 60);
    let capital = initialCapital, peakCapital = initialCapital, maxDrawdown = 0;
    let prevAdv = full[startIdx - 1]?._decision?.position || 0;
    let entryCapital = 0, winCount = 0, totalTrades = 0;
    const trades = [], closedTradeReturns = [];

    for(let i = startIdx; i < full.length; i++) {
        const item = full[i], prev = full[i-1], decision = item?._decision;
        if (!item || !prev || !decision) continue;

        if (prevAdv > 0) {
            const dailyRet = (item.close - prev.close) / prev.close;
            capital = capital * (1 + dailyRet * (prevAdv / 100));
        }

        if(capital > peakCapital) peakCapital = capital;
        const dd = (peakCapital - capital) / peakCapital;
        if(dd > maxDrawdown) maxDrawdown = dd;

        if (decision.position !== prevAdv) {
            const turnover = Math.abs(decision.position - prevAdv) / 100;
            const cost = capital * turnover * costRate;
            if (cost > 0) capital -= cost;

            trades.push({
                date: item.date,
                action: decision.simpleAction,
                posFrom: prevAdv,
                posTo: decision.position,
                price: item.close,
                cost
            });

            if (prevAdv === 0 && decision.position > 0) {
                entryCapital = capital;
            } else if (decision.position === 0 && prevAdv > 0) {
                totalTrades++;
                const tradeRet = entryCapital ? (capital - entryCapital) / entryCapital : 0;
                closedTradeReturns.push(tradeRet);
                if (tradeRet > 0) winCount++;
                entryCapital = 0;
            }

            if(capital > peakCapital) peakCapital = capital;
            const postCostDd = (peakCapital - capital) / peakCapital;
            if(postCostDd > maxDrawdown) maxDrawdown = postCostDd;
        }
        prevAdv = decision.position;
    }

    return {
        capital,
        ret: ((capital - initialCapital) / initialCapital * 100).toFixed(2),
        maxDrawdown: (maxDrawdown * 100).toFixed(2),
        winRate: totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0',
        winCount,
        totalTrades,
        trades,
        closedTradeReturns,
        costRate,
        startIdx,
        sampleDays: Math.max(0, full.length - startIdx)
    };
}

async function runBacktest() {
    if(state.mode !== 'stock' || !state.id) return customAlert("请先选择并查看一只具体的股票后再运行回测。");
    
    const full = state.rawData[state.id]; 
    if(!full || full.length < 100) return customAlert("历史数据不足，无法完成精准回测。");
    
    const prevPeriod = state.period; 
    showLoading("策略沙盘高速推演中...");

    try {
        if (state.period !== 'daily') { 
            state.period = 'daily'; 
            markIndicatorsDirty(); 
        }
        
        updateAllIndicators(); 
        await new Promise(r => setTimeout(r, 100)); 
        
        const summary = calculateBacktestSummary(full, { startIdx: 60, costRate: 0.001 });
        const { ret, winRate, maxDrawdown: md, winCount, totalTrades, trades } = summary;
        
        hideLoading();
        
        let tradeRows = [...trades].reverse().map(t => {
            const colorClass = t.posTo > t.posFrom ? 'text-bull' : 'text-bear';
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px dashed var(--border-color); font-family:'JetBrains Mono', monospace; font-size:11px;">
                    <span class="text-dim" style="flex:1; text-align:left;">${t.date.length > 5 ? t.date.substring(5) : t.date}</span>
                    <span class="${colorClass}" style="font-weight:bold; width:50px; text-align:center; flex-shrink:0;">${t.action.substring(0, 4)}</span>
                    <span class="text-main" style="flex:1; text-align:right;">${t.price.toFixed(2)}</span>
                    <span class="text-dim" style="flex:1.2; text-align:right;">${t.posFrom}%➔${t.posTo}%</span>
                </div>
            `;
        }).join('');
        
        const tradeListHtml = trades.length > 0 
            ? `<div style="margin-top:16px; border:1px solid var(--border-color); border-radius:var(--radius-sm); max-height:180px; overflow-y:auto; padding:0 12px; text-align:left;">${tradeRows}</div>` 
            : `<div style="margin-top:16px; padding:20px; font-size:12px; text-align:center; border:1px dashed var(--border-color); border-radius:var(--radius-sm);" class="text-dim">区间内无调仓动作</div>`;

        const reportHtml = `
            <div class="mono text-main" style="font-size:15px;font-weight:800;margin-bottom:16px;letter-spacing:0.5px;text-align:center;">
                回测报告: ${state.stockId}
            </div>
            <div class="text-dim" style="font-size:12px;margin-bottom:20px;text-align:center;">
                基于「${state.strategy}」过去 ${summary.sampleDays} 天日线推演，调仓成本按单边 ${(summary.costRate * 100).toFixed(2)}% 估算
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:left;">
                <div class="terminal-block" style="padding:14px;">
                    <div class="text-dim" style="font-size:11px;margin-bottom:6px;font-weight:600;">策略总收益</div>
                    <div class="mono ${ret >= 0 ? 'text-bull' : 'text-bear'}" style="font-size:20px;font-weight:800;">${ret > 0 ? '+' : ''}${ret}%</div>
                </div>
                <div class="terminal-block" style="padding:14px;">
                    <div class="text-dim" style="font-size:11px;margin-bottom:6px;font-weight:600;">极限最大回撤</div>
                    <div class="mono text-main" style="font-size:20px;font-weight:800;">${md}%</div>
                </div>
                <div class="terminal-block" style="padding:14px;grid-column:1/-1;">
                    <div class="text-dim" style="font-size:11px;margin-bottom:6px;font-weight:600;">波段交易胜率</div>
                    <div style="display:flex;justify-content:space-between;align-items:end;">
                        <div class="mono text-info" style="font-size:24px;font-weight:800;">${winRate}%</div>
                        <div class="text-dim" style="font-size:12px;font-weight:500;">${totalTrades} 次清仓结算，获利 ${winCount} 次</div>
                    </div>
                </div>
            </div>
            ${tradeListHtml}
            <div class="text-dim" style="margin-top:16px;font-size:10px;line-height:1.5;text-align:justify;">
                注：交易记录按盘末收盘价触发，收益按实际仓位比例滚动计算，并扣除调仓成本；未模拟涨跌停无法成交、盘中滑点和 T+1 约束。主图 B/S 仅标注重大的开平仓转折点，中途加减仓仅在回测记录中展示。
            </div>
        `;
        
        await customAlert(reportHtml, true);
    } catch(e) { 
        hideLoading(); 
        await customAlert('回测失败：' + (e.message || e)); 
    } finally { 
        if (state.period !== prevPeriod) { 
            state.period = prevPeriod; 
            markIndicatorsDirty(); 
            updateAllIndicators(); 
            draw(); 
            safeUpdateSidebar(); 
        } 
    }
}

function searchLocalStocks(q) { 
    const qt = q.toLowerCase(); 
    return STOCK_DATABASE
        .concat(stockCache.filter(s => !STOCK_DATABASE.some(b => b.Code === s.Code)))
        .map(s => ({ Code: s.Code, Name: normalizeStockDisplayName(s.Code, s.Name) }))
        .filter(s => s.Name.toLowerCase().includes(qt) || s.Code.includes(qt)); 
}

function jsonpSearchEastmoney(query) {
    return new Promise(resolve => {
        const cb = 'em_search_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const url = `https://searchadapter.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=${STOCK_TOKEN}&cb=${cb}`;
        let cl = false;
        const cleanup = () => {
            if (cl) return;
            cl = true; clearTimeout(timer); delete window[cb];
            const s = document.getElementById('jq_' + cb);
            if (s) s.remove();
        };
        const timer = setTimeout(() => { cleanup(); resolve([]); }, 5000);
        window[cb] = data => {
            cleanup();
            const list = data?.QuotationCodeTable?.Data || [];
            resolve(list.filter(x => /^\d{6}$/.test(x.Code)).map(x => ({ Code: x.Code, Name: x.Name || x.SecurityName || x.Code })));
        };
        const script = document.createElement('script');
        script.id = 'jq_' + cb;
        script.src = url;
        script.onerror = () => { cleanup(); resolve([]); };
        document.head.appendChild(script);
    });
}

function jsonpSearchSina(query) {
    return new Promise(resolve => {
        const cb = 'sina_search_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const url = `https://suggest.sinajs.cn/suggest/type=11&key=${encodeURIComponent(query)}&callback=${cb}`;
        let cl = false;
        const cleanup = () => {
            if (cl) return;
            cl = true; clearTimeout(timer); delete window[cb];
            const s = document.getElementById('jq_' + cb);
            if (s) s.remove();
        };
        const timer = setTimeout(() => { cleanup(); resolve([]); }, 5000);
        window[cb] = data => {
            cleanup();
            const list = data?.result?.items || [];
            resolve(list.map(i => ({ Code: i.code, Name: i.name })).filter(x => /^\d{6}$/.test(x.Code)));
        };
        const script = document.createElement('script');
        script.id = 'jq_' + cb;
        script.src = url;
        script.onerror = () => { cleanup(); resolve([]); };
        document.head.appendChild(script);
    });
}

async function jsonpSearch(query) {
    const res = await jsonpSearchEastmoney(query);
    return res.length ? res : await jsonpSearchSina(query);
}

let suggestTimer = null, suggestActiveIdx = -1, suggestSeq = 0;

function onSearchInput() { 
    clearTimeout(suggestTimer); 
    suggestTimer = setTimeout(fetchSuggestions, 200); 
}

function closeSuggestions() { 
    const el = document.getElementById('stockSuggest'); 
    if(el) el.style.display = 'none'; 
    suggestActiveIdx = -1; 
}

async function fetchSuggestions() {
    const inp = document.getElementById('stockSearchInput');
    const sug = document.getElementById('stockSuggest'); 
    if(!inp || !sug) return;
    
    const q = inp.value.trim(); 
    if(!q) { sug.style.display = 'none'; return; }
    
    const seq = ++suggestSeq; 
    let res = searchLocalStocks(q).slice(0, 20); 
    if(!res.length) res = await jsonpSearch(q);
    
    if(seq !== suggestSeq || inp.value.trim() !== q) return;
    
    if(!res.length) { 
        sug.innerHTML = '<div class="stock-suggest-empty">无匹配结果</div>'; 
        sug.style.display = 'block'; 
        suggestActiveIdx = -1; 
        return; 
    }
    renderSuggest(sug, res.slice(0, 20));
}

async function searchAndShowInSuggest(q) {
    const inp = document.getElementById('stockSearchInput');
    const query = String(q || '').trim();
    const sug = document.getElementById('stockSuggest'); 
    if(!sug) return; 
    
    sug.innerHTML = '<div class="stock-suggest-empty">搜索中...</div>'; 
    sug.style.display = 'block';
    
    const seq = ++suggestSeq; 
    let res = await jsonpSearch(query); 
    if(!res.length) res = searchLocalStocks(query).slice(0, 20);
    
    if(seq !== suggestSeq || (inp && inp.value.trim() !== query)) return;
    
    if(!res.length) { 
        sug.innerHTML = '<div class="stock-suggest-empty">无匹配结果</div>'; 
        suggestActiveIdx = -1; 
        return; 
    } 
    renderSuggest(sug, res.slice(0, 20));
}

function renderSuggest(container, res) { 
    container.innerHTML = res.map(x => `
        <div class="stock-suggest-item" onclick="selectSuggestItem('${escapeJSArg(x.Code)}','${escapeJSArg(normalizeStockDisplayName(x.Code, x.Name))}')">
            <span class="ss-name">${escapeHTML(normalizeStockDisplayName(x.Code, x.Name))}</span>
            <span class="ss-code mono">${escapeHTML(x.Code)}</span>
        </div>
    `).join(''); 
    container.style.display = 'block'; 
    suggestActiveIdx = -1;
}

function selectSuggestItem(code, name) { 
    closeSuggestions(); 
    const i = document.getElementById('stockSearchInput');
    const safeCode = String(code || '').trim();
    const safeName = normalizeStockDisplayName(safeCode, name); 
    
    if(i) i.value = ''; 
    if(!/^\d{6}$/.test(safeCode)) return; 
    
    const alreadyWatched = state.watchlist.some(s => s.code === safeCode);
    if(!alreadyWatched && state.watchlist.length >= 10) { 
        customAlert('最多只能添加 10 只自选股。'); 
        return; 
    }
    
    if(!STOCK_DATABASE.some(s => s.Code === safeCode) && !stockCache.some(s => s.Code === safeCode)) { 
        stockCache.push({ Code: safeCode, Name: safeName }); 
        dbSet('stock_cache', stockCache); 
    } 
    selectStock(safeCode, safeName); 
}

function onSearchKeydown(e) {
    const inp = document.getElementById('stockSearchInput');
    const sug = document.getElementById('stockSuggest');
    const items = sug ? sug.querySelectorAll('.stock-suggest-item') : [];
    
    if(e.key === 'Escape'){ closeSuggestions(); return; }
    
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); 
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            suggestActiveIdx = (suggestActiveIdx + 1) % items.length; 
        } else {
            suggestActiveIdx = (suggestActiveIdx - 1 + items.length) % items.length;
        }
        
        items.forEach((item, idx) => { 
            if (idx === suggestActiveIdx) { 
                item.classList.add('active'); 
                item.scrollIntoView({ block: 'nearest' }); 
            } else {
                item.classList.remove('active'); 
            }
        }); 
        return;
    }
    
    if(e.key === 'Enter') { 
        e.preventDefault(); 
        if (suggestActiveIdx >= 0 && items && items.length > suggestActiveIdx) { 
            items[suggestActiveIdx].click(); 
            return; 
        }
        const q = inp.value.trim(); 
        if(q) searchAndShowInSuggest(q); 
    }
}

async function loadWatchlist() { 
    try { 
        const w = await dbGet('watchlist_list'); 
        const rawWatchlist = (w && w.data) || [];
        state.watchlist = rawWatchlist.map(stock => ({
            ...stock,
            name: normalizeStockDisplayName(stock.code, stock.name)
        }));
        if (JSON.stringify(state.watchlist) !== JSON.stringify(rawWatchlist)) {
            try {
                await saveWatchlist();
            } catch(e) {}
        }
    } catch(e) { 
        state.watchlist = []; 
    } 
}

async function saveWatchlist() { 
    await dbSet('watchlist_list', state.watchlist); 
}

const WATCHLIST_STATUS_META = {
    candidate: { label: '候选' },
    hold: { label: '持有' },
    observe: { label: '观察' },
    defend: { label: '防守' },
    pending: { label: '同步' }
};

let watchlistRenderRAF = 0;
let watchlistSnapshotFlushHandle = 0;
const watchlistSnapshotQueue = new Map();

function resolveWatchlistStatus(decision) {
    if (!decision) return { ...WATCHLIST_STATUS_META.pending, action: '信号待同步', toneClass: 'tone-dim' };

    const action = decision.simpleAction || '';
    const toneClass = decision.simpleColorClass ? decision.simpleColorClass.replace('text-', 'tone-') : 'tone-dim';
    if (['轻仓建仓', '积极建仓', '缓慢加仓', '顺势加仓'].includes(action)) {
        return { ...WATCHLIST_STATUS_META.candidate, action, toneClass };
    }
    if (['轻仓持有', '积极持有', '顺势抱单'].includes(action)) {
        return { ...WATCHLIST_STATUS_META.hold, action, toneClass };
    }
    if (['防守减仓', '执行离场', '清仓离场', '规避风险'].includes(action)) {
        return { ...WATCHLIST_STATUS_META.defend, action, toneClass };
    }
    if (['持币观望', '谨慎持有'].includes(action)) {
        return { ...WATCHLIST_STATUS_META.observe, action, toneClass };
    }
    return { ...WATCHLIST_STATUS_META.observe, action: action || '观察中', toneClass };
}

function setWatchlistStatusSnapshot(code, status) {
    const item = state.watchlist.find(stock => stock.code === code);
    if (item) item._navStatus = status || null;
}

function scheduleWatchlistRender() {
    if (watchlistRenderRAF) return;
    watchlistRenderRAF = requestAnimationFrame(() => {
        watchlistRenderRAF = 0;
        if (state.mode === 'stock') renderWatchlist();
    });
}

function applyWatchlistDecisionSnapshot(code, decision, date) {
    const status = resolveWatchlistStatus(decision);
    setWatchlistStatusSnapshot(code, { ...status, strategy: state.strategy, date: date || '' });
}

function primeWatchlistStatusSnapshot(code, date) {
    const item = state.watchlist.find(stock => stock.code === code);
    if (!item) return;
    if (item._navStatus && item._navStatus.strategy === state.strategy) {
        item._navStatus = { ...item._navStatus, date: date || item._navStatus.date || '' };
        return;
    }
    setWatchlistStatusSnapshot(code, { ...WATCHLIST_STATUS_META.pending, action: '信号同步中', toneClass: 'tone-dim', strategy: state.strategy, date: date || '' });
}

function getLatestDecisionFromData(full) {
    const last = full?.[full.length - 1];
    if (last?._decision && last._strategy === state.strategy && last._signalVersion === SIGNAL_VERSION) {
        return last._decision;
    }
    return null;
}

function computeWatchlistDecisionSnapshot(full) {
    if (!full || full.length < 60) return null;

    const cachedDecision = getLatestDecisionFromData(full);
    if (cachedDecision) return cachedDecision;

    const localIndicators = { ma: {}, macd: null, rsi: null, kdj: null };
    MA_OPTIONS.forEach(n => localIndicators.ma[n] = Calcs.ma(full, n));
    localIndicators.macd = Calcs.macd(full);
    localIndicators.rsi = Calcs.rsi(full);
    localIndicators.kdj = Calcs.kdj(full);

    const prevMode = state.mode;
    const prevPeriod = state.period;
    const prevIndicators = state.indicators;
    let prevPos = 0;

    try {
        state.mode = 'stock';
        state.period = 'daily';
        state.indicators = localIndicators;

        const tailStartIdx = Math.max(0, full.length - 80);
        const priorDecision = tailStartIdx > 0 ? full[tailStartIdx - 1]?._decision : null;
        const canUseTailRebuild = priorDecision && full[tailStartIdx - 1]?._strategy === state.strategy && full[tailStartIdx - 1]?._signalVersion === SIGNAL_VERSION;
        const startIdx = canUseTailRebuild ? tailStartIdx : 0;
        prevPos = canUseTailRebuild ? (priorDecision.position || 0) : 0;
        for (let i = startIdx; i < full.length; i++) {
            if (!full[i]) continue;
            full[i]._signals = calculateDailySignals(i, full, localIndicators);
            full[i]._signalVersion = SIGNAL_VERSION;
            full[i]._strategy = state.strategy;
            full[i]._decision = computeDecisionForIndex(i, full, prevPos);
            prevPos = full[i]._decision.position;
        }
        return full[full.length - 1]?._decision || null;
    } finally {
        state.mode = prevMode;
        state.period = prevPeriod;
        state.indicators = prevIndicators;
    }
}

function flushWatchlistSnapshotQueue(deadline) {
    watchlistSnapshotFlushHandle = 0;
    let processed = 0;
    const canContinue = () => !deadline || deadline.didTimeout || deadline.timeRemaining() > 6 || processed === 0;
    while (watchlistSnapshotQueue.size && canContinue()) {
        const [code, full] = watchlistSnapshotQueue.entries().next().value;
        watchlistSnapshotQueue.delete(code);
        syncWatchlistSignalSnapshot(code, full);
        processed++;
    }
    if (watchlistSnapshotQueue.size) scheduleWatchlistSnapshotQueue();
    scheduleWatchlistRender();
}

function scheduleWatchlistSnapshotQueue() {
    if (watchlistSnapshotFlushHandle) return;
    if (typeof window.requestIdleCallback === 'function') {
        watchlistSnapshotFlushHandle = window.requestIdleCallback(flushWatchlistSnapshotQueue, { timeout: 240 });
        return;
    }
    watchlistSnapshotFlushHandle = window.setTimeout(() => flushWatchlistSnapshotQueue(), 48);
}

function queueWatchlistSignalSnapshot(code, full) {
    if (!code || !full?.length) return;
    primeWatchlistStatusSnapshot(code, full[full.length - 1]?.date || '');
    watchlistSnapshotQueue.set(code, full);
    scheduleWatchlistSnapshotQueue();
}

function syncWatchlistSignalSnapshotFast(code, full) {
    const last = full?.[full.length - 1];
    if (!last) {
        setWatchlistStatusSnapshot(code, { ...WATCHLIST_STATUS_META.pending, action: '暂无数据', strategy: state.strategy, date: '' });
        return;
    }
    const decision = getLatestDecisionFromData(full);
    if (decision) {
        applyWatchlistDecisionSnapshot(code, decision, last.date);
        return;
    }
    queueWatchlistSignalSnapshot(code, full);
}

function syncWatchlistSignalSnapshot(code, full) {
    const last = full?.[full.length - 1];
    if (!last) {
        setWatchlistStatusSnapshot(code, { ...WATCHLIST_STATUS_META.pending, action: '暂无数据', strategy: state.strategy, date: '' });
        return;
    }

    const decision = computeWatchlistDecisionSnapshot(full);
    applyWatchlistDecisionSnapshot(code, decision, last.date);
}

function refreshWatchlistSignalSnapshots() {
    state.watchlist.forEach(stock => {
        const full = state.rawData[codeToSecid(stock.code)];
        syncWatchlistSignalSnapshotFast(stock.code, full);
    });
    scheduleWatchlistRender();
}

async function addToWatchlist(code, name) { 
    const displayName = normalizeStockDisplayName(code, name);
    const existing = state.watchlist.find(s => s.code === code);
    if (existing) {
        if (existing.name !== displayName) {
            existing.name = displayName;
            await saveWatchlist();
            renderWatchlist();
        }
        return;
    }
    if(state.watchlist.length >= 10) { 
        await customAlert('最多只能添加 10 只自选股。'); 
        return; 
    } 
    state.watchlist.push({ code, name: displayName }); 
    await saveWatchlist(); 
    renderWatchlist(); 
}

async function removeStock(code) { 
    var stock = state.watchlist.find(function(s) { return s.code === code; });
    if (!stock) return;
    if (stock._pendingRemove) return;
    
    stock._pendingRemove = true;
    renderWatchlist();
    const displayName = normalizeStockDisplayName(code, stock.name);
    
    showToastWithAction(
        '\u5df2\u79fb\u9664 ' + displayName,
        '\u64a4\u9500',
        function() { stock._pendingRemove = false; renderWatchlist(); },
        'info', 3000
    );
    
    setTimeout(async function() {
        if (!stock._pendingRemove) return;
        state.watchlist = state.watchlist.filter(s => s.code !== code); 
        await saveWatchlist(); 
        renderWatchlist();
        
        if(state.stockId === code) { 
            state.stockId = null; 
            state.id = 'sh'; 
            state.mode = 'index'; 
            state.isFrozen = false;
            
            document.querySelectorAll('#mainTabs .nav-btn').forEach(btn => btn.classList.remove('active')); 
            document.querySelector('#mainTabs .nav-btn[data-tab="index"]').classList.add('active');
            document.getElementById('indexNavList').style.display = 'block'; 
            document.getElementById('stockNavList').style.display = 'none'; 
            document.getElementById('btnBacktest').style.display = 'none'; 
            
            globalSelectionSeq++; 
            renderIndexList(); 
            clearCharts(); 
            cachedFetch('sh');
        }
    }, 3000);
}

let watchlistUpdateTimer = null;
let sidebarFullSyncTimer = 0;

function debounceWatchlistUpdate() {
    if (watchlistUpdateTimer) clearTimeout(watchlistUpdateTimer);
    watchlistUpdateTimer = setTimeout(async () => {
        await updateAllWatchlistData();
        renderWatchlist();
    }, 2000);
}

async function updateAllWatchlistData() {
    if (!state.watchlist || !state.watchlist.length) return [];
    const stocks = state.watchlist.filter(s => codeToSecid(s.code) !== state.id);
    const results = await pLimit(stocks, SYS_CONFIG.SIDEBAR_SYNC_CONCURRENCY, async (stock) => {
        const secid = codeToSecid(stock.code);
        try {
            const data = await syncData(secid);
            if (data && data.length >= 30 && isValidPrice(data[data.length - 1].close, secid)) {
                setRawData(secid, data);
                await dbSet(secid, data);
                syncWatchlistSignalSnapshotFast(stock.code, data);
                return { code: stock.code, success: true };
            } else {
                setWatchlistStatusSnapshot(stock.code, { ...WATCHLIST_STATUS_META.pending, action: '数据不足', strategy: state.strategy, date: data?.[data.length - 1]?.date || '' });
                return { code: stock.code, success: false, reason: '数据不足' };
            }
        } catch (e) {
            const cached = await dbGet(secid);
            const cachedData = normalizeConfirmedHistoryData(cached?.data, secid);
            if (cachedData && cachedData.length >= 30) {
                setRawData(secid, cachedData);
                syncWatchlistSignalSnapshotFast(stock.code, cachedData);
                return { code: stock.code, success: true, source: 'cache' };
            } else {
                setWatchlistStatusSnapshot(stock.code, { ...WATCHLIST_STATUS_META.pending, action: '同步失败', strategy: state.strategy, date: '' });
                return { code: stock.code, success: false, reason: e.message };
            }
        }
    });
    scheduleWatchlistRender();
    return results;
}

let _sidebarRefreshFailCount = 0;
async function refreshSidebarRealtime() {
    let ids = [];
    if (state.tab === 'index' || state.mode === 'index') {
        ids = INDEX_IDS.filter(id => id !== state.id);
    } else if (state.tab === 'stock' || state.mode === 'stock') {
        ids = (state.watchlist || []).map(s => codeToSecid(s.code)).filter(id => id && id !== state.id);
    }
    if (!ids.length) return;
    const prices = await batchGetRealtimePrices(ids);
    if (!Object.keys(prices).length) {
        _sidebarRefreshFailCount++;
        if (_sidebarRefreshFailCount >= 2) {
            showToast('\u884c\u60c5\u8fde\u63a5\u5f02\u5e38\uff0c\u4fa7\u8fb9\u680f\u4ef7\u683c\u53ef\u80fd\u5ef6\u8fdf', 'warn', 4000);
        }
        return;
    }
    _sidebarRefreshFailCount = 0;
    let changed = false;
    for (const [id, rtBar] of Object.entries(prices)) {
        const series = state.rawData[id];
        if (!series || !series.length) continue;
        const lastBar = series[series.length - 1];
        if (!lastBar || !isValidPrice(rtBar.close, id)) continue;
        if (rtBar.date < lastBar.date) continue;
        applyRealtimeQuoteForSeries(id, series, rtBar);
        changed = true;
    }
    if (changed) {
        if (state.tab === 'index' || state.mode === 'index') refreshIndexListQuotes();
        if (state.tab === 'stock' || state.mode === 'stock') refreshWatchlistQuotes();
        markRefreshTime();
    }
}

function startSidebarFullSync() {
    if (sidebarFullSyncTimer) return;
    sidebarFullSyncTimer = setInterval(async () => {
        if (document.hidden) return;
        if (!isMarketOpen()) return;
        if (state.tab === 'index' || state.mode === 'index') {
            const ids = INDEX_IDS.filter(id => id !== state.id);
            let failCnt = 0;
            await pLimit(ids, SYS_CONFIG.SIDEBAR_SYNC_CONCURRENCY, async (id) => {
                try {
                    const data = await syncData(id);
                    if (data && data.length >= 30) { setRawData(id, data); await dbSet(id, data); }
                } catch(e) { failCnt++; }
            });
            if (failCnt >= 2) showToast('\u90e8\u5206\u6307\u6570\u5386\u53f2\u6570\u636e\u540c\u6b65\u5931\u8d25', 'warn', 4000);
            renderIndexList();
        } else if (state.tab === 'stock' || state.mode === 'stock') {
            if (!state.watchlist || !state.watchlist.length) return;
            const results = await updateAllWatchlistData();
            const failCount = results ? results.filter(r => !r.success).length : 0;
            if (failCount >= 2) showToast('\u90e8\u5206\u81ea\u9009\u80a1\u6570\u636e\u540c\u6b65\u5931\u8d25', 'warn', 4000);
        }
    }, 90000);
}

// P0-3: 切换标的防抖 — 快速连点只执行最后一次，避免浪费网络请求
let _selectDebounceTimer = 0;
function selectIndex(id) {
    clearTimeout(_selectDebounceTimer);
    _selectDebounceTimer = setTimeout(() => _selectIndexImpl(id), 120);
}

async function _selectIndexImpl(id) {
    const perfTrace = PERF.start('selectIndex', { id });
    if (!getIndexConfig(id)) return;
    const selectionSeq = ++globalSelectionSeq;
    const config = getIndexConfig(id);

    state.tab = 'index';
    state.mode = 'index';
    state.id = id;
    state.stockId = null;
    state.isFrozen = false;
    resetViewportToLatest(null);

    document.querySelectorAll('#mainTabs .nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'index'));
    document.getElementById('indexNavList').style.display = 'block';
    document.getElementById('stockNavList').style.display = 'none';
    document.getElementById('btnBacktest').style.display = 'none';

    resetIndicatorState();
    // P0-1: showLoading 提前到 clearCharts 之前，避免图表区一帧空白闪烁
    showLoading(`加载 ${config.name} 数据...`);
    renderIndexList();
    clearCharts();
    renderCache.clear();

    try {
        await cachedFetch(id);
        PERF.mark(perfTrace, 'cachedFetch');
        if (selectionSeq !== globalSelectionSeq || state.id !== id) return;
        renderIndexList();
        PERF.mark(perfTrace, 'renderIndexList');
    } finally {
        if (selectionSeq === globalSelectionSeq) hideLoading();
        PERF.end(perfTrace, { selected: state.id, selectionSeq });
    }
}

function selectStock(code, name) {
    clearTimeout(_selectDebounceTimer);
    _selectDebounceTimer = setTimeout(() => _selectStockImpl(code, name), 120);
}

async function _selectStockImpl(code, name) {
    const perfTrace = PERF.start('selectStock', { code });
    const safeCode = String(code || '').trim();
    const safeName = normalizeStockDisplayName(safeCode, name);
    if (!/^\d{6}$/.test(safeCode)) return;

    const selectionSeq = ++globalSelectionSeq;
    const secid = codeToSecid(safeCode);
    await addToWatchlist(safeCode, safeName);
    if (selectionSeq !== globalSelectionSeq) return;

    state.tab = 'stock';
    state.mode = 'stock';
    state.id = secid;
    state.stockId = safeCode;
    state.isFrozen = false;
    resetViewportToLatest(null);

    document.querySelectorAll('#mainTabs .nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'stock'));
    document.getElementById('indexNavList').style.display = 'none';
    document.getElementById('stockNavList').style.display = 'block';
    document.getElementById('btnBacktest').style.display = 'flex';

    resetIndicatorState();
    // P0-1: showLoading 提前到 clearCharts 之前，避免图表区一帧空白闪烁
    showLoading(`加载 ${safeName} 数据...`);
    renderWatchlist();
    clearCharts();
    renderCache.clear();

    try {
        await cachedFetch(secid);
        PERF.mark(perfTrace, 'cachedFetch');
        if (selectionSeq !== globalSelectionSeq || state.id !== secid || state.stockId !== safeCode) return;
        const data = getActiveData();
        if (!(data && data.length >= 30 && isValidPrice(data[data.length - 1].close, secid))) {
            setRawData(secid, null);
            clearCharts();
            const cPrice = document.getElementById('cardPrice');
            const cAnalysis = document.getElementById('cardAnalysis');
            if (cPrice) {
                cPrice.style.display = 'flex';
                cPrice.innerHTML = '<div class="stock-empty">该股票数据暂时加载失败，请稍后重试或更换标的。</div>';
            }
            if (cAnalysis) cAnalysis.style.display = 'none';
        }
        PERF.mark(perfTrace, 'post-check', { points: data?.length || 0 });
    } catch(e) {
        if (selectionSeq !== globalSelectionSeq || state.id !== secid || state.stockId !== safeCode) return;
        setRawData(secid, null);
        clearCharts();
        const cPrice = document.getElementById('cardPrice');
        const cAnalysis = document.getElementById('cardAnalysis');
        if (cPrice) {
            cPrice.style.display = 'flex';
            cPrice.innerHTML = '<div class="stock-empty">该股票数据暂时加载失败，请稍后重试或更换标的。</div>';
        }
        if (cAnalysis) cAnalysis.style.display = 'none';
    } finally {
        if (selectionSeq === globalSelectionSeq) {
            hideLoading();
            renderWatchlist();
            debounceWatchlistUpdate();
        }
        PERF.end(perfTrace, { selected: state.stockId, selectionSeq });
    }
}

function updateLeftMarketContext(date) {
    const container = document.getElementById('leftMarketContext');
    if(!container) return;

    const market = getMarketContext(date);
    const panelClass = market.cls === 'bull' ? 'panel-bull' : (market.cls === 'bear' ? 'panel-bear' : 'panel-info');
    const textClass = market.cls === 'bull' ? 'text-bull' : (market.cls === 'bear' ? 'text-bear' : 'text-main');

    let detailHtml = market.trends.map(t => `
        <div class="index-dash-card" style="padding: 8px 10px; margin-bottom: 4px;">
            <span class="n">${t.name}</span>
            <span class="s ${t.score>0?'text-bull':t.score<0?'text-bear':'text-main'}">${t.state}</span>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="stock-header" style="margin-top:24px; padding-bottom:8px;">
            <div class="title-wrap"><span>大盘环境与共振</span></div>
        </div>
        <div class="action-panel ${panelClass}" style="padding: 12px; gap:6px;">
            <div class="action-line">
                <div class="action-name ${textClass}" style="font-size:16px;">${escapeHTML(market.label)}</div>
                <div class="action-cap">
                    <span class="text-dim" style="font-size:10px;">建议仓位上限</span>
                    <strong class="text-main mono" style="font-size:14px;">${market.maxPosition}%</strong>
                </div>
            </div>
            <div class="action-sub text-dim" style="font-size:11px; padding-top:6px; margin-top:4px; line-height:1.4;">
                ${escapeHTML(market.reason)}
            </div>
        </div>
        <div class="index-dash-grid" style="margin-top:8px;">
            ${detailHtml}
        </div>
    `;
}

function renderIndexList() {
    const container = document.getElementById('indexNavList'); 
    if(!container) return;
    
    const html = INDEX_IDS.map(id => {
        const config = INDEX_CONFIG[id];
        const active = state.id === id && state.mode === 'index' ? 'active' : '';
        const d = getVisibleQuoteData(id);
        const indexCode = (config.tencent || id).toUpperCase();
        const price = d?.length ? d[d.length-1].close : 0;
        const prev = getVisibleQuoteChangeBase(id, d);
        const change = price - prev;
        const pct = (change / prev * 100) || 0;
        const cl = change >= 0 ? 'up' : 'down';
        
        const priceHtml = price > 0 
            ? `<span class="lprice mono ${cl}" data-code="${id}">${price.toFixed(2)}</span><span class="lchange mono ${cl}" data-code="${id}">${pct !== 0 ? (change >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--'}</span>` 
            : `<span class="lprice mono" data-code="${id}">--</span><span class="lchange mono" data-code="${id}">--</span>`;
            
        return `
            <div class="nav-list-item ${active}" onclick="selectIndex('${id}')">
                <div class="nav-list-main">
                    <div class="lname-wrap">
                        <span class="lname">${config.name}</span>
                    </div>
                </div>
                <div class="nav-list-sub">
                    <span class="lcode mono">${escapeHTML(indexCode)}</span>
                    <div class="lquote">${priceHtml}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="stock-header">
            <div class="title-wrap"><span>核心宽基指数</span></div>
        </div>
        <div>${html}</div>
        <div id="leftMarketContext"></div>
    `;
    
    const rd = getActiveData();
    if (rd && rd.length > 0) {
        const safeIdx = getSafeIndex(rd);
        if (safeIdx >= 0 && safeIdx < rd.length) updateLeftMarketContext(rd[safeIdx].date);
    } else {
        updateLeftMarketContext(getBJDate().toISOString().split('T')[0]);
    }
}

function renderWatchlist() {
    const container = document.getElementById('stockNavList'); 
    if(!container) return;
    
    const sHtml = `
        <div class="stock-search">
            <input id="stockSearchInput" placeholder="搜索代码/名称..." autocomplete="off" oninput="onSearchInput()" onkeydown="onSearchKeydown(event)">
            <div class="stock-suggest" id="stockSuggest"></div>
        </div>
    `;
    
    if(!state.watchlist.length) { 
        container.innerHTML = `
            <div class="stock-header"><div class="title-wrap"><span>自选股池</span></div></div>
            ${sHtml}
            <div class="stock-empty"><strong>添加自选股</strong><br/>开启量化追踪</div>
        `; 
        return; 
    }
    
    const lHtml = state.watchlist.map(s => {
        const displayName = normalizeStockDisplayName(s.code, s.name);
        const id = codeToSecid(s.code);
        const d = getVisibleQuoteData(id);
        const statusData = getMergedLiveDailyData(id);
        const lastDate = statusData?.length ? statusData[statusData.length - 1].date : '';
        const rowStatus = s._navStatus && s._navStatus.strategy === state.strategy && s._navStatus.date === lastDate
            ? s._navStatus
            : (() => {
                const fallback = resolveWatchlistStatus(getLatestDecisionFromData(statusData));
                const status = { ...fallback, strategy: state.strategy, date: lastDate };
                setWatchlistStatusSnapshot(s.code, status);
                return status;
            })();
        const price = d?.length ? d[d.length-1].close : 0;
        const prev = getVisibleQuoteChangeBase(id, d);
        const change = price - prev;
        const pct = (change / prev * 100) || 0;
        const cl = change >= 0 ? 'up' : 'down';
        
        return `
            <div class="nav-list-item ${s.code === state.stockId ? 'active' : ''}${s._pendingRemove ? ' pending-remove' : ''}" data-code="${s.code}" ${s._pendingRemove ? '' : `onclick="selectStock('${escapeJSArg(s.code)}','${escapeJSArg(displayName)}')"`}>
                <div class="nav-list-main">
                    <div class="lname-wrap">
                        <span class="lname">${escapeHTML(displayName)}</span>
                        <span class="wl-status ${rowStatus.toneClass}" title="${escapeHTML(rowStatus.action)}">${rowStatus.label}</span>
                    </div>
                    ${s._pendingRemove ? '' : `<button type="button" class="wl-close" title="移除自选股" aria-label="移除 ${escapeHTML(displayName)}" onclick="event.stopPropagation();removeStock('${escapeJSArg(s.code)}')">×</button>`}
                </div>
                <div class="nav-list-sub">
                    <div class="wl-sub-left">
                        <span class="lcode mono">${escapeHTML(s.code)}</span>
                        <span class="wl-action ${rowStatus.toneClass}" title="${escapeHTML(rowStatus.action)}">${escapeHTML(rowStatus.action || rowStatus.label)}</span>
                    </div>
                    <div class="lquote">
                        <span class="lprice mono ${cl}" data-code="${s.code}">${price > 0 ? price.toFixed(2) : '--'}</span>
                        <span class="lchange mono ${cl}" data-code="${s.code}">${pct !== 0 ? (change >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--'}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="stock-header"><div class="title-wrap"><span>自选股池</span></div></div>
        ${sHtml}
        <div>${lHtml}</div>
    `;
}

function refreshWatchlistQuotes() {
    (state.watchlist || []).forEach(s => {
        const id = codeToSecid(s.code);
        const d = getVisibleQuoteData(id);
        const price = d?.length ? d[d.length - 1].close : 0;
        const prev = getVisibleQuoteChangeBase(id, d);
        const change = price - prev;
        const pct = (change / prev * 100) || 0;
        const cl = change >= 0 ? 'up' : 'down';
        const priceEl = document.querySelector(`#stockNavList .lprice[data-code="${s.code}"]`);
        const changeEl = document.querySelector(`#stockNavList .lchange[data-code="${s.code}"]`);
        if (priceEl) {
            priceEl.textContent = price > 0 ? price.toFixed(2) : '--';
            priceEl.className = `lprice mono ${cl}`;
        }
        if (changeEl) {
            changeEl.textContent = pct !== 0 ? (change >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--';
            changeEl.className = `lchange mono ${cl}`;
        }
    });
}

function refreshIndexListQuotes() {
    INDEX_IDS.forEach(id => {
        const d = getVisibleQuoteData(id);
        const price = d?.length ? d[d.length - 1].close : 0;
        const prev = getVisibleQuoteChangeBase(id, d);
        const change = price - prev;
        const pct = (change / prev * 100) || 0;
        const cl = change >= 0 ? 'up' : 'down';
        const priceEl = document.querySelector(`#indexNavList .lprice[data-code="${id}"]`);
        const changeEl = document.querySelector(`#indexNavList .lchange[data-code="${id}"]`);
        if (priceEl) {
            priceEl.textContent = price > 0 ? price.toFixed(2) : '--';
            priceEl.className = `lprice mono ${cl}`;
        }
        if (changeEl) {
            changeEl.textContent = pct !== 0 ? (change >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--';
            changeEl.className = `lchange mono ${cl}`;
        }
    });
}

function toggleMA(n) { 
    if(state.activeMAs.includes(n)) {
        state.activeMAs = state.activeMAs.filter(v => v !== n); 
    } else {
        state.activeMAs.push(n); 
    }
    state.activeMAs.sort((a, b) => a - b); 
    renderMASelector(); 
    redrawCurrentViewport(); 
}

function renderMASelector() { 
    const c = document.getElementById('indicatorGroup'); 
    if(c) {
        c.innerHTML = MA_OPTIONS.map(n => { 
            const isActive = state.activeMAs.includes(n);
            const color = MA_COLORS[n]; 
            return `
                <label class="ma-checkbox" style="color:${isActive ? color : 'var(--text-dim)'}">
                    <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleMA(${n})">
                    <span class="check-box" style="border-color:${color}; background-color:${isActive ? color : 'transparent'}"></span>
                    MA${n}
                </label>
            `; 
        }).join(''); 
    }
}

function redrawCurrentViewport() {
    if (typeof drawViewport === 'function') drawViewport();
    else draw();
}

function suppressStaleHoverSelection() {
    if (typeof pendingHoverIdx !== 'undefined') pendingHoverIdx = -1;
    if (typeof hoverRAF !== 'undefined' && hoverRAF) {
        cancelAnimationFrame(hoverRAF);
        hoverRAF = null;
    }
    if (typeof chartHoverSuppressUntil !== 'undefined') chartHoverSuppressUntil = Date.now() + 350;
}

function prevDay() {
    if(state.lockIdx > 0) {
        state.isFrozen = true;
        setLockIdx(state.lockIdx - 1);
        anchorViewportAt(state.lockIdx);
        clearStaleTooltips();
        redrawCurrentViewport();
        safeUpdateSidebar();
        updateFreezeBadge();
    }
}

function nextDay() {
    const rd = getActiveData();
    if(rd && state.lockIdx < rd.length - 1) {
        const nextIdx = state.lockIdx + 1;
        setLockIdx(nextIdx);
        state.isFrozen = nextIdx < rd.length - 1;
        if (state.isFrozen) anchorViewportAt(nextIdx);
        else {
            suppressStaleHoverSelection();
            resetViewportToLatest(rd);
        }
        clearStaleTooltips();
        redrawCurrentViewport();
        safeUpdateSidebar();
        if (typeof updateNavCapsuleVisuals === 'function') updateNavCapsuleVisuals(nextIdx, rd.length);
        updateFreezeBadge();
    }
}

function resetLatest() {
    const rd = getActiveData();
    if(rd) {
        suppressStaleHoverSelection();
        state.isFrozen = false;
        setLockIdx(rd.length - 1);
        resetViewportToLatest(rd);
        clearStaleTooltips();
        redrawCurrentViewport();
        safeUpdateSidebar();
        updateNavCapsuleVisuals(rd.length - 1, rd.length);
        updateFreezeBadge();
    }
}

function toggleHelp() { 
    const o = document.getElementById('helpOverlay'); 
    if(o) o.classList.toggle('show'); 
}

function renderPerfPanel() {
    const panel = document.getElementById('perfPanel');
    if (!panel) return;

    const traces = (window.__DG_PERF__?.traces || []).slice().reverse();
    const listHtml = traces.length ? traces.map(item => {
        const metaEntries = Object.entries(item.meta || {});
        const refreshPath = metaEntries.find(([k]) => k === 'path')?.[1] || '';
        const meta = metaEntries.filter(([k]) => k !== 'path').map(([k, v]) => `${k}: ${v}`).join(' · ');
        const steps = (item.steps || []).map(step => `
            <div class="perf-step">
                <span class="step-name">${escapeHTML(step.step)}</span>
                <span class="mono">${step.duration}ms</span>
            </div>
        `).join('');
        return `
            <div class="perf-item">
                <div class="perf-item-head">
                    <div class="perf-item-title">${escapeHTML(item.label)}</div>
                    <div class="perf-item-total mono">${item.total}ms</div>
                </div>
                ${refreshPath ? `
                <div class="perf-path-row">
                    <span class="perf-path-label">刷新路径</span>
                    <span class="perf-path-value mono">${escapeHTML(refreshPath)}</span>
                </div>
                ` : ''}
                <div class="perf-item-meta">${escapeHTML(meta || '无额外信息')}</div>
                <div class="perf-steps">${steps || '<div class="perf-item-meta">无分步记录</div>'}</div>
            </div>
        `;
    }).join('') : '<div class="perf-empty">先操作几次切换、刷新或图表交互，这里会出现最近性能记录。</div>';

    panel.innerHTML = `
        <div class="sg-header">
            <h2>性能诊断</h2>
            <button class="sg-close" onclick="togglePerfPanel()">×</button>
        </div>
        <div class="sg-body">
            <div class="perf-toolbar">
                <button type="button" onclick="renderPerfPanel()">刷新</button>
                <button type="button" onclick="copyPerfSummary()">复制摘要</button>
                <button type="button" onclick="clearPerfSummary()">清空记录</button>
            </div>
            <div class="perf-list">${listHtml}</div>
        </div>
    `;
}

function togglePerfPanel() {
    const overlay = document.getElementById('perfOverlay');
    if (!overlay) return;
    if (!overlay.classList.contains('show')) renderPerfPanel();
    overlay.classList.toggle('show');
}

async function copyPerfSummary() {
    const text = JSON.stringify(window.__DG_PERF__?.summary() || [], null, 2);
    try {
        await navigator.clipboard.writeText(text);
        await customAlert('性能摘要已复制。');
    } catch (e) {
        await customAlert('复制失败，请稍后重试。');
    }
}

function clearPerfSummary() {
    if (window.__DG_PERF__) window.__DG_PERF__.traces = [];
    renderPerfPanel();
}

async function switchStrategy(name) { 
    if(!STRATEGIES[name]) return;
    const confirmed = await customConfirm(`确定切换到 [${name}]？\n${STRATEGIES[name].desc}`); 
    if(!confirmed) return;
    
    setActiveStrategy(name); 
    localStorage.setItem('quant_strategy', name); 
    renderSettings(); 
    
    if(getActiveData()) { 
        updateAllIndicators(); 
        draw(); 
        safeUpdateSidebar(); 
        refreshWatchlistSignalSnapshots();
        renderWatchlist();
    } 
}

function renderSettings() {
    const panel = document.getElementById('settingsPanel'); 
    if(!panel) return;
    
    const strategyHtml = Object.entries(STRATEGIES).map(([name, config]) => `
        <button class="${state.strategy === name ? 'active' : ''}" onclick="switchStrategy('${name}')" style="padding:10px;">
            ${name}
            <span class="sg-desc" style="margin-top:4px;">${config.desc}</span>
        </button>
    `).join('');
    
    const signalConfigHtml = SIGNAL_RULES.map(rule => {
        const score = getSignalScore(rule.id);
        const isBuy = rule.id.startsWith('B');
        const isWarning = rule.id.startsWith('W');
        const baseColorVar = isBuy ? '--red' : (isWarning ? '--yellow' : '--green');
        const isUsed = STRATEGY.buySignals?.includes(rule.id) || STRATEGY.exitSignals?.includes(rule.id) || STRATEGY.warningSignals?.includes(rule.id);
        
        const opacity = isUsed ? '1' : '0.4';
        const idBg = isUsed ? 'rgba(255,255,255,0.08)' : 'transparent';
        const idColor = isUsed ? `var(${baseColorVar})` : 'var(--text-dim)';
        const textColor = isUsed ? 'var(--text-main)' : 'var(--text-dim)';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:var(--inner-bg); border-radius:var(--radius-sm); border:1px solid var(--border-light); opacity:${opacity}; transition: opacity 0.2s;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="mono" style="font-size:10px; font-weight:700; background:${idBg}; padding:2px 4px; border-radius:3px; color:${idColor}; line-height:1;">${rule.id}</span>
                    <span style="font-size:11px; color:${textColor};">${getUserSignalText(rule.id)}</span>
                </div>
                <span class="mono" style="font-size:11px; color:${textColor}; font-weight:700;">${score > 0 ? '+' + score : score}</span>
            </div>
        `;
    }).join('');

    panel.innerHTML = `
        <div class="sg-header">
            <h2>系统设置</h2>
            <button class="sg-close" onclick="toggleSettings()">×</button>
        </div>
        <div class="sg-body">
            <div class="terminal-block" style="padding:12px 16px;">
                <div class="block-title" style="margin-bottom:8px;">量化策略选择 (当前: ${state.strategy})</div>
                <div class="sg-strategy" style="gap:8px;">${strategyHtml}</div>
            </div>
            <div class="terminal-block" style="padding:12px 16px;">
                <div class="block-title" style="display:flex;justify-content:space-between; margin-bottom:8px;">
                    <span>信号积分配置 (SOP 4.1.2)</span>
                    <span class="text-dim" style="font-weight:400;">买入阈值: ${STRATEGY.buyThreshold}分</span>
                </div>
                <div class="signal-config-grid">${signalConfigHtml}</div>
                <div class="risk-note" style="margin-top:8px;">注：灰色未点亮的信号表示当前策略未将该信号纳入核心驱动模型。积分配置由当前策略动态决定，不同策略对同一信号的赋分可能不同。</div>
            </div>
            <div class="terminal-block no-bg">
                <button onclick="handleClearCache()" class="text-bull" style="width:100%; padding:10px; background:var(--bg-up-light); border:1px solid rgba(246, 70, 93, 0.4); border-radius:var(--radius-sm); font-size:12px; font-weight:700; cursor:pointer; transition:all .1s; outline:none;">
                    ⚠️ 彻底重置系统数据
                </button>
            </div>
        </div>
    `;
}

function toggleSettings() { 
    const o = document.getElementById('settingsOverlay'); 
    if(o) { 
        if (!o.classList.contains('show')) { 
            renderSettings(); 
        } 
        o.classList.toggle('show'); 
    } 
}

async function init() {
    showLoading(); 
    await openDB(); 
    await loadWatchlist();
    if (typeof hydrateLiveOverlayCacheState === 'function') hydrateLiveOverlayCacheState();
    try {
        const sc = await dbGet('stock_cache');
        stockCache = (sc && Array.isArray(sc.data)) ? sc.data : [];
    } catch(e) {
        stockCache = [];
    }
    
    const savedStrategy = localStorage.getItem('quant_strategy');
    if(savedStrategy && STRATEGIES[savedStrategy]) { 
        setActiveStrategy(savedStrategy); 
    }
    
    let resizeRAF = 0;
    window.addEventListener('resize', () => { 
        if (resizeRAF) return;
        resizeRAF = requestAnimationFrame(() => {
            resizeRAF = 0;
            ['main', 'vol', 'macd', 'kdj'].forEach(k => { 
                if(state.charts[k]) state.charts[k].resize(); 
            }); 
        });
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab; 
            if(tab === state.tab) return;
            
            state.tab = tab; 
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); 
            e.target.classList.add('active');
            
            if(tab === 'index') {
                document.getElementById('indexNavList').style.display = 'block'; 
                document.getElementById('stockNavList').style.display = 'none'; 
                selectIndex('sh');
            } else {
                document.getElementById('indexNavList').style.display = 'none'; 
                document.getElementById('stockNavList').style.display = 'block'; 
                renderWatchlist();
                if(state.watchlist.length > 0) {
                    selectStock(state.watchlist[0].code, state.watchlist[0].name);
                } else { 
                    state.mode = 'stock'; 
                    state.id = null; 
                    state.stockId = null; 
                    clearCharts(); 
                    applySidebarHTML({ priceHtml: '', analysisHtml: '', isHide: true }); 
                }
            }
        });
    });

    document.querySelectorAll('#periodTabs .seg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const p = e.target.dataset.period; 
            if(p === state.period) return;
            
            document.querySelectorAll('#periodTabs .seg-btn').forEach(b => b.classList.remove('active')); 
            e.target.classList.add('active');
            const prevPeriod = state.period;
            const prevData = getActiveData();
            const prevLock = getPeriodLock(prevPeriod);
            const anchorDate = prevData?.[prevLock]?.date;

            state.period = p; 
            state.isFrozen = false; 
            
            setLockIdx(alignLockToPeriod(p, anchorDate)); 
            resetViewportToLatest(getActiveData());
            markIndicatorsDirty(); 
            clearStaleTooltips(); 
            draw(); 
            safeUpdateSidebar();
        });
    });
    
    document.querySelectorAll('#rangeTabs .seg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const r = parseInt(e.target.dataset.range); 
            if(r === state.range) return;
            
            document.querySelectorAll('#rangeTabs .seg-btn').forEach(b => b.classList.remove('active')); 
            e.target.classList.add('active');
            state.range = r; 
            redrawCurrentViewport();
        });
    });
    
    renderMASelector();
    renderIndexList();

    // 同步 range 按钮 active 状态到当前 state.range
    document.querySelectorAll('#rangeTabs .seg-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.range) === state.range);
    });
    
    setInterval(() => { 
        if (document.hidden) return;
        const d = getBJDate(); 
        document.getElementById('liveClock').innerText = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; 
    }, 1000);
    
    // 30s 批量侧边栏价格刷新：1 次 JSONP 拿全部侧边栏标的实时价格
    setInterval(() => {
        if (document.hidden) return;
        if (!isMarketOpen()) return;
        refreshSidebarRealtime();
    }, SYS_CONFIG.THROTTLE_MS);

    // 30s 当前标的完整同步：增量历史 + 实时合并 + 图表重绘（延迟 15s 启动，与侧边栏刷新错峰）
    setTimeout(() => {
        setInterval(() => { 
            if (document.hidden) return;
            if (!isMarketOpen()) return;
            if(state.mode === 'index') cachedFetch(state.id); 
            else if(state.mode === 'stock' && state.id) cachedFetch(state.id); 
        }, SYS_CONFIG.THROTTLE_MS);
    }, SYS_CONFIG.THROTTLE_MS / 2);

    // 90s 侧边栏全量历史同步：受控并发（并发数 3），覆盖大盘和自选
    startSidebarFullSync();

    // P0-4: 后台切回前台时若在交易时段，立即刷新侧边栏 + 当前标的
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        if (!isMarketOpen()) return;
        refreshSidebarRealtime();
        if (state.mode === 'index') cachedFetch(state.id);
        else if (state.mode === 'stock' && state.id) cachedFetch(state.id);
    });

    await preloadCacheOnly(); 
    await ensureMarketTemperatureData(); 
    await _selectIndexImpl('sh');  // init 直接调用 impl，跳过防抖

    requestAnimationFrame(() => refreshWatchlistSignalSnapshots());
}

// 启动应用
init();
