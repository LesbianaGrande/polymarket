import { BaseStrategy } from './BaseStrategy';
import { MarketInfo } from '../services/PolymarketService';
import { NwsService, US_CITY_COORDINATES } from '../services/NwsService';

export class NwsStrategy extends BaseStrategy {
    walletId = 'strategy-3';
    strategyName = 'NWS Forecast Bet';

    async execute(markets: MarketInfo[]): Promise<void> {
        const forecastCache: Record<string, { today: number, tomorrow: number } | null> = {};

        for (const market of markets) {
            // Find which US city this market relates to
            const titleLower = market.title.toLowerCase();
            let matchedCity: string | null = null;
            
            for (const city of Object.keys(US_CITY_COORDINATES)) {
                if (titleLower.includes(city)) {
                    matchedCity = city;
                    break;
                }
            }

            if (!matchedCity) {
                continue; // Skip if no US city matched
            }

            const timezone = US_CITY_COORDINATES[matchedCity].timezone;
            
            let isToday = false;
            let isTomorrow = false;
            
            // Check if market falls under today or tomorrow based on local date string matching
            // The user requested NO trades beyond tomorrow.
            const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
            const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
            
            const todayStr = formatter.format(now).toLowerCase(); // e.g. "april 8"
            const tmrw = new Date(now);
            tmrw.setDate(tmrw.getDate() + 1);
            const tmrwStr = formatter.format(tmrw).toLowerCase(); // e.g. "april 9"

            if (titleLower.includes(todayStr) || market.question.toLowerCase().includes(todayStr) || market.question.toLowerCase().includes('today')) {
                isToday = true;
            } else if (titleLower.includes(tmrwStr) || market.question.toLowerCase().includes(tmrwStr) || market.question.toLowerCase().includes('tomorrow')) {
                isTomorrow = true;
            } else {
                continue; // Not today or tomorrow
            }

            // Extract US explicit band syntax e.g. "80-81°F", "72-73 F"
            const tempMatch = market.question.match(/(\d+)-(\d+)\s*°?F/i);
            if (!tempMatch) continue;

            const lowerBound = parseInt(tempMatch[1], 10);
            const upperBound = parseInt(tempMatch[2], 10);

            // Fetch forecast
            if (forecastCache[matchedCity] === undefined) {
                await new Promise(r => setTimeout(r, 200)); // Rate limit buffer
                forecastCache[matchedCity] = await NwsService.getForecastedHighs(matchedCity);
            }
            
            const forecast = forecastCache[matchedCity];
            if (!forecast) continue;

            const relevantForecast = isToday ? forecast.today : forecast.tomorrow;
            
            if (relevantForecast === -999) {
                // Period dropped or unavailable
                continue; 
            }

            // Does the NWS exact high temperature fall strictly within the inclusive Polymarket bounds?
            if (relevantForecast >= lowerBound && relevantForecast <= upperBound) {
                // It's a match! Buy YES.
                
                let yesIndex = -1;
                for (let i = 0; i < market.outcomes.length; i++) {
                    if (market.outcomes[i].toLowerCase() === 'yes') {
                        yesIndex = i;
                        break;
                    }
                }

                if (yesIndex !== -1 && market.clobTokenIds.length > yesIndex) {
                    const tokenId = market.clobTokenIds[yesIndex];
                    const mappedTemp = `${relevantForecast}°F (NWS)`;
                    
                    // We execute buying a YES token. Due to its exact nature, we assume a limit of YES bets should be restricted natively.
                    // The limit executes 2 options per Event. Since YES is highly confident, we pass amount = 100.
                    await this.executePaperTrade(market, tokenId, 'YES', 100, mappedTemp, markets);
                }
            }
        }
    }
}
