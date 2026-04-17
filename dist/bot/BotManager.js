"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotManager = void 0;
const PolymarketService_1 = require("../services/PolymarketService");
const OpenMeteoService_1 = require("../services/OpenMeteoService");
const OpenMeteoStrategy_1 = require("../strategies/OpenMeteoStrategy");
const CheapestNoStrategy_1 = require("../strategies/CheapestNoStrategy");
const NwsStrategy_1 = require("../strategies/NwsStrategy");
const database_1 = require("../db/database");
class BotManager {
    strategies = [
        new OpenMeteoStrategy_1.OpenMeteoStrategy(),
        new CheapestNoStrategy_1.CheapestNoStrategy(),
        new NwsStrategy_1.NwsStrategy()
    ];
    async runCycle() {
        console.log(`[BotManager] Starting trade cycle at ${new Date().toISOString()}`);
        // 1. Fetch active temperature markets
        const markets = await PolymarketService_1.PolymarketService.getActiveTemperatureMarkets();
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
        const allTrades = (0, database_1.getAllTrades)();
        const openTrades = allTrades.filter(t => t.status === 'OPEN' || t.status === 'CLOSED');
        console.log(`[BotManager] Checking resolution ${openTrades.length} pending trades.`);
        for (const trade of openTrades) {
            try {
                const match = trade.marketTitle.match(/highest temperature in (.+?) on ([a-zA-Z]+ \d+)/i);
                if (match) {
                    const cityName = match[1];
                    const dateStr = match[2] + ', ' + new Date().getFullYear();
                    const targetDate = new Date(dateStr);
                    if (!isNaN(targetDate.getTime())) {
                        const formatted = targetDate.toISOString().split('T')[0];
                        const forecast = await OpenMeteoService_1.OpenMeteoService.getForecastForDate(cityName, formatted);
                        if (forecast !== null) {
                            (0, database_1.updateTradeLatestForecast)(trade.id, `${forecast}°F`);
                        }
                    }
                }
            }
            catch (e) {
                console.log(`[BotManager] Failed to update latest forecast for trade ${trade.id}`);
            }
            const result = await PolymarketService_1.PolymarketService.checkMarketResolution(trade.marketId);
            if (result.resolved) {
                let winStatus = 'CLOSED';
                if (result.winningToken) {
                    if (trade.tokenId === result.winningToken) {
                        winStatus = 'WON';
                    }
                    else {
                        winStatus = 'LOST';
                    }
                }
                else if (result.winningOutcome) {
                    if (trade.type.toLowerCase() === result.winningOutcome.toLowerCase()) {
                        winStatus = 'WON';
                    }
                    else {
                        winStatus = 'LOST';
                    }
                }
                if (winStatus === 'WON') {
                    // Add payout ($1 per share won)
                    const payout = trade.amount * 1.0;
                    const currentBal = (0, database_1.getWalletBalance)(trade.walletId);
                    (0, database_1.updateWalletBalance)(trade.walletId, currentBal + payout);
                }
                (0, database_1.updateTradeStatus)(trade.id, winStatus);
                console.log(`[BotManager] Trade ${trade.id} market resolved. Marked as ${winStatus}.`);
            }
            else if (trade.tokenId) {
                // Not resolved, so let's update the current price for display on dashboard
                try {
                    const orderbook = await PolymarketService_1.PolymarketService.getOrderBook(trade.tokenId);
                    if (orderbook) {
                        // The bot buys at Ask (we own shares). Current value of shares to liquidate is best Bid.
                        if (orderbook.bids && orderbook.bids.length > 0) {
                            const bestBid = Math.max(...orderbook.bids.map((b) => parseFloat(b.price)));
                            (0, database_1.updateTradeCurrentPrice)(trade.id, bestBid);
                        }
                        else if (orderbook.asks && orderbook.asks.length > 0) {
                            const bestAsk = Math.min(...orderbook.asks.map((a) => parseFloat(a.price)));
                            (0, database_1.updateTradeCurrentPrice)(trade.id, bestAsk); // Fallback to ask if no bids
                        }
                    }
                }
                catch (e) {
                    console.log(`[BotManager] Failed to update current price for ${trade.tokenId}`);
                }
            }
        }
        console.log(`[BotManager] Resolution cycle complete.`);
    }
}
exports.BotManager = BotManager;
