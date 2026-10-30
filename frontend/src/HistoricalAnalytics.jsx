import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://bihar-weather-api.onrender.com"
).replace(/\/$/, "");
function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function HistoricalAnalytics({ district }) {
  const today = new Date();
  const defaultEnd = new Date(today);
  defaultEnd.setDate(today.getDate() - 1);
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 6);
  const [startDate, setStartDate] = useState(getDateString(defaultStart));
  const [endDate, setEndDate] = useState(getDateString(defaultEnd));
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function fetchHistory() {
    if (!startDate || !endDate) {
      setError("Please select both dates.");
      return;
    }
    if (startDate > endDate) {
      setError("Start date cannot be after end date.");
      return;
    }
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const days = Math.round((end - start) / 86400000) + 1;
    if (days > 31) {
      setError("Maximum date range is 31 days.");
      return;
    }
    if (end >= new Date(getDateString(today) + "T00:00:00")) {
      setError("Select dates before today for historical records.");
      return;
    }
    setLoading(true);
    setError("");
    setHistory(null);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });
      const response = await fetch(
        `${API_BASE}/api/history/${encodeURIComponent(district)}?${params}`
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.detail || `Historical API request failed: ${response.status}`
        );
      }
      const result = await response.json();
      if (!result.daily || !result.daily.time?.length) {
        throw new Error("Historical records are not available.");
      }
      const chartData = result.daily.time.map((date, index) => ({
        date,
        label: new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        max: result.daily.temperature_max[index],
        min: result.daily.temperature_min[index],
        average: result.daily.temperature_avg[index],
        rainfall: result.daily.rainfall[index],
        humidity: result.daily.humidity[index],
      }));
      setHistory({
        ...result,
        chartData,
      });
    } catch (err) {
      setError(err.message || "Unable to load historical weather data.");
    } finally {
      setLoading(false);
    }
  }
  function exportCSV() {
    if (!history?.chartData?.length) return;
    const headers = [
      "Date",
      "Maximum Temperature (C)",
      "Minimum Temperature (C)",
      "Average Temperature (C)",
      "Rainfall (mm)",
      "Humidity (%)",
    ];
    const escapeCSV = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = history.chartData.map((day) => [
      day.date,
      day.max,
      day.min,
      day.average,
      day.rainfall,
      day.humidity,
    ]);
    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${district}-weather-history-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function exportPDF() {
    if (!history?.chartData?.length) return;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const columns = [
      { title: "Date", x: 14 },
      { title: "Max Temp (C)", x: 49 },
      { title: "Min Temp (C)", x: 88 },
      { title: "Avg Temp (C)", x: 127 },
      { title: "Rainfall (mm)", x: 166 },
      { title: "Humidity (%)", x: 210 },
    ];
    function drawPageHeader() {
      doc.setFontSize(19);
      doc.setFont("helvetica", "bold");
      doc.text("Bihar Weather Intelligence Dashboard", 14, 17);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Historical Weather Report - ${district}`, 14, 26);
      doc.text(`Period: ${startDate} to ${endDate}`, 14, 33);
      doc.text(`Data Provider: ${history.source}`, 14, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      columns.forEach((column) => {
        doc.text(column.title, column.x, 53);
      });
      doc.setLineWidth(0.4);
      doc.line(14, 57, pageWidth - 14, 57);
    }
    drawPageHeader();
    let y = 65;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    history.chartData.forEach((day) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        drawPageHeader();
        y = 65;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }
      const values = [
        day.date,
        String(day.max ?? "N/A"),
        String(day.min ?? "N/A"),
        String(day.average ?? "N/A"),
        String(day.rainfall ?? "N/A"),
        String(day.humidity ?? "N/A"),
      ];
      values.forEach((value, index) => {
        doc.text(value, columns[index].x, y);
      });
      y += 9;
    });
    doc.setFontSize(8);
    doc.text(
      "Historical recorded weather values. This report is not an official IMD publication or forecast.",
      14,
      pageHeight - 9
    );
    doc.save(
      `${district}-weather-report-${startDate}-to-${endDate}.pdf`
    );
  }
  useEffect(() => {
    fetchHistory();
  }, [district]);
  const chartCard = {
    background: "#101817",
    border: "1px solid #29413d",
    borderRadius: "16px",
    padding: "18px",
    minWidth: 0,
  };
  const chartStyle = {
    width: "100%",
    height: 280,
    marginTop: 12,
  };
  return (
    <section
      className="section-block"
      id="analytics"
      style={{ marginTop: 32 }}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">WEATHER DATA ANALYSIS</p>
          <h2>Historical Weather Analytics</h2>
          <p className="subtitle">
            Explore recorded temperature, rainfall and humidity for {district}.
          </p>
        </div>
        <span className="section-badge">HISTORICAL DATA</span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "end",
          gap: 14,
          padding: 18,
          borderRadius: 14,
          background: "#101817",
          border: "1px solid #29413d",
          marginBottom: 20,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span>Start date</span>
          <input
            type="date"
            value={startDate}
            max={getDateString(defaultEnd)}
            onChange={(event) => setStartDate(event.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #3b514d", background: "#080e0d", color: "#f1f7f5", colorScheme: "dark" }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>End date</span>
          <input
            type="date"
            value={endDate}
            max={getDateString(defaultEnd)}
            onChange={(event) => setEndDate(event.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #3b514d", background: "#080e0d", color: "#f1f7f5", colorScheme: "dark" }}
          />
        </label>
        <button
          type="button"
          onClick={exportCSV}
          disabled={!history || loading}
          style={{
            padding: "11px 20px",
            border: 0,
            borderRadius: 8,
            cursor: !history || loading ? "not-allowed" : "pointer",
            background: "#15803d",
            color: "#ffffff",
            fontWeight: 600,
            opacity: !history || loading ? 0.5 : 1,
          }}
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={exportPDF}
          disabled={!history || loading}
          style={{
            padding: "11px 20px",
            border: 0,
            borderRadius: 8,
            cursor: !history || loading ? "not-allowed" : "pointer",
            background: "#b91c1c",
            color: "#ffffff",
            fontWeight: 600,
            opacity: !history || loading ? 0.5 : 1,
          }}
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          style={{
            padding: "11px 20px",
            border: 0,
            borderRadius: 8,
            cursor: loading ? "wait" : "pointer",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 600,
          }}
        >
          {loading ? "Loading..." : "Load Historical Data"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          style={{
            padding: 14,
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
          }}
        >
          {error}
        </p>
      )}
      {loading && <p>Fetching historical records for {district}...</p>}
      {history && !loading && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div style={{ ...chartCard, color: "#f1f7f5" }}>
              <strong>{history.record_count}</strong>
              <p>Daily records</p>
            </div>
            <div style={{ ...chartCard, color: "#f1f7f5" }}>
              <strong>{history.source}</strong>
              <p>Data provider</p>
            </div>
            <div style={{ ...chartCard, color: "#f1f7f5" }}>
              <strong>{history.start_date} – {history.end_date}</strong>
              <p>Selected period</p>
            </div>
          </div>
          <div style={{ ...chartCard, color: "#f1f7f5" }}>
            <h3 style={{ color: "#f1f7f5" }}>Temperature Trend (°C)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={history.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#344640" />
                <XAxis dataKey="label" stroke="#a6b8b1" tick={{ fill: "#c4d2cd", fontSize: 12 }} />
                <YAxis stroke="#a6b8b1" tick={{ fill: "#c4d2cd", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#101817", border: "1px solid #45635b", borderRadius: 8, color: "#f1f7f5" }} labelStyle={{ color: "#f1f7f5" }} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="max"
                  name="Maximum"
                  stroke="#ef4444"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="min"
                  name="Minimum"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="average"
                  name="Average"
                  stroke="#16a34a"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: 18,
              marginTop: 18,
            }}
          >
            <div style={{ ...chartCard, color: "#f1f7f5" }}>
              <h3 style={{ color: "#f1f7f5" }}>Daily Rainfall (mm)</h3>
              <ResponsiveContainer width="100%" height={chartStyle.height}>
                <BarChart data={history.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#344640" />
                  <XAxis dataKey="label" stroke="#a6b8b1" tick={{ fill: "#c4d2cd", fontSize: 12 }} />
                  <YAxis stroke="#a6b8b1" tick={{ fill: "#c4d2cd", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "#101817", border: "1px solid #45635b", borderRadius: 8, color: "#f1f7f5" }} labelStyle={{ color: "#f1f7f5" }} />
                  <Bar dataKey="rainfall" name="Rainfall" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...chartCard, color: "#f1f7f5" }}>
              <h3 style={{ color: "#f1f7f5" }}>Daily Humidity (%)</h3>
              <ResponsiveContainer width="100%" height={chartStyle.height}>
                <LineChart data={history.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#344640" />
                  <XAxis dataKey="label" stroke="#a6b8b1" tick={{ fill: "#c4d2cd", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#101817", border: "1px solid #45635b", borderRadius: 8, color: "#f1f7f5" }} labelStyle={{ color: "#f1f7f5" }} />
                  <Line
                    type="monotone"
                    dataKey="humidity"
                    name="Humidity"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="footnote" style={{ marginTop: 16 }}>
            Historical observations supplied by {history.source}. These are
            recorded past weather values, not forecasts or official IMD alerts.
          </p>
        </>
      )}
    </section>
  );
}
export default HistoricalAnalytics;



