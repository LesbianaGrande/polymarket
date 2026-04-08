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
    
    // Fetch active daily highest temperature weather markets
    static async getActiveTemperatureMarkets(): Promise<MarketInfo[]> {
        try {
            // Polymarket often uses 'weather' tags or category, but we fetch active events
            const res = await axios.get(`${GAMMA_API}/events?active=true&closed=false&limit=100`);
            const events = res.data || [];
            
            const tempMarkets: MarketInfo[] = [];

            for (const event of events) {
                // Filter specifically for highest temperature events
                const titleLower = event.title ? event.title.toLowerCase() : '';
                if (titleLower.includes('highest temperature') || titleLower.includes('high temperature')) {
                    if (event.markets && Array.isArray(event.markets)) {
                        for (const market of event.markets) {
                            if (market.active && !market.closed) {
                                let parsedTokens = [];
                                try {
                                    parsedTokens = JSON.parse(market.clobTokenIds || '[]');
                                } catch (e) { }

                                let parsedOutcomes = [];
                                try {
                                    parsedOutcomes = JSON.parse(market.outcomes || '[]');
                                } catch (e) { }

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
            console.error('Error fetching Polymarket markets:', error);
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
