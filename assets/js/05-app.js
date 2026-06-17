/* DailyGlance [5] - split from dailyglance.html. Keep classic script order. */
// ==========================================
// [5] 交互与生命周期 (Events & Lifecycle)
// ==========================================

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
        
        let capital = 10000, peakCapital = 10000, maxDrawdown = 0;
        const startIdx = Math.max(60, full.length - 250);
        let prevAdv = 0, winCount = 0, totalTrades = 0, entryPrice = 0;
        const trades = [];
        
        for(let i = startIdx; i < full.length; i++) {
            const item = full[i], prev = full[i-1], decision = item._decision;
            if (!decision) continue;
            
            if (prevAdv > 0) {
                const dailyRet = (item.close - prev.close) / prev.close;
                capital = capital * (1 + dailyRet * (prevAdv / 100));
                if(capital > peakCapital) peakCapital = capital;
                const dd = (peakCapital - capital) / peakCapital;
                if(dd > maxDrawdown) maxDrawdown = dd;
            }
            
            if (decision.position !== prevAdv) {
                trades.push({ 
                    date: item.date, 
                    action: decision.simpleAction, 
                    posFrom: prevAdv, 
                    posTo: decision.position, 
                    price: item.close 
                });
                
                if (prevAdv === 0 && decision.position > 0) {
                    entryPrice = item.close; 
                } else if (decision.position === 0 && prevAdv > 0) { 
                    totalTrades++; 
                    if (item.close > entryPrice) winCount++; 
                }
            }
            prevAdv = decision.position;
        }
        
        const ret = ((capital - 10000) / 10000 * 100).toFixed(2);
        const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : 0;
        const md = (maxDrawdown * 100).toFixed(2);
        
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
                基于「${state.strategy}」过去 ${full.length - startIdx} 天实盘推演
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
                注：交易记录按盘末收盘价触发，并严格叠加了大盘温控环境及个股极端防守系数。主图 B/S 仅标注重大的开平仓转折点，中途加减仓仅在回测记录中展示。
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
    return STOCK_DATABASE.filter(s => s.Name.toLowerCase().includes(qt) || s.Code.includes(qt))
        .concat(stockCache.filter(s => !STOCK_DATABASE.some(b => b.Code === s.Code) && (s.Name?.toLowerCase().includes(qt) || s.Code.includes(qt)))); 
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
        <div class="stock-suggest-item" onclick="selectSuggestItem('${escapeJSArg(x.Code)}','${escapeJSArg(x.Name)}')">
            <span class="ss-name">${escapeHTML(x.Name)}</span>
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
    const safeName = String(name || '').trim(); 
    
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
        state.watchlist = (w && w.data) || []; 
    } catch(e) { 
        state.watchlist = []; 
    } 
}

async function saveWatchlist() { 
    await dbSet('watchlist_list', state.watchlist); 
}

async function addToWatchlist(code, name) { 
    if(!state.watchlist.some(s => s.code === code)) { 
        if(state.watchlist.length >= 10) { 
            await customAlert('最多只能添加 10 只自选股。'); 
            return; 
        } 
        state.watchlist.push({ code, name }); 
        await saveWatchlist(); 
        renderWatchlist(); 
    } 
}

async function removeStock(code) { 
    state.watchlist = state.watchlist.filter(s => s.code !== code); 
    await saveWatchlist(); 
    
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
    } else {
        renderWatchlist(); 
    }
}

let watchlistUpdateTimer = null;

function debounceWatchlistUpdate() {
    if (watchlistUpdateTimer) clearTimeout(watchlistUpdateTimer);
    watchlistUpdateTimer = setTimeout(async () => {
        await updateAllWatchlistData();
        renderWatchlist();
    }, 2000);
}

async function updateAllWatchlistData() {
    const results = [];
    for (const stock of state.watchlist) {
        const secid = codeToSecid(stock.code);
        if (secid === state.id) continue;
        try {
            const data = await syncData(secid);
            if (data && data.length >= 30 && isValidPrice(data[data.length - 1].close, secid)) {
                setRawData(secid, data);
                await dbSet(secid, data);
                results.push({ code: stock.code, success: true });
            } else {
                results.push({ code: stock.code, success: false, reason: '数据不足' });
            }
        } catch (e) {
            const cached = await dbGet(secid);
            if (cached && cached.data && cached.data.length >= 30) {
                setRawData(secid, cached.data);
                results.push({ code: stock.code, success: true, source: 'cache' });
            } else {
                results.push({ code: stock.code, success: false, reason: e.message });
            }
        }
    }
    return results;
}

async function selectIndex(id) {
    if (!getIndexConfig(id)) return;
    const selectionSeq = ++globalSelectionSeq;
    const config = getIndexConfig(id);

    state.tab = 'index';
    state.mode = 'index';
    state.id = id;
    state.stockId = null;
    state.isFrozen = false;

    document.querySelectorAll('#mainTabs .nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'index'));
    document.getElementById('indexNavList').style.display = 'block';
    document.getElementById('stockNavList').style.display = 'none';
    document.getElementById('btnBacktest').style.display = 'none';

    renderIndexList();
    clearCharts();
    showLoading(`加载 ${config.name} 数据...`);

    try {
        await cachedFetch(id);
        if (selectionSeq !== globalSelectionSeq || state.id !== id) return;
        const data = getActiveData();
        if (data && data.length) {
            setLockIdx(data.length - 1);
            updateAllIndicators();
            draw();
            safeUpdateSidebar();
        }
        renderIndexList();
    } finally {
        if (selectionSeq === globalSelectionSeq) hideLoading();
    }
}

async function selectStock(code, name) {
    const safeCode = String(code || '').trim();
    const safeName = String(name || safeCode).trim();
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

    document.querySelectorAll('#mainTabs .nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'stock'));
    document.getElementById('indexNavList').style.display = 'none';
    document.getElementById('stockNavList').style.display = 'block';
    document.getElementById('btnBacktest').style.display = 'flex';

    renderWatchlist();
    clearCharts();
    showLoading(`加载 ${safeName} 数据...`);

    try {
        const data = await syncData(secid);
        if (selectionSeq !== globalSelectionSeq || state.id !== secid || state.stockId !== safeCode) return;

        if (data && data.length >= 30 && isValidPrice(data[data.length - 1].close, secid)) {
            setRawData(secid, data);
            await dbSet(secid, data);
            setLockIdx(getActiveData()?.length - 1 || -1);
            updateAllIndicators();
            draw();
            safeUpdateSidebar();
        } else {
            throw new Error('数据不足或价格无效');
        }
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
    }
}

function updateLeftMarketContext(date) {
    const container = document.getElementById('leftMarketContext');
    if(!container) return;

    const market = getMarketContext(date);
    const panelClass = market.cls === 'bull' ? 'panel-bull' : (market.cls === 'bear' ? 'panel-bear' : 'panel-info');
    const textClass = market.cls === 'bull' ? 'text-bull' : (market.cls === 'bear' ? 'text-bear' : 'text-main');

    let detailHtml = market.trends.map(t => `
        <div class="index-dash-card" style="border-left-color:${t.score>0?'var(--up-color)':t.score<0?'var(--down-color)':'var(--border-color)'}; padding: 8px 10px; margin-bottom: 4px;">
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
        const d = state.rawData[id];
        const price = d?.length ? d[d.length-1].close : 0;
        const prev = d?.length > 1 ? d[d.length-2].close : (d?.length ? d[0].open : 1);
        const change = price - prev;
        const pct = (change / prev * 100) || 0;
        const cl = change >= 0 ? 'up' : 'down';
        
        const priceHtml = price > 0 
            ? `<span class="lprice mono ${cl}">${price.toFixed(2)}</span><span class="lchange mono ${cl}">${pct !== 0 ? (change >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--'}</span>` 
            : '<span class="lprice">--</span><span class="lchange">--</span>';
            
        return `
            <div class="nav-list-item ${active}" onclick="selectIndex('${id}')">
                <span class="lname">${config.name}</span>
                ${priceHtml}
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
        const d = state.rawData[codeToSecid(s.code)];
        const price = d?.length ? d[d.length-1].close : 0;
        const prev = d?.length > 1 ? d[d.length-2].close : (d?.length ? d[0].open : 1);
        const change = price - prev;
        const pct = (change / prev * 100) || 0;
        const cl = change >= 0 ? 'up' : 'down';
        
        return `
            <div class="nav-list-item ${s.code === state.stockId ? 'active' : ''}" onclick="selectStock('${escapeJSArg(s.code)}','${escapeJSArg(s.name)}')">
                <span class="lname">${escapeHTML(s.name)}</span>
                <span class="lprice mono ${cl}">${price > 0 ? price.toFixed(2) : '--'}</span>
                <span class="lchange mono ${cl}">${pct !== 0 ? (change >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--'}</span>
                <span class="wl-close" onclick="event.stopPropagation();removeStock('${escapeJSArg(s.code)}')">×</span>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="stock-header"><div class="title-wrap"><span>自选股池</span></div></div>
        ${sHtml}
        <div>${lHtml}</div>
    `;
}

function toggleMA(n) { 
    if(state.activeMAs.includes(n)) {
        state.activeMAs = state.activeMAs.filter(v => v !== n); 
    } else {
        state.activeMAs.push(n); 
    }
    state.activeMAs.sort((a, b) => a - b); 
    renderMASelector(); 
    draw(); 
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

function prevDay() { 
    if(state.lockIdx > 0) { 
        state.isFrozen = true; 
        setLockIdx(state.lockIdx - 1); 
        clearStaleTooltips(); 
        safeUpdateSidebar(); 
    } 
}

function nextDay() { 
    const rd = getActiveData(); 
    if(rd && state.lockIdx < rd.length - 1) { 
        state.isFrozen = true; 
        setLockIdx(state.lockIdx + 1); 
        clearStaleTooltips(); 
        safeUpdateSidebar(); 
    } 
}

function resetLatest() { 
    const rd = getActiveData(); 
    if(rd) { 
        state.isFrozen = false; 
        setLockIdx(rd.length - 1); 
        clearStaleTooltips(); 
        safeUpdateSidebar(); 
    } 
}

function toggleHelp() { 
    const o = document.getElementById('helpOverlay'); 
    if(o) o.classList.toggle('show'); 
}

async function switchStrategy(name) { 
    if(!STRATEGIES[name]) return;
    const confirmed = await customConfirm(`确定切换到 [${name}]？\n${STRATEGIES[name].desc}`); 
    if(!confirmed) return;
    
    state.strategy = name; 
    Object.assign(STRATEGY, STRATEGIES[name]); 
    localStorage.setItem('quant_strategy', name); 
    renderSettings(); 
    
    if(getActiveData()) { 
        updateAllIndicators(); 
        draw(); 
        safeUpdateSidebar(); 
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
        const borderColor = isUsed ? `var(${baseColorVar})` : 'var(--border-color)';
        
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:var(--inner-bg); border-radius:var(--radius-sm); border-left:2px solid ${borderColor}; opacity:${opacity}; transition: opacity 0.2s;">
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
    try {
        const sc = await dbGet('stock_cache');
        stockCache = (sc && Array.isArray(sc.data)) ? sc.data : [];
    } catch(e) {
        stockCache = [];
    }
    
    const savedStrategy = localStorage.getItem('quant_strategy');
    if(savedStrategy && STRATEGIES[savedStrategy]) { 
        state.strategy = savedStrategy; 
        Object.assign(STRATEGY, STRATEGIES[savedStrategy]); 
    }
    
    window.addEventListener('resize', () => { 
        ['main', 'vol', 'macd', 'kdj'].forEach(k => { 
            if(state.charts[k]) state.charts[k].resize(); 
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
            state.period = p; 
            state.isFrozen = false; 
            
            setLockIdx(alignLockToPeriod(p, getActiveData()?.[getPeriodLock(p === 'daily' ? 'weekly' : 'daily')]?.date)); 
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
            draw();
        });
    });
    
    renderMASelector();
    
    setInterval(() => { 
        const d = getBJDate(); 
        document.getElementById('liveClock').innerText = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; 
    }, 1000);
    
    if(isMarketOpen()) {
        setInterval(() => { 
            if(state.mode === 'index') cachedFetch(state.id); 
            else if(state.mode === 'stock' && state.id) cachedFetch(state.id); 
        }, SYS_CONFIG.THROTTLE_MS);
    }

    await ensureMarketTemperatureData(); 
    await preloadCacheOnly(); 
    await cachedFetch('sh'); 
    
    hideLoading();
}

// 启动应用
init();
