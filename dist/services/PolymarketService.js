"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolymarketService = void 0;
const axios_1 = __importDefault(require("axios"));
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
class PolymarketService {
    // Fetch active daily highest temperature weather markets by slug
    static async getActiveTemperatureMarkets() {
        const tempMarkets = [];
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
            // Only check tomorrow (+1) and next day (+2) per user request
            for (const city of cities) {
                const citySlug = city.replace(/\s+/g, '-');
                for (const offset of [1, 2]) {
                    const d = new Date();
                    d.setUTCDate(d.getUTCDate() + offset);
                    const monthInfo = months[d.getUTCMonth()];
                    // Slugs don't pad single digit days on PM usually, it's just '8' not '08'
                    const dayInfo = d.getUTCDate();
                    const yearInfo = d.getUTCFullYear();
                    const slug = `highest-temperature-in-${citySlug}-on-${monthInfo}-${dayInfo}-${yearInfo}`;
                    slugPromises.push(axios_1.default.get(`${GAMMA_API}/events?slug=${slug}`).catch(() => null));
                }
            }
            console.log(`[PolymarketService] Probing ${slugPromises.length} potential unique weather market slugs...`);
            // Execute all probes. Takes ~2-5s but guarantees 100% discovery rate skipping volume pagination
            const responses = await Promise.all(slugPromises);
            const exampleTitles = new Set();
            for (const res of responses) {
                if (res && res.data && res.data.length > 0) {
                    // Slug returns array of matching events, usually length 1
                    const event = res.data[0];
                    if (event && event.markets && Array.isArray(event.markets)) {
                        for (const market of event.markets) {
                            if (market.active && !market.closed) {
                                let parsedTokens = [];
                                try {
                                    parsedTokens = JSON.parse(market.clobTokenIds || '[]');
                                }
                                catch (e) { }
                                let parsedOutcomes = [];
                                try {
                                    parsedOutcomes = JSON.parse(market.outcomes || '[]');
                                }
                                catch (e) { }
                                exampleTitles.add(event.title);
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
            if (exampleTitles.size > 0) {
                const examples = Array.from(exampleTitles).slice(0, 3);
                console.log(`[PolymarketService] Example markets grabbed:\n - ${examples.join('\n - ')}`);
            }
            return tempMarkets;
        }
        catch (error) {
            console.error('[PolymarketService] Error fetching Polymarket markets by slug:', error.message || error);
            return [];
        }
    }
    // Get orderbook for a specific token
    static async getOrderBook(tokenId) {
        try {
            const res = await axios_1.default.get(`${CLOB_API}/book?token_id=${tokenId}`);
            return res.data;
        }
        catch (error) {
            // Might be a 404 if no orders, silently fail or return empty
            return { bids: [], asks: [] };
        }
    }
    // Get market resolution status
    static async checkMarketResolution(marketId) {
        try {
            // In Gamma API markets endpoint
            const res = await axios_1.default.get(`${GAMMA_API}/markets/${marketId}`);
            const market = res.data;
            if (market && market.closed) {
                // Try to figure out winning token or outcome
                let winningToken = undefined;
                let winningOutcome = market.outcome; // Gamma API often returns the winning outcome text
                if (market.tokens && Array.isArray(market.tokens)) {
                    const winner = market.tokens.find((t) => t.winner === true || t.winner === 'true');
                    if (winner)
                        winningToken = winner.token_id;
                }
                return {
                    resolved: true,
                    conditionId: market.conditionId,
                    winningToken,
                    winningOutcome
                };
            }
            return { resolved: false };
        }
        catch (error) {
            return { resolved: false };
        }
    }
}
exports.PolymarketService = PolymarketService;
