const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://bihar-weather-api.onrender.com"
).replace(/\/$/, "");
const weatherCache = new Map();
const pendingRequests = new Map();
const CACHE_DURATION = 60 * 1000;
export async function fetchWeather(district) {
  const name = String(district || "").trim();
  if (!name) {
    throw new Error("District name is required.");
  }
  const key = name.toLowerCase();
  const now = Date.now();
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }
  const request = (async () => {
    const response = await fetch(
      `${API_BASE}/api/weather/${encodeURIComponent(name)}`
    );
    if (!response.ok) {
      throw new Error(`${name} weather API error: ${response.status}`);
    }
    const data = await response.json();
    if (!data.current || !data.daily) {
      throw new Error(`${name} weather data is incomplete.`);
    }
    weatherCache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_DURATION,
    });
    return data;
  })();
  pendingRequests.set(key, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(key);
  }
}
export function clearWeatherCache() {
  weatherCache.clear();
}
