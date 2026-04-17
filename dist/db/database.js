"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
exports.getWalletBalance = getWalletBalance;
exports.updateWalletBalance = updateWalletBalance;
exports.getWallets = getWallets;
exports.getWalletHistory = getWalletHistory;
exports.saveTrade = saveTrade;
exports.getOpenTrades = getOpenTrades;
exports.getAllTrades = getAllTrades;
exports.updateTradeStatus = updateTradeStatus;
exports.updateTradeCurrentPrice = updateTradeCurrentPrice;
exports.updateTradeLatestForecast = updateTradeLatestForecast;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let dbPath = path_1.default.resolve(__dirname, '../../bot.db');
if (fs_1.default.existsSync('/data')) {
    dbPath = '/data/bot.db';
}
const db = new better_sqlite3_1.default(dbPath, { verbose: console.log });
function initDatabase() {
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
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE trades ADD COLUMN forecastTemp TEXT DEFAULT ''");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE trades ADD COLUMN currentPrice REAL DEFAULT NULL");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE trades ADD COLUMN latestForecastTemp TEXT DEFAULT ''");
    }
    catch (e) { }
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
    ensureWallet.run('strategy-3', 'NWS Forecast Bet', 10000);
    // Seed history if empty
    const historyCount = db.prepare('SELECT COUNT(*) as c FROM wallet_history').get();
    if (historyCount && historyCount.c === 0) {
        const wallets = getWallets();
        const insertHistory = db.prepare('INSERT INTO wallet_history (walletId, balance) VALUES (?, ?)');
        for (const w of wallets) {
            insertHistory.run(w.id, w.balance);
        }
    }
}
function getWalletBalance(walletId) {
    const row = db.prepare('SELECT balance FROM wallets WHERE id = ?').get(walletId);
    return row ? row.balance : 0;
}
function updateWalletBalance(walletId, balance) {
    db.prepare('UPDATE wallets SET balance = ? WHERE id = ?').run(balance, walletId);
    db.prepare('INSERT INTO wallet_history (walletId, balance) VALUES (?, ?)').run(walletId, balance);
}
function getWallets() {
    return db.prepare('SELECT * FROM wallets').all();
}
function getWalletHistory() {
    return db.prepare('SELECT * FROM wallet_history ORDER BY recordedAt ASC').all();
}
function saveTrade(trade) {
    const stmt = db.prepare(`
        INSERT INTO trades (id, walletId, marketId, marketTitle, forecastTemp, latestForecastTemp, tokenId, type, price, amount, status)
        VALUES (@id, @walletId, @marketId, @marketTitle, @forecastTemp, @latestForecastTemp, @tokenId, @type, @price, @amount, @status)
    `);
    stmt.run({
        ...trade,
        forecastTemp: trade.forecastTemp || '',
        latestForecastTemp: trade.latestForecastTemp || ''
    });
}
function getOpenTrades() {
    return db.prepare("SELECT * FROM trades WHERE status = ?").all('OPEN');
}
function getAllTrades() {
    return db.prepare('SELECT * FROM trades ORDER BY createdAt DESC').all();
}
function updateTradeStatus(tradeId, status) {
    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run(status, tradeId);
}
function updateTradeCurrentPrice(tradeId, currentPrice) {
    db.prepare('UPDATE trades SET currentPrice = ? WHERE id = ?').run(currentPrice, tradeId);
}
function updateTradeLatestForecast(tradeId, temp) {
    db.prepare('UPDATE trades SET latestForecastTemp = ? WHERE id = ?').run(temp, tradeId);
}
exports.default = db;
