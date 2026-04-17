"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NwsService = exports.US_CITY_COORDINATES = void 0;
exports.US_CITY_COORDINATES = {
    'new york': { lat: 40.7128, lon: -74.0060, timezone: 'America/New_York' },
    'miami': { lat: 25.7617, lon: -80.1918, timezone: 'America/New_York' },
    'chicago': { lat: 41.8781, lon: -87.6298, timezone: 'America/Chicago' },
    'los angeles': { lat: 34.0522, lon: -118.2437, timezone: 'America/Los_Angeles' },
    'austin': { lat: 30.2672, lon: -97.7431, timezone: 'America/Chicago' },
    'phoenix': { lat: 33.4484, lon: -112.0740, timezone: 'America/Phoenix' },
    'washington': { lat: 38.9072, lon: -77.0369, timezone: 'America/New_York' },
    'philadelphia': { lat: 39.9526, lon: -75.1652, timezone: 'America/New_York' },
};
class NwsService {
    /**
     * Gets the forecasted highest daytime temperature for today and tomorrow using the National Weather Service API.
     * NWS relies on gridpoints instead of lat/lon directly for forecasting.
     */
    static async getForecastedHighs(cityName) {
        const cityKey = cityName.toLowerCase();
        const coords = exports.US_CITY_COORDINATES[cityKey];
        if (!coords)
            return null;
        try {
            // Step 1: Find the grid endpoint for the provided lat/lon
            const pointsUrl = `https://api.weather.gov/points/${coords.lat},${coords.lon}`;
            const pointsRes = await fetch(pointsUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 PolymarketWeatherBot/1.0' }
            });
            if (!pointsRes.ok) {
                console.error(`[NWS] Failed to fetch points for ${cityKey}: ${pointsRes.status}`);
                return null;
            }
            const pointsData = await pointsRes.json();
            const forecastUrl = pointsData.properties?.forecast;
            if (!forecastUrl) {
                console.error(`[NWS] No forecast URL found for ${cityKey}`);
                return null;
            }
            // Step 2: Fetch the grid forecast periods
            const forecastRes = await fetch(forecastUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 PolymarketWeatherBot/1.0' }
            });
            if (!forecastRes.ok) {
                console.error(`[NWS] Failed to fetch forecast for ${cityKey}: ${forecastRes.status}`);
                return null;
            }
            const forecastData = await forecastRes.json();
            const periods = forecastData.properties?.periods;
            if (!periods || periods.length === 0)
                return null;
            // NWS 'periods' alternates between Daytime and Nighttime conditions mapping roughly to 14 periods for 7 days.
            // We need the `isDaytime == true` periods, ordered sequentially.
            const daytimePeriods = periods.filter(p => p.isDaytime === true);
            if (daytimePeriods.length < 2)
                return null;
            // Typically daytimePeriods[0] is Today (if we query before sunset), and daytimePeriods[1] is Tomorrow.
            // If the query is executed AT NIGHT, the API might drop "Today" and daytimePeriods[0] becomes "Tomorrow".
            // We must identify "Today" vs "Tomorrow" based on the localized chronological name or relative timing.
            let todayHigh = null;
            let tomorrowHigh = null;
            let nextDayHigh = null;
            // Let's create a deterministic date footprint string in the target timezone
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', { timeZone: coords.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
            // Generates "MM/DD/YYYY"
            const todayStr = formatter.format(now);
            const tomorrowDate = new Date(now);
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            const tomorrowStr = formatter.format(tomorrowDate);
            const nextDate = new Date(now);
            nextDate.setDate(nextDate.getDate() + 2);
            const nextDateStr = formatter.format(nextDate);
            // Match period startTime bounds to today/tomorrow/nextDay
            for (const period of daytimePeriods) {
                const pDate = new Date(period.startTime);
                const pStr = formatter.format(pDate);
                if (pStr === todayStr) {
                    todayHigh = period.temperature;
                }
                else if (pStr === tomorrowStr) {
                    tomorrowHigh = period.temperature;
                }
                else if (pStr === nextDateStr) {
                    nextDayHigh = period.temperature;
                }
            }
            // Fallbacks in case NWS naming/date offset was weird (e.g., late night drops today entirely)
            if (todayHigh === null && tomorrowHigh !== null) {
                // If today is dropped, we can only safely return tomorrow.
                return { today: -999, tomorrow: tomorrowHigh, nextDay: nextDayHigh || -999 };
            }
            else if (todayHigh !== null && tomorrowHigh !== null) {
                return { today: todayHigh, tomorrow: tomorrowHigh, nextDay: nextDayHigh || -999 };
            }
            else if (todayHigh === null && tomorrowHigh === null) {
                // If neither matched our string, let's just assume index 0 and 1...
                return { today: daytimePeriods[0].temperature, tomorrow: daytimePeriods[1].temperature, nextDay: daytimePeriods[2]?.temperature || -999 };
            }
            return { today: todayHigh || -999, tomorrow: tomorrowHigh || daytimePeriods[0]?.temperature || -999, nextDay: nextDayHigh || daytimePeriods[1]?.temperature || -999 };
        }
        catch (err) {
            console.error(`[NWS] Error fetching forecast for ${cityName}:`, err.message);
            return null;
        }
    }
}
exports.NwsService = NwsService;
