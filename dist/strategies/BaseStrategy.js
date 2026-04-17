"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseStrategy = void 0;
const PolymarketService_1 = require("../services/PolymarketService");
const uuid_1 = require("uuid");
const database_1 = require("../db/database");
class BaseStrategy {
    // Up to 2 options per market per day. 100 shares each trade
    async executePaperTrade(market, tokenId, type, amount = 100, forecastTemp, allMarkets) {
        // limit logic (only 2 options per market EVENT per day)
        const openTrades = (0, database_1.getOpenTrades)();
        // Filter trades for this specific event and wallet today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        // Find all Polymarket band IDs that belong to the same parent Event
        const eventMarketIds = allMarkets ? allMarkets.filter(m => m.id === market.id).map(m => m.marketId) : [market.marketId];
        const marketTradesToday = openTrades.filter(t => t.walletId === this.walletId &&
            eventMarketIds.includes(t.marketId) &&
            new Date(t.createdAt) >= startOfDay);
        if (marketTradesToday.length >= 2) {
            console.log(`[${this.strategyName}] Skipping trade for ${market.title} - already executed 2 trades today.`);
            return; // Hit the max 2 trades per day for this market.
        }
        const balance = (0, database_1.getWalletBalance)(this.walletId);
        // Fetch orderbook for this token
        // Ask means they are selling the token (so we buy from the ask)
        const orderbook = await PolymarketService_1.PolymarketService.getOrderBook(tokenId);
        if (!orderbook || !orderbook.asks || orderbook.asks.length === 0) {
            console.log(`[${this.strategyName}] No asks in orderbook for market ${market.title} (${type})`);
            return;
        }
        // Simulate filling 100 shares
        let sharesToBuy = amount;
        let totalCost = 0;
        let averagePrice = 0;
        // Traverse the order book asks (sorted cheapest to most expensive)
        const sortedAsks = [...orderbook.asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        for (const ask of sortedAsks) {
            const price = parseFloat(ask.price);
            const size = parseFloat(ask.size);
            if (sharesToBuy <= size) {
                totalCost += sharesToBuy * price;
                sharesToBuy = 0;
                break;
            }
            else {
                totalCost += size * price;
                sharesToBuy -= size;
            }
        }
        // If we couldn't buy all 100 shares, we just skip because liquidity is probably too thin.
        if (sharesToBuy > 0) {
            console.log(`[${this.strategyName}] Not enough liquidity to buy ${amount} shares for ${market.title}`);
            return;
        }
        // Add slippage/execution logic: totalCost is how much USDC we spend
        if (balance < totalCost) {
            console.log(`[${this.strategyName}] Insufficient balance (${balance}) to buy ${totalCost.toFixed(2)} worth of ${market.title}`);
            return;
        }
        averagePrice = totalCost / amount;
        // Ensure we don't buy if the option is too expensive (> $0.92) per user request
        if (averagePrice > 0.92) {
            console.log(`[${this.strategyName}] Price too high ($${averagePrice.toFixed(3)}) for ${market.title}. Skipping.`);
            return;
        }
        // Execute DB changes
        const tradeId = (0, uuid_1.v4)();
        (0, database_1.updateWalletBalance)(this.walletId, balance - totalCost);
        (0, database_1.saveTrade)({
            id: tradeId,
            walletId: this.walletId,
            marketId: market.marketId,
            marketTitle: market.question,
            forecastTemp: forecastTemp,
            tokenId: tokenId,
            type: type,
            price: averagePrice,
            amount: amount,
            status: 'OPEN'
        });
        console.log(`[${this.strategyName}] EXECUTED TRADE: Bought ${amount} ${type} shares of "${market.title}" at avg price $${averagePrice.toFixed(3)}. Total cost: $${totalCost.toFixed(2)}`);
    }
    /**
     * Helper to classify a string as tomorrow, next day etc.
     * Often markets have "today", "tomorrow" or a specific date in the question.
     * We'll do simple string matching.
     */
    isTomorrowOrNextDay(questionOrTitle, userTimezone = 'UTC') {
        const questionLower = questionOrTitle.toLowerCase();
        // Let's create local dates for comparison.
        // For simplicity, we look for explicit dates.
        if (questionLower.includes('tomorrow'))
            return true;
        const tzDate = new Date(new Date().toLocaleString("en-US", { timeZone: userTimezone }));
        const tzDay = tzDate.getDate();
        const tomorrow = new Date(tzDate);
        tomorrow.setDate(tzDay + 1);
        const nextDay = new Date(tzDate);
        nextDay.setDate(tzDay + 2);
        // Simple formatting check, e.g. "April 8", Poly uses full month names!
        const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const tomorrowStr = `${fullMonths[tomorrow.getMonth()]} ${tomorrow.getDate()}`;
        const nextDayStr = `${fullMonths[nextDay.getMonth()]} ${nextDay.getDate()}`;
        if (questionLower.includes(tomorrowStr) || questionLower.includes(nextDayStr)) {
            return true;
        }
        return false; // If not explicitly today/tomorrow matched
    }
    isTomorrow(questionOrTitle, userTimezone = 'UTC') {
        const questionLower = questionOrTitle.toLowerCase();
        if (questionLower.includes('tomorrow'))
            return true;
        const tzDate = new Date(new Date().toLocaleString("en-US", { timeZone: userTimezone }));
        const tomorrow = new Date(tzDate);
        tomorrow.setDate(tzDate.getDate() + 1);
        const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const tomorrowStr = `${fullMonths[tomorrow.getMonth()]} ${tomorrow.getDate()}`;
        return questionLower.includes(tomorrowStr);
    }
    isNextDay(questionOrTitle, userTimezone = 'UTC') {
        const questionLower = questionOrTitle.toLowerCase();
        const tzDate = new Date(new Date().toLocaleString("en-US", { timeZone: userTimezone }));
        const nextDay = new Date(tzDate);
        nextDay.setDate(tzDate.getDate() + 2);
        const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const nextDayStr = `${fullMonths[nextDay.getMonth()]} ${nextDay.getDate()}`;
        return questionLower.includes(nextDayStr) || questionLower.includes('next day');
    }
}
exports.BaseStrategy = BaseStrategy;
