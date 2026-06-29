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

function updateFreezeBadge() {
    var badge = document.getElementById('freezeBadge');
    if (!badge) return;
    if (state.isFrozen) {
        var rd = getActiveData();
        var safeIdx = rd ? getSafeIndex(rd) : -1;
        var date = rd && safeIdx >= 0 && safeIdx < rd.length ? rd[safeIdx].date : '';
        var dateEl = badge.querySelector('.freeze-badge-date');
        if (dateEl) dateEl.textContent = date ? ' \u00b7 ' + date : '';
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function redrawChartsFast() {
    Object.values(state.charts).forEach(c => {
        if (!c) return;
        if (typeof c.draw === 'function') c.draw();
        else c.update('none');
    });
}

const freezePlugin = {
    id: 'freezePlugin',
    beforeEvent: (c, args) => { if (state.isFrozen && args.event.type !== 'click' && args.event.type !== 'touchstart' && args.event.type !== 'touchend') return false; }
};

// 成交量柱 plugin：用 canvas 手绘，像素级对齐 K 线蜡烛
const volumeBarPlugin = {
    id: 'volumeBarPlugin',
    afterDatasetsDraw: c => {
        const dss = c.data.datasets.find(d => d.isVolData === true && d.volData);
        if (!dss || !dss.volData) return;
        const { ctx, chartArea } = c;
        if (!chartArea) return;
        const { bottom, top } = chartArea;
        const x = c.scales.x, y = c.scales.y;
        if (!x || !y) return;
        const colorUpHex = getCssVar('--up-color') || '#f6465d';
        const colorDownHex = getCssVar('--down-color') || '#0ecb81';
        const barW = Math.min((x.width / c.data.labels.length) * 0.8, 20);
        dss.volData.forEach((d, i) => {
            if (!d || d.vol == null) return;
            const px = x.getPixelForValue(i);
            const vy = y.getPixelForValue(d.vol);
            if (isNaN(px) || isNaN(vy)) return;
            const vyClamped = Math.max(top, Math.min(bottom, vy));
            ctx.fillStyle = d.isUp ? colorUpHex + '80' : colorDownHex + '80';
            ctx.fillRect(px - barW / 2, vyClamped, barW, Math.max(bottom - vyClamped, 0.5));
        });
    }
};

// MACD 柱 plugin：跟 volume 一样用 canvas 手绘，正负值从中线向上下延伸
const macdBarPlugin = {
    id: 'macdBarPlugin',
    afterDatasetsDraw: c => {
        const dss = c.data.datasets.find(d => d.isMacdBar === true && d.macdBarData);
        if (!dss || !dss.macdBarData) return;
        const { ctx, chartArea } = c;
        if (!chartArea) return;
        const { bottom, top } = chartArea;
        const x = c.scales.x, y = c.scales.y;
        if (!x || !y) return;
        const colorUpHex = getCssVar('--up-color') || '#f6465d';
        const colorDownHex = getCssVar('--down-color') || '#0ecb81';
        const barW = Math.min((x.width / c.data.labels.length) * 0.8, 20);
        const zeroY = Math.min(bottom, Math.max(top, y.getPixelForValue(0)));
        dss.macdBarData.forEach((v, i) => {
            if (v == null) return;
            const px = x.getPixelForValue(i);
            const vy = y.getPixelForValue(v);
            if (isNaN(px) || isNaN(vy)) return;
            const vyClamped = Math.min(bottom, Math.max(top, vy));
            const barY = Math.min(zeroY, vyClamped);
            ctx.fillStyle = v >= 0 ? colorUpHex + '80' : colorDownHex + '80';
            ctx.fillRect(px - barW / 2, barY, barW, Math.max(Math.abs(zeroY - vyClamped), 0.5));
        });
    }
};

const localAlignPlugin = {
    id: 'localAlignPlugin',
    afterDatasetsDraw: c => {
        const { ctx, chartArea } = c;
        if (!chartArea) return;
        const { top, bottom, left, right } = chartArea;
        const x = c.scales.x, y = c.scales.y;
        if (!x || !y) return;
        const dss = c.data.datasets.find(d => d.isCandle === true && d.candleData);
        const colorUpHex = getCssVar('--up-color') || '#f6465d', colorDownHex = getCssVar('--down-color') || '#0ecb81';
        
        if (dss && dss.candleData) {
            const w = Math.min((x.width / c.data.labels.length) * 0.8, 20);
            dss.candleData.forEach((d, i) => {
                if (!d) return;
                const px = x.getPixelForValue(i);
                const ho = y.getPixelForValue(d.h), lo = y.getPixelForValue(d.l);
                const co = y.getPixelForValue(d.c), oo = y.getPixelForValue(d.o);
                if (isNaN(px) || isNaN(ho) || isNaN(lo) || isNaN(co) || isNaN(oo)) return;
                const cl = d.c >= d.o ? colorUpHex : colorDownHex;
                ctx.strokeStyle = cl; ctx.beginPath(); ctx.moveTo(px, ho); ctx.lineTo(px, lo); ctx.stroke();
                ctx.fillStyle = cl; ctx.fillRect(px - w / 2, Math.min(oo, co), w, Math.max(Math.abs(oo - co), 1.5));
            });
        }
    }
};

function updateCrosshairOverlay() {
    const overlay = document.getElementById('crosshairOverlay');
    const line = document.getElementById('crosshairLine');
    const hLine = document.getElementById('crosshairHLine');
    if (!overlay || !line) return;
    const mainChart = state.charts.main;
    if (!mainChart) return;
    const actData = getActiveData();
    if (!actData || !actData.length) { overlay.classList.remove('active'); if (hLine) hLine.classList.remove('active'); return; }
    const safeIdx = getSafeIndex(actData);
    if (safeIdx < 0 || safeIdx >= actData.length) { overlay.classList.remove('active'); if (hLine) hLine.classList.remove('active'); return; }
    const li = mainChart.data.labels.indexOf(actData[safeIdx].date);
    if (li < 0) { overlay.classList.remove('active'); if (hLine) hLine.classList.remove('active'); return; }
    const xScale = mainChart.scales.x;
    const yScale = mainChart.scales.y;
    const px = xScale.getPixelForValue(li);
    if (px < xScale.left || px > xScale.right) { overlay.classList.remove('active'); if (hLine) hLine.classList.remove('active'); return; }

    // 竖线
    line.style.transform = 'translateX(' + px + 'px)';
    overlay.classList.add('active');
    if (state.isFrozen) overlay.classList.add('frozen');
    else overlay.classList.remove('frozen');

    // 横线（只在主图）
    if (hLine && yScale) {
        var py = yScale.getPixelForValue(actData[safeIdx].close);
        if (py >= yScale.top && py <= yScale.bottom) {
            hLine.style.transform = 'translateY(' + py + 'px)';
            hLine.classList.add('active');
        } else {
            hLine.classList.remove('active');
        }
        // 主图 frozen 状态切换
        var mainBox = document.querySelector('.main-chart-box');
        if (mainBox) {
            if (state.isFrozen) mainBox.classList.add('frozen');
            else mainBox.classList.remove('frozen');
        }
    }
}

const bsMarkerPlugin = {
    id: 'bsMarkerPlugin',
    afterDatasetsDraw: c => {
        const { ctx, chartArea } = c;
        if (!chartArea) return;
        const { top, bottom, left, right } = chartArea;
        const x = c.scales.x, y = c.scales.y;
        if (!x || !y) return;
        const dss = c.data.datasets.find(d => d.isCandle === true && d.candleData);
        if (!dss || state.period === 'weekly') return; 

        const activeData = getActiveData(); if(!activeData) return;
        const slice = activeData.slice(-c.data.labels.length);
        const colorUpHex = getCssVar('--up-color') || '#f6465d', colorDownHex = getCssVar('--down-color') || '#0ecb81';

        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
        slice.forEach((d, i) => {
            const px = x.getPixelForValue(i);
            if (isNaN(px) || px < left || px > right || !d._decision) return;
            if (d._decision.bsMark === 'B') { 
                ctx.fillStyle = colorUpHex; 
                const py = y.getPixelForValue(d.low);
                if (!isNaN(py)) { ctx.fillText('B', px, Math.min(py + 14, bottom - 8)); }
            } 
            else if (d._decision.bsMark === 'S') { 
                ctx.fillStyle = colorDownHex; 
                const py = y.getPixelForValue(d.high);
                if (!isNaN(py)) { ctx.fillText('S', px, Math.max(py - 14, top + 8)); }
            }
        });
        ctx.restore();
    }
};

let hoverRAF = null;
let pendingHoverIdx = -1;
let chartPointerResetBound = false;

function resolveVisibleDataIndex(activeData, renderedIndex) {
    if (!activeData || renderedIndex < 0) return -1;
    const actualRange = state.period === 'weekly' ? Math.ceil(state.range / 5) : state.range;
    const startIdx = Math.max(0, activeData.length - actualRange);
    const targetIdx = startIdx + renderedIndex;
    return (targetIdx >= 0 && targetIdx < activeData.length) ? targetIdx : -1;
}

function refreshHoverSelection() {
    hoverRAF = null;
    if (pendingHoverIdx < 0 || pendingHoverIdx === state.lockIdx) return;
    setLockIdx(pendingHoverIdx);
    pendingHoverIdx = -1;
    safeUpdateSidebar();
    updateCrosshairOverlay();
}

function resetHoverSelectionToLatest() {
    if (state.isFrozen) return;
    const activeData = getActiveData();
    if (!activeData || !activeData.length) return;
    const latestIdx = activeData.length - 1;
    pendingHoverIdx = -1;
    if (hoverRAF) {
        cancelAnimationFrame(hoverRAF);
        hoverRAF = null;
    }
    if (state.lockIdx === latestIdx) { updateCrosshairOverlay(); return; }
    setLockIdx(latestIdx);
    safeUpdateSidebar();
    updateCrosshairOverlay();
}

function bindChartPointerReset() {
    if (chartPointerResetBound) return;
    const container = document.querySelector('.integrated-container');
    if (!container) return;
    container.addEventListener('mouseleave', () => {
        resetHoverSelectionToLatest();
    });
    chartPointerResetBound = true;
}

function handleChartHover(e, els) {
    const type = e?.native?.type || e?.type; 
    if (type === 'mousemove' && state.isFrozen) return;
    
    if (els && els.length) {
        const activeData = getActiveData(); if (!activeData) return;
        const ti = resolveVisibleDataIndex(activeData, els[0].index);
        if (ti >= 0 && state.lockIdx !== ti) {
            setLockIdx(ti);
            // 十字线同步更新，零延迟跟随鼠标
            updateCrosshairOverlay();
            // 侧边栏用 RAF 节流，避免频繁 DOM 操作
            if (!hoverRAF) hoverRAF = requestAnimationFrame(() => {
                hoverRAF = null;
                safeUpdateSidebar();
            });
        }
    }
}

function handleChartClick(e, els) {
    if (!els || !els.length) {
        state.isFrozen = false;
        var rd = getActiveData();
        setLockIdx(rd ? rd.length - 1 : -1);
        redrawChartsFast();
        safeUpdateSidebar();
        updateFreezeBadge();
        updateCrosshairOverlay();
        return;
    }
    const activeData = getActiveData(); if (!activeData) return;
    const ti = resolveVisibleDataIndex(activeData, els[0].index);
    if (ti >= 0) {
        pendingHoverIdx = -1;
        if (state.isFrozen && state.lockIdx === ti) state.isFrozen = false; else { state.isFrozen = true; setLockIdx(ti); }
        if (hoverRAF) cancelAnimationFrame(hoverRAF);
        hoverRAF = requestAnimationFrame(() => { safeUpdateSidebar(); redrawChartsFast(); updateFreezeBadge(); updateCrosshairOverlay(); });
    }
}

function draw() {
    const perfTrace = PERF.start('draw', { id: state.id, mode: state.mode, period: state.period, range: state.range });
    bindChartPointerReset();
    document.querySelectorAll('.empty-hint').forEach(e => e.remove());
    const currentFd = getActiveData(); 
    if(!currentFd || !currentFd.length) { clearCharts(); updateFreezeBadge(); PERF.end(perfTrace, { status: 'empty' }); return; }
    
    updateAllIndicators();
    PERF.mark(perfTrace, 'indicators');
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
        beginAtZero: isVol ? true : undefined,
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
        // 图表类型变更或 scope 变更时必须销毁重建，否则 scale 配置不会正确初始化
        if (existingChart && (existingChart.canvas.dataset.scope !== currentScope || existingChart.config.type !== cfg.type)) {
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
    mainOpts.scales = { x: { display: false, type: 'category', offset: false, bounds: 'ticks', grid: { offset: false } }, y: getYScale() };
    uc('main', 'mainChart', { type: 'line', data: { labels, datasets: ds }, options: mainOpts, plugins: [localAlignPlugin, bsMarkerPlugin, freezePlugin] });
    
    const volOpts = getBaseOptions();
    volOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
    volOpts.scales = { x: { display: false, type: 'category', offset: false, bounds: 'ticks', grid: { offset: false } }, y: getYScale(true) };
    // 成交量柱子用 plugin 手绘，data 全是 null，Chart.js 看不到实际 vol 值，需手动设 y 轴范围
    const volMax = Math.max(...slice.map(d => d.vol));
    volOpts.scales.y.min = 0;
    if (volMax > 0) volOpts.scales.y.max = Math.ceil(volMax * 1.1);
    uc('vol', 'volumeChart', { type: 'line', data: { labels, datasets: [{ isVolData: true, volData: slice.map(d => ({ vol: d.vol, isUp: d.close >= d.open })), data: slice.map(() => null), borderColor: 'transparent', pointRadius: 0 }] }, options: volOpts, plugins: [volumeBarPlugin, freezePlugin] });
    
    if(state.indicators.macd) {
        const md = state.indicators.macd;
        const macdOpts = getBaseOptions();
        macdOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
        macdOpts.scales = { x: { display: false, type: 'category', offset: false, bounds: 'ticks', grid: { offset: false } }, y: getYScale() };
        // 让 y 轴范围同时覆盖 diff/dea 线和 bar 柱子，否则柱子被压缩成1-2像素
        const macdBarArr = md.bar.slice(-actualRange).filter(v => v != null);
        if (macdBarArr.length) {
            const allY = [...md.diff.slice(-actualRange), ...md.dea.slice(-actualRange), ...macdBarArr];
            const yMin = Math.min(...allY.filter(v => v != null));
            const yMax = Math.max(...allY.filter(v => v != null));
            const pad = Math.max(Math.abs(yMax - yMin) * 0.1, 1);
            macdOpts.scales.y.min = Math.floor(yMin - pad);
            macdOpts.scales.y.max = Math.ceil(yMax + pad);
        }
        uc('macd', 'macdChart', { 
            type: 'line', 
            data: { labels, datasets: [ { data: md.diff.slice(-actualRange), borderColor: colorBlueHex, borderWidth: 1, pointRadius: 0, tension: 0.1 }, { data: md.dea.slice(-actualRange), borderColor: '#f5a623', borderWidth: 1, pointRadius: 0, tension: 0.1 }, { isMacdBar: true, macdBarData: md.bar.slice(-actualRange), data: md.bar.slice(-actualRange).map(() => null), borderColor: 'transparent', pointRadius: 0 } ] }, 
            options: macdOpts, plugins: [macdBarPlugin, freezePlugin] 
        });
    }
    
    if(state.indicators.kdj) {
        const kd = state.indicators.kdj;
        const kdjOpts = getBaseOptions();
        kdjOpts.plugins = { legend: { display: false }, tooltip: { enabled: false } };
        kdjOpts.scales = { x: { display: false, type: 'category', offset: false, bounds: 'ticks', grid: { offset: false } }, y: getYScale() };
        uc('kdj', 'kdjChart', { 
            type: 'line', 
            data: { labels, datasets: [ { label: 'K', data: kd.k.slice(-actualRange), borderColor: '#f8fafc', borderWidth: 1, pointRadius: 0, tension: 0.1 }, { label: 'D', data: kd.d.slice(-actualRange), borderColor: '#f5a623', borderWidth: 1, pointRadius: 0, tension: 0.1 }, { label: 'J', data: kd.j.slice(-actualRange), borderColor: '#8b5cf6', borderWidth: 1, pointRadius: 0, tension: 0.1 } ] }, 
            options: kdjOpts, plugins: [localAlignPlugin, freezePlugin] 
        });
    }
    PERF.end(perfTrace, { points: slice.length });
    updateFreezeBadge();
    updateCrosshairOverlay();
}

function getNoviceEvidenceCopy(meta, decision, displayExitLevel, guardHint) {
    const position = decision?.position ?? 0;
    const scoreText = `${meta?.windowScore ?? 0}/${STRATEGY?.buyThreshold ?? '-'}`;
    const action = decision?.simpleAction || '';
    const isDefensive = ['清仓离场', '执行离场', '规避风险'].includes(action) || position === 0;
    const isReduce = action.includes('减仓') || displayExitLevel !== '无明确离场';

    let marketHint = '大盘给背景，不直接等于买点；个股/指数自身信号仍要达标。';
    if (decision?.market?.cls === 'bear') marketHint = '大盘环境偏弱，先降低预期；个股买点需要更强确认。';
    else if (decision?.market?.cls === 'bull' && position > 0) marketHint = '大盘给顺风背景，但继续持有仍要看自身趋势和防守位。';

    let signalHint = `为什么现在不能买：买入积分只有 ${scoreText}，没有达到当前策略要求。`;
    if (position > 0 && (meta?.windowScore ?? 0) >= (STRATEGY?.buyThreshold ?? Infinity)) {
        signalHint = `为什么还能拿：买入积分 ${scoreText} 已达标，趋势信号仍在支持当前仓位。`;
    } else if (position > 0) {
        signalHint = `为什么只观察：买入积分 ${scoreText} 不强，当前仓位主要依赖已有趋势和风控约束。`;
    }

    let guardAction = '接下来怎么防守：没有额外风险时，重点盯防守位和强离场信号。';
    if (isDefensive) guardAction = '接下来怎么防守：先不要新开仓，等买入积分重新达标并脱离冷静期。';
    else if (isReduce) guardAction = '接下来怎么防守：降低仓位，若继续跌破防守位或再出离场信号，优先退出。';
    else if (guardHint) guardAction = `接下来怎么防守：${guardHint}。`;

    return { marketHint, signalHint, guardHint: guardAction };
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
    
    const noviceSummary = getNoviceDecisionSummary(meta, decision);
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
    const guardSignals = [
        ...exitEvidence.direct,
        ...(exitEvidence.window || []).filter(sig => !exitEvidence.direct.includes(sig))
    ].slice(0, 3);
    const guardSignalSummary = guardSignals.length ? `信号 ${guardSignals.join(' / ')}` : '';
    const guardHoldingText = diagnosis ? (diagnosis.displayStatus || diagnosis.status) : '';
    const guardHint = [riskFlags, guardSignalSummary, guardHoldingText].filter(Boolean).join(' · ');
    const noviceEvidence = getNoviceEvidenceCopy(meta, decision, displayExitLevel, guardHint);

    let panelClass = 'panel-neutral';
    const a = decision.simpleAction;
    
    if (['清仓离场', '执行离场', '规避风险'].includes(a)) { panelClass = 'panel-bear'; } 
    else if (['防守减仓', '谨慎持有'].includes(a)) { panelClass = 'panel-warn'; } 
    else if (['轻仓建仓', '缓慢加仓', '轻仓持有'].includes(a)) { panelClass = 'panel-info'; } 
    else if (['积极建仓', '顺势加仓', '顺势抱单', '积极持有'].includes(a)) { panelClass = 'panel-bull'; }

    const cooldownHtml = meta.inCooldown ? `<div style="position:absolute; top:0; right:0; background:var(--yellow); color:#000; font-size:9px; font-weight:800; padding:2px 8px; border-bottom-left-radius:6px; border-top-right-radius:7px;">防守冷静期</div>` : '';
    const titleText = state.mode === 'index' ? '大盘每日结论' : '新手每日结论';
    const evidenceTitle2 = state.mode === 'index' ? '指数动能' : '个股信号';

    const actionPanelHtml = `
        <div class="action-panel ${panelClass}">
            ${cooldownHtml}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="block-title" style="border:none; padding-bottom:0; margin:0;">${titleText}</div>
                <div class="kicker text-main">${escapeHTML(noviceSummary.state)}</div>
            </div>
            <div class="action-line">
                <div class="action-name ${decision.simpleColorClass}">${escapeHTML(noviceSummary.action)}</div>
                <div class="action-cap">
                    <span class="text-dim">当前建议仓位</span>
                    <strong class="mono text-main">${escapeHTML(noviceSummary.positionText)}</strong>
                </div>
            </div>
            <div class="action-sub">${escapeHTML(noviceSummary.reason)}。${escapeHTML(ct)}</div>
            ${decision.positionDriver ? `<div class="action-driver">${escapeHTML(decision.positionDriver)}</div>` : ''}
            <div class="action-driver">失效条件：${escapeHTML(noviceSummary.invalidCondition)}</div>
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
                        <div class="h">${escapeHTML(noviceEvidence.marketHint)}</div>
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
                        <div class="h">${escapeHTML(noviceEvidence.signalHint)}</div>
                    </div>
                </div>
                <div class="evidence-item">
                    <div class="evidence-label">
                        <div class="k">风控/防守</div>
                        <div class="evidence-source">推导自：风险评分 / L 类离场 / 持仓状态</div>
                    </div>
                    <div class="right-side">
                        <div class="v ${guardTextClass}">${escapeHTML(guardValue)}</div>
                        <div class="h">${escapeHTML(guardHint || '暂无额外风控提示')}</div>
                        <div class="h">${escapeHTML(noviceEvidence.guardHint)}</div>
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
    const perfTrace = PERF.start('sidebar', { id: state.id, mode: state.mode, period: state.period });
    const rd = getActiveData();
    if (rd && rd.length > 0) {
        const safeIdx = getSafeIndex(rd); 
        if (safeIdx < 0 || !rd[safeIdx]) { PERF.end(perfTrace, { status: 'invalid-index' }); return; }
        setLockIdx(safeIdx);
        
        const item = rd[safeIdx];
        const decision = item._decision || null;
        const cacheKey = [
            state.id,
            item.date,
            state.strategy,
            state.period,
            item.close,
            item.vol,
            getDecisionSignature(decision),
            SIGNAL_VERSION,
            APP_BUILD
        ].join('_');
        
        if (state.mode === 'index') {
            updateLeftMarketContext(item.date);
            PERF.mark(perfTrace, 'left-context');
        }

        if (renderCache.has(cacheKey)) { 
            applySidebarHTML(renderCache.get(cacheKey), cacheKey); 
            updateNavCapsuleVisuals(safeIdx, rd.length); 
            PERF.end(perfTrace, { status: 'cache-hit', date: item.date });
            return; 
        }

        const prev = safeIdx > 0 ? rd[safeIdx - 1] : null;
        const htmlBundle = generateSidebarBundle(item, prev, safeIdx, rd);
        PERF.mark(perfTrace, 'bundle');
        
        if (renderCache.size >= SYS_CONFIG.RENDER_CACHE_SIZE) {
            renderCache.delete(renderCache.keys().next().value);
        }
        renderCache.set(cacheKey, htmlBundle);
        
        applySidebarHTML(htmlBundle, cacheKey);
        updateNavCapsuleVisuals(safeIdx, rd.length);
        PERF.end(perfTrace, { status: 'cache-miss', date: item.date });
    } else {
        applySidebarHTML({ priceHtml: '', analysisHtml: '', isHide: true });
        if (state.mode === 'index') { 
            const ctx = document.getElementById('leftMarketContext'); 
            if(ctx) ctx.innerHTML = ''; 
        }
        PERF.end(perfTrace, { status: 'empty-data' });
    }
}

function updateSidebarPriceOnly() {
    const rd = getActiveData();
    if (!rd || !rd.length) return;
    const safeIdx = getSafeIndex(rd);
    if (safeIdx < 0 || !rd[safeIdx]) return;
    const item = rd[safeIdx];
    const prev = safeIdx > 0 ? rd[safeIdx - 1] : null;
    const ch = item.close - (prev ? prev.close : item.open);
    const pct = (ch / (prev ? prev.close : item.open) * 100).toFixed(2);
    const cls = ch >= 0 ? 'up' : 'down';
    const fmt = v => !v ? '--' : (v >= 1e8 ? (v/1e8).toFixed(2)+'亿' : v >= 1e4 ? (v/1e4).toFixed(2)+'万' : v.toFixed(0));

    const cPrice = document.getElementById('cardPrice');
    if (!cPrice) return;

    // 辅助函数：只有值变了才更新文本 + pulse
    function diffUpdate(el, newVal, newCls) {
        if (!el) return;
        var oldText = el.textContent;
        var newText = String(newVal);
        if (oldText === newText) return; // 值没变，不操作
        el.textContent = newText;
        if (newCls) el.className = (el.className.split(' ').filter(c => c !== 'up' && c !== 'down').join(' ') + ' ' + newCls).trim();
        el.classList.add('price-pulse');
        setTimeout(function() { el.classList.remove('price-pulse'); }, 400);
    }

    // 价格
    diffUpdate(cPrice.querySelector('.price-main'), item.close.toFixed(2), cls);

    // 涨跌幅
    var subText = (ch >= 0 ? '+' : '') + ch.toFixed(2) + ' (' + (ch >= 0 ? '+' : '') + pct + '%)';
    var subEl = cPrice.querySelector('.price-sub');
    if (subEl) {
        if (subEl.textContent !== subText) {
            subEl.textContent = subText;
            subEl.className = 'price-sub mono ' + cls;
            subEl.classList.add('price-pulse');
            setTimeout(function() { subEl.classList.remove('price-pulse'); }, 400);
        }
    }

    // 今开 / 最高 / 最低 / 成交量
    var vals = cPrice.querySelectorAll('.data-box-row .val');
    if (vals.length >= 4) {
        diffUpdate(vals[0], item.open.toFixed(2));
        diffUpdate(vals[1], item.high.toFixed(2));
        diffUpdate(vals[2], item.low.toFixed(2));
        diffUpdate(vals[3], fmt(item.vol) + '手');
    }

    // 成交额
    diffUpdate(cPrice.querySelector('.amt-row .val'), fmt(item.amt));
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

    var oldPriceEl = cPrice.querySelector('.price-main');
    var oldPrice = oldPriceEl ? parseFloat(oldPriceEl.textContent) : null;

    // 用 hash 比对，避免脆弱的 innerHTML.trim 字符串比较导致误刷
    var priceHtml = bundle.priceHtml || '';
    var analysisHtml = bundle.analysisHtml || '';
    var priceHash = hashString32(priceHtml);
    var analysisHash = hashString32(analysisHtml);
    var prevPriceHash = parseInt(cPrice.dataset.ph || '0', 10);
    var prevAnalysisHash = parseInt(cAnalysis.dataset.ah || '0', 10);

    // 价格区：用淡入过渡防白闪
    if (priceHash !== prevPriceHash) {
        cPrice.style.opacity = '0';
        cPrice.innerHTML = priceHtml;
        cPrice.dataset.ph = String(priceHash);
        // 强制回流后恢复可见（浏览器会在下一帧渲染，不会看到空白帧）
        cPrice.offsetHeight; 
        cPrice.style.opacity = '';
    }

    // 分析区：同样用淡入过渡
    if (analysisHash !== prevAnalysisHash) {
        cAnalysis.style.opacity = '0';
        cAnalysis.innerHTML = analysisHtml;
        cAnalysis.dataset.ah = String(analysisHash);
        cAnalysis.offsetHeight;
        cAnalysis.style.opacity = '';
    }

    if (cacheKey) cPrice.dataset.key = cacheKey;

    var newPriceEl = cPrice.querySelector('.price-main');
    if (newPriceEl && oldPrice !== null && !isNaN(oldPrice)) {
        var newPrice = parseFloat(newPriceEl.textContent);
        if (!isNaN(newPrice) && newPrice !== oldPrice) {
            newPriceEl.classList.add('price-pulse');
            setTimeout(function() { newPriceEl.classList.remove('price-pulse'); }, 400);
        }
    }
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
