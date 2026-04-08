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
                <h3>💵 ${w.name}</h3>
                <p>Balance: <span class="highlight">$${w.balance.toFixed(2)}</span></p>
                <p>Wallet ID: <code>${w.id}</code></p>
                <div class="chart-container" style="position: relative; height:200px; width:100%; margin-top:20px;">
                    <canvas id="chart-${w.id}"></canvas>
                </div>
                <div class="chart-toggles">
                    <button onclick="updateChart('${w.id}', 1)">1D</button>
                    <button onclick="updateChart('${w.id}', 3)">3D</button>
                    <button onclick="updateChart('${w.id}', 7)">7D</button>
                    <button onclick="updateChart('${w.id}', 14)">14D</button>
                    <button onclick="updateChart('${w.id}', 30)">30D</button>
                    <button onclick="updateChart('${w.id}', 90)">90D</button>
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
        const statusColor = t.status === 'OPEN' ? '#f59e0b' : (t.status === 'WON' ? '#10b981' : '#ef4444');
        const forecastTd = showForecast ? `<td><span style="color:#ec4899; font-weight:bold;">${t.forecastTemp || 'N/A'}</span></td>` : '';
        const cityKey = getCity(titleText);
        return `
            <tr data-city="${cityKey}" class="trade-row">
                <td>${new Date(t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</td>
                <td><strong style="color: #475569; font-size:1.05rem;">${titleText}</strong></td>
                ${forecastTd}
                <td><span class="badge ${t.type.toLowerCase()}">${t.type}</span></td>
                <td>${t.amount}</td>
                <td>$${t.price.toFixed(3)}</td>
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
                flex-direction: column;
                align-items: center;
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
                margin-bottom: 20px;
                font-weight: 800;
                font-size: 1.5rem;
                margin-top: 40px;
                background: var(--surface);
                display: inline-block;
                padding: 10px 20px;
                border-radius: 20px;
                border: 2px solid var(--border);
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
                padding: 20px;
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
        </style>
    </head>
    <body>
        <header>
            <h1>🌺 Weather Bot Dash 🌺</h1>
            <p style="color: var(--text-muted); font-size: 1.1rem; font-weight: 600;">Paper Trading in a pastel paradise! ✨</p>
        </header>

        <div class="controls">
            <select id="cityToggle" onchange="filterCity()">
                <option value="all">🌍 All Cities (Global View)</option>
                ${cities.sort().map(c => `<option value="${c}">${c.replace(/\\b\\w/g, l => l.toUpperCase())}</option>`).join('')}
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
        </div>

        <div class="grid">
            ${wallets.map(w => `
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
            `).join('')}
        </div>

        <div class="section-title">☁️ OpenMeteo Counter-Bet</div>
        <table>
            <thead><tr><th>Date</th><th>Market Details</th><th>Forecast</th><th>Type</th><th>Shares</th><th>Avg Price</th><th>Status</th></tr></thead>
            <tbody id="table-strategy-1">${trades1.map(t => renderRow(t, true)).join('')}</tbody>
        </table>

        <div class="section-title">📉 Cheapest NO</div>
        <table>
            <thead><tr><th>Date</th><th>Market Details</th><th>Type</th><th>Shares</th><th>Avg Price</th><th>Status</th></tr></thead>
            <tbody id="table-strategy-2">${trades2.map(t => renderRow(t, false)).join('')}</tbody>
        </table>

        <div class="section-title">🇺🇸 NWS Forecast Bet (YES)</div>
        <table>
            <thead><tr><th>Date</th><th>Market Details</th><th>Forecast</th><th>Type</th><th>Shares</th><th>Avg Price</th><th>Status</th></tr></thead>
            <tbody id="table-strategy-3">${trades3.map(t => renderRow(t, true)).join('')}</tbody>
        </table>

        <script>
            function trigger(url) {
                fetch(url, {method: 'POST'})
                    .then(r => r.json())
                    .then(d => { alert(d.message); window.location.reload(); })
                    .catch(e => alert('Error: ' + e));
            }

            // Data passed for analytics toggling
            const rawTrades = ${JSON.stringify(allTrades)};
            const rawHistory = ${JSON.stringify(historyByWalletId)};
            const chartInstances = {};
            const cityDropdown = document.getElementById('cityToggle');

            function filterCity() {
                const selectedCity = cityDropdown.value;
                const rows = document.querySelectorAll('.trade-row');
                let visibleCount = 0;
                let visibleOpen = 0;

                rows.forEach(row => {
                    const rowCity = row.getAttribute('data-city');
                    if (selectedCity === 'all' || rowCity === selectedCity) {
                        row.classList.remove('hidden');
                        visibleCount++;
                        if (row.innerHTML.includes('OPEN')) visibleOpen++;
                    } else {
                        row.classList.add('hidden');
                    }
                });

                document.getElementById('stat-total').innerText = visibleCount;
                document.getElementById('stat-open').innerText = visibleOpen;
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
