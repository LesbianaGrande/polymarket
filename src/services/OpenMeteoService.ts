import axios from 'axios';

// Exclude American cities.
// Strategy 1 excludes: London, Seoul, mainland China.
// Strategy 2 excludes: Amsterdam, Shanghai, Helsinki, Ankara, Sao Paulo, Shenzhen, Tel Aviv, Warsaw, Beijing.
export const CITY_COORDINATES: Record<string, { lat: number, lon: number, timezone: string }> = {
    'paris': { lat: 48.8566, lon: 2.3522, timezone: 'Europe/Paris' },
    'amsterdam': { lat: 52.3676, lon: 4.9041, timezone: 'Europe/Amsterdam' }, // Excluded in (2)
    'berlin': { lat: 52.5200, lon: 13.4050, timezone: 'Europe/Berlin' },
    'london': { lat: 51.5074, lon: -0.1278, timezone: 'Europe/London' }, // Excluded in (1)
    'madrid': { lat: 40.4168, lon: -3.7038, timezone: 'Europe/Madrid' },
    'rome': { lat: 41.9028, lon: 12.4964, timezone: 'Europe/Rome' },
    'moscow': { lat: 55.7558, lon: 37.6173, timezone: 'Europe/Moscow' },
    'tokyo': { lat: 35.6762, lon: 139.6503, timezone: 'Asia/Tokyo' },
    'seoul': { lat: 37.5665, lon: 126.9780, timezone: 'Asia/Seoul' }, // Excluded in (1)
    'beijing': { lat: 39.9042, lon: 116.4074, timezone: 'Asia/Shanghai' }, // Excluded in (1) & (2)
    'shanghai': { lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' }, // Excluded in (1) & (2)
    'shenzhen': { lat: 22.5431, lon: 114.0579, timezone: 'Asia/Shanghai' }, // Excluded in (1) & (2)
    'hong kong': { lat: 22.3193, lon: 114.1694, timezone: 'Asia/Hong_Kong' },
    'sydney': { lat: -33.8688, lon: 151.2093, timezone: 'Australia/Sydney' },
    'dubai': { lat: 25.2048, lon: 55.2708, timezone: 'Asia/Dubai' },
    'singapore': { lat: 1.3521, lon: 103.8198, timezone: 'Asia/Singapore' },
    'helsinki': { lat: 60.1695, lon: 24.9354, timezone: 'Europe/Helsinki' }, // Excluded in (2)
    'ankara': { lat: 39.9334, lon: 32.8597, timezone: 'Europe/Istanbul' }, // Excluded in (2)
    'sao paulo': { lat: -23.5505, lon: -46.6333, timezone: 'America/Sao_Paulo' }, // Excluded in (2)
    'tel aviv': { lat: 32.0853, lon: 34.7818, timezone: 'Asia/Jerusalem' }, // Excluded in (2)
    'warsaw': { lat: 52.2297, lon: 21.0122, timezone: 'Europe/Warsaw' }, // Excluded in (2)
    'toronto': { lat: 43.65107, lon: -79.347015, timezone: 'America/Toronto' },
    // more can be added dynamically or stored here
};

export class OpenMeteoService {

    /**
     * Gets the forecasted highest temperature for tomorrow and the next day.
     * We specify the timezone so "tomorrow" aligns with the local day of the city.
     */
    static async getForecastedHighs(cityName: string, isCelsius: boolean = false): Promise<{ tomorrow: number, nextDay: number } | null> {
        const cityKey = cityName.toLowerCase();
        const coords = CITY_COORDINATES[cityKey];
        if (!coords) {
            console.log(`[OpenMeteo] No coordinates for city: ${cityName}`);
            return null;
        }

        try {
            // Polymarket weather can be in either F or C depending on the region.
            const unit = isCelsius ? 'celsius' : 'fahrenheit';
            
            // Execute primary request using Polymarket's expected ECMWF IFS 0.25 model
            let url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max&temperature_unit=${unit}&timezone=${coords.timezone}&models=ecmwf_ifs025`;
            
            let res = await axios.get(url);
            let daily = res.data.daily;

            // If the ECMWF model array misses the horizon (returns nulls), fall back to best_match
            if (!daily || !daily.temperature_2m_max || daily.temperature_2m_max.length < 3 || daily.temperature_2m_max[1] === null || daily.temperature_2m_max[2] === null) {
                console.log(`[OpenMeteo] ECMWF horizon miss for ${cityKey}, falling back to "best_match"...`);
                let fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max&temperature_unit=${unit}&timezone=${coords.timezone}`;
                res = await axios.get(fallbackUrl);
                daily = res.data.daily;
            }

            if (daily && daily.temperature_2m_max && daily.temperature_2m_max.length >= 3 && daily.temperature_2m_max[1] !== null) {
                // index 0 = today, index 1 = tomorrow, index 2 = next day
                return {
                    tomorrow: daily.temperature_2m_max[1],
                    nextDay: daily.temperature_2m_max[2]
                };
            }
            return null;
        } catch (err: any) {
            console.error(`[OpenMeteo] Error fetching forecast for ${cityName}:`, err.message || err);
            return null;
        }
    }
}
