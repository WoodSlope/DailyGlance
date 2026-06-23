/* DailyGlance [2] - split from dailyglance.html. Keep classic script order. */
// ==========================================
// [2] 接口与数据层 (API & Data Layer)
// ==========================================

const INDEX_CONFIG = { sh: {name: '上证指数', eastmoney: '1.000001', tencent: 'sh000001'}, cy: {name: '创业板指', eastmoney: '0.399006', tencent: 'sz399006'}, zz1000: {name: '中证1000', eastmoney: '1.000852', tencent: 'sh000852'}, kc50: {name: '科创50', eastmoney: '1.000688', tencent: 'sh000688'} };
const INDEX_IDS = Object.keys(INDEX_CONFIG);
function getIndexConfig(id) { return INDEX_CONFIG[id] || null; }
function resolveSecid(id) { return getIndexConfig(id)?.eastmoney || id; }
function resolveTencentSymbol(id) { const cfg = getIndexConfig(id); if(cfg) return cfg.tencent; let cleanCode = id.includes('.') ? id.split('.')[1] : id; return cleanCode.startsWith('6') ? 'sh' + cleanCode : 'sz' + cleanCode; }

const STOCK_TOKEN='D43BF722C8E33BDC906FB84D85E326E8';
function codeToSecid(c){ return c.match(/^6/) ? '1.' + c : '0.' + c }
const STOCK_DATABASE = [
    {Code:'601398',Name:'工商银行'},{Code:'601939',Name:'建设银行'},{Code:'601988',Name:'中国银行'},{Code:'601318',Name:'中国平安'},{Code:'600519',Name:'贵州茅台'},{Code:'000858',Name:'五粮液'},{Code:'000333',Name:'美的集团'},{Code:'002594',Name:'比亚迪'},{Code:'300750',Name:'宁德时代'},{Code:'601012',Name:'隆基绿能'},{Code:'002371',Name:'北方华创'},{Code:'603501',Name:'韦尔股份'},{Code:'002475',Name:'立讯精密'},{Code:'600276',Name:'恒瑞医药'},{Code:'300760',Name:'迈瑞医疗'},{Code:'601899',Name:'紫金矿业'}
];
let stockCache = [];
const cachedFetchRefreshJobs = new Map();
let cachedFetchRefreshApplyTimer = 0;
let pendingCachedFetchRefreshApplyId = '';
const historyRefreshMeta = new Map();

function getBJDate() { return new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Shanghai"})); }
function isMarketOpen() { const now = getBJDate(), day = now.getDay(), m = now.getHours() * 60 + now.getMinutes(); return day !== 0 && day !== 6 && m >= 9 * 60 + 15 && m <= 15 * 60 + 15; }
function isAfterMarketClose() { const now = getBJDate(), day = now.getDay(), m = now.getHours() * 60 + now.getMinutes(); return day === 0 || day === 6 || m > 15 * 60 + 15; }
function getLastTradingDate() { let d = getBJDate(), day = d.getDay(), m = d.getHours() * 60 + d.getMinutes(); if(day === 0) d.setDate(d.getDate() - 2); else if(day === 6) d.setDate(d.getDate() - 1); else if(day === 1 && m <= 15 * 60 + 15) d.setDate(d.getDate() - 3); else if(m <= 15 * 60 + 15) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function isValidPrice(price, id) { return !isNaN(price) && price > 0; }
function getActiveData() { return state.period === 'weekly' ? state.weeklyData[state.id] : state.rawData[state.id]; }
function rememberPeriodLock(idx=state.lockIdx, period=state.period) { if(!state.periodLocks) state.periodLocks = {daily:-1, weekly:-1}; state.periodLocks[period] = idx; }
function setLockIdx(idx) { state.lockIdx = idx; rememberPeriodLock(idx); }
function getPeriodLock(period=state.period) { return state.periodLocks?.[period] ?? -1; }

function findDateIndex(data, date, id = '') {
    if(!data || !data.length) return -1;
    const cacheKey = `${id}_${date}`;
    if (dateIndexCache.has(cacheKey)) return dateIndexCache.get(cacheKey);
    let l = 0, r = data.length - 1, res = -1;
    while (l <= r) {
        let m = (l + r) >> 1;
        if (data[m].date === date) { res = m; break; }
        else if (data[m].date < date) { res = m; l = m + 1; }
        else r = m - 1;
    }
    if (res === -1) res = data.length - 1; 
    dateIndexCache.set(cacheKey, res); 
    return res;
}

function alignLockToPeriod(targetPeriod, anchorDate) {
    const data = targetPeriod === 'weekly' ? state.weeklyData[state.id] : state.rawData[state.id];
    if(!data || !data.length) return -1;
    if(anchorDate) return findDateIndex(data, anchorDate, state.id);
    const saved = getPeriodLock(targetPeriod);
    if(saved >= 0 && saved < data.length) return saved;
    return data.length - 1;
}

function getSafeIndex(data) {
    if (!data || data.length === 0) return -1;
    if (state.lockIdx < 0 || state.lockIdx >= data.length) { setLockIdx(data.length - 1); return data.length - 1; }
    return state.lockIdx;
}

function convertDailyToWeekly(dailyData) {
    if (!dailyData || !dailyData.length) return [];
    const weekly = []; let currentWeekKey = null, currentWeek = null;
    for (const d of dailyData) {
        const dateObj = new Date(d.date + "T00:00:00Z"); const day = dateObj.getUTCDay() || 7;
        dateObj.setUTCDate(dateObj.getUTCDate() - day + 1);
        const wk = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth()+1).padStart(2,'0')}-${String(dateObj.getUTCDate()).padStart(2,'0')}`;
        if (wk !== currentWeekKey) {
            if (currentWeek) weekly.push(currentWeek);
            currentWeekKey = wk; currentWeek = { date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, vol: d.vol, amt: d.amt };
        } else {
            currentWeek.date = d.date; currentWeek.high = Math.max(currentWeek.high, d.high); currentWeek.low = Math.min(currentWeek.low, d.low);
            currentWeek.close = d.close; currentWeek.vol += d.vol; currentWeek.amt += d.amt;
        }
    }
    if (currentWeek) weekly.push(currentWeek); 
    return weekly;
}

function setRawData(id, data) {
    const prevData = state.rawData[id];
    state.rawData[id] = data;
    if (data) state.weeklyData[id] = convertDailyToWeekly(data); else state.weeklyData[id] = null;
    if (id === state.id) {
        const indicatorScopePrefix = `${state.id}_${state.period}_${state.strategy}_`;
        const isSameIndicatorScope = typeof state.indicatorKey === 'string' && state.indicatorKey.startsWith(indicatorScopePrefix);
        if (!isSameIndicatorScope) {
            state.indicators = { ma: {}, macd: null, rsi: null, kdj: null };
        }
        state.pendingIndicatorMutation = isSameIndicatorScope ? getDataMutationMeta(prevData, data) : { mode: 'full', startIdx: 0 };
        markIndicatorsDirty();
    }
    clearDerivedCaches();
}

function barsEqual(a, b) {
    if (!a || !b) return false;
    return a.date === b.date &&
        a.open === b.open &&
        a.close === b.close &&
        a.high === b.high &&
        a.low === b.low &&
        a.vol === b.vol &&
        a.amt === b.amt;
}

function getDataMutationMeta(prevData, nextData) {
    if (!prevData || !prevData.length || !nextData || !nextData.length) {
        return { mode: 'full', startIdx: 0 };
    }
    if (nextData.length < prevData.length) {
        return { mode: 'full', startIdx: 0 };
    }

    const minLen = Math.min(prevData.length, nextData.length);
    let firstDiff = 0;
    while (firstDiff < minLen && barsEqual(prevData[firstDiff], nextData[firstDiff])) firstDiff++;

    if (firstDiff === minLen && prevData.length === nextData.length) {
        return { mode: 'unchanged', startIdx: -1 };
    }

    const isPureAppend = firstDiff === prevData.length && nextData.length >= prevData.length;
    const tailOnlyChange = firstDiff >= Math.max(0, minLen - 5);

    if (isPureAppend || tailOnlyChange) {
        return { mode: 'incremental', startIdx: Math.max(0, firstDiff) };
    }

    return { mode: 'full', startIdx: 0 };
}

const requestManager = {
    limiters: new Map(),
    async fetchRealtimeWithThrottle(id) {
        const now = Date.now(), s = this.limiters.get(id) || { lastCall: 0, isFetching: false };
        if (s.isFetching) return null; if (now - s.lastCall < SYS_CONFIG.THROTTLE_MS) return null;
        s.isFetching = true; this.limiters.set(id, s);
        try { const rt = await getRealtimePriceJSONP(id); s.lastCall = Date.now(); return rt; } 
        catch (e) { return null; } 
        finally { s.isFetching = false; this.limiters.set(id, s); }
    }
};

function jsonpFetchEastmoneyKline(id) {
    return new Promise(resolve => {
        const secid = resolveSecid(id), cb = 'em_kline_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=1000&cb=${cb}`;
        let cl = false; const cleanup = () => { if(cl) return; cl=true; clearTimeout(timer); delete window[cb]; const s = document.getElementById(cb); if(s) s.remove(); };
        const timer = setTimeout(() => { cleanup(); resolve([]); }, 8000);
        window[cb] = data => { 
            cleanup(); 
            if(data && data.data && data.data.klines) resolve(data.data.klines.map(l => { const p = l.split(','); return { date: p[0], open: parseFloat(p[1]), close: parseFloat(p[2]), high: parseFloat(p[3]), low: parseFloat(p[4]), vol: parseFloat(p[5]), amt: parseFloat(p[6]) }; }).filter(item => isValidPrice(item.close, id))); 
            else resolve([]);
        };
        const script = document.createElement('script'); script.id = cb; script.src = url; script.onerror = () => { cleanup(); resolve([]); }; document.head.appendChild(script);
    });
}

function jsonpFetchTencentKline(id) {
    return new Promise(resolve => {
        let symbol = resolveTencentSymbol(id);
        const cb = 'tx_kline_' + Date.now(), url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,1000,qfq&_var=${cb}`;
        let cl = false; const cleanup = () => { if(cl) return; cl = true; clearTimeout(timer); delete window[cb]; const s = document.getElementById(cb); if(s) s.remove(); };
        const timer = setTimeout(() => { cleanup(); resolve([]); }, 5000); window[cb] = undefined;
        const script = document.createElement('script'); script.id = cb; script.src = url;
        script.onload = () => { 
            const payload = window[cb]; cleanup(); 
            if(payload && payload.code === 0 && payload.data && payload.data[symbol]) { 
                const klines = payload.data[symbol].qfqday || payload.data[symbol].day; 
                if(!klines) { resolve([]); return; } 
                resolve(klines.map(p => ({ date: p[0], open: parseFloat(p[1]), close: parseFloat(p[2]), high: parseFloat(p[3]), low: parseFloat(p[4]), vol: parseFloat(p[5]), amt: p.length > 6 ? parseFloat(p[6]) : (parseFloat(p[5]) * parseFloat(p[2]) * 100) })).filter(item => isValidPrice(item.close, id))); 
            } else resolve([]); 
        };
        script.onerror = () => { cleanup(); resolve([]); }; document.head.appendChild(script);
    });
}

function getRealtimePriceJSONP(id) {
    return new Promise(resolve => {
        const symbol = resolveTencentSymbol(id), varName = 'v_' + symbol;
        const script = document.createElement('script'); script.src = `https://qt.gtimg.cn/q=${symbol}`; script.charset = 'GBK';
        let cl = false; const cleanup = () => { if(cl) return; cl = true; clearTimeout(timer); if(script.parentNode) script.remove(); };
        const timer = setTimeout(() => { cleanup(); resolve(null); }, 5000);
        script.onload = () => { 
            cleanup(); 
            if(typeof window[varName] !== 'undefined') { 
                const fields = window[varName].split('~'); 
                if(fields.length >= 6) { 
                    const price = parseFloat(fields[3]) || 0; 
                    if(price > 0) { 
                        const now = getBJDate(), localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; 
                        resolve({ date: localDate, open: parseFloat(fields[5])||price, high: parseFloat(fields[33])||price, low: parseFloat(fields[34])||price, close: price, vol: parseInt(fields[36])||0, amt: parseFloat(fields[37])||0 }); 
                        return; 
                    } 
                } 
            } 
            resolve(null); 
        };
        script.onerror = () => { cleanup(); resolve(null); }; document.head.appendChild(script);
    });
}

async function syncDataWithHistory(id) { 
    let data = await jsonpFetchEastmoneyKline(id); if(data && data.length >= 30) return data; 
    data = await jsonpFetchTencentKline(id); if(data && data.length >= 30) return data; 
    return null; 
}

function getHistoryRefreshMeta(id) {
    return historyRefreshMeta.get(id) || { lastSuccessAt: 0, lastAttemptAt: 0, lastDate: '' };
}

function setHistoryRefreshMeta(id, patch = {}) {
    historyRefreshMeta.set(id, { ...getHistoryRefreshMeta(id), ...patch });
}

function shouldSkipHistoryRefresh(id, cached) {
    if (!cached || !cached.length) return false;
    const meta = getHistoryRefreshMeta(id);
    const now = Date.now();
    const lastDate = cached[cached.length - 1]?.date || '';
    if (lastDate && lastDate < getLastTradingDate()) return false;
    if (meta.lastDate && meta.lastDate !== lastDate) return false;
    if (meta.lastSuccessAt && now - meta.lastSuccessAt < SYS_CONFIG.HISTORY_FRESH_MS) return true;
    if (meta.lastAttemptAt && now - meta.lastAttemptAt < SYS_CONFIG.HISTORY_REFRESH_COOLDOWN_MS) return true;
    return false;
}

async function syncDataIncremental(id) { 
    try { 
        const cached = await dbGet(id); 
        if(!cached || !cached.data || !cached.data.length) return await syncDataWithHistory(id); 
        if (shouldSkipHistoryRefresh(id, cached.data)) return cached.data;
        
        setHistoryRefreshMeta(id, { lastAttemptAt: Date.now(), lastDate: cached.data[cached.data.length - 1]?.date || '' });
        const fresh = await syncDataWithHistory(id); 
        if(!fresh || !fresh.length) return cached.data; 
        setHistoryRefreshMeta(id, { lastSuccessAt: Date.now(), lastDate: fresh[fresh.length - 1]?.date || '' });

        const lastCached = cached.data[cached.data.length - 1];
        const matchingFresh = fresh.find(d => d.date === lastCached.date);
        
        if (matchingFresh && Math.abs(matchingFresh.close - lastCached.close) / lastCached.close > SYS_CONFIG.EX_RIGHT_TOLERANCE) return fresh; 

        const mergedMap = new Map(); 
        cached.data.forEach(item => mergedMap.set(item.date, item)); 
        fresh.forEach(item => mergedMap.set(item.date, item)); 
        return Array.from(mergedMap.values()).sort((a, b) => a.date.localeCompare(b.date)); 
    } catch(e) { return await getCachedData(id) || null; } 
}

async function syncData(id) { 
    const cached = await getCachedData(id), now = getBJDate(), today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; 
    const hasEnough = cached && cached.length >= 30; 
    const isIndex = !!getIndexConfig(id);
    const cachedLastDate = cached && cached.length ? (cached[cached.length - 1]?.date || '') : '';

    const canMergeRealtimeBar = (series, rtBar) => {
        if (!rtBar || !series || !series.length) return false;
        if (isIndex) return true;
        const lastBar = series[series.length - 1];
        if (!lastBar || lastBar.date !== today) return false;
        if (!lastBar.close || !isValidPrice(lastBar.close, id)) return false;
        return Math.abs(rtBar.close - lastBar.close) / lastBar.close <= SYS_CONFIG.EX_RIGHT_TOLERANCE;
    };
    
    if(isMarketOpen()) { 
        if(hasEnough) { 
            const incremental = await syncDataIncremental(id); 
            if(incremental && incremental.length > 0) { await dbSet(id, incremental); cached.length = 0; Array.prototype.push.apply(cached, incremental); } 
            const rt = await requestManager.fetchRealtimeWithThrottle(id); 
            if (canMergeRealtimeBar(cached, rt)) {
                if (cached[cached.length - 1].date === today) cached[cached.length - 1] = rt;
                else cached.push(rt);
                await dbSet(id, cached);
            }
            return cached; 
        } 
        setHistoryRefreshMeta(id, { lastAttemptAt: Date.now(), lastDate: cachedLastDate });
        const data = await syncDataWithHistory(id); 
        if(data && data.length >= 30) { setHistoryRefreshMeta(id, { lastSuccessAt: Date.now(), lastDate: data[data.length - 1]?.date || '' }); await dbSet(id, data); return data; } 
        return hasEnough ? cached : null; 
    } else { 
        if(hasEnough) { 
            const incremental = await syncDataIncremental(id); 
            if(incremental && incremental.length > 0) { await dbSet(id, incremental); return incremental; } 
            return cached; 
        } 
        setHistoryRefreshMeta(id, { lastAttemptAt: Date.now(), lastDate: cachedLastDate });
        const data = await syncDataWithHistory(id); 
        if(data && data.length >= 30) { setHistoryRefreshMeta(id, { lastSuccessAt: Date.now(), lastDate: data[data.length - 1]?.date || '' }); await dbSet(id, data); return data; } 
        return null; 
    } 
}

async function checkCacheNeedUpdate(id) { 
    const cached = await dbGet(id); 
    if(!cached || !cached.data || !cached.data.length) return { needUpdate: true, reason: '无数据' }; 
    const ld = cached.data[cached.data.length-1].date, ltd = getLastTradingDate(); 
    if(ld < ltd) return { needUpdate: true, reason: '数据过期' }; 
    return { needUpdate: false, reason: '已最新' }; 
}

const lastUpdateClicks = new Map(); 
async function handleUpdateData(forceFull = false) { 
    const btn = document.getElementById('updateDataBtn'); if(!btn) return; 
    if(!state.id) return; 
    
    const now = Date.now(), lastClick = lastUpdateClicks.get(state.id) || 0;
    if(!forceFull && now - lastClick < SYS_CONFIG.UPDATE_COOLDOWN) { await customAlert(`频繁请求限制。此标的更新需等待 ${Math.ceil((SYS_CONFIG.UPDATE_COOLDOWN-(now-lastClick))/1000)} 秒。`); return; } 
    lastUpdateClicks.set(state.id, now); 
    
    const info = await checkCacheNeedUpdate(state.id); 
    const confirmed = await customConfirm(info.needUpdate ? `需要更新：${info.reason}\n继续？` : '数据已是最新，确认强制同步？');
    if(!confirmed) return;
    
    btn.disabled = true; btn.innerHTML = SVG_ICONS.SPIN; 
    try { 
        const fresh = (!forceFull && !info.needUpdate) ? await syncDataIncremental(state.id) : await syncDataWithHistory(state.id); 
        if(fresh && fresh.length) { 
            await dbSet(state.id, fresh); setRawData(state.id, fresh); setLockIdx(getActiveData()?.length-1 || -1); 
            updateAllIndicators(); draw(); safeUpdateSidebar(); 
            await customAlert(`同步成功！K线数量：${fresh.length}`); 
        } else { await customAlert('数据同步失败！'); } 
    } catch(e) { await customAlert('同步异常: ' + e.message); } 
    finally { btn.disabled = false; btn.innerHTML = SVG_ICONS.UPDATE; } 
}

let DB = null; const DB_NAME = 'QuantProDB_v515', DB_VER = 1, STORE = 'kline';
function openDB() { 
    return new Promise(resolve => { 
        const req = indexedDB.open(DB_NAME, DB_VER); 
        req.onupgradeneeded = e => { if (!e.target.result.objectStoreNames.contains(STORE)) e.target.result.createObjectStore(STORE, { keyPath: 'id' }); }; 
        req.onsuccess = e => { DB = e.target.result; resolve(); }; 
        req.onerror = () => resolve(); 
    }); 
}
function dbGet(id) { 
    return new Promise(resolve => { 
        if(!DB) return resolve(null); 
        const req = DB.transaction(STORE, 'readonly').objectStore(STORE).get(id); 
        req.onsuccess = e => resolve(e.target.result); req.onerror = () => resolve(null); 
    }); 
}
function dbSet(id, data) { 
    return new Promise(resolve => { 
        if(!DB) return resolve(); 
        const tx = DB.transaction(STORE, 'readwrite'); 
        tx.objectStore(STORE).put({ id, data, updated: Date.now() }); 
        tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); 
    }); 
}
async function getCachedData(id) { const c = await dbGet(id); return (c && c.data) ? c.data : null; }

function scheduleCachedFetchRefreshApply(id) {
    pendingCachedFetchRefreshApplyId = id;
    if (cachedFetchRefreshApplyTimer) return;
    cachedFetchRefreshApplyTimer = window.setTimeout(() => {
        const applyId = pendingCachedFetchRefreshApplyId;
        pendingCachedFetchRefreshApplyId = '';
        cachedFetchRefreshApplyTimer = 0;
        if (!applyId) return;

        const perfTrace = PERF.start('cachedFetchRefreshApply', { id: applyId, activeId: state.id, mode: state.mode });
        requestAnimationFrame(() => {
            if (applyId !== state.id) {
                PERF.end(perfTrace, { status: 'skipped' });
                return;
            }
            setLockIdx(getActiveData()?.length - 1 || -1);
            renderMASelector();
            draw();
            safeUpdateSidebar();
            PERF.mark(perfTrace, 'render');
            PERF.end(perfTrace, { status: 'applied' });
        });
    }, 32);
}

function getFinalVerdict(decision) {
    const action = decision.simpleAction;
    if (['清仓离场', '规避风险'].includes(action)) return { label:'强制防守', text:'核心防守或破位信号触发，严格规避系统性风险。' };
    if (action === '执行离场') return { label:'主动撤退', text:'上行动能衰退或环境走弱，建议清空敞口，耐心等待。' };
    if (action === '持币观望') return { label:'防守等待', text:'市场环境或个股动能不足，空仓观望为主。' };
    if (action === '防守减仓') return { label:'控制敞口', text:'系统判定风险上升或动能衰减，建议主动降低持仓比例。' };
    if (['轻仓建仓', '缓慢加仓'].includes(action)) return { label:'低吸试错', text:'左侧异动或动能初显，建议控制上限，小仓位试探。' };
    if (['积极建仓', '顺势加仓'].includes(action)) return { label:'把握主升', text:'量价结构共振向好，动能充沛，可积极获取趋势利润。' };
    if (['谨慎持有', '轻仓持有'].includes(action)) return { label:'轻仓观望', text:'处于震荡或分歧期，胜率盈亏比偏低，底仓持有观察。' };
    if (['顺势抱单', '积极持有'].includes(action)) return { label:'趋势进攻', text:'处于主升或多头排列中，依托均线及防守位顺势持有。' };
    return { label:'状态检测', text:'量化系统持续推演中...' };
}

function getHoldingDisplayStatus(status) {
    const map = {
        '持仓观察': '观望等待',
        '弱势套牢': '弱势承压',
        '结构转强': '结构转强',
        '破位防守': '破位防守'
    };
    return map[status] || status;
}

function getExitDisplayLevel(level, hasContext = false) {
    const map = {
        '清仓防守': '清仓防守',
        '强离场': '强制离场',
        '减仓观察': '防守观察',
        '延续防守': '防守延续',
        '无明确离场': hasContext ? '防守观察' : '未触发离场'
    };
    return map[level] || level;
}

function getActionDisplayText(action) {
    const map = {
        '减仓观察': '防守观察',
        '延续防守': '防守延续',
        '弱势套牢': '弱势承压',
        '破位防守': '破位防守',
        '结构转强': '结构转强'
    };
    return map[action] || action;
}

function getRelativeStrength(stockData, date) {
    const marketData = state.rawData.sh || [];
    if(!stockData?.length || marketData.length < 25) return null;
    const sIdx = findDateIndex(stockData, date, state.id);
    const mIdx = findDateIndex(marketData, date, 'sh');
    if(sIdx < 20 || mIdx < 20) return null;
    const stockBase = stockData[sIdx - 20]?.close;
    const marketBase = marketData[mIdx - 20]?.close;
    if(!stockBase || !marketBase) return null;
    const stockRet = (stockData[sIdx].close - stockBase) / stockBase * 100;
    const marketRet = (marketData[mIdx].close - marketBase) / marketBase * 100;
    const diff = stockRet - marketRet;
    let label = '跟随大盘';
    if(diff >= 5) label = '强于大盘';
    else if(diff <= -5) label = '弱于大盘';
    return { stockRet, marketRet, diff, label };
}

function getHoldingDiagnosis(idx, full, ind, meta, decision) {
    const rs = getRelativeStrength(full, full[idx]?.date);
    let status = '持仓观察', action = '按原策略执行，不主动补仓。';
    if(decision.exit.level === '清仓防守' || decision.exit.level === '强离场') { 
        status = '破位防守'; action = '优先处理风险部位，果断执行纪律止损。'; 
    } else if(rs?.diff <= -5 && decision.position <= 30) { 
        status = '弱势套牢'; action = '跌破趋势支撑，反弹无量时优先降仓或调仓。'; 
    } else if(meta.windowScore >= STRATEGY.buyThreshold) { 
        status = '结构转强'; action = '已有仓位按防守位管理，新仓仍看策略阈值。'; 
    }
    const rsText = rs ? `${rs.label}，20日相对大盘 ${rs.diff >= 0 ? '+' : ''}${rs.diff.toFixed(1)}%` : '相对强弱样本不足';
    const toneClass = status === '破位防守' ? 'text-bear' : (status === '弱势套牢' ? 'text-warn' : (status === '结构转强' ? 'text-bull' : 'text-main'));
    return { status, displayStatus: getHoldingDisplayStatus(status), action, displayAction: getActionDisplayText(action), rsText, toneClass };
}

async function clearAllCache() { 
    if(DB) { 
        const tx = DB.transaction(STORE, 'readwrite'); 
        tx.objectStore(STORE).clear(); 
        await new Promise(r => tx.oncomplete = r); 
    } 
    state.rawData = {}; 
    state.weeklyData = {}; 
    derivedIndicatorCache.clear();
    localStorage.removeItem('quant_strategy'); 
    location.reload(); 
}

async function handleClearCache() { 
    const confirmed = await customConfirm('确定要彻底清除所有本地数据缓存并重置系统吗？'); 
    if(confirmed) {
        clearAllCache().catch(async e => await customAlert('清除失败: '+e.message)); 
    }
}

async function cachedFetch(id) {
    const perfTrace = PERF.start('cachedFetch', { id, activeId: state.id, mode: state.mode });
    const fetchStateKey = `${state.mode}_${state.id}_${state.period}_${state.strategy}`;
    const cachedResult = await dbGet(id);
    PERF.mark(perfTrace, 'dbGet');
    if (cachedResult && cachedResult.data && cachedResult.data.length > 0 && id === state.id) {
        setRawData(id, cachedResult.data);
        setLockIdx(getActiveData()?.length - 1 || -1);
        updateAllIndicators();
        hideLoading();
        renderMASelector();
        if (state.mode === 'index') renderIndexList();
        if (state.mode === 'stock' && typeof scheduleWatchlistRender === 'function') scheduleWatchlistRender();
        requestAnimationFrame(() => {
            const currentStateKey = `${state.mode}_${state.id}_${state.period}_${state.strategy}`;
            if (currentStateKey !== fetchStateKey || id !== state.id) return;
            draw();
            safeUpdateSidebar();
        });
        PERF.mark(perfTrace, 'use-cache', { points: cachedResult.data.length });
        PERF.end(perfTrace, { status: 'cache-first', firstLoad: false });
        scheduleCachedFetchRefresh(id);
        return;
    }

    const fresh = await syncData(id);
    PERF.mark(perfTrace, 'syncData', { points: fresh?.length || 0 });
    if (!fresh || fresh.length === 0) {
        document.getElementById('loading').innerHTML = `<div class="loading-wrap" style="flex-direction:column;gap:16px;"><div class="text-bull" style="font-size:14px;font-weight:700;">数据加载失败</div><button onclick="location.reload()" style="padding:8px 24px;background:var(--blue);border:none;border-radius:4px;color:#fff;cursor:pointer;font-weight:600;outline:none;">重试</button></div>`;
        PERF.end(perfTrace, { status: 'no-fresh-data', firstLoad: true });
        return;
    }

    const old = state.rawData[id];
    const hasUpdate = getDataMutationMeta(old, fresh).mode !== 'unchanged';
    const shouldApplyFresh = !old || !old.length || hasUpdate;
    
    if (shouldApplyFresh) {
        setRawData(id, fresh);
        setLockIdx(getActiveData()?.length - 1 || -1);
        await dbSet(id, fresh);
        PERF.mark(perfTrace, 'dbSet');
        if (typeof syncWatchlistSignalSnapshotFast === 'function') {
            const matched = (state.watchlist || []).find(stock => codeToSecid(stock.code) === id);
            if (matched) syncWatchlistSignalSnapshotFast(matched.code, fresh);
            PERF.mark(perfTrace, 'watchlist');
        }
        if (id === state.id) {
            hideLoading();
            renderMASelector();
            updateAllIndicators();
            requestAnimationFrame(() => {
                const currentStateKey = `${state.mode}_${state.id}_${state.period}_${state.strategy}`;
                if (currentStateKey !== fetchStateKey || id !== state.id) return;
                draw();
                safeUpdateSidebar();
            });
        }
        PERF.mark(perfTrace, 'apply-fresh', { hasUpdate, firstLoad: !old || !old.length });
    } else if (id === state.id) {
        hideLoading();
        renderMASelector();
        requestAnimationFrame(() => {
            const currentStateKey = `${state.mode}_${state.id}_${state.period}_${state.strategy}`;
            if (currentStateKey !== fetchStateKey || id !== state.id) return;
            draw();
            safeUpdateSidebar();
        });
        PERF.mark(perfTrace, 'reuse-state', { points: old.length });
    }
    if (state.mode === 'index') renderIndexList(); 
    if (state.mode === 'stock' && typeof scheduleWatchlistRender === 'function') scheduleWatchlistRender();
    PERF.end(perfTrace, { status: shouldApplyFresh ? (hasUpdate ? 'updated' : 'initial') : 'unchanged', firstLoad: !old || !old.length });
}

function scheduleCachedFetchRefresh(id) {
    if (cachedFetchRefreshJobs.has(id)) return cachedFetchRefreshJobs.get(id);
    const job = (async () => {
        const perfTrace = PERF.start('cachedFetchRefresh', { id, activeId: state.id, mode: state.mode });
        const fresh = await syncData(id);
        PERF.mark(perfTrace, 'syncData', { points: fresh?.length || 0 });
        if (!fresh || fresh.length === 0) {
            PERF.end(perfTrace, { status: 'no-fresh-data' });
            return;
        }

        const old = state.rawData[id];
        const hasUpdate = getDataMutationMeta(old, fresh).mode !== 'unchanged';
        if (!hasUpdate) {
            PERF.end(perfTrace, { status: 'unchanged' });
            return;
        }

        setRawData(id, fresh);
        PERF.mark(perfTrace, 'apply-raw');
        await dbSet(id, fresh);
        PERF.mark(perfTrace, 'dbSet');
        if (typeof syncWatchlistSignalSnapshotFast === 'function') {
            const matched = (state.watchlist || []).find(stock => codeToSecid(stock.code) === id);
            if (matched) syncWatchlistSignalSnapshotFast(matched.code, fresh);
            PERF.mark(perfTrace, 'watchlist');
        }
        if (id === state.id) {
            scheduleCachedFetchRefreshApply(id);
            PERF.mark(perfTrace, 'queue-active-apply');
        }
        if (state.mode === 'index') {
            renderIndexList();
            PERF.mark(perfTrace, 'render-index-list');
        }
        if (state.mode === 'stock' && typeof scheduleWatchlistRender === 'function') scheduleWatchlistRender();
        PERF.end(perfTrace, { status: 'updated' });
    })().finally(() => {
        cachedFetchRefreshJobs.delete(id);
    });
    cachedFetchRefreshJobs.set(id, job);
    return job;
}

async function preloadCacheOnly() {
    const symbols = [...INDEX_IDS];
    if (state.watchlist && state.watchlist.length > 0) {
        symbols.push(...state.watchlist.slice(0, 5).map(s => codeToSecid(s.code)).filter(s => !symbols.includes(s)));
    }
    for (const id of symbols) {
        try {
            const c = await dbGet(id);
            if (c && c.data && c.data.length >= 30 && isValidPrice(c.data[c.data.length - 1].close, id)) {
                setRawData(id, c.data);
            }
        } catch(e) {}
    }
}

async function ensureMarketTemperatureData() {
    for (const id of INDEX_IDS) {
        if (state.rawData[id] && state.rawData[id].length >= 60) continue;
        try {
            const data = await syncData(id);
            if (data && data.length >= 30) {
                setRawData(id, data);
                await dbSet(id, data);
            }
        } catch(e) {}
    }
    if (state.mode === 'index' || state.mode === 'stock') {
        updateAllIndicators();
        safeUpdateSidebar();
    }
}
