const axios = require('axios');
async function test() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);  // April 10 is +3 days from local April 7
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const m = months[d.getUTCMonth()];
    const s = `highest-temperature-in-london-on-${m}-${d.getUTCDate()}-${d.getUTCFullYear()}`;
    console.log("Slug:", s);
    try {
        const r = await axios.get('https://gamma-api.polymarket.com/events?slug='+s);
        console.log("Found:", r.data.length);
        if (r.data.length > 0) {
            console.log("Title:", r.data[0].title);
            console.log("Markets:", r.data[0].markets.length);
        }
    } catch (e) {
        console.error(e.message);
    }
}
test();
