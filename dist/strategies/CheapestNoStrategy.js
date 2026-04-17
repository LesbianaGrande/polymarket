"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheapestNoStrategy = void 0;
const BaseStrategy_1 = require("./BaseStrategy");
const PolymarketService_1 = require("../services/PolymarketService");
const OpenMeteoService_1 = require("../services/OpenMeteoService");
class CheapestNoStrategy extends BaseStrategy_1.BaseStrategy {
    walletId = 'strategy-2';
    strategyName = 'Cheapest NO';
    excludedCities = [
        'amsterdam', 'ankara', 'helsinki', 'mexico city',
        'milan', 'munich', 'panama city', 'sao paulo', 'warsaw'
    ];
    async execute(markets) {
        // Group markets by Event (City/Date combo - mapped by market.id which is event ID) so we can find the "cheapest NO" per specific event
        const eventMarkets = {};
        for (const market of markets) {
            const titleLower = market.title.toLowerCase();
            let matchedCity = null;
            for (const city of Object.keys(OpenMeteoService_1.CITY_COORDINATES)) {
                if (titleLower.includes(city)) {
                    matchedCity = city;
                    break;
                }
            }
            if (!matchedCity || this.excludedCities.includes(matchedCity)) {
                continue;
            }
            const timezone = OpenMeteoService_1.CITY_COORDINATES[matchedCity].timezone;
            if (!this.isTomorrow(market.title, timezone) && !this.isNextDay(market.title, timezone) &&
                !this.isTomorrow(market.question, timezone) && !this.isNextDay(market.question, timezone)) {
                continue;
            }
            if (!eventMarkets[market.id]) {
                eventMarkets[market.id] = [];
            }
            eventMarkets[market.id].push(market);
        }
        // For each eligible event (City + Date), evaluate all its band options to find the absolute cheapest "NO"
        for (const eventId of Object.keys(eventMarkets)) {
            const group = eventMarkets[eventId];
            let cheapestMarket = null;
            let cheapestTokenId = '';
            let cheapestPrice = Infinity;
            for (const market of group) {
                let noIndex = -1;
                for (let i = 0; i < market.outcomes.length; i++) {
                    if (market.outcomes[i].toLowerCase() === 'no') {
                        noIndex = i;
                        break;
                    }
                }
                if (noIndex !== -1 && market.clobTokenIds.length > noIndex) {
                    const tokenId = market.clobTokenIds[noIndex];
                    const orderbook = await PolymarketService_1.PolymarketService.getOrderBook(tokenId);
                    if (orderbook && orderbook.asks && orderbook.asks.length > 0) {
                        // Polymarket orderbook asks might not be guaranteed sorted lowest-to-highest
                        const bestAsk = Math.min(...orderbook.asks.map((a) => parseFloat(a.price)));
                        if (bestAsk < cheapestPrice) {
                            cheapestPrice = bestAsk;
                            cheapestMarket = market;
                            cheapestTokenId = tokenId;
                        }
                    }
                }
            }
            if (cheapestMarket && cheapestTokenId !== '') {
                // Determine the city name for logging purposes
                let cityLog = "unknown";
                for (const c of Object.keys(OpenMeteoService_1.CITY_COORDINATES)) {
                    if (cheapestMarket.title.toLowerCase().includes(c))
                        cityLog = c;
                }
                console.log(`[Cheapest NO] Found cheapest market for ${cityLog} event: ${cheapestMarket.title} at $${cheapestPrice}`);
                await this.executePaperTrade(cheapestMarket, cheapestTokenId, 'NO', 100, undefined, markets);
            }
        }
    }
}
exports.CheapestNoStrategy = CheapestNoStrategy;
