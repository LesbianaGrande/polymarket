import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bot.db');
const db = new Database(dbPath, { verbose: console.log });

export function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS wallets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trades (
            id TEXT PRIMARY KEY,
            walletId TEXT NOT NULL,
            marketId TEXT NOT NULL,
            tokenId TEXT NOT NULL,
            type TEXT NOT NULL,
            price REAL NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(walletId) REFERENCES wallets(id)
        );
    `);

    try {
        db.exec("ALTER TABLE trades ADD COLUMN marketTitle TEXT DEFAULT 'Unknown Title'");
    } catch (e) {
        // Ignored if column already exists
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS wallet_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            walletId TEXT NOT NULL,
            balance REAL NOT NULL,
            recordedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(walletId) REFERENCES wallets(id)
        );
    `);

    // Ensure wallets exist
    const ensureWallet = db.prepare('INSERT OR IGNORE INTO wallets (id, name, balance) VALUES (?, ?, ?)');
    ensureWallet.run('strategy-1', 'OpenMeteo Counter-Bet', 10000);
    ensureWallet.run('strategy-2', 'Cheapest NO', 10000);

    // Seed history if empty
    const historyCount = db.prepare('SELECT COUNT(*) as c FROM wallet_history').get() as any;
    if (historyCount && historyCount.c === 0) {
        const wallets = getWallets() as any[];
        const insertHistory = db.prepare('INSERT INTO wallet_history (walletId, balance) VALUES (?, ?)');
        for (const w of wallets) {
            insertHistory.run(w.id, w.balance);
        }
    }
}

export function getWalletBalance(walletId: string): number {
    const row = db.prepare('SELECT balance FROM wallets WHERE id = ?').get(walletId) as any;
    return row ? row.balance : 0;
}

export function updateWalletBalance(walletId: string, balance: number) {
    db.prepare('UPDATE wallets SET balance = ? WHERE id = ?').run(balance, walletId);
    db.prepare('INSERT INTO wallet_history (walletId, balance) VALUES (?, ?)').run(walletId, balance);
}

export function getWallets() {
  return db.prepare('SELECT * FROM wallets').all();
}

export function getWalletHistory() {
    return db.prepare('SELECT * FROM wallet_history ORDER BY recordedAt ASC').all() as any[];
}

export function saveTrade(trade: { id: string, walletId: string, marketId: string, marketTitle: string, tokenId: string, type: 'NO' | 'YES', price: number, amount: number, status: 'OPEN' | 'WON' | 'LOST' | 'CLOSED' }) {
    const stmt = db.prepare(`
        INSERT INTO trades (id, walletId, marketId, marketTitle, tokenId, type, price, amount, status)
        VALUES (@id, @walletId, @marketId, @marketTitle, @tokenId, @type, @price, @amount, @status)
    `);
    stmt.run(trade);
}

export function getOpenTrades() {
    return db.prepare("SELECT * FROM trades WHERE status = 'OPEN'").all() as any[];
}

export function getAllTrades() {
  return db.prepare('SELECT * FROM trades ORDER BY createdAt DESC').all() as any[];
}

export function updateTradeStatus(tradeId: string, status: 'WON' | 'LOST' | 'CLOSED') {
    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run(status, tradeId);
}

export default db;
