import { PolymarketService } from '../services/PolymarketService';
import { OpenMeteoStrategy } from '../strategies/OpenMeteoStrategy';
import { CheapestNoStrategy } from '../strategies/CheapestNoStrategy';
import { getOpenTrades, updateTradeStatus } from '../db/database';

export class BotManager {
    private strategies = [
        new OpenMeteoStrategy(),
        new CheapestNoStrategy()
    ];

    async runCycle() {
        console.log(`[BotManager] Starting trade cycle at ${new Date().toISOString()}`);
        
        // 1. Fetch active temperature markets
        const markets = await PolymarketService.getActiveTemperatureMarkets();
        console.log(`[BotManager] Fetched ${markets.length} active high temperature markets.`);

        // 2. Execute each strategy
        for (const strategy of this.strategies) {
            console.log(`[BotManager] Running strategy: ${strategy.strategyName}...`);
            await strategy.execute(markets);
        }

        console.log(`[BotManager] Trade cycle complete.`);
    }

    async resolveTrades() {
        console.log(`[BotManager] Starting resolution cycle at ${new Date().toISOString()}`);
        const openTrades = getOpenTrades();
        console.log(`[BotManager] Checking resolution for ${openTrades.length} open trades.`);

        for (const trade of openTrades) {
            const result = await PolymarketService.checkMarketResolution(trade.marketId);
            if (result.resolved) {
                // Determine if we won. In Gamma API, usually closed/resolved markets 
                // have a winning outcome that we could identify, but it's tricky.
                // For simplicity here, we assume if conditionId is present and matches logic, we'll check token ID.
                // Or if we don't have enough data, we mark it 'CLOSED' and it waits manual payout logic.
                // To do this perfectly requires subgraph or more data, 
                // but we will mock a static 50% win rate or just mark CLOSED for the UI.
                
                // For the task, we mark it CLOSED so it moves out of OPEN state.
                updateTradeStatus(trade.id, 'CLOSED');
                console.log(`[BotManager] Trade ${trade.id} market resolved. Marked as CLOSED.`);
            }
        }
        console.log(`[BotManager] Resolution cycle complete.`);
    }
}
