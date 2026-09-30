/**
 * @name api_fetcher
 * @cron 0 8 * * *
 * @mcp true
 * @description Demonstrates calling external REST APIs via ActaCron built-in http.get/http.post.
 * @param {string} currency - Target base currency code (e.g. USD, EUR)
 */
function main(params) {
  const base = (params && params.currency) ? params.currency.toUpperCase() : "USD";
  const apiUrl = "https://api.exchangerate-api.com/v4/latest/" + base;

  console.log("Fetching exchange rates for base:", base);

  // ActaCron built-in HTTP GET client
  const res = http.get(apiUrl, {
    "User-Agent": "ActaCron-Bot/1.0"
  });

  if (!res || res.status !== 200) {
    throw new Error("HTTP request failed with status: " + (res ? res.status : "unknown"));
  }

  const data = JSON.parse(res.body);
  console.log("Rates retrieved successfully. Base:", data.base, "Date:", data.date);

  return {
    status: "ok",
    base: data.base,
    date: data.date,
    sample_rates: {
      VND: data.rates ? data.rates.VND : null,
      EUR: data.rates ? data.rates.EUR : null,
      JPY: data.rates ? data.rates.JPY : null
    }
  };
}
