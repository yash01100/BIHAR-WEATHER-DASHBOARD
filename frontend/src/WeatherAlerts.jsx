import { useCallback, useEffect, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://bihar-weather-api.onrender.com"
).replace(/\/$/, "");

function getAlerts(data) {
  const alerts = [];
  const district = data.district;

  const maxTemps = data.daily?.temperature_2m_max || [];
  const rainProbabilities =
    data.daily?.precipitation_probability_max || [];
  const weatherCodes = data.daily?.weather_code || [];

  const validTemps = maxTemps
    .map(Number)
    .filter(Number.isFinite);

  const validRainProbabilities = rainProbabilities
    .map(Number)
    .filter(Number.isFinite);

  const highestTemp = validTemps.length
    ? Math.max(...validTemps)
    : null;

  const highestRain = validRainProbabilities.length
    ? Math.max(...validRainProbabilities)
    : null;

  // Temperature risk: project-defined thresholds
  if (highestTemp !== null && highestTemp >= 45) {
    alerts.push({
      district,
      level: "Severe",
      type: "Extreme heat indicator",
      detail: `Forecast maximum ${highestTemp}°C tak hai.`,
      advice: "Outdoor activity aur heat exposure ko lekar extra caution rakhein.",
    });
  } else if (highestTemp !== null && highestTemp >= 40) {
    alerts.push({
      district,
      level: "High",
      type: "High temperature",
      detail: `Forecast maximum ${highestTemp}°C tak hai.`,
      advice: "Hydrated rahein aur peak afternoon heat se bachne ki koshish karein.",
    });
  } else if (highestTemp !== null && highestTemp >= 35) {
    alerts.push({
      district,
      level: "Moderate",
      type: "Warm weather",
      detail: `Forecast maximum ${highestTemp}°C tak hai.`,
      advice: "Garmi ke dauran paani peete rahein.",
    });
  }

  // Rain probability: forecast probability, not measured rainfall
  if (highestRain !== null && highestRain >= 90) {
    alerts.push({
      district,
      level: "Severe",
      type: "Very high rain probability",
      detail: `Forecast rain probability ${highestRain}% tak hai.`,
      advice: "Local weather updates check karein aur outdoor plans mein flexibility rakhein.",
    });
  } else if (highestRain !== null && highestRain >= 70) {
    alerts.push({
      district,
      level: "High",
      type: "High rain probability",
      detail: `Forecast rain probability ${highestRain}% tak hai.`,
      advice: "Rain ke liye prepared rahein.",
    });
  } else if (highestRain !== null && highestRain >= 40) {
    alerts.push({
      district,
      level: "Moderate",
      type: "Possible rain",
      detail: `Forecast rain probability ${highestRain}% tak hai.`,
      advice: "Outdoor plans se pehle updated forecast check karein.",
    });
  }

  // Backend currently maps fog to weather code 45
  if (weatherCodes.some((code) => Number(code) === 45)) {
    alerts.push({
      district,
      level: "Moderate",
      type: "Fog indicator",
      detail: "Forecast mein fog-related weather condition mili hai.",
      advice: "Travel karte waqt visibility ka dhyan rakhein.",
    });
  }

  // Thunderstorm indicator based on backend mapping
  if (weatherCodes.some((code) => Number(code) === 95)) {
    alerts.push({
      district,
      level: "High",
      type: "Thunderstorm indicator",
      detail: "Forecast mein thunderstorm-related weather condition mili hai.",
      advice: "Thunderstorm ke dauran open areas aur exposed locations se bachein.",
    });
  }

  if (!alerts.length) {
    alerts.push({
      district,
      level: "Low",
      type: "No configured threshold crossed",
      detail:
        "Available forecast ne dashboard ke configured alert thresholds cross nahi kiye.",
      advice: "Normal weather updates check karte rahein.",
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

      const results = new Array(names.length);
      let nextIndex = 0;

      // Maximum 6 simultaneous district requests
      const workerCount = Math.min(6, names.length);

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (true) {
            const index = nextIndex++;

            if (index >= names.length) return;

            const name = names[index];

            try {
              const response = await fetch(
                `${API_BASE}/api/weather/${encodeURIComponent(name)}`
              );

              if (!response.ok) {
                throw new Error(`${name} ka data load nahi hua.`);
              }

              const data = await response.json();

              if (!data.current || !data.daily) {
                throw new Error(`${name} ka forecast incomplete hai.`);
              }

              results[index] = {
                status: "fulfilled",
                value: getAlerts(data),
              };
            } catch (requestError) {
              results[index] = {
                status: "rejected",
                reason: requestError,
              };
            }
          }
        })
      );

      const successfulAlerts = results
        .filter((result) => result?.status === "fulfilled")
        .flatMap((result) => result.value);

      const failedCount = results.filter(
        (result) => result?.status === "rejected"
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
    Severe: "#991b1b",
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
          <h2>Smart Weather Alerts & Risk Dashboard</h2>
        </div>

        <span className="section-badge">RULE-BASED</span>
      </div>

      <p className="footnote">
        Dashboard indicators forecast data aur project-defined thresholds par
        based hain. Ye official IMD alerts ya government warnings nahi hain.
        Severe, High, Moderate aur Low labels sirf is project ki classification
        hain.
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
            <option value="Severe">Severe</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </label>

        <button
          type="button"
          onClick={loadAlerts}
          disabled={loading}
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
          }}
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

            {alert.advice && (
              <p
                className="footnote"
                style={{ marginTop: 10, marginBottom: 0 }}
              >
                <strong>Suggested precaution:</strong> {alert.advice}
              </p>
            )}
          </article>
        ))}
      </div>

      <p className="footnote" style={{ marginTop: 16 }}>
        Source: Visual Crossing weather API through the project backend.
        Thresholds are project rules, not official public safety guidance.
      </p>
    </section>
  );
}