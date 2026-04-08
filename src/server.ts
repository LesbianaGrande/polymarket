import express from 'express';
import { getWallets, getAllTrades, getOpenTrades } from './db/database';
import { BotManager } from './bot/BotManager';

export const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
    const wallets = getWallets() as any[];
    const allTrades = getAllTrades() as any[];
    
    // Some stats
    const openTradesCount = getOpenTrades().length;
    const totalTrades = allTrades.length;

    let walletsHtml = '';
    for (const w of wallets) {
        walletsHtml += `
            <div class="card">
                <h3>💵 ${w.name}</h3>
                <p>Balance: <span class="highlight">$${w.balance.toFixed(2)}</span></p>
                <p>Wallet ID: <code>${w.id}</code></p>
            </div>
        `;
    }

    let tradesHtml = '';
    for (const t of allTrades) {
        const statusColor = t.status === 'OPEN' ? '#ffb86c' : (t.status === 'WON' ? '#50fa7b' : '#ff5555');
        tradesHtml += `
            <tr>
                <td>${new Date(t.createdAt).toLocaleString()}</td>
                <td>${t.walletId}</td>
                <td>${t.type}</td>
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
        <title>Polymarket Weather Bot Dashboard</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a;
                --surface: #1e293b;
                --primary: #38bdf8;
                --accent: #f472b6;
                --text: #f8fafc;
                --text-muted: #94a3b8;
            }
            body {
                margin: 0;
                font-family: 'Outfit', sans-serif;
                background-color: var(--bg);
                color: var(--text);
                padding: 40px;
            }
            header {
                text-align: center;
                margin-bottom: 50px;
            }
            h1 {
                font-size: 3rem;
                background: linear-gradient(to right, var(--primary), var(--accent));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin: 0 0 10px 0;
            }
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 40px;
            }
            .card {
                background: var(--surface);
                padding: 24px;
                border-radius: 16px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .card:hover {
                transform: translateY(-5px);
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
            }
            .card h3 {
                margin-top: 0;
                color: var(--primary);
                font-size: 1.5rem;
            }
            .highlight {
                font-size: 1.8rem;
                font-weight: 800;
                color: var(--accent);
            }
            code {
                background: #0f172a;
                padding: 4px 8px;
                border-radius: 6px;
                color: var(--text-muted);
                font-size: 0.85rem;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                background: var(--surface);
                border-radius: 12px;
                overflow: hidden;
            }
            th, td {
                padding: 16px;
                text-align: left;
                border-bottom: 1px solid #334155;
            }
            th {
                background-color: #334155;
                font-weight: 600;
                color: var(--text-muted);
            }
            tr:last-child td {
                border-bottom: none;
            }
            tr:hover {
                background-color: #27354a;
            }
            .stats {
                display: flex;
                gap: 20px;
                justify-content: center;
                margin-bottom: 40px;
                background: var(--surface);
                padding: 20px;
                border-radius: 12px;
            }
            .stat-box { text-align: center; }
            .stat-box span { font-size: 2rem; font-weight: 800; color: var(--primary); display: block; }
        </style>
    </head>
    <body>
        <header>
            <h1>Weather Bot Dash</h1>
            <p>Automated Paper Trading for Polymarket Daily Temperatures</p>
        </header>

        <div class="stats">
            <div class="stat-box">
                <span>${totalTrades}</span>
                Total Trades Executed
            </div>
            <div class="stat-box">
                <span>${openTradesCount}</span>
                Open Positions
            </div>
        </div>

        <div style="text-align: center; margin-bottom: 30px;">
            <button onclick="fetch('/api/run-cycle', {method: 'POST'}).then(r => r.json()).then(d => { alert(d.message); window.location.reload(); }).catch(e => alert('Error: ' + e))" style="padding: 12px 24px; background: var(--primary); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-weight: bold; margin-right: 15px; font-size: 1rem; transition: opacity 0.2s;">⚡ Force Trade Cycle</button>
            <button onclick="fetch('/api/resolve', {method: 'POST'}).then(r => r.json()).then(d => { alert(d.message); window.location.reload(); }).catch(e => alert('Error: ' + e))" style="padding: 12px 24px; background: var(--accent); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-weight: bold; font-size: 1rem; transition: opacity 0.2s;">🔄 Force Resolution Cycle</button>
        </div>

        <h2 style="color: var(--text-muted); border-bottom: 1px solid #334155; padding-bottom: 10px;">Wallets / Strategies</h2>
        <div class="grid">
            ${walletsHtml}
        </div>

        <h2 style="color: var(--text-muted); border-bottom: 1px solid #334155; padding-bottom: 10px;">Trade Ledger</h2>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Wallet</th>
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
