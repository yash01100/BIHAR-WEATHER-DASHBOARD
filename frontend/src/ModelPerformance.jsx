import { useEffect, useState } from "react";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://bihar-weather-api.onrender.com"
).replace(/\/$/, "");
function MetricCard({ title, value, description, icon }) {
  return (
    <article className="metric-card model-metric-card">
      <span className="model-metric-icon">{icon}</span>
      <p>{title}</p>
      <h3>{value}</h3>
      <small>{description}</small>
    </article>
  );
}
export default function ModelPerformance() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function fetchMetrics() {
      try {
        const response = await fetch(
          `${API_BASE}/api/model/metrics`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Metrics API error: ${response.status}`);
        }
        const data = await response.json();
        if (!controller.signal.aborted) {
          setMetrics(data);
        }
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) {
          setError(err.message || "Model metrics load nahi ho paaye.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchMetrics();
    return () => controller.abort();
  }, []);
  if (loading) {
    return (
      <section className="prediction-panel">
        <h2>ML Model Performance</h2>
        <p className="prediction-status">Loading model evaluation metrics...</p>
      </section>
    );
  }
  if (error || !metrics) {
    return (
      <section className="prediction-panel">
        <h2>ML Model Performance</h2>
        <p className="prediction-status" role="alert">
          {error || "Model metrics unavailable."}
        </p>
      </section>
    );
  }
  return (
    <section className="prediction-panel model-performance-panel" id="model-performance">
      <div className="prediction-header">
        <div>
          <p className="eyebrow">MODEL EVALUATION / HISTORICAL TEST</p>
          <h2>ML Model Performance</h2>
          <p>Rainfall prediction model evaluation results</p>
        </div>
        <span className="prediction-icon">ML</span>
      </div>
      <div className="prediction-metrics model-performance-grid">
        <MetricCard
          icon="ACC"
          title="Classification Accuracy"
          value={`${(metrics.classifier_accuracy * 100).toFixed(2)}%`}
          description="Correct classification rate"
        />
        <MetricCard
          icon="PRE"
          title="Precision"
          value={`${(metrics.classifier_precision * 100).toFixed(2)}%`}
          description="Correct positive predictions"
        />
        <MetricCard
          icon="REC"
          title="Recall"
          value={`${(metrics.classifier_recall * 100).toFixed(2)}%`}
          description="Actual rainy days identified"
        />
        <MetricCard
          icon="F1"
          title="F1 Score"
          value={`${(metrics.classifier_f1 * 100).toFixed(2)}%`}
          description="Balance of precision and recall"
        />
        <MetricCard
          icon="MAE"
          title="Mean Absolute Error (MAE)"
          value={`${metrics.regressor_mae.toFixed(2)} mm`}
          description="Mean absolute error on rainy test days"
        />
        <MetricCard
          icon="RMSE"
          title="Root Mean Squared Error (RMSE)"
          value={`${metrics.regressor_rmse.toFixed(2)} mm`}
          description="Root mean squared error on rainy test days"
        />
      </div>
      <div className="model-evaluation-details">
        <p><strong>Training period:</strong> {metrics.training_period}</p>
        <p><strong>Testing period:</strong> {metrics.testing_period}</p>
        <p><strong>Districts:</strong> {metrics.districts}</p>
        <p><strong>Training rows:</strong> {metrics.training_rows.toLocaleString("en-IN")}</p>
        <p><strong>Testing rows:</strong> {metrics.testing_rows.toLocaleString("en-IN")}</p>
        <p><strong>Data source:</strong> {metrics.data_source}</p>
      </div>
      <p className="prediction-disclaimer">
        Historical test-set evaluation, not live forecast accuracy.{" "} 
        {metrics.model_note}
      </p>
    </section>
  );
}
