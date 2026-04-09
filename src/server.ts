import express from 'express';
import { getWallets, getAllTrades, getOpenTrades, getWalletHistory } from './db/database';
import { BotManager } from './bot/BotManager';

export const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
    const wallets = getWallets() as any[];
    const allTrades = getAllTrades() as any[];
    const walletHistory = getWalletHistory() as any[];
    
    // Group history by wallet
    const historyByWalletId: Record<string, any[]> = {};
    wallets.forEach(w => historyByWalletId[w.id] = []);
    walletHistory.forEach(h => {
        if (historyByWalletId[h.walletId]) {
            historyByWalletId[h.walletId].push(h);
        }
    });

    const openTradesCount = getOpenTrades().length;
    const totalTrades = allTrades.length;

    let walletsHtml = '';
    for (const w of wallets) {
        walletsHtml += `
            <div class="card glass">
                <h3>💖 ${w.name}</h3>
                <p>Balance: <span class="highlight">$${w.balance.toFixed(2)}</span></p>
                <p>Wallet ID: <code>${w.id}</code></p>
                <div class="chart-container" style="position: relative; height:200px; width:100%; margin-top:20px;">
                    <canvas id="chart-${w.id}"></canvas>
                </div>
                <div class="chart-toggles">
                    <button onclick="updateChart('${w.id}', 1)">1D</button>
                    <button onclick="updateChart('${w.id}', 7)">7D</button>
                    <button onclick="updateChart('${w.id}', 30)">30D</button>
                    <button onclick="updateChart('${w.id}', 'MAX')">MAX</button>
                </div>
            </div>
        `;
    }
    const trades1 = allTrades.filter(t => t.walletId === 'strategy-1');
    const trades2 = allTrades.filter(t => t.walletId === 'strategy-2');
    const trades3 = allTrades.filter(t => t.walletId === 'strategy-3');

    // List of cities for dropdown (dynamically deduced or explicit)
    const cities = ['paris', 'amsterdam', 'berlin', 'london', 'madrid', 'rome', 'moscow', 'tokyo', 'seoul', 'beijing', 
    'shanghai', 'shenzhen', 'hong kong', 'sydney', 'dubai', 'singapore', 'helsinki', 'ankara', 'sao paulo', 'tel aviv', 
    'warsaw', 'toronto', 'new york', 'miami', 'chicago', 'los angeles', 'austin', 'phoenix', 'washington', 'philadelphia', 
    'mexico city', 'milan', 'munich', 'panama city'];

    function getCity(title: string) {
        if (!title) return 'other';
        const t = title.toLowerCase();
        for (const c of cities) {
            if (t.includes(c)) return c;
        }
        return 'other';
    }

    function renderRow(t: any, showForecast: boolean) {
        const titleText = t.marketTitle && t.marketTitle !== 'Unknown Title' ? t.marketTitle : t.marketId;
        const statusColor = t.status === 'OPEN' ? '#f59e0b' : (t.status === 'WON' ? '#10b981' : (t.status === 'LOST' ? '#ef4444' : '#64748b'));
        const cityKey = getCity(titleText);
        
        let pnlText = '';
        if (t.status !== 'OPEN' && t.status !== 'CLOSED') {
             const cost = t.amount * t.price;
             let net = 0;
             if (t.status === 'WON') net = t.amount - cost;
             if (t.status === 'LOST') net = -cost;
             pnlText = `<span style="color: ${net >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold;">${net >= 0 ? '+$' : '-$'}${Math.abs(net).toFixed(3)}</span>`;
        } else if (t.currentPrice !== undefined && t.currentPrice !== null) {
            const diff = t.currentPrice - t.price;
            const diffColor = diff >= 0 ? '#10b981' : '#ef4444';
            pnlText = `<span style="color: ${diffColor}; font-weight: bold;">$${t.currentPrice.toFixed(3)} (Est)</span>`;
        } else {
            pnlText = `<span style="color: var(--text-muted);">N/A</span>`;
        }
        
        const forecastTd = showForecast ? `<td><span style="color:#ec4899; font-weight:bold;">${t.forecastTemp || 'N/A'}</span> <br><span style="font-size:0.8rem; color:var(--text-muted)">Latest: ${t.latestForecastTemp || 'N/A'}</span></td>` : '';

        return `
            <tr data-city="${cityKey}" data-date="${t.createdAt}" data-strategy="${t.walletId}" data-status="${t.status}" data-shares="${t.amount}" data-price="${t.price}" class="trade-row strat-${t.walletId} ${t.status === 'OPEN' ? 'is-open' : 'is-settled'}">
                <td>${new Date(t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</td>
                <td><strong style="color: #475569; font-size:1.05rem;">${titleText}</strong></td>
                ${forecastTd}
                <td><span class="badge ${t.type.toLowerCase()}">${t.type}</span></td>
                <td>${t.amount}</td>
                <td>$${t.price.toFixed(3)}</td>
                <td>${pnlText}</td>
                <td><span style="color: ${statusColor}; font-weight: bold;">${t.status}</span></td>
            </tr>
        `;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Polymarket Weather Bot</title>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            :root {
                --bg: #e8f7f0;
                --surface: rgba(255, 255, 255, 0.85);
                --border: #b2ebd1;
                --primary: #4ade80;
                --primary-glow: rgba(74, 222, 128, 0.4);
                --accent: #f472b6;
                --accent-glow: rgba(244, 114, 182, 0.4);
                --text: #334155;
                --text-muted: #64748b;
            }
            body {
                margin: 0;
                font-family: 'Nunito', sans-serif;
                background-color: var(--bg);
                color: var(--text);
                padding: 40px;
                background-image: 
                    radial-gradient(at 0% 0%, rgba(244, 114, 182, 0.1) 0px, transparent 50%),
                    radial-gradient(at 100% 0%, rgba(74, 222, 128, 0.15) 0px, transparent 50%);
                background-attachment: fixed;
            }
            .glass {
                background: var(--surface);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 2px solid var(--border);
            }
            header {
                text-align: center;
                margin-bottom: 30px;
            }
            h1 {
                font-size: 3.5rem;
                background: linear-gradient(to right, #2dd4bf, #f472b6);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin: 0 0 10px 0;
                letter-spacing: -1px;
                font-weight: 800;
            }
            .controls {
                text-align: center;
                margin-bottom: 40px;
                display: flex;
                flex-direction: row;
                justify-content: center;
                flex-wrap: wrap;
                gap: 15px;
            }
            select {
                padding: 12px 24px;
                border-radius: 20px;
                border: 2px solid var(--accent);
                font-size: 1.1rem;
                font-family: 'Nunito', sans-serif;
                font-weight: 600;
                color: var(--text);
                background: #fff;
                outline: none;
                cursor: pointer;
                box-shadow: 0 4px 15px var(--accent-glow);
                appearance: none;
            }
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                gap: 25px;
                margin-bottom: 40px;
            }
            .card {
                padding: 30px;
                border-radius: 30px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .card:hover {
                transform: translateY(-5px);
            }
            .card h3 {
                margin-top: 0;
                color: var(--accent);
                font-size: 1.6rem;
            }
            .highlight {
                font-size: 2.2rem;
                font-weight: 800;
                color: #0d9488;
            }
            code {
                background: #f1f5f9;
                padding: 6px 10px;
                border-radius: 12px;
                color: var(--text-muted);
                font-size: 0.85rem;
                border: 1px solid #e2e8f0;
            }
            .chart-toggles {
                margin-top: 15px;
                display: flex;
                gap: 5px;
                justify-content: center;
                flex-wrap: wrap;
            }
            .chart-toggles button {
                background: transparent;
                border: 2px solid var(--border);
                color: var(--text-muted);
                padding: 4px 10px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 0.8rem;
                font-weight: 700;
                transition: all 0.2s;
            }
            .chart-toggles button:hover, .chart-toggles button.active {
                background: var(--accent);
                color: white;
                border-color: var(--accent);
                box-shadow: 0 0 10px var(--accent-glow);
            }
            .section-title {
                color: #0f766e;
                margin-bottom: 10px;
                font-weight: 800;
                font-size: 1.5rem;
                margin-top: 40px;
                background: var(--surface);
                display: inline-block;
                padding: 10px 20px;
                border-radius: 20px;
                border: 2px solid var(--border);
            }
            .mini-stats {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin-bottom: 20px;
                background: white;
                padding: 15px 25px;
                border-radius: 16px;
                border: 1px dashed var(--border);
                align-items: center;
            }
            .mini-stat {
                font-size: 0.95rem;
                color: var(--text-muted);
                font-weight: 600;
            }
            .mini-stat b {
                font-size: 1.15rem;
                color: var(--text);
                margin-left: 5px;
            }
            table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                background: var(--surface);
                border-radius: 24px;
                overflow: hidden;
                border: 2px solid var(--border);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03);
            }
            th, td {
                padding: 15px 20px;
                text-align: left;
                border-bottom: 1px solid #e2e8f0;
            }
            th {
                background-color: #f8fafc;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-size: 0.85rem;
                color: var(--text-muted);
                cursor: pointer;
                user-select: none;
            }
            th:hover {
                background-color: #e2e8f0;
            }
            .sub-title {
                color: var(--text-muted);
                margin: 0px 0 10px 0;
                font-size: 1.1rem;
                font-weight: 700;
            }
            tr:last-child td { border-bottom: none; }
            tr:hover td { background-color: #f1f5f9; }
            
            .badge {
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 0.85rem;
                font-weight: 800;
                display: inline-block;
            }
            .badge.yes { background: #dcfce7; color: #16a34a; border: 2px solid #bbf7d0; }
            .badge.no { background: #fee2e2; color: #dc2626; border: 2px solid #fecaca; }

            .stats {
                display: flex;
                gap: 20px;
                justify-content: center;
                margin-bottom: 30px;
                flex-wrap: wrap;
            }
            .stat-box { 
                text-align: center; 
                padding: 20px 35px;
                border-radius: 24px;
                min-width: 150px;
            }
            .stat-box span { 
                font-size: 2.5rem; 
                font-weight: 800; 
                color: var(--accent);
                display: block; 
            }
            
            .action-btn {
                padding: 14px 28px;
                border: none;
                border-radius: 20px;
                color: #fff;
                cursor: pointer;
                font-weight: 800;
                font-size: 1rem;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-family: 'Nunito', sans-serif;
            }
            .btn-primary {
                background: linear-gradient(135deg, #34d399, #10b981);
                box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
            }
            .btn-accent {
                background: linear-gradient(135deg, #f472b6, #ec4899);
                box-shadow: 0 10px 20px rgba(236, 72, 153, 0.3);
            }
            .action-btn:hover {
                transform: scale(1.05) translateY(-2px);
                filter: brightness(1.1);
            }
            .hidden {
                display: none !important;
            }

            /* Tooltip styling for matrix rows */
            .matrix-row:hover { background: #e0f2fe; }
        </style>
    </head>
    <body>
        <header>
            <h1>🌺 Weather Bot Dash 🌺</h1>
            <p style="color: var(--text-muted); font-size: 1.1rem; font-weight: 600;">Full Analytics Tracking</p>
        </header>

        <div class="controls">
            <select id="timeToggle" onchange="filterData()">
                <option value="all">📅 All Time (Default)</option>
                <option value="1">📅 Today Only</option>
                <option value="7">📅 Last 7 Days</option>
                <option value="30">📅 Last 30 Days</option>
            </select>

            <select id="cityToggle" onchange="filterData()">
                <option value="all">🌍 All Cities (Global View)</option>
                ${cities.sort().map(c => `<option value="${c}">${c.replace(/\b\w/g, (l) => l.toUpperCase())}</option>`).join('')}
                <option value="other">Other / Unknown</option>
            </select>

            <div style="display: flex; gap: 15px;">
                <button class="action-btn btn-primary" onclick="trigger('/api/run-cycle')">⚡ Run Cycle</button>
                <button class="action-btn btn-accent" onclick="trigger('/api/resolve')">🔄 Resolve</button>
            </div>
        </div>

        <div class="stats">
            <div class="stat-box glass">
                <span id="stat-total">${totalTrades}</span>
                <b style="color: var(--text-muted);">Total Trades</b>
            </div>
            <div class="stat-box glass">
                <span id="stat-open">${openTradesCount}</span>
                <b style="color: var(--text-muted);">Open Positions</b>
            </div>
            <div class="stat-box glass">
                <span id="stat-net-pnl">$0.00</span>
                <b style="color: var(--text-muted);">Total Profit</b>
            </div>
            <div class="stat-box glass">
                <span id="stat-roc">0%</span>
                <b style="color: var(--text-muted);">Return on Capital</b>
            </div>
            <div class="stat-box glass">
                <span id="stat-winrate">0%</span>
                <b style="color: var(--text-muted);">Win Rate</b>
            </div>
            <div class="stat-box glass">
                <span id="stat-avgwin">$0.00</span>
                <b style="color: var(--text-muted);">Avg Win</b>
            </div>
            <div class="stat-box glass">
                <span id="stat-avgloss">$0.00</span>
                <b style="color: var(--text-muted);">Avg Loss</b>
            </div>
        </div>

        <div class="grid">
            ${walletsHtml}
        </div>

        <!-- Strategy 1 -->
        <div class="section-title">☁️ OpenMeteo Counter-Bet</div>
        <div class="mini-stats" id="mini-strat-strategy-1">
            <span class="mini-stat">Total Profit: <b class="val-pnl">$0.00</b></span>
            <span class="mini-stat">Win Rate: <b class="val-wr">0%</b></span>
            <span class="mini-stat">ROI: <b class="val-roi">0%</b></span>
            <span class="mini-stat">Settled: <b class="val-count">0</b></span>
            <span class="mini-stat" style="margin-left: auto;">Current Open: <b class="val-open">0</b></span>
        </div>
        <h3 class="sub-title">Active Positions</h3>
        <table class="sortable">
            <thead><tr><th onclick="sortTable(this, 0)">Date ↕</th><th onclick="sortTable(this, 1)">Market Details ↕</th><th onclick="sortTable(this, 2)">Forecast ↕</th><th onclick="sortTable(this, 3)">Type ↕</th><th onclick="sortTable(this, 4)">Shares ↕</th><th onclick="sortTable(this, 5)">Avg Buy Price ↕</th><th onclick="sortTable(this, 6)">PnL ↕</th><th onclick="sortTable(this, 7)">Status ↕</th></tr></thead>
            <tbody id="table-strategy-1-open">${trades1.filter(t => t.status === 'OPEN').map(t => renderRow(t, true)).join('')}</tbody>
        </table>
        <h3 class="sub-title" style="margin-top:20px;">Settled History</h3>
        <table class="sortable">
            <thead><tr><th onclick="sortTable(this, 0)">Date ↕</th><th onclick="sortTable(this, 1)">Market Details ↕</th><th onclick="sortTable(this, 2)">Forecast ↕</th><th onclick="sortTable(this, 3)">Type ↕</th><th onclick="sortTable(this, 4)">Shares ↕</th><th onclick="sortTable(this, 5)">Avg Buy Price ↕</th><th onclick="sortTable(this, 6)">PnL ↕</th><th onclick="sortTable(this, 7)">Status ↕</th></tr></thead>
            <tbody id="table-strategy-1-settled">${trades1.filter(t => t.status !== 'OPEN').map(t => renderRow(t, true)).join('')}</tbody>
        </table>

        <!-- Strategy 2 -->
        <div class="section-title">📉 Cheapest NO</div>
        <div class="mini-stats" id="mini-strat-strategy-2">
            <span class="mini-stat">Total Profit: <b class="val-pnl">$0.00</b></span>
            <span class="mini-stat">Win Rate: <b class="val-wr">0%</b></span>
            <span class="mini-stat">ROI: <b class="val-roi">0%</b></span>
            <span class="mini-stat">Settled: <b class="val-count">0</b></span>
            <span class="mini-stat" style="margin-left: auto;">Current Open: <b class="val-open">0</b></span>
        </div>
        <h3 class="sub-title">Active Positions</h3>
        <table class="sortable">
            <thead><tr><th onclick="sortTable(this, 0)">Date ↕</th><th onclick="sortTable(this, 1)">Market Details ↕</th><th onclick="sortTable(this, 2)">Type ↕</th><th onclick="sortTable(this, 3)">Shares ↕</th><th onclick="sortTable(this, 4)">Avg Buy Price ↕</th><th onclick="sortTable(this, 5)">PnL ↕</th><th onclick="sortTable(this, 6)">Status ↕</th></tr></thead>
            <tbody id="table-strategy-2-open">${trades2.filter(t => t.status === 'OPEN').map(t => renderRow(t, false)).join('')}</tbody>
        </table>
        <h3 class="sub-title" style="margin-top:20px;">Settled History</h3>
        <table class="sortable">
            <thead><tr><th onclick="sortTable(this, 0)">Date ↕</th><th onclick="sortTable(this, 1)">Market Details ↕</th><th onclick="sortTable(this, 2)">Type ↕</th><th onclick="sortTable(this, 3)">Shares ↕</th><th onclick="sortTable(this, 4)">Avg Buy Price ↕</th><th onclick="sortTable(this, 5)">PnL ↕</th><th onclick="sortTable(this, 6)">Status ↕</th></tr></thead>
            <tbody id="table-strategy-2-settled">${trades2.filter(t => t.status !== 'OPEN').map(t => renderRow(t, false)).join('')}</tbody>
        </table>

        <!-- Strategy 3 -->
        <div class="section-title">🇺🇸 NWS Forecast Bet (YES)</div>
        <div class="mini-stats" id="mini-strat-strategy-3">
            <span class="mini-stat">Total Profit: <b class="val-pnl">$0.00</b></span>
            <span class="mini-stat">Win Rate: <b class="val-wr">0%</b></span>
            <span class="mini-stat">ROI: <b class="val-roi">0%</b></span>
            <span class="mini-stat">Settled: <b class="val-count">0</b></span>
            <span class="mini-stat" style="margin-left: auto;">Current Open: <b class="val-open">0</b></span>
        </div>
        <h3 class="sub-title">Active Positions</h3>
        <table class="sortable">
            <thead><tr><th onclick="sortTable(this, 0)">Date ↕</th><th onclick="sortTable(this, 1)">Market Details ↕</th><th onclick="sortTable(this, 2)">Forecast ↕</th><th onclick="sortTable(this, 3)">Type ↕</th><th onclick="sortTable(this, 4)">Shares ↕</th><th onclick="sortTable(this, 5)">Avg Buy Price ↕</th><th onclick="sortTable(this, 6)">PnL ↕</th><th onclick="sortTable(this, 7)">Status ↕</th></tr></thead>
            <tbody id="table-strategy-3-open">${trades3.filter(t => t.status === 'OPEN').map(t => renderRow(t, true)).join('')}</tbody>
        </table>
        <h3 class="sub-title" style="margin-top:20px;">Settled History</h3>
        <table class="sortable">
            <thead><tr><th onclick="sortTable(this, 0)">Date ↕</th><th onclick="sortTable(this, 1)">Market Details ↕</th><th onclick="sortTable(this, 2)">Forecast ↕</th><th onclick="sortTable(this, 3)">Type ↕</th><th onclick="sortTable(this, 4)">Shares ↕</th><th onclick="sortTable(this, 5)">Avg Buy Price ↕</th><th onclick="sortTable(this, 6)">PnL ↕</th><th onclick="sortTable(this, 7)">Status ↕</th></tr></thead>
            <tbody id="table-strategy-3-settled">${trades3.filter(t => t.status !== 'OPEN').map(t => renderRow(t, true)).join('')}</tbody>
        </table>

        <!-- Advanced Analytics Matrix -->
        <div style="margin-top: 60px;">
            <div class="section-title" style="margin-bottom: 25px; border-color: #38bdf8;">📊 Breakdown Matrix (Settled Trades)</div>
            <table class="sortable" id="matrix-table">
                <thead>
                    <tr>
                        <th onclick="sortTable(this, 0)">Execution Date ↕</th>
                        <th onclick="sortTable(this, 1)">Strategy ↕</th>
                        <th onclick="sortTable(this, 2)">City ↕</th>
                        <th onclick="sortTable(this, 3)">Trades Settled ↕</th>
                        <th onclick="sortTable(this, 4)">Win Rate ↕</th>
                        <th onclick="sortTable(this, 5)">Deployed Capital ↕</th>
                        <th onclick="sortTable(this, 6)">Total Profit ↕</th>
                    </tr>
                </thead>
                <tbody id="matrix-tbody">
                    <!-- Matrix dynamically rendered by Javascript -->
                </tbody>
            </table>
        </div>

        <script>
            function trigger(url) {
                fetch(url, {method: 'POST'})
                    .then(r => r.json())
                    .then(d => { alert(d.message); window.location.reload(); })
                    .catch(e => alert('Error: ' + e));
            }

            // Data passed for analytics toggling
            const rawHistory = ${JSON.stringify(historyByWalletId)};
            const chartInstances = {};
            const cityDropdown = document.getElementById('cityToggle');
            const timeDropdown = document.getElementById('timeToggle');

            function calculateStats() {
                // 1. Calculate Global Stats
                const rows = document.querySelectorAll('.trade-row:not(.hidden)');
                let deployed = 0, returned = 0, netPnl = 0, wins = 0, losses = 0, totalWinAmt = 0, totalLossAmt = 0;
                let tCount = 0, oCount = 0;

                rows.forEach(row => {
                    tCount++;
                    const status = row.getAttribute('data-status');
                    if (status === 'OPEN') oCount++;
                    const shares = parseFloat(row.getAttribute('data-shares')) || 0;
                    const buyPrice = parseFloat(row.getAttribute('data-price')) || 0;
                    const cost = shares * buyPrice;
                    
                    if (status === 'WON' || status === 'LOST') {
                        deployed += cost;
                        if (status === 'WON') {
                            wins++;
                            returned += (shares * 1.0);
                            totalWinAmt += ((shares * 1.0) - cost);
                        } else {
                            losses++;
                            totalLossAmt += cost;
                        }
                    }
                });

                netPnl = returned - deployed;
                const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) + '%' : '0%';
                const roc = deployed > 0 ? ((netPnl / deployed) * 100).toFixed(1) + '%' : '0%';
                const avgWin = wins > 0 ? '$' + (totalWinAmt / wins).toFixed(2) : '$0';
                const avgLoss = losses > 0 ? '$' + (totalLossAmt / losses).toFixed(2) : '$0';

                document.getElementById('stat-total').innerText = tCount;
                document.getElementById('stat-open').innerText = oCount;
                const pnlEl = document.getElementById('stat-net-pnl');
                pnlEl.innerText = (netPnl >= 0 ? '+$' : '-$') + Math.abs(netPnl).toFixed(2);
                pnlEl.style.color = netPnl >= 0 ? '#10b981' : '#ef4444';
                document.getElementById('stat-roc').innerText = roc;
                document.getElementById('stat-winrate').innerText = winRate;
                document.getElementById('stat-avgwin').innerText = avgWin;
                document.getElementById('stat-avgloss').innerText = avgLoss;

                // 2. Calculate Strategy-specific mini stats
                ['strategy-1', 'strategy-2', 'strategy-3'].forEach(strat => {
                    const stratRows = document.querySelectorAll('.trade-row.strat-' + strat + ':not(.hidden)');
                    let sDep = 0, sRet = 0, sWins = 0, sLosses = 0, sOpen = 0;
                    stratRows.forEach(r => {
                        const status = r.getAttribute('data-status');
                        if (status === 'OPEN') sOpen++;
                        const shares = parseFloat(r.getAttribute('data-shares')) || 0;
                        const bp = parseFloat(r.getAttribute('data-price')) || 0;
                        const c = shares * bp;
                        if (status === 'WON' || status === 'LOST') {
                            sDep += c;
                            if (status === 'WON') {
                                sWins++;
                                sRet += (shares * 1.0);
                            } else {
                                sLosses++;
                            }
                        }
                    });

                    const sNet = sRet - sDep;
                    const sWR = (sWins + sLosses) > 0 ? ((sWins / (sWins + sLosses)) * 100).toFixed(1) + '%' : '0%';
                    const sROC = sDep > 0 ? ((sNet / sDep) * 100).toFixed(1) + '%' : '0%';
                    
                    const el = document.getElementById('mini-strat-' + strat);
                    if (el) {
                        el.querySelector('.val-count').innerText = (sWins + sLosses);
                        el.querySelector('.val-open').innerText = sOpen;
                        el.querySelector('.val-wr').innerText = sWR;
                        el.querySelector('.val-roi').innerText = sROC;
                        const pEl = el.querySelector('.val-pnl');
                        pEl.innerText = (sNet >= 0 ? '+$' : '-$') + Math.abs(sNet).toFixed(2);
                        pEl.style.color = sNet >= 0 ? '#10b981' : '#ef4444';
                    }
                });
            }

            function filterData() {
                const selectedCity = cityDropdown.value;
                const daysLimit = timeDropdown.value;
                let cutoffDate = null;
                if (daysLimit !== 'all') {
                    cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysLimit));
                }

                const rows = document.querySelectorAll('.trade-row');

                rows.forEach(row => {
                    const rowCity = row.getAttribute('data-city');
                    const rowDateStr = row.getAttribute('data-date');
                    const rowDate = new Date(rowDateStr);

                    const matchCity = selectedCity === 'all' || rowCity === selectedCity;
                    const matchTime = !cutoffDate || rowDate >= cutoffDate;

                    if (matchCity && matchTime) {
                        row.classList.remove('hidden');
                    } else {
                        row.classList.add('hidden');
                    }
                });
                
                calculateStats();
                renderBreakdownMatrix();
            }

            function renderBreakdownMatrix() {
                // Group the NON-HIDDEN settled trades by Date -> Strategy -> City
                const rows = document.querySelectorAll('.trade-row.is-settled:not(.hidden)');
                const matrix = {};

                rows.forEach(r => {
                    const status = r.getAttribute('data-status');
                    if (status !== 'WON' && status !== 'LOST') return;
                    
                    const dStr = new Date(r.getAttribute('data-date')).toLocaleDateString();
                    const strategy = r.getAttribute('data-strategy');
                    const city = r.getAttribute('data-city');

                    const key = dStr + '|' + strategy + '|' + city;
                    if (!matrix[key]) {
                        matrix[key] = { dStr, strategy, city, wins: 0, losses: 0, deployed: 0, returned: 0 };
                    }
                    
                    const shares = parseFloat(r.getAttribute('data-shares')) || 0;
                    const cost = shares * (parseFloat(r.getAttribute('data-price')) || 0);

                    matrix[key].deployed += cost;
                    if (status === 'WON') {
                        matrix[key].wins++;
                        matrix[key].returned += (shares * 1.0);
                    } else {
                        matrix[key].losses++;
                    }
                });

                const tbody = document.getElementById('matrix-tbody');
                const fragment = document.createDocumentFragment();

                Object.values(matrix).sort((a,b) => new Date(b.dStr) - new Date(a.dStr)).forEach(m => {
                    const tr = document.createElement('tr');
                    tr.className = 'matrix-row';
                    
                    const stratName = m.strategy === 'strategy-1' ? 'OpenMeteo Counter' : (m.strategy === 'strategy-2' ? 'Cheapest NO' : 'NWS Bet');
                    const cityFmt = m.city.replace(/\\b\\w/g, l => l.toUpperCase());
                    const tCount = m.wins + m.losses;
                    const wr = tCount > 0 ? ((m.wins / tCount) * 100).toFixed(1) + '%' : '0%';
                    const net = m.returned - m.deployed;
                    
                    const pnlColor = net >= 0 ? '#10b981' : '#ef4444';
                    const pnlText = '<span style="color:' + pnlColor + '; font-weight:bold;">' + (net >= 0 ? '+$' : '-$') + Math.abs(net).toFixed(2) + '</span>';

                    tr.innerHTML = \`
                        <td>\${m.dStr}</td>
                        <td><span class="badge \${m.strategy}">\${stratName}</span></td>
                        <td><strong>\${cityFmt}</strong></td>
                        <td>\${tCount}</td>
                        <td>\${wr}</td>
                        <td>$\${m.deployed.toFixed(2)}</td>
                        <td>\${pnlText}</td>
                    \`;
                    fragment.appendChild(tr);
                });

                tbody.innerHTML = '';
                tbody.appendChild(fragment);
                
                if (Object.keys(matrix).length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding: 25px;">No settled trades found for current filters.</td></tr>';
                }
            }
            
            // Initialization run
            calculateStats();
            renderBreakdownMatrix();

            function sortTable(thElement, colIndex) {
                const table = thElement.closest('table');
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr.trade-row:not(.hidden), tr.matrix-row'));
                const isAsc = thElement.classList.toggle('asc');
                const direction = isAsc ? 1 : -1;
                
                const headers = table.querySelectorAll('th');
                headers.forEach(h => {
                    if(h !== thElement) {
                        h.classList.remove('asc', 'desc');
                        h.innerText = h.innerText.replace(/[🔼🔽↕]/g, '↕');
                    }
                });
                thElement.classList.toggle('desc', !isAsc);
                const textWithoutArrows = thElement.innerText.replace(/[🔼🔽↕]/g, '').trim();
                thElement.innerText = textWithoutArrows + ' ' + (isAsc ? '🔼' : '🔽');

                rows.sort((a, b) => {
                    const aText = a.cells[colIndex].innerText.replace(/[^0-9.-]+/g,"");
                    const bText = b.cells[colIndex].innerText.replace(/[^0-9.-]+/g,"");
                    const aNum = parseFloat(aText);
                    const bNum = parseFloat(bText);

                    if(!isNaN(aNum) && !isNaN(bNum)) {
                        return (aNum - bNum) * direction;
                    }
                    return a.cells[colIndex].innerText.localeCompare(b.cells[colIndex].innerText) * direction;
                });

                rows.forEach(row => tbody.appendChild(row));
            }

            function updateChart(walletId, days) {
                const history = rawHistory[walletId] || [];
                
                let filtered = history;
                if (days !== 'MAX') {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - parseInt(days));
                    filtered = history.filter(h => new Date(h.recordedAt) >= cutoff);
                }

                if (filtered.length === 0 && history.length > 0) {
                    filtered = [history[history.length - 1]];
                }

                const labels = filtered.map(h => {
                    const d = new Date(h.recordedAt);
                    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                });
                const data = filtered.map(h => h.balance);

                if (chartInstances[walletId]) {
                    chartInstances[walletId].data.labels = labels;
                    chartInstances[walletId].data.datasets[0].data = data;
                    chartInstances[walletId].update();
                } else {
                    const ctx = document.getElementById('chart-' + walletId).getContext('2d');
                    
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    const isStrat1 = walletId === 'strategy-1';
                    const mainColor = isStrat1 ? '#0ea5e9' : (walletId === 'strategy-2' ? '#ec4899' : '#10b981');
                    
                    gradient.addColorStop(0, mainColor + '60');
                    gradient.addColorStop(1, mainColor + '00');

                    chartInstances[walletId] = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Balance ($)',
                                data: data,
                                borderColor: mainColor,
                                backgroundColor: gradient,
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4,
                                pointRadius: 2,
                                pointHoverRadius: 6
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { display: false },
                                y: { 
                                    display: true,
                                    grid: { display: true, color: 'rgba(0,0,0,0.05)' },
                                    ticks: { color: '#64748b' }
                                }
                            }
                        }
                    });
                }
            }

            Object.keys(rawHistory).forEach(walletId => updateChart(walletId, 7));
        </script>
    </body>
    </html>
    `;

    res.send(html);
});

export function startServer(bot: BotManager) {
    app.post('/api/run-cycle', async (req, res) => {
        try {
            await bot.runCycle();
            res.status(200).json({ success: true, message: 'Trade cycle executed manually.' });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/resolve', async (req, res) => {
        try {
            await bot.resolveTrades();
            res.status(200).json({ success: true, message: 'Resolution cycle executed manually.' });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.listen(port, () => {
        console.log(`[Dashboard] Server running on port ${port}`);
    });
}
