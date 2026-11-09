import { lazy, useEffect, useState } from "react";
import LazySection from "./LazySection";
import { fetchWeather as fetchDistrictWeather } from "./weatherApi";
import "./App.css";
import AIWeatherAssistant from "./AIWeatherAssistant";
const WeatherComparison = lazy(() => import("./WeatherComparison"));
const WeatherAlerts = lazy(() => import("./WeatherAlerts"));
const WeatherMaps = lazy(() => import("./WeatherMaps"));
const HistoricalAnalytics = lazy(() => import("./HistoricalAnalytics"));
const ModelPerformance = lazy(() => import("./ModelPerformance"));
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://bihar-weather-api.onrender.com").replace(/\/$/, "");

function getWeatherInfo(code) {
  if (code === 0) return { condition: "Clear Sky", icon: "\u2600\ufe0f" };
  if (code === 1) return { condition: "Mainly Clear", icon: "\u2600\ufe0f" };
  if (code === 2) return { condition: "Partly Cloudy", icon: "\u26c5" };
  if (code === 3) return { condition: "Overcast", icon: "\u2601\ufe0f" };
  if ([45, 48].includes(code)) return { condition: "Foggy", icon: "\u{1F32B}\uFE0F" };
  if ([51, 53, 55, 56, 57].includes(code)) return { condition: "Drizzle", icon: "\u{1F326}\uFE0F" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { condition: "Rain", icon: "\u{1F327}\uFE0F" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: "Snow", icon: "\u{1F328}\uFE0F" };
  if ([95, 96, 99].includes(code)) return { condition: "Thunderstorm", icon: "\u26c8\ufe0f" };
  return { condition: "Conditions Unavailable", icon: "\u2753" };
}
function formatClockTime(value) {
  if (!value) return "Time unavailable";
  const raw = String(value);
  const timePart = raw.includes("T") ? raw.split("T").pop() : raw.split(" ").pop();
  const match = timePart.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function formatDay(dateString, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-IN", { weekday: "short" });
}
function App() {
  const [district, setDistrict] = useState("Patna");
  const [activeSection, setActiveSection] = useState("overview");
  const navClass = (sectionId) =>
    `nav-link${activeSection === sectionId ? " active" : ""}`;
  const [districtNames, setDistrictNames] = useState([]);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function fetchDistricts() {
      try {
        const response = await fetch(`${API_BASE}/api/districts`);
        if (!response.ok) {
          throw new Error("District API request failed");
        }
        const data = await response.json();
        if (active) {
          setDistrictNames(data.districts || []);
          if (
            data.districts?.length &&
            !data.districts.some(
              (name) => name.toLowerCase() === district.toLowerCase()
            )
          ) {
            setDistrict(data.districts[0]);
          }
        }
      } catch {
        if (active) {
          setError("District list load nahi hui. Backend server check karo.");
        }
      } finally {
        if (active) {
          setDistrictsLoading(false);
        }
      }
    }
    fetchDistricts();
    return () => {
      active = false;
    };
  }, []);
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  useEffect(() => {
    let active = true;
    async function loadWeather() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchDistrictWeather(district);
        if (active) {
          setWeatherData(data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (active) setError(err.message || "Weather data load nahi hua.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadWeather();
    const interval = setInterval(loadWeather, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [district]);
  useEffect(() => {
    const sectionIds = ["overview", "districts", "weather-alerts", "comparison", "weather-maps", "analytics", "forecast", "insights", "ai-assistant"];
    const updateActiveSection = () => {
      let currentSection = "overview";
      for (const id of sectionIds) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 160) {
          currentSection = id;
        }
      }
      setActiveSection(currentSection);
    };
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    updateActiveSection();
    return () => window.removeEventListener("scroll", updateActiveSection);
  }, []);
  const current = weatherData?.current;
  const daily = weatherData?.daily;
  const weatherInfo = current
    ? getWeatherInfo(current.weather_code)
    : { condition: "Loading...", icon: "\u{1F324}\uFE0F" };
  const forecast = daily
    ? daily.time.slice(0, 7).map((date, index) => ({
        day: formatDay(date, index),
        date,
        ...getWeatherInfo(daily.weather_code[index]),
        max: daily.temperature_2m_max[index],
        min: daily.temperature_2m_min[index],
        rain: daily.precipitation_probability_max[index],
      }))
    : [];
  const currentRain = current?.precipitation;
  const humidity = current?.relative_humidity_2m;
  const wind = current?.wind_speed_10m;
  let insightTitle = "Weather overview";
  let insightText = "Current weather observations ke basis par conditions monitor karein.";
  if (current) {
    if ([95, 96, 99].includes(current.weather_code)) {
      insightTitle = "Thunderstorm conditions";
      insightText = `${district} mein thunderstorm conditions report hui hain. Local weather alerts check karein aur outdoor activities mein caution rakhein.`;
    } else if (
      [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(
        current.weather_code
      )
    ) {
      insightTitle = "Rain detected";
      insightText = `${district} mein rain-related conditions report hui hain. Bahar nikalne se pehle updated forecast check karein.`;
    } else if (humidity >= 75) {
      insightTitle = "High humidity";
      insightText = `${district} mein relative humidity ${humidity}% hai. Weather comparatively humid feel ho sakta hai.`;
    } else if (wind >= 30) {
      insightTitle = "Elevated wind speed";
      insightText = `Wind speed ${wind} km/h report hui hai. Local advisories aur updated weather conditions par nazar rakhein.`;
    } else {
      insightTitle = "Current conditions";
      insightText = `${district} mein ${weatherInfo.condition.toLowerCase()} conditions hain. Temperature ${current.temperature_2m}\u00B0C aur humidity ${humidity}% report hui hai.`;
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon">{String.fromCodePoint(0x2600, 0xFE0F)}</span>
          <span>
            <strong>
              BIHAR<span className="brand-accent">WX</span>
            </strong>
            <small>WEATHER INTELLIGENCE</small>
          </span>
        </a>
        <p className="nav-heading">WORKSPACE</p>
        <nav className="navigation">
  <a className={navClass("overview")} href="#overview" onClick={() => setActiveSection("overview")}>
    <span>Overview</span>
  </a>
  <a className={navClass("districts")} href="#districts" onClick={() => setActiveSection("districts")}>
    <span>District Explorer</span>
  </a>
  <a className={navClass("weather-alerts")} href="#weather-alerts" onClick={() => setActiveSection("weather-alerts")}>
    <span>Smart Weather Alerts & Risk Dashboard</span>
  </a>
  <a className={navClass("comparison")} href="#comparison" onClick={() => setActiveSection("comparison")}>
    <span>Temperature Comparison</span>
  </a>
  <a className={navClass("weather-maps")} href="#weather-maps" onClick={() => setActiveSection("weather-maps")}>
    <span>Bihar Weather Maps</span>
  </a>
  <a className={navClass("analytics")} href="#analytics" onClick={() => setActiveSection("analytics")}>
    <span>Historical Analytics</span>
  </a>
  <a className={navClass("forecast")} href="#forecast" onClick={() => setActiveSection("forecast")}>
    <span>Forecast</span>
  </a>
  <a className={navClass("insights")} href="#insights" onClick={() => setActiveSection("insights")}>
    <span>Weather Insights</span>
  </a>  <a className={navClass("ai-assistant")} href="#ai-assistant" onClick={() => setActiveSection("ai-assistant")}>
    <span>AI Weather Assistant</span>
  </a>
</nav>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>{error ? "Connection issue" : "Weather service"}</strong>
            <small>
              {loading
                ? "Fetching weather..."
                : error
                  ? "API unavailable"
                  : `${weatherData?.source || "Weather API"} connected`}
            </small>
          </div>
        </div>
      </aside>
      <main className="main-content" id="overview">
        <header className="page-header">
          <div>
            <p className="eyebrow">BIHAR, INDIA / WEATHER CENTER</p>
            <h1>Weather Dashboard</h1>
            <p className="subtitle">
              Regional weather overview and district intelligence.
            </p>
          </div>
          <span className="demo-badge">
            <span />
            {error ? "API ERROR" : loading ? "LOADING" : "LIVE API"}
          </span>
        </header>
        {error ? (
          <section className="demo-notice" role="alert">
            <span className="notice-icon">{String.fromCodePoint(0x26C5)}</span>
            <div>
              <strong>Weather data unavailable</strong>
              <p>{error}</p>
              <p>
                Backend terminal check karo aur phir district select karke
                retry karo.
              </p>
            </div>
          </section>
        ) : (
          <section className="demo-notice">
            <span className="notice-icon">{String.fromCodePoint(0x26C5)}</span>
            <div>
              <strong>
                {loading
                  ? "Live weather load ho raha hai..."
                  : "Live weather data connected"}
              </strong>
              <p>
                {loading
                  ? "Selected district ke latest available observations aur forecast fetch ho rahe hain."
                  : `Source: ${weatherData?.source || "Weather API"}. Weather values provider ke latest available data par based hain.`}
              </p>
            </div>
          </section>
        )}
        <section className="district-toolbar" id="districts">
          <div className="district-select">
            <label htmlFor="district">SELECT DISTRICT</label>
            <select
              id="district"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
            >
              {districtNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="location-info">
            <span className="location-icon">{String.fromCodePoint(0x1F4CD)}</span>
            <div>
              <strong>{district}, Bihar</strong>
              <small>
                {weatherData
                  ? `Coordinates: ${weatherData.coordinates.latitude}, ${weatherData.coordinates.longitude}`
                  : "Fetching district weather"}
              </small>
            </div>
          </div>
        </section>
        <section className="weather-hero">
          <div className="hero-copy">
              <p className="eyebrow">CURRENT CONDITIONS | {loading ? "LOADING" : "LIVE DATA"}</p>
            <h2>{district}</h2>
            <p className="condition">
              {loading ? "Fetching conditions..." : error ? "Unavailable" : weatherInfo.condition}
            </p>
            <div className="temperature">
              {current ? current.temperature_2m : "--"}
              <span>{"\u00B0C"}</span>
            </div>
            <p className="temperature-note">
              {current
                ? `Feels like ${current.apparent_temperature}\u00B0C | ${formatClockTime(current.time || current.datetime)}`
                : "Temperature will appear when data loads"}
            </p>
          </div>
          <div className="weather-art" aria-hidden="true">
            <div className="sun" />
            <div className="cloud cloud-back" />
            <div className="cloud cloud-front" />
            <div className="rain rain-one" />
            <div className="rain rain-two" />
          </div>
          <div className="hero-footer">
            <span>{district}, Bihar, India</span>
            <span>Source: {weatherData?.source || "Weather API"}</span>
            <span>
              Last Updated:{" "}
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    hour12: true,
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Waiting for data"}
            </span>
          </div>
        </section>
        <section className="metrics-grid">
          <Metric
            icon={String.fromCodePoint(0x1F4A7)}
            label="Humidity"
            value={current ? `${current.relative_humidity_2m}%` : "--"}
            detail="Relative humidity"
          />
          <Metric
            icon={String.fromCodePoint(0x1F327, 0xFE0F)}
            label="Precipitation"
            value={currentRain != null ? `${currentRain} mm` : "--"}
            detail="Current reported interval"
          />
          <Metric
            icon={String.fromCodePoint(0x1F4A8)}
            label="Wind speed"
            value={current ? `${wind} km/h` : "--"}
            detail="Current wind speed"
          />
          <Metric
            icon={weatherInfo.icon}
            label="Conditions"
            value={current ? weatherInfo.condition : "--"}
            detail="Weather code classification"
          />
        </section>
        <LazySection component={ModelPerformance} sectionId="model-performance" fallback="Model performance will load when you scroll here..." />
        <LazySection component={WeatherAlerts} sectionId="weather-alerts" fallback="Weather alerts will load when you scroll here..." />
        <LazySection component={WeatherComparison} sectionId="comparison" fallback="Comparison will load when you scroll here..." />
        <LazySection component={WeatherMaps} sectionId="weather-maps" fallback="Weather maps will load when you scroll here..." />
        <LazySection component={HistoricalAnalytics} district={district} sectionId="analytics" fallback="Historical analytics will load when you scroll here..." />
<section className="section-block" id="forecast">
          <div className="section-heading">
            <div>
              <p className="eyebrow">UPCOMING OUTLOOK</p>
              <h2>7-Day Forecast</h2>
            </div>
            <span className="section-badge">
              {loading ? "LOADING" : error ? "UNAVAILABLE" : "LIVE FORECAST"}
            </span>
          </div>
          <div className="forecast-grid">
            {forecast.map((item) => (
              <article className="forecast-card" key={item.date}>
                <p>{item.day}</p>
<small style={{ display: "block", fontSize: "0.78rem", opacity: 0.75, marginTop: "-8px", marginBottom: "8px" }}>
  {new Date(`${item.date}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
</small>
                <span className="forecast-icon">{item.icon}</span>
                <h3>
                  {item.max !== null ? `${item.max}\u00B0C` : "--"}
                </h3>
                <small>
                  Low: {item.min !== null ? `${item.min}\u00B0C` : "--"}
                </small>
                <small>
                  Rain chance: {item.rain != null ? `${item.rain}%` : "N/A"}
                </small>
              </article>
            ))}
            {!loading && !error && forecast.length === 0 && (
              <p>Forecast data available nahi hai.</p>
            )}
          </div>
          <p className="footnote">
            Forecast provider ke estimates par based hai; weather rapidly
            change ho sakta hai.
          </p>
        </section>
        <section className="section-block" id="insights">
          <div className="section-heading">
            <div>
              <p className="eyebrow">INTELLIGENCE CENTER</p>
              <h2>Weather Insights</h2>
            </div>
            <span className="section-badge">RULE-BASED</span>
          </div>
          <article className="insight-card">
            <span className="insight-icon">*</span>
            <div>
              <h3>{loading ? "Analysing weather..." : insightTitle}</h3>
              <p>
                {error
                  ? "Live data unavailable hone ki wajah se insights generate nahi kiye ja sakte."
                  : loading
                    ? "Latest observations ka wait ho raha hai."
                    : insightText}
              </p>
            </div>
          </article>
          <p className="footnote">
            Insights simple weather rules se generate hote hain. Yeh AI/ML
            prediction ya official weather warning nahi hain.
          </p>
        </section>
        <AIWeatherAssistant district={district} />
        <footer className="page-footer">
          Bihar Weather Intelligence Dashboard <span>|</span> Educational
          prototype
        </footer>
      </main>
    </div>
  );
}
function Metric({ icon, label, value, detail }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <h3>{value}</h3>
      <p>{detail}</p>
    </article>
  );
}
export default App;
