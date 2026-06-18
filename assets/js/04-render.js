/* DailyGlance [4] - split from dailyglance.html. Keep classic script order. */
// ==========================================
// [4] 渲染与 UI 层 (Render & UI)
// ==========================================

function clearCharts(){
    ['mainChart','volumeChart','macdChart','kdjChart'].forEach(id => { const c = Chart.getChart(id); if(c) c.destroy(); }); state.charts = {};
    ['mainChart','volumeChart','macdChart','kdjChart'].forEach(id => {
        const el = document.getElementById(id); if(!el) return; 
        const p = el.parentElement; p.style.position = 'relative';
        let ph = p.querySelector('.empty-hint'); 
        if(!ph) { ph = document.createElement('div'); ph.className = 'empty-hint text-dim mono'; p.appendChild(ph); }
        ph.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;letter-spacing:1px;z-index:5;';
        ph.innerText = {'mainChart': 'K 线图', 'volumeChart': '成交量', 'macdChart': 'MACD', 'kdjChart': 'KDJ'}[id] + ' — 暂无数据';
    });
}

function clearStaleTooltips() {
    Object.values(state.charts).forEach(c => { if (c) { if (c.tooltip) c.tooltip.setActiveElements([], {x: 0, y: 0}); c.update('none'); } });
}

const freezePlugin = {
    id: 'freezePlugin',
    beforeEvent: (c, args) => { if (state.isFrozen && args.event.type !== 'click' && args.event.type !== 'touchstart' && args.event.type !== 'touchend') return false; }
};

const localAlignPlugin = {
    id: 'localAlignPlugin',
    afterDatasetsDraw: c => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = c;
        const dss = c.data.datasets.find(d => d.isCandle === true && d.candleData);
        const colorUpHex = getCssVar('--up-color') || '#f6465d', colorDownHex = getCssVar('--down-color') || '#0ecb81';

        if (dss && dss.candleData) {
            const w = Math.min((x.width / c.data.labels.length) * 0.8, 20);
            dss.candleData.forEach((d, i) => {
                if (!d) return;
                const px = x.getPixelForValue(i), cl = d.c >= d.o ? colorUpHex : colorDownHex;
                ctx.strokeStyle = cl; ctx.beginPath(); ctx.moveTo(px, y.getPixelForValue(d.h)); ctx.lineTo(px, y.getPixelForValue(d.l)); ctx.stroke();
                ctx.fillStyle = cl; ctx.fillRect(px - w / 2, Math.min(y.getPixelForValue(d.o), y.getPixelForValue(d.c)), w, Math.max(Math.abs(y.getPixelForValue(d.o) - y.getPixelForValue(d.c)), 1.5));
            });
        }
        const actData = getActiveData();
        if (actData) {
            const safeIdx = getSafeIndex(actData);
            if (safeIdx >= 0 && safeIdx < actData.length) {
                const targetDate = actData[safeIdx].date; const li = c.data.labels.indexOf(targetDate);
                if (li >= 0) {
                    const px = x.getPixelForValue(li);
                    if (px >= left && px <= right) {
                        ctx.save(); ctx.beginPath(); 
                        if (state.isFrozen) { ctx.setLineDash([]); ctx.strokeStyle = getCssVar('--blue') || '#3d6df9'; ctx.lineWidth = 1.5; } 
                        else { ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; }
                        ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke(); ctx.restore();
                    }
                }
            }
        }
    }
};

const bsMarkerPlugin = {
    id: 'bsMarkerPlugin',
    afterDatasetsDraw: c => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = c;
        const dss = c.data.datasets.find(d => d.isCandle === true && d.candleData);
        if (!dss || state.period === 'weekly') return; 

        const activeData = getActiveData(); if(!activeData) return;
        const slice = activeData.slice(-c.data.labels.length);
        const colorUpHex = getCssVar('--up-color') || '#f6465d', colorDownHex = getCssVar('--down-color') || '#0ecb81';

        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
        slice.forEach((d, i) => {
            const px = x.getPixelForValue(i);
            if (px < left || px > right || !d._decision) return;
            if (d._decision.bsMark === 'B') { ctx.fillStyle = colorUpHex; let py = Math.min(y.getPixelForValue(d.low) + 14, bottom - 8); ctx.fillText('B', px, py); } 
            else if (d._decision.bsMark === 'S') { ctx.fillStyle = colorDownHex; let py = Math.max(y.getPixelForValue(d.high) - 14, top + 8); ctx.fillText('S', px, py); }
        });
        ctx.restore();
    }
};

let hoverRAF = null;

function handleChartHover(e, els) {
    const type = e?.native?.type || e?.type; 
    if (type === 'mousemove' && state.isFrozen) return;
    
    if (els && els.length) {
        const activeData = getActiveData(); if (!activeData) return;
        const actualRange = state.period === 'weekly' ? Math.ceil(state.range / 5) : state.range;
        const dataItem = activeData.slice(-actualRange)[els[0].index];
        if (dataItem) {
            const ti = activeData.indexOf(dataItem);
            if (ti >= 0 && state.lockIdx !== ti) {
                setLockIdx(ti);
                if(hoverRAF) cancelAnimationFrame(hoverRAF);
                hoverRAF = requestAnimationFrame(() => { safeUpdateSidebar(); Object.values(state.charts).forEach(c => c && c.update('none')); });
            }
        }
    }
}

function handleChartClick(e, els) {
    if (!els || !els.length) { state.isFrozen = false; Object.values(state.charts).forEach(c => c && c.update('none')); return; }
    const activeData = getActiveData(); if (!activeData) return;
    const actualRange = state.period === 'weekly' ? Math.ceil(state.range / 5) : state.range;
    const dataItem = activeData.slice(-actualRange)[els[0].index];
    if (dataItem) {
        const ti = activeData.indexOf(dataItem);
        if (ti >= 0) {
            if (state.isFrozen && state.lockIdx === ti) state.isFrozen = false; else { state.isFrozen = true; setLockIdx(ti); }
            if(hoverRAF) cancelAnimationFrame(hoverRAF);
            hoverRAF = requestAnimationFrame(() => { safeUpdateSidebar(); Object.values(state.charts).forEach(c => c && c.update('none')); });
        }
    }
}

function draw() {
    document.querySelectorAll('.empty-hint').forEach(e => e.remove());
    const currentFd = getActiveData(); 
    if(!currentFd || !currentFd.length) { clearCharts(); return; }
    
    updateAllIndicators();
    const actualRange = state.period === 'weekly' ? Math.ceil(state.range / 5) : state.range;
    const slice = currentFd.slice(-actualRange);
    const labels = slice.map(d => d.date);
    
    const colorDim = getCssVar('--text-dim') || '#8b9eb7';
    const colorUpHex = getCssVar('--up-color') || '#f6465d';
    const colorDownHex = getCssVar('--down-color') || '#0ecb81';
    const colorBlueHex = getCssVar('--blue') || '#3d6df9';
    
    const getLayout = () => ({ padding: { left: 8, right: 8, top: 10, bottom: 0 } });
    const getYScale = (isVol = false) => ({
        position: 'right', 
        grid: { color: 'rgba(255,255,255,0.04)' }, 
        ticks: { 
            color: colorDim, 
            font: { family: "'JetBrains Mono', monospace", size: 10 }, 
            padding: 12,
            callback: isVol ? (v => v >= 100000000 ? (v / 100000000).toFixed(1) + '亿' : (v >= 10000 ? (v / 10000).toFixed(0) + '万' : v)) : undefined
        }, 
        afterFit: (scale) => { scale.width = 60; } 
    });

    const getBaseOptions = () => ({
        responsive: true, 
        maintainAspectRatio: false, 
        animation: false, 
        layout: getLayout(), 
        interaction: { mode: 'index', intersect: false },
        onHover: handleChartHover,
        onClick: handleChartClick
    });
    
    const currentScope = `${state.id}_${state.period}`;
    const uc = (k, id, cfg) => {
        const el = document.getElementById(id); 
        if(!el) return;
        
        let existingChart = Chart.getChart(id);
        if (existingChart && existingChart.canvas.dataset.scope !== currentScope) {
            existingChart.destroy();
            existingChart = null;
        }
        
        if (existingChart) { 
            existingChart.data = cfg.data; 
            existingChart.options = cfg.options; 
            existingChart.update('none'); 
            state.charts[k] = existingChart; 
        } else { 
            state.charts[k] = new Chart(el, cfg); 
            el.dataset.scope = currentScope;
        }
    };

    const ds = state.activeMAs.map(n => ({ 
        label: `MA${n}`, data: state.indicators.ma?.[n]?.slice(-actualRange) || [], 
        borderColor: MA_COLORS[n], borderWidth: 1.2, pointRadius: 0, order: 1, 
        isCandle: false, candleData: null, tension: 0.1 
    }));
    
    ds.push({ 
        label: 'KLine', isCandle: true, 
        candleData: slice.map(d => ({o: d.open, h: d.high, l: d.low, c: d.close})), 
        data: slice.map(d => d.close), 
        borderColor: 'transparent', pointRadius: 0, order: 0
    });

    const mainOpts = getBaseOptions();
    mainOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
    mainOpts.scales = { x: { display: false }, y: getYScale() };
    uc('main', 'mainChart', { type: 'line', data: { labels, datasets: ds }, options: mainOpts, plugins: [localAlignPlugin, bsMarkerPlugin, freezePlugin] });
    
    const volColorsOp = slice.map(d => (d.close >= d.open ? colorUpHex : colorDownHex) + '80');
    const volOpts = getBaseOptions();
    volOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
    volOpts.scales = { x: { display: false }, y: getYScale(true) };
    uc('vol', 'volumeChart', { type: 'bar', data: { labels, datasets: [{ data: slice.map(d => d.vol), backgroundColor: volColorsOp }] }, options: volOpts, plugins: [localAlignPlugin, freezePlugin] });
    
    if(state.indicators.macd) {
        const md = state.indicators.macd;
        const macdBarColors = md.bar.slice(-actualRange).map(v => v >= 0 ? colorUpHex + '80' : colorDownHex + '80');
        const macdOpts = getBaseOptions();
        macdOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
        macdOpts.scales = { x: { display: false }, y: getYScale() };
        uc('macd', 'macdChart', { 
            type: 'line', 
            data: { labels, datasets: [ { data: md.diff.slice(-actualRange), borderColor: colorBlueHex, borderWidth: 1, pointRadius: 0, tension: 0.1 }, { data: md.dea.slice(-actualRange), borderColor: '#f5a623', borderWidth: 1, pointRadius: 0, tension: 0.1 }, { type: 'bar', data: md.bar.slice(-actualRange), backgroundColor: macdBarColors } ] }, 
            options: macdOpts, plugins: [localAlignPlugin, freezePlugin] 
        });
    }
    
    if(state.indicators.kdj) {
        const kd = state.indicators.kdj;
        const kdjOpts = getBaseOptions();
        kdjOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
        kdjOpts.scales = { x: { display: false }, y: getYScale() };
        uc('kdj', 'kdjChart', { 
            type: 'line', 
            data: { labels, datasets: [ { label: 'K', data: kd.k.slice(-actualRange), borderColor: '#f8fafc', borderWidth: 1, pointRadius: 0, tension: 0.1 }, { label: 'D', data: kd.d.slice(-actualRange), borderColor: '#f5a623', borderWidth: 1, pointRadius: 0, tension: 0.1 }, { label: 'J', data: kd.j.slice(-actualRange), borderColor: '#8b5cf6', borderWidth: 1, pointRadius: 0, tension: 0.1 } ] }, 
            options: kdjOpts, plugins: [localAlignPlugin, freezePlugin] 
        });
    }
}

function generateAnalysisHTML(idx, full, meta) {
    const fmt = v => v ? v.toFixed(2) : '--';
    if (!full || !full[idx]) return '';

    const S = STRATEGY;
    const rawToday = full[idx]?._signals || [];
    
    let ptsRawHtml = '';
    if (rawToday.length > 0) {
        ptsRawHtml = UI.sectionTitle('近期触发形态', 'text-main') + rawToday.map(sig => {
            const isMonitored = S.buySignals?.includes(sig) || S.exitSignals?.includes(sig) || S.warningSignals?.includes(sig);
            return UI.signalRow(getUserSignalText(sig), sig, isMonitored, sig.startsWith('B'));
        }).join('');
    } else {
        ptsRawHtml = UI.sectionTitle('近期无强技术形态', 'text-dim');
    }

    let ptsValidHtml = '';
    if(meta.windowSignals && meta.windowSignals.length > 0) {
        ptsValidHtml += UI.sectionTitle('历史有效信号 (构建动能)', 'text-main');
        const grouped = {};
        meta.windowSignals.forEach(w => { 
            if(!grouped[w.day]) grouped[w.day] = []; 
            grouped[w.day].push(w.signal); 
        });
        
        Object.keys(grouped).sort((a,b) => b - a).forEach(dIdx => {
            const dayOffset = idx - parseInt(dIdx);
            const dayLabel = dayOffset === 0 ? '今日' : dayOffset === 1 ? '昨日' : `${dayOffset}日前`;
            grouped[dIdx].forEach(sig => {
                ptsValidHtml += UI.signalRow(`[${dayLabel}] ${getUserSignalText(sig)}`, sig, true, sig.startsWith('B'));
            });
        });
    }

    let signalsHtmlBlock = '';
    if (state.period === 'daily') {
        signalsHtmlBlock = `
            <div class="terminal-block">
                <div class="block-title">底层技术信号 (日线级)</div>
                <div class="signal-compact">${ptsRawHtml}</div>
                <div class="signal-compact" style="margin-top: 8px;">${ptsValidHtml}</div>
            </div>
        `;
    }

    if(state.period === 'weekly') {
        const wk = getWeeklyDirectionContext(idx, full, state.indicators);
        const wkClass = wk.direction === '周线多头' ? 'panel-bull' : (wk.direction === '周线空头' ? 'panel-bear' : 'panel-info');
        const wkTextClass = wk.direction === '周线多头' ? 'text-bull' : (wk.direction === '周线空头' ? 'text-bear' : 'text-info');

        return `
            <div class="action-panel ${wkClass}">
                <div class="block-title" style="border:none; padding-bottom:0; margin:0 0 8px 0; color:var(--text-dim);">宏观趋势过滤</div>
                <div class="action-line">
                    <div class="action-name ${wkTextClass}">${wk.direction}</div>
                </div>
                <div class="action-sub">${escapeHTML(wk.directionReason)}<br/>${escapeHTML(wk.dailyImpact)}</div>
            </div>
            <div class="terminal-block">
                <div class="block-title">周线关键位</div>
                <div class="evidence-grid">
                    <div class="evidence-item">
                        <div class="k">当前位置</div>
                        <div class="right-side"><div class="v">${escapeHTML(wk.position)}</div></div>
                    </div>
                    <div class="evidence-item">
                        <div class="k">趋势修复</div>
                        <div class="right-side"><div class="v">${escapeHTML(wk.repair)}</div></div>
                    </div>
                </div>
                <div class="level-line">
                    <div class="level-pill"><span>20周线 (中期线)</span><strong class="mono">${fmt(wk.ma20)}</strong></div>
                    <div class="level-pill"><span>60周线 (长期线)</span><strong class="mono">${fmt(wk.ma60)}</strong></div>
                    <div class="level-pill"><span>周线防守区</span><strong class="mono">${fmt(wk.support)}</strong></div>
                    <div class="level-pill"><span>周线压力区</span><strong class="mono">${fmt(wk.pressure)}</strong></div>
                </div>
            </div>
            <div class="risk-note">周线级别为主力中长线风向标，不输出直接买卖积分。用于过滤日线噪音，辅助判断当前为反弹还是主升浪。</div>
        `;
    }

    const decision = full[idx]?._decision; 
    if (!decision) return ''; 
    
    const adv = decision.position;
    const prevAdv = decision.prevAdv;
    
    let ct = `维持在 ${adv}%`;
    if(adv === 0 && prevAdv === 0) {
        ct = '只观察，不开新仓';
    } else if (adv > prevAdv) { 
        if (prevAdv === 0) ct = meta.windowScore >= STRATEGY.buyThreshold ? `动能转强，建仓上限 ${adv}%` : `左侧异动，试探建仓上限 ${adv}%`; 
        else ct = `环境转暖，风控仓位上调至 ${adv}%`; 
    } else if(adv < prevAdv) {
        ct = `降至 ${adv}%${adv === 0 ? ' (严格执行防守)' : ''}`; 
    }
    
    const verdict = getFinalVerdict(decision);
    const riskFlags = decision.risk.flags.length ? decision.risk.flags.join(' / ') : '处于安全空间，无明显偏离';
    const diagnosis = state.mode === 'stock' ? getHoldingDiagnosis(idx, full, state.indicators, meta, decision) : null;
    const exitEvidence = getExitSignalEvidence(meta, decision);
    const hasExitContext = decision.exit.level !== '无明确离场' || exitEvidence.direct.length || exitEvidence.windowDesc !== '近窗内无额外离场形态';
    const displayExitLevel = getExitDisplayLevel(decision.exit.level, hasExitContext);
    const decisionSummary = getFinalVerdict(decision);
    const signalSourceText = state.mode === 'index' ? '推导自：指数信号窗口' : '推导自：B/L 信号窗口';
    const isDirectExitContext = decision.exit.level !== '无明确离场' || exitEvidence.direct.length;
    const guardValue = hasExitContext ? displayExitLevel : decision.risk.level;
    const guardTextClass = isDirectExitContext || decision.risk.score < 60 ? 'text-warn' : 'text-main';
    const guardExitText = isDirectExitContext
        ? (decision.exit.detail || exitEvidence.exitText)
        : (hasExitContext ? `近窗：${exitEvidence.windowDesc}` : decision.exit.detail);
    const guardHoldingText = diagnosis ? `${diagnosis.displayStatus || diagnosis.status}：${diagnosis.action}` : '';
    const guardHint = [riskFlags, guardExitText, guardHoldingText].filter(Boolean).join('；');

    let panelClass = 'panel-neutral';
    const a = decision.simpleAction;
    
    if (['清仓离场', '执行离场', '规避风险'].includes(a)) { panelClass = 'panel-bear'; } 
    else if (['防守减仓', '谨慎持有'].includes(a)) { panelClass = 'panel-warn'; } 
    else if (['轻仓建仓', '缓慢加仓', '轻仓持有'].includes(a)) { panelClass = 'panel-info'; } 
    else if (['积极建仓', '顺势加仓', '顺势抱单', '积极持有'].includes(a)) { panelClass = 'panel-bull'; }

    const cooldownHtml = meta.inCooldown ? `<div style="position:absolute; top:0; right:0; background:var(--yellow); color:#000; font-size:9px; font-weight:800; padding:2px 8px; border-bottom-left-radius:6px; border-top-right-radius:7px;">防守冷静期</div>` : '';
    const titleText = state.mode === 'index' ? '大盘走势推演 (日线)' : '个股交易结论 (日线微观)';
    const evidenceTitle2 = state.mode === 'index' ? '指数动能' : '个股信号';

    const actionPanelHtml = `
        <div class="action-panel ${panelClass}">
            ${cooldownHtml}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="block-title" style="border:none; padding-bottom:0; margin:0;">${titleText}</div>
                <div class="kicker text-main">${escapeHTML(verdict.label)}</div>
            </div>
            <div class="action-line">
                <div class="action-name ${decision.simpleColorClass}">${escapeHTML(decision.simpleAction)}</div>
                <div class="action-cap">
                    <span class="text-dim">当前建议仓位</span>
                    <strong class="mono text-main">${adv}%</strong>
                </div>
            </div>
            <div class="action-sub">${escapeHTML(verdict.text)} ${escapeHTML(ct)}</div>
            ${decision.positionDriver ? `<div class="action-driver">${escapeHTML(decision.positionDriver)}</div>` : ''}
            <div class="level-line">
                <div class="level-pill">
                    <span>防守位</span><strong class="mono">${fmt(decision.risk.stop)}</strong>
                </div>
                <div class="level-pill">
                    <span>压力区</span><strong class="mono">${fmt(decision.risk.pressure)}</strong>
                </div>
            </div>
        </div>
    `;

    const evidencePanelHtml = `
        <div class="terminal-block">
            <div class="block-title">关键推导依据</div>
            <div class="evidence-grid">
                <div class="evidence-item">
                    <div class="evidence-label">
                        <div class="k">大盘定基调</div>
                        <div class="evidence-source">推导自：四指数趋势温度</div>
                    </div>
                    <div class="right-side">
                        <div class="v ${decision.market.cls === 'bull' ? 'text-bull' : (decision.market.cls === 'bear' ? 'text-bear' : 'text-main')}">${escapeHTML(decision.market.label)}</div>
                        <div class="h">${escapeHTML(decision.market.reason)}</div>
                    </div>
                </div>
                <div class="evidence-item">
                    <div class="evidence-label">
                        <div class="k">${evidenceTitle2}</div>
                        <div class="evidence-source">${signalSourceText}</div>
                    </div>
                    <div class="right-side">
                        <div class="v">${escapeHTML(decisionSummary.label)}</div>
                        <div class="h">信号积分 ${meta.windowScore}/${STRATEGY.buyThreshold}</div>
                    </div>
                </div>
                <div class="evidence-item">
                    <div class="evidence-label">
                        <div class="k">风控/防守</div>
                        <div class="evidence-source">推导自：风险评分 / L 类离场 / 持仓状态</div>
                    </div>
                    <div class="right-side">
                        <div class="v ${guardTextClass}">${escapeHTML(guardValue)}</div>
                        <div class="h">${escapeHTML(guardHint)}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    return `
        ${actionPanelHtml}
        ${evidencePanelHtml}
        ${signalsHtmlBlock}
        <div class="risk-note">系统按 SOP 3.5.4 规则层层递推，结论仅用于辅助决策，非投资理财建议。</div>
    `;
}

function safeUpdateSidebar() {
    const rd = getActiveData();
    if (rd && rd.length > 0) {
        const safeIdx = getSafeIndex(rd); 
        if (safeIdx < 0 || !rd[safeIdx]) return;
        setLockIdx(safeIdx);
        
        const item = rd[safeIdx];
        const cacheKey = `${state.id}_${item.date}_${state.strategy}_${state.period}_${item.close}_${item.vol}`;
        
        if (state.mode === 'index') {
            updateLeftMarketContext(item.date);
        }

        if (renderCache.has(cacheKey)) { 
            applySidebarHTML(renderCache.get(cacheKey), cacheKey); 
            updateNavCapsuleVisuals(safeIdx, rd.length); 
            return; 
        }

        const prev = safeIdx > 0 ? rd[safeIdx - 1] : null;
        const htmlBundle = generateSidebarBundle(item, prev, safeIdx, rd);
        
        if (renderCache.size >= SYS_CONFIG.RENDER_CACHE_SIZE) {
            renderCache.delete(renderCache.keys().next().value);
        }
        renderCache.set(cacheKey, htmlBundle);
        
        applySidebarHTML(htmlBundle, cacheKey);
        updateNavCapsuleVisuals(safeIdx, rd.length);
    } else {
        applySidebarHTML({ priceHtml: '', analysisHtml: '', isHide: true });
        if (state.mode === 'index') { 
            const ctx = document.getElementById('leftMarketContext'); 
            if(ctx) ctx.innerHTML = ''; 
        }
    }
}

function updateNavCapsuleVisuals(safeIdx, totalLen) {
    const btn = document.getElementById('btnResetLatest');
    if (btn) {
        if (safeIdx === totalLen - 1) { 
            btn.classList.add('active'); 
            btn.classList.remove('is-history'); 
        } else { 
            btn.classList.remove('active'); 
            btn.classList.add('is-history'); 
        }
    }
}

function applySidebarHTML(bundle, cacheKey = '') {
    const cPrice = document.getElementById('cardPrice');
    const cAnalysis = document.getElementById('cardAnalysis');
    if(!cPrice || !cAnalysis) return;
    
    if (bundle.isHide) { 
        cPrice.style.display = 'none'; 
        cAnalysis.style.display = 'none'; 
        return; 
    }
    
    cPrice.style.display = 'flex'; 
    cPrice.style.flexDirection = 'column';
    cAnalysis.style.display = 'flex';
    cAnalysis.style.flexDirection = 'column';
    
    if (cacheKey && cPrice.dataset.key === cacheKey) return; 
    
    cPrice.innerHTML = bundle.priceHtml; 
    cAnalysis.innerHTML = bundle.analysisHtml;
    
    if (cacheKey) cPrice.dataset.key = cacheKey;
}

function generateSidebarBundle(item, prev, safeIdx, rd) {
    if (!item) return { priceHtml: '', analysisHtml: '', isHide: true };
    
    const ch = item.close - (prev ? prev.close : item.open);
    const pct = (ch / (prev ? prev.close : item.open) * 100).toFixed(2);
    const cls = ch >= 0 ? 'up' : 'down';
    const formatUnit = (v) => !v ? '--' : (v >= 1e8 ? `${(v/1e8).toFixed(2)}亿` : v >= 1e4 ? `${(v/1e4).toFixed(2)}万` : v.toFixed(0));
    
    const headerMeta = `${item.date}${state.mode === 'stock' ? `<span class="text-dim" style="margin:0 8px;">|</span><span class="mono text-main">${state.stockId}</span>` : ''}`;
    
    const priceHtml = `
        <div class="terminal-block">
            <div class="header-meta-row">
                <div class="mono text-dim" style="font-size:12px;font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${headerMeta}
                </div>
                <div class="nav-capsule">
                    <button class="btn-sm" onclick="prevDay()" title="上一天 (左方向键)">◀</button>
                    <button class="btn-sm" onclick="nextDay()" title="下一天 (右方向键)">▶</button>
                    <button class="btn-sm ${safeIdx === rd.length - 1 ? 'active' : 'is-history'}" id="btnResetLatest" onclick="resetLatest()">最新</button>
                </div>
            </div>
            <div class="price-hero-compact">
                <div class="price-main mono ${cls}">${item.close.toFixed(2)}</div>
                <div class="price-sub mono ${cls}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)} (${ch >= 0 ? '+' : ''}${pct}%)</div>
            </div>
            <div class="data-grid-2x2">
                <div class="data-box-row"><span class="lbl">今开</span><span class="val mono">${item.open.toFixed(2)}</span></div>
                <div class="data-box-row"><span class="lbl">最高</span><span class="val mono">${item.high.toFixed(2)}</span></div>
                <div class="data-box-row"><span class="lbl">最低</span><span class="val mono">${item.low.toFixed(2)}</span></div>
                <div class="data-box-row"><span class="lbl">成交</span><span class="val mono">${formatUnit(item.vol)}手</span></div>
            </div>
            <div class="amt-row">
                <span class="lbl">成交额</span><span class="val mono">${formatUnit(item.amt)}</span>
            </div>
        </div>
    `;
    
    const meta = getSignalMeta(safeIdx, rd, state.indicators);
    return { 
        priceHtml, 
        analysisHtml: generateAnalysisHTML(safeIdx, rd, meta), 
        isHide: false 
    };
}
