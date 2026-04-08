import { BaseStrategy } from './BaseStrategy';
import { MarketInfo } from '../services/PolymarketService';
import { OpenMeteoService, CITY_COORDINATES } from '../services/OpenMeteoService';

export class OpenMeteoStrategy extends BaseStrategy {
    walletId = 'strategy-1';
    strategyName = 'OpenMeteo Counter-Bet';

    // Excluded cities for strategy 1 (in addition to US cities which are already excluded from CITY_COORDINATES)
    private excludedCities = ['london', 'seoul', 'beijing', 'shanghai', 'shenzhen'];

    async execute(markets: MarketInfo[]): Promise<void> {
        const forecastCache: Record<string, { tomorrow: number, nextDay: number } | null> = {};

        for (const market of markets) {
            // Find which city this market relates to
            const titleLower = market.title.toLowerCase();
            let matchedCity: string | null = null;
            
            for (const city of Object.keys(CITY_COORDINATES)) {
                if (titleLower.includes(city)) {
                    matchedCity = city;
                    break;
                }
            }

            if (!matchedCity || this.excludedCities.includes(matchedCity)) {
                continue; // Skip if no city matched or it's excluded
            }

            // Ensure it's for "tomorrow" or "next day"
            const timezone = CITY_COORDINATES[matchedCity].timezone;
            if (!this.isTomorrow(market.title, timezone) && !this.isNextDay(market.title, timezone) &&
                !this.isTomorrow(market.question, timezone) && !this.isNextDay(market.question, timezone)) {
                continue;
            }

            // Extract the band "X" from the question
            const tempMatch = market.question.match(/(\d+)\s*°?[FC]/i);
            if (!tempMatch) continue;

            const bandTemp = parseFloat(tempMatch[1]);

            // Get the forecast from OpenMeteo (use cache to avoid 429 rate limits)
            if (forecastCache[matchedCity] === undefined) {
                // To be extra safe against burst limits, add a tiny sleep
                await new Promise(r => setTimeout(r, 200));
                forecastCache[matchedCity] = await OpenMeteoService.getForecastedHighs(matchedCity);
            }
            
            const forecast = forecastCache[matchedCity];
            if (!forecast) continue;

            // Determine if the market applies to tomorrow or next day
            // Simplified logic: choose the closest numerical day in the string, or we test both if ambiguous.
            // For safety, let's see if the forecasted values are within 2 degrees of `bandTemp` for either day.
            let relevantForecast: number;
            
            // Use the explicit helpers that check the dates in the question
            if (this.isNextDay(market.question, timezone) || this.isNextDay(market.title, timezone)) {
                relevantForecast = forecast.nextDay;
            } else {
                // assume tomorrow
                relevantForecast = forecast.tomorrow;
            }

            const questionLower = market.question.toLowerCase();
            const isBand = questionLower.includes('higher') || questionLower.includes('lower') || questionLower.includes('more') || questionLower.includes('less');

            let shouldBetNo = false;

            if (isBand) {
                // For X or higher/lower bands, only bet NO if X is within 2 degrees of forecast
                if (Math.abs(bandTemp - relevantForecast) <= 2) {
                    shouldBetNo = true;
                }
            } else {
                // For exact temps, buy NO if forecast rounded equals X (or if forecast exactly matches the string)
                if (Math.round(relevantForecast) === bandTemp) {
                    shouldBetNo = true;
                }
            }

            if (shouldBetNo) {
                // We ONLY bet NO in this strategy.
                let noIndex = -1;
                for (let i = 0; i < market.outcomes.length; i++) {
                    if (market.outcomes[i].toLowerCase() === 'no') {
                        noIndex = i;
                        break;
                    }
                }

                if (noIndex !== -1 && market.clobTokenIds.length > noIndex) {
                    const tokenId = market.clobTokenIds[noIndex];
                    await this.executePaperTrade(market, tokenId, 'NO');
                }
            }
        }
    }
}
