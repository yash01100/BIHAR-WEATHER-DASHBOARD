import { useCallback, useEffect, useState } from "react";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://bihar-weather-api.onrender.com").replace(/\/$/, "");
function getAlerts(data) {
  const alerts = [];
  const district = data.district;
  const maxTemps = data.daily?.temperature_2m_max || [];
  const rainProbabilities = data.daily?.precipitation_probability_max || [];
  const weatherCodes = data.daily?.weather_code || [];
  const highestTemp = maxTemps.length ? Math.max(...maxTemps) : null;
  const highestRain = rainProbabilities.length
    ? Math.max(...rainProbabilities)
    : null;
  if (highestTemp !== null && highestTemp >= 40) {
    alerts.push({
      district,
      level: "High",
      type: "High temperature",
      detail: `Forecast maximum ${highestTemp}°C tak hai.`,
    });
  } else if (highestTemp !== null && highestTemp >= 35) {
    alerts.push({
      district,
      level: "Moderate",
      type: "Warm weather",
      detail: `Forecast maximum ${highestTemp}°C tak hai.`,
    });
  }
  if (highestRain !== null && highestRain >= 70) {
    alerts.push({
      district,
      level: "High",
      type: "Rain probability",
      detail: `Forecast mein rain probability ${highestRain}% tak hai.`,
    });
  } else if (highestRain !== null && highestRain >= 40) {
    alerts.push({
      district,
      level: "Moderate",
      type: "Possible rain",
      detail: `Forecast mein rain probability ${highestRain}% tak hai.`,
    });
  }
  if (weatherCodes.some((code) => code === 45 || code === 48)) {
    alerts.push({
      district,
      level: "Moderate",
      type: "Fog indicator",
      detail: "Forecast mein fog-related weather code mila hai.",
    });
  }
  if (!alerts.length) {
    alerts.push({
      district,
      level: "Low",
      type: "No configured threshold crossed",
      detail: "Available forecast ne is dashboard ke configured alert thresholds cross nahi kiye.",
    });
  }
  return alerts;
}
export default function WeatherAlerts() {
  const [districts, setDistricts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [districtFilter, setDistrictFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const districtResponse = await fetch(`${API_BASE}/api/districts`);
      if (!districtResponse.ok) {
        throw new Error("District list load nahi hui.");
      }
      const districtData = await districtResponse.json();
      const names = districtData.districts || [];
      setDistricts(names);
      const results = await Promise.allSettled(
        names.map(async (name, index) => {
          // Requests ko stagger karo taaki sab ek saath na jayen.
          await new Promise((resolve) => setTimeout(resolve, index * 1000));
          const response = await fetch(
            `${API_BASE}/api/weather/${encodeURIComponent(name)}`
          );
          if (!response.ok) throw new Error(`${name} ka data load nahi hua.`);
          const data = await response.json();
          if (!data.current || !data.daily) {
            throw new Error(`${name} ka forecast incomplete hai.`);
          }
          return getAlerts(data);
        })
      );
      const successfulAlerts = results
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value);
      const failedCount = results.filter(
        (result) => result.status === "rejected"
      ).length;
      setAlerts(successfulAlerts);
      setUpdatedAt(new Date());
      if (failedCount > 0) {
        setError(
          `${failedCount} district(s) ka data load nahi hua. Results partial hain; Refresh try karo.`
        );
      }
    } catch (err) {
      setError(err.message || "Weather alerts load nahi ho sake.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);
  const visibleAlerts = alerts.filter((alert) => {
    const matchesDistrict =
      districtFilter === "All" || alert.district === districtFilter;
    const matchesLevel =
      levelFilter === "All" || alert.level === levelFilter;
    return matchesDistrict && matchesLevel;
  });
  const levelColors = {
    High: "#dc2626",
    Moderate: "#d97706",
    Low: "#15803d",
  };
  return (
    <section
      className="section-block"
      id="weather-alerts"
      style={{ marginTop: 28 }}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">FORECAST MONITORING</p>
          <h2>Weather Alerts & Risk Dashboard</h2>
        </div>
        <span className="section-badge">RULE-BASED</span>
      </div>
      <p className="footnote">
        Forecast thresholds par based dashboard indicators. Ye official IMD
        alerts nahi hain. Low ka matlab sirf itna hai ki configured thresholds
        cross nahi hue.
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          margin: "18px 0",
          alignItems: "center",
        }}
      >
        <label>
          District{" "}
          <select
            value={districtFilter}
            onChange={(event) => setDistrictFilter(event.target.value)}
          >
            <option value="All">All districts</option>
            {districts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Risk level{" "}
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
          >
            <option value="All">All levels</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </label>
        <button
          type="button"
          onClick={loadAlerts}
          disabled={loading}
          style={{ padding: "9px 14px", borderRadius: 8, cursor: "pointer" }}
        >
          {loading ? "Loading..." : "Refresh Alerts"}
        </button>
      </div>
      {updatedAt && (
        <p className="footnote">
          Last checked:{" "}
          {updatedAt.toLocaleTimeString("en-IN", {
            hour: "2-digit",
                    hourCycle: "h23",
            minute: "2-digit",
          })}
          {" · "}Showing {visibleAlerts.length} of {alerts.length} alert cards
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: "12px 0" }}>
          {error}
        </p>
      )}
      {loading && <p>District weather data load ho raha hai...</p>}
      {!loading && visibleAlerts.length === 0 && !error && (
        <p>No alerts match your selected filters.</p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        {visibleAlerts.map((alert, index) => (
          <article
            key={`${alert.district}-${alert.type}-${index}`}
            style={{
              border: "1px solid var(--border-color, #dbe3ec)",
              borderLeft: `5px solid ${levelColors[alert.level]}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <strong>{alert.district}</strong>
              <span
                style={{
                  color: levelColors[alert.level],
                  fontWeight: 700,
                }}
              >
                {alert.level}
              </span>
            </div>
            <h3 style={{ margin: "12px 0 6px" }}>{alert.type}</h3>
            <p style={{ margin: 0 }}>{alert.detail}</p>
          </article>
        ))}
      </div>
      <p className="footnote" style={{ marginTop: 16 }}>
        Source: Visual Crossing forecast API. Thresholds are simple project rules,
        not official public safety guidance.
      </p>
    </section>
  );
}
