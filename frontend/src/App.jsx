import { useEffect, useState } from "react";
import "./App.css";
import WeatherComparison from "./WeatherComparison";
import WeatherAlerts from "./WeatherAlerts";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://bihar-weather-api.onrender.com").replace(/\/$/, "");

function getWeatherInfo(code) {
  if (code === 0) return { condition: "Clear Sky", icon: "☀️" };
  if (code === 1) return { condition: "Mainly Clear", icon: "🌤️" };
  if (code === 2) return { condition: "Partly Cloudy", icon: "⛅" };
  if (code === 3) return { condition: "Overcast", icon: "☁️" };
  if ([45, 48].includes(code)) {
    return { condition: "Foggy", icon: "🌫️" };
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { condition: "Drizzle", icon: "🌦️" };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { condition: "Rain", icon: "🌧️" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { condition: "Snow", icon: "❄️" };
  }
  if ([95, 96, 99].includes(code)) {
    return { condition: "Thunderstorm", icon: "⛈️" };
  }
  return { condition: "Conditions Unavailable", icon: "🌡️" };
}
function formatDay(dateString, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-IN", { weekday: "short" });
}
function App() {
  const [district, setDistrict] = useState("Patna");
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
    const controller = new AbortController();
    async function fetchWeather() {
      setLoading(true);
      setError("");
      setWeatherData(null);
      try {
        let data;
        try {
          const response = await fetch(
            `${API_BASE}/api/weather/${encodeURIComponent(district)}`,
            { signal: controller.signal }
          );
          if (!response.ok) {
            throw new Error(`Backend weather API error: ${response.status}`);
          }
          data = await response.json();
          if (!data.current || !data.daily) {
            throw new Error("Backend response mein weather data incomplete hai.");
          }
        } catch (backendError) {
          if (backendError.name === "AbortError") throw backendError;
          const coordinateResponse = await fetch(
            `${API_BASE}/api/coordinates/${encodeURIComponent(district)}`,
            { signal: controller.signal }
          );
          if (!coordinateResponse.ok) {
            throw new Error("Backend aur weather fallback dono fail hue. Thodi der baad retry karo.");
          }
          const coordinateData = await coordinateResponse.json();
          const { latitude, longitude } = coordinateData.coordinates;
          const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
            daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            forecast_days: "5",
            timezone: "Asia/Kolkata"
          });
          const fallbackResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
            { signal: controller.signal }
          );
          if (!fallbackResponse.ok) {
            throw new Error(`Open-Meteo fallback error: ${fallbackResponse.status}`);
          }
          const fallbackData = await fallbackResponse.json();
          if (!fallbackData.current || !fallbackData.daily) {
            throw new Error("Fallback response mein weather data incomplete hai.");
          }
          data = {
            district: coordinateData.district,
            coordinates: coordinateData.coordinates,
            source: "Open-Meteo",
            data_mode: "live_api",
            current: fallbackData.current,
            daily: fallbackData.daily
          };
        }
        setWeatherData(data);
        setLastUpdated(new Date());
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(
            err.message ||
              "Weather data nahi mil raha. Backend aur internet connection check karo."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchWeather();
    const refreshTimer = window.setInterval(() => {
      fetchWeather();
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(refreshTimer);
      controller.abort();
    };
  }, [district]);
  const current = weatherData?.current;
  const daily = weatherData?.daily;
  const weatherInfo = current
    ? getWeatherInfo(current.weather_code)
    : { condition: "Loading...", icon: "🌤️" };
  const forecast = daily
    ? daily.time.map((date, index) => ({
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
      insightText = `${district} mein ${weatherInfo.condition.toLowerCase()} conditions hain. Temperature ${current.temperature_2m}°C aur humidity ${humidity}% report hui hai.`;
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon">☀</span>
          <span>
            <strong>
              BIHAR<span className="brand-accent">WX</span>
            </strong>
            <small>WEATHER INTELLIGENCE</small>
          </span>
        </a>
        <p className="nav-heading">WORKSPACE</p>
        <nav className="navigation">
          <a className="nav-link active" href="#overview">
            ▦ <span>Overview</span>
          </a>
          <a className="nav-link" href="#forecast">
            ◷ <span>Forecast</span>
          </a>
          <a className="nav-link" href="#districts">
            ⌖ <span>District Explorer</span>
          </a>
          <a className="nav-link" href="#insights">
            ✧ <span>Weather Insights</span>
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
            <span className="notice-icon">⚠️</span>
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
            <span className="notice-icon">ⓘ</span>
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
            <span className="location-icon">⌖</span>
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
            <p className="eyebrow">
              CURRENT CONDITIONS · {loading ? "LOADING" : "LIVE DATA"}
            </p>
            <h2>{district}</h2>
            <p className="condition">
              {loading ? "Fetching conditions..." : error ? "Unavailable" : weatherInfo.condition}
            </p>
            <div className="temperature">
              {current ? current.temperature_2m : "--"}
              <span>°C</span>
            </div>
            <p className="temperature-note">
              {current
                ? `Feels like ${current.apparent_temperature}°C · ${(current.time || current.datetime || "Time unavailable").replace("T", " ")}`
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
            <span>⌖ {district}, Bihar, India</span>
            <span>Source: {weatherData?.source || "Weather API"}</span>
            <span>
              Last Updated:{" "}
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    hourCycle: "h23",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Waiting for data"}
            </span>
          </div>
        </section>
        <section className="metrics-grid">
          <Metric
            icon="💧"
            label="Humidity"
            value={current ? `${current.relative_humidity_2m}%` : "--"}
            detail="Relative humidity"
          />
          <Metric
            icon="🌧️"
            label="Precipitation"
            value={currentRain != null ? `${currentRain} mm` : "--"}
            detail="Current reported interval"
          />
          <Metric
            icon="💨"
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
        <WeatherAlerts />
        <WeatherComparison />
        <section className="section-block" id="forecast">
          <div className="section-heading">
            <div>
              <p className="eyebrow">UPCOMING OUTLOOK</p>
              <h2>5-Day Forecast</h2>
            </div>
            <span className="section-badge">
              {loading ? "LOADING" : error ? "UNAVAILABLE" : "LIVE FORECAST"}
            </span>
          </div>
          <div className="forecast-grid">
            {forecast.map((item) => (
              <article className="forecast-card" key={item.date}>
                <p>{item.day}</p>
                <span className="forecast-icon">{item.icon}</span>
                <h3>
                  {item.max !== null ? `${item.max}°C` : "--"}
                </h3>
                <small>
                  Low: {item.min !== null ? `${item.min}°C` : "--"}
                </small>
                <small>
                  Rain chance: {item.rain !== null ? `${item.rain}%` : "N/A"}
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
            <span className="insight-icon">✧</span>
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
        <footer className="page-footer">
          Bihar Weather Intelligence Dashboard <span>·</span> Educational
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
