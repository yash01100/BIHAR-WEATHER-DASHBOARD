import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
const API_BASE = "http://127.0.0.1:8000";
export default function WeatherComparison() {
  const [districts, setDistricts] = useState([]);
  const [selected, setSelected] = useState(["Patna", "Gaya", "Bhagalpur"]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function loadDistricts() {
      try {
        const response = await fetch(`${API_BASE}/api/districts`);
        if (!response.ok) throw new Error("District list load nahi hui.");
        const data = await response.json();
        if (!cancelled) {
          const names = data.districts || [];
          setDistricts(names);
          setSelected((previous) => {
            const valid = previous.filter((name) => names.includes(name));
            return valid.length ? valid : names.slice(0, 3);
          });
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    loadDistricts();
    return () => {
      cancelled = true;
    };
  }, []);
  async function loadComparison(names = selected) {
    if (!names.length) {
      setError("Kam se kam ek district select karo.");
      setChartData([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        names.map(async (name) => {
          const response = await fetch(
            `${API_BASE}/api/weather/${encodeURIComponent(name)}`
          );
          if (!response.ok) {
            throw new Error(`${name} ka weather fetch nahi hua.`);
          }
          const data = await response.json();
          if (!data.current) throw new Error(`${name} ka data incomplete hai.`);
          return {
            district: name,
            temperature: Number(data.current.temperature_2m),
          };
        })
      );
      setChartData(results);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err.message || "Comparison data load nahi hua.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!districts.length) return;
    const validSelected = selected.filter((name) => districts.includes(name));
    if (!validSelected.length) return;
    const timer = window.setTimeout(() => loadComparison(validSelected), 0);
    return () => window.clearTimeout(timer);
  }, [selected, districts]);
  function toggleDistrict(name) {
    setSelected((previous) => {
      if (previous.includes(name)) {
        return previous.filter((item) => item !== name);
      }
      if (previous.length >= 8) {
        setError("Maximum 8 districts select kar sakte ho.");
        return previous;
      }
      return [...previous, name];
    });
  }
  return (
    <section className="section-block" id="comparison" style={{ marginTop: 28 }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">DISTRICT ANALYTICS</p>
          <h2>Temperature Comparison</h2>
        </div>
        <span className="section-badge">LIVE API</span>
      </div>
      <p className="footnote">
        Bihar ke districts select karo aur unka current temperature Celsius mein compare karo.
        Maximum 8 districts select kar sakte ho.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 10,
          margin: "18px 0",
        }}
      >
        {districts.map((name) => (
          <label
            key={name}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "10px 12px",
              border: "1px solid var(--border-color, #dbe3ec)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => toggleDistrict(name)}
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => loadComparison()}
          disabled={loading || selected.length === 0}
          style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}
        >
          {loading ? "Loading..." : "Refresh Comparison"}
        </button>
        <span className="footnote">
          {selected.length} district(s) selected
          {updatedAt
            ? ` · Updated ${updatedAt.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                    hourCycle: "h23",
                minute: "2-digit",
              })}`
            : ""}
        </span>
      </div>
      {error && <p role="alert" style={{ marginTop: 12 }}>{error}</p>}
      {loading && <p>Comparison data load ho raha hai...</p>}
      {!loading && !error && chartData.length > 0 && (
        <div style={{ width: "100%", height: 340, marginTop: 18 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 12, right: 16, left: 0, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="district"
                angle={-20}
                textAnchor="end"
                interval={0}
                height={65}
              />
              <YAxis unit="°C" domain={["auto", "auto"]} />
              <Tooltip formatter={(value) => [`${value}°C`, "Temperature"]} />
              <Bar
                dataKey="temperature"
                name="Temperature"
                fill="#38bdf8"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="footnote">
        Source: Open-Meteo API. Values provider ke latest available weather data par based hain.
      </p>
    </section>
  );
}
