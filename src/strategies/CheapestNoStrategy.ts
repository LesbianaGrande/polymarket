import { BaseStrategy } from './BaseStrategy';
import { MarketInfo, PolymarketService } from '../services/PolymarketService';
import { CITY_COORDINATES } from '../services/OpenMeteoService';

export class CheapestNoStrategy extends BaseStrategy {
    walletId = 'strategy-2';
    strategyName = 'Cheapest NO';

    private excludedCities = [
        'amsterdam', 'shanghai', 'helsinki', 'ankara', 
        'sao paulo', 'shenzhen', 'tel aviv', 'warsaw', 'beijing'
    ];

    async execute(markets: MarketInfo[]): Promise<void> {
        // Group markets by city so we can find the "cheapest NO" per city event group
        const cityMarkets: Record<string, MarketInfo[]> = {};

        for (const market of markets) {
            const titleLower = market.title.toLowerCase();
            let matchedCity: string | null = null;

            for (const city of Object.keys(CITY_COORDINATES)) {
                if (titleLower.includes(city)) {
                    matchedCity = city;
                    break;
                }
            }

            if (!matchedCity || this.excludedCities.includes(matchedCity)) {
                continue;
            }

            const timezone = CITY_COORDINATES[matchedCity].timezone;
            if (!this.isTomorrow(market.title, timezone) && !this.isNextDay(market.title, timezone) &&
                !this.isTomorrow(market.question, timezone) && !this.isNextDay(market.question, timezone)) {
                continue;
            }

            if (!cityMarkets[matchedCity]) {
                cityMarkets[matchedCity] = [];
            }
            cityMarkets[matchedCity].push(market);
        }

        // For each eligible city, evaluate all its markets to find the absolute cheapest "NO"
        for (const city of Object.keys(cityMarkets)) {
            const group = cityMarkets[city];
            let cheapestMarket: MarketInfo | null = null;
            let cheapestTokenId: string = '';
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
                    const orderbook = await PolymarketService.getOrderBook(tokenId);
                    
                    if (orderbook && orderbook.asks && orderbook.asks.length > 0) {
                        const bestAsk = parseFloat(orderbook.asks[0].price);
                        if (bestAsk < cheapestPrice) {
                            cheapestPrice = bestAsk;
                            cheapestMarket = market;
                            cheapestTokenId = tokenId;
                        }
                    }
                }
            }

            if (cheapestMarket && cheapestTokenId !== '') {
                // We found the cheapest NO for this city's group of markets.
                console.log(`[Cheapest NO] Found cheapest market for ${city}: ${cheapestMarket.title} at $${cheapestPrice}`);
                await this.executePaperTrade(cheapestMarket, cheapestTokenId, 'NO');
            }
        }
    }
}
