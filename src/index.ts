import cron from 'node-cron';
import { initDatabase } from './db/database';
import { BotManager } from './bot/BotManager';
import { startServer } from './server';

async function bootstrap() {
    console.log('[App] Initializing database...');
    initDatabase();
    
    console.log('[App] Starting dashboard server...');
    startServer();

    const bot = new BotManager();

    // Cron syntax for 3x a day (e.g., 00:00, 08:00, 16:00 UTC)
    // For Railway, we can just use "0 0,8,16 * * *"
    
    // Trade Execution Cron
    cron.schedule('0 0,8,16 * * *', async () => {
        console.log('[Cron] Triggering Trade Cycle...');
        await bot.runCycle();
    });

    // Resolution Check Cron (Offset by 30 mins)
    cron.schedule('30 0,8,16 * * *', async () => {
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
