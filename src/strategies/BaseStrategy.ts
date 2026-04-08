import { MarketInfo, PolymarketService } from '../services/PolymarketService';
import { v4 as uuidv4 } from 'uuid';
import { saveTrade, updateWalletBalance, getWalletBalance, getOpenTrades } from '../db/database';

export abstract class BaseStrategy {
    abstract walletId: string;
    abstract strategyName: string;

    // The main execution loop for the strategy
    abstract execute(markets: MarketInfo[]): Promise<void>;

    // Up to 2 options per market per day. 100 shares each trade
    protected async executePaperTrade(market: MarketInfo, tokenId: string, type: 'YES' | 'NO', amount: number = 100) {
        // limit logic (only 2 options per market per day)
        const openTrades = getOpenTrades();
        
        // Filter trades for this specific market and wallet today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const marketTradesToday = openTrades.filter(t => 
            t.walletId === this.walletId && 
            t.marketId === market.marketId && 
            new Date(t.createdAt) >= startOfDay
        );

        if (marketTradesToday.length >= 2) {
            console.log(`[${this.strategyName}] Skipping trade for ${market.title} - already executed 2 trades today.`);
            return; // Hit the max 2 trades per day for this market.
        }

        const balance = getWalletBalance(this.walletId);
        
        // Fetch orderbook for this token
        // Ask means they are selling the token (so we buy from the ask)
        const orderbook = await PolymarketService.getOrderBook(tokenId);
        if (!orderbook || !orderbook.asks || orderbook.asks.length === 0) {
            console.log(`[${this.strategyName}] No asks in orderbook for market ${market.title} (${type})`);
            return;
        }

        // Simulate filling 100 shares
        let sharesToBuy = amount;
        let totalCost = 0;
        let averagePrice = 0;

        // Traverse the order book asks
        for (const ask of orderbook.asks) {
            const price = parseFloat(ask.price);
            const size = parseFloat(ask.size);

            if (sharesToBuy <= size) {
                totalCost += sharesToBuy * price;
                sharesToBuy = 0;
                break;
            } else {
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
        const tradeId = uuidv4();
        updateWalletBalance(this.walletId, balance - totalCost);
        saveTrade({
            id: tradeId,
            walletId: this.walletId,
            marketId: market.marketId,
            marketTitle: market.question,
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
    protected isTomorrowOrNextDay(questionOrTitle: string, userTimezone: string = 'UTC') {
        const questionLower = questionOrTitle.toLowerCase();
        
        // Let's create local dates for comparison.
        // For simplicity, we look for explicit dates.
        if (questionLower.includes('tomorrow')) return true;

        const tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: userTimezone}));
        const tzDay = tzDate.getDate();
        const tomorrow = new Date(tzDate); tomorrow.setDate(tzDay + 1);
        const nextDay = new Date(tzDate); nextDay.setDate(tzDay + 2);

        // Simple formatting check, e.g. "April 8", Poly uses full month names!
        const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const tomorrowStr = `${fullMonths[tomorrow.getMonth()]} ${tomorrow.getDate()}`;
        const nextDayStr = `${fullMonths[nextDay.getMonth()]} ${nextDay.getDate()}`;

        if (questionLower.includes(tomorrowStr) || questionLower.includes(nextDayStr)) {
            return true;
        }

        return false; // If not explicitly today/tomorrow matched
    }

    protected isTomorrow(questionOrTitle: string, userTimezone: string = 'UTC'): boolean {
        const questionLower = questionOrTitle.toLowerCase();
        if (questionLower.includes('tomorrow')) return true;
        const tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: userTimezone}));
        const tomorrow = new Date(tzDate); tomorrow.setDate(tzDate.getDate() + 1);
        const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const tomorrowStr = `${fullMonths[tomorrow.getMonth()]} ${tomorrow.getDate()}`;
        return questionLower.includes(tomorrowStr);
    }

    protected isNextDay(questionOrTitle: string, userTimezone: string = 'UTC'): boolean {
        const questionLower = questionOrTitle.toLowerCase();
        const tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: userTimezone}));
        const nextDay = new Date(tzDate); nextDay.setDate(tzDate.getDate() + 2);
        const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const nextDayStr = `${fullMonths[nextDay.getMonth()]} ${nextDay.getDate()}`;
        return questionLower.includes(nextDayStr) || questionLower.includes('next day');
    }
}
