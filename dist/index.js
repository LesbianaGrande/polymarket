"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("./db/database");
const BotManager_1 = require("./bot/BotManager");
const server_1 = require("./server");
async function bootstrap() {
    console.log('[App] Initializing database...');
    (0, database_1.initDatabase)();
    const bot = new BotManager_1.BotManager();
    console.log('[App] Starting dashboard server...');
    (0, server_1.startServer)(bot);
    // Cron syntax for 3x a day (e.g., 00:00, 08:00, 16:00 UTC)
    // For Railway, we can just use "0 0,8,16 * * *"
    // Trade Execution Cron
    node_cron_1.default.schedule('0 0,8,16 * * *', async () => {
        console.log('[Cron] Triggering Trade Cycle...');
        await bot.runCycle();
    });
    // Resolution Check Cron (Offset by 30 mins)
    node_cron_1.default.schedule('30 0,8,16 * * *', async () => {
        console.log('[Cron] Triggering Resolution Cycle...');
        await bot.resolveTrades();
    });
    console.log('[App] Cron jobs scheduled: 00:00, 08:00, 16:00 UTC.');
    // Fire an immediate cycle for testing/startup so it isn't empty on deploy
    console.log('[App] Running initial bootstrap cycles...');
    await bot.resolveTrades();
    await bot.runCycle();
}
bootstrap().catch(err => {
    console.error('Fatal initialization error:', err);
});
