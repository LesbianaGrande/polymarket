import axios from 'axios';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

export interface MarketInfo {
    id: string;
    title: string;
    marketId: string;
    conditionId: string;
    question: string;
    clobTokenIds: string[];
    outcomes: string[];
    resolutionSource: string;
    endDate: string;
}

export interface OrderBookLevel {
    price: string;
    size: string;
}

export interface OrderBook {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
}

export class PolymarketService {
    
    // Fetch active daily highest temperature weather markets by slug
    static async getActiveTemperatureMarkets(): Promise<MarketInfo[]> {
        const tempMarkets: MarketInfo[] = [];
        const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        
        // Comprehensive list of cities likely to have weather markets
        const cities = [
            'paris', 'amsterdam', 'berlin', 'london', 'madrid', 'rome', 'moscow', 
            'tokyo', 'seoul', 'beijing', 'shanghai', 'shenzhen', 'hong kong', 
            'sydney', 'dubai', 'singapore', 'helsinki', 'ankara', 'sao paulo', 
            'tel aviv', 'warsaw', 'toronto', 'new york', 'miami', 'chicago', 'los angeles', 'austin', 'phoenix'
        ];

        try {
            const slugPromises = [];
            // Check today and up to 7 days in the future
            for (const city of cities) {
                const citySlug = city.replace(/\s+/g, '-');
                for (let offset = 0; offset <= 7; offset++) {
                    const d = new Date();
                    d.setUTCDate(d.getUTCDate() + offset);
                    const monthInfo = months[d.getUTCMonth()];
                    // Slugs don't pad single digit days on PM usually, it's just '8' not '08'
                    const dayInfo = d.getUTCDate();
                    const yearInfo = d.getUTCFullYear();
                    
                    const slug = `highest-temperature-in-${citySlug}-on-${monthInfo}-${dayInfo}-${yearInfo}`;
                    slugPromises.push(
                        axios.get(`${GAMMA_API}/events?slug=${slug}`).catch(() => null)
                    );
                }
            }

            console.log(`[PolymarketService] Probing ${slugPromises.length} potential unique weather market slugs...`);

            // Execute all probes. Takes ~2-5s but guarantees 100% discovery rate skipping volume pagination
            const responses = await Promise.all(slugPromises);

            for (const res of responses) {
                if (res && res.data && res.data.length > 0) {
                    // Slug returns array of matching events, usually length 1
                    const event = res.data[0];
                    if (event && event.markets && Array.isArray(event.markets)) {
                        for (const market of event.markets) {
                            if (market.active && !market.closed) {
                                let parsedTokens = [];
                                try { parsedTokens = JSON.parse(market.clobTokenIds || '[]'); } catch (e) {}

                                let parsedOutcomes = [];
                                try { parsedOutcomes = JSON.parse(market.outcomes || '[]'); } catch (e) {}

                                tempMarkets.push({
                                    id: event.id,
                                    title: event.title,
                                    marketId: market.id,
                                    conditionId: market.conditionId,
                                    question: market.question,
                                    clobTokenIds: parsedTokens,
                                    outcomes: parsedOutcomes,
                                    resolutionSource: market.resolutionSource,
                                    endDate: market.endDate
                                });
                            }
                        }
                    }
                }
            }
            return tempMarkets;
        } catch (error) {
            console.error('Error fetching Polymarket markets by slug:', error);
            return [];
        }
    }

    // Get orderbook for a specific token
    static async getOrderBook(tokenId: string): Promise<OrderBook | null> {
        try {
            const res = await axios.get(`${CLOB_API}/book?token_id=${tokenId}`);
            return res.data;
        } catch (error) {
            // Might be a 404 if no orders, silently fail or return empty
            return { bids: [], asks: [] };
        }
    }

    // Get market resolution status
    static async checkMarketResolution(marketId: string): Promise<{ resolved: boolean, conditionId?: string, winningToken?: string }> {
        try {
             // In Gamma API markets endpoint
             const res = await axios.get(`${GAMMA_API}/markets/${marketId}`);
             const market = res.data;
             if (market && market.closed) {
                 // Try to figure out winning token or outcome
                 return {
                     resolved: true,
                     conditionId: market.conditionId
                 };
             }
             return { resolved: false };
        } catch (error) {
            return { resolved: false };
        }
    }
}
