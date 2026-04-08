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

    let tradesHtml = '';
    for (const t of allTrades) {
        // Safe check for marketTitle backward compat
        const titleText = t.marketTitle && t.marketTitle !== 'Unknown Title' ? t.marketTitle : t.marketId;
        const statusColor = t.status === 'OPEN' ? '#ffb86c' : (t.status === 'WON' ? '#50fa7b' : '#ff5555');
        tradesHtml += `
            <tr>
                <td>${new Date(t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</td>
                <td><span class="badge" style="background: rgba(255,255,255,0.1); font-weight: normal;">${t.walletId}</span></td>
                <td><strong style="color: #fff; font-size:1.05rem;">${titleText}</strong></td>
                <td><span class="badge ${t.type.toLowerCase()}">${t.type}</span></td>
                <td>${t.amount}</td>
                <td>$${t.price.toFixed(3)}</td>
                <td><span style="color: ${statusColor}; font-weight: bold; text-shadow: 0 0 10px ${statusColor}40;">${t.status}</span></td>
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            :root {
                --bg: #09090b;
                --surface: rgba(24, 24, 27, 0.6);
                --border: rgba(255, 255, 255, 0.1);
                --primary: #3b82f6;
                --primary-glow: rgba(59, 130, 246, 0.5);
                --accent: #ec4899;
                --accent-glow: rgba(236, 72, 153, 0.5);
                --text: #f8fafc;
                --text-muted: #94a3b8;
            }
            body {
                margin: 0;
                font-family: 'Inter', sans-serif;
                background-color: var(--bg);
                color: var(--text);
                padding: 40px;
                background-image: 
                    radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                    radial-gradient(at 100% 0%, rgba(236, 72, 153, 0.15) 0px, transparent 50%);
                background-attachment: fixed;
            }
            .glass {
                background: var(--surface);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid var(--border);
            }
            header {
                text-align: center;
                margin-bottom: 50px;
                position: relative;
            }
            h1 {
                font-size: 3.5rem;
                background: linear-gradient(to right, #60a5fa, #f472b6);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin: 0 0 10px 0;
                letter-spacing: -1px;
            }
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: 30px;
                margin-bottom: 40px;
            }
            .card {
                padding: 30px;
                border-radius: 24px;
                box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .card:hover {
                transform: translateY(-5px);
            }
            .card h3 {
                margin-top: 0;
                color: #e2e8f0;
                font-size: 1.5rem;
            }
            .highlight {
                font-size: 2.2rem;
                font-weight: 800;
                color: #fff;
                text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
            }
            code {
                background: rgba(0,0,0,0.3);
                padding: 6px 10px;
                border-radius: 8px;
                color: var(--text-muted);
                font-size: 0.85rem;
                border: 1px solid var(--border);
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
                border: 1px solid var(--border);
                color: var(--text-muted);
                padding: 4px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s;
            }
            .chart-toggles button:hover, .chart-toggles button.active {
                background: var(--primary);
                color: white;
                border-color: var(--primary);
                box-shadow: 0 0 10px var(--primary-glow);
            }
            table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                background: var(--surface);
                border-radius: 16px;
                overflow: hidden;
                border: 1px solid var(--border);
                backdrop-filter: blur(16px);
            }
            th, td {
                padding: 20px;
                text-align: left;
                border-bottom: 1px solid var(--border);
            }
            th {
                background-color: rgba(0,0,0,0.2);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-size: 0.85rem;
                color: var(--text-muted);
            }
            tr:last-child td { border-bottom: none; }
            tr:hover td { background-color: rgba(255,255,255,0.02); }
            
            .badge {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: 800;
                display: inline-block;
            }
            .badge.yes { background: rgba(80, 250, 123, 0.1); color: #50fa7b; border: 1px solid #50fa7b; }
            .badge.no { background: rgba(255, 85, 85, 0.1); color: #ff5555; border: 1px solid #ff5555; }

            .stats {
                display: flex;
                gap: 30px;
                justify-content: center;
                margin-bottom: 50px;
            }
            .stat-box { 
                text-align: center; 
                padding: 24px 40px;
                border-radius: 20px;
            }
            .stat-box span { 
                font-size: 2.5rem; 
                font-weight: 800; 
                background: linear-gradient(to right, #fff, #94a3b8);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: block; 
            }
            
            .action-btn {
                padding: 14px 28px;
                border: none;
                border-radius: 12px;
                color: #fff;
                cursor: pointer;
                font-weight: 600;
                font-size: 1rem;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .btn-primary {
                background: linear-gradient(135deg, var(--primary), #2563eb);
                box-shadow: 0 0 20px var(--primary-glow);
            }
            .btn-accent {
                background: linear-gradient(135deg, var(--accent), #db2777);
                box-shadow: 0 0 20px var(--accent-glow);
            }
            .action-btn:hover {
                transform: scale(1.05);
                filter: brightness(1.1);
            }
        </style>
    </head>
    <body>
        <header>
            <h1>Weather Bot Dash</h1>
            <p style="color: var(--text-muted); font-size: 1.1rem;">Automated Paper Trading for Polymarket Daily Temperatures</p>
        </header>

        <div class="stats">
            <div class="stat-box glass">
                <span>${totalTrades}</span>
                Total Trades Executed
            </div>
            <div class="stat-box glass">
                <span>${openTradesCount}</span>
                Open Positions
            </div>
        </div>

        <div style="text-align: center; margin-bottom: 50px; display: flex; justify-content: center; gap: 20px;">
            <button class="action-btn btn-primary" onclick="trigger('/api/run-cycle')">⚡ Force Trade Cycle</button>
            <button class="action-btn btn-accent" onclick="trigger('/api/resolve')">🔄 Force Resolution</button>
        </div>

        <h2 style="color: #fff; margin-bottom: 20px; font-weight: 400;">Wallets & Analytics</h2>
        <div class="grid">
            ${walletsHtml}
        </div>

        <h2 style="color: #fff; margin-bottom: 20px; font-weight: 400; margin-top: 40px;">Trade Ledger</h2>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Wallet</th>
                    <th>Market Details</th>
                    <th>Type</th>
                    <th>Shares</th>
                    <th>Avg Price</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${tradesHtml}
            </tbody>
        </table>

        <script>
            function trigger(url) {
                fetch(url, {method: 'POST'})
                    .then(r => r.json())
                    .then(d => { alert(d.message); window.location.reload(); })
                    .catch(e => alert('Error: ' + e));
            }

            const rawHistory = ${JSON.stringify(historyByWalletId)};
            const chartInstances = {};

            function updateChart(walletId, days) {
                const history = rawHistory[walletId] || [];
                
                // Filter history based on days
                let filtered = history;
                if (days !== 'MAX') {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - parseInt(days));
                    filtered = history.filter(h => new Date(h.recordedAt) >= cutoff);
                }

                // If nothing in that window, fallback to at least last data point or empty
                if (filtered.length === 0 && history.length > 0) {
                    filtered = [history[history.length - 1]];
                }

                const labels = filtered.map(h => {
                    const d = new Date(h.recordedAt);
                    return d.toLocaleDateString('en-US', {timeZone: 'America/New_York'}) + ' ' + d.toLocaleTimeString('en-US', {timeZone: 'America/New_York', hour: '2-digit', minute:'2-digit'}) + ' ET';
                });
                const data = filtered.map(h => h.balance);

                if (chartInstances[walletId]) {
                    chartInstances[walletId].data.labels = labels;
                    chartInstances[walletId].data.datasets[0].data = data;
                    chartInstances[walletId].update();
                } else {
                    const ctx = document.getElementById('chart-' + walletId).getContext('2d');
                    
                    // Create gradient for line
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    const isStrategy1 = walletId === 'strategy-1';
                    const mainColor = isStrategy1 ? '#38bdf8' : '#f472b6';
                    const rgb = isStrategy1 ? '56,189,248' : '244,114,182';

                    gradient.addColorStop(0, \`rgba(\${rgb}, 0.5)\`);
                    gradient.addColorStop(1, \`rgba(\${rgb}, 0.0)\`);

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
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    mode: 'index',
                                    intersect: false,
                                    backgroundColor: 'rgba(24, 24, 27, 0.9)',
                                    titleColor: '#94a3b8',
                                    bodyColor: '#fff',
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    borderWidth: 1
                                }
                            },
                            scales: {
                                x: { display: false },
                                y: { 
                                    display: true,
                                    grid: { display: true, color: 'rgba(255,255,255,0.05)' },
                                    ticks: { color: '#94a3b8' }
                                }
                            },
                            interaction: {
                                mode: 'nearest',
                                axis: 'x',
                                intersect: false
                            }
                        }
                    });
                }
            }

            // Initialize all charts to 7D default
            Object.keys(rawHistory).forEach(walletId => {
                updateChart(walletId, 7);
            });
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
