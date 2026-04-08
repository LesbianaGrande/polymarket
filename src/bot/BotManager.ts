import { PolymarketService } from '../services/PolymarketService';
import { OpenMeteoStrategy } from '../strategies/OpenMeteoStrategy';
import { CheapestNoStrategy } from '../strategies/CheapestNoStrategy';
import { NwsStrategy } from '../strategies/NwsStrategy';
import { getOpenTrades, updateTradeStatus, updateTradeCurrentPrice } from '../db/database';

export class BotManager {
    private strategies = [
        new OpenMeteoStrategy(),
        new CheapestNoStrategy(),
        new NwsStrategy()
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
        console.log(`[BotManager] Checking resolution ${openTrades.length} open trades.`);

        for (const trade of openTrades) {
            const result = await PolymarketService.checkMarketResolution(trade.marketId);
            if (result.resolved) {
                updateTradeStatus(trade.id, 'CLOSED');
                console.log(`[BotManager] Trade ${trade.id} market resolved. Marked as CLOSED.`);
            } else if (trade.tokenId) {
                // Not resolved, so let's update the current price for display on dashboard
                try {
                    const orderbook = await PolymarketService.getOrderBook(trade.tokenId);
                    if (orderbook) {
                        // The bot buys at Ask (we own shares). Current value of shares to liquidate is best Bid.
                        if (orderbook.bids && orderbook.bids.length > 0) {
                            const bestBid = Math.max(...orderbook.bids.map((b: any) => parseFloat(b.price)));
                            updateTradeCurrentPrice(trade.id, bestBid);
                        } else if (orderbook.asks && orderbook.asks.length > 0) {
                            const bestAsk = Math.min(...orderbook.asks.map((a: any) => parseFloat(a.price)));
                            updateTradeCurrentPrice(trade.id, bestAsk); // Fallback to ask if no bids
                        }
                    }
                } catch (e) {
                    console.log(`[BotManager] Failed to update current price for ${trade.tokenId}`);
                }
            }
        }
        console.log(`[BotManager] Resolution cycle complete.`);
    }
}
