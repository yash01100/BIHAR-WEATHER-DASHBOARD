import { useState } from "react";
import "./AIWeatherAssistant.css";
const AI_API_BASE = (
  import.meta.env.VITE_AI_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
function AIWeatherAssistant({ district }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(event) {
    event.preventDefault();
    const userQuestion = question.trim();
    if (!userQuestion || loading) return;
    setQuestion("");
    setError("");
    setMessages((previous) => [
      ...previous,
      { role: "user", text: userQuestion },
    ]);
    setLoading(true);
    try {
      const response = await fetch(`${AI_API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          message: userQuestion,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "AI service request failed."
        );
      }
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: data.answer || "AI response unavailable.",
          model: data.model,
          source: data.weather_source,
        },
      ]);
    } catch (err) {
      setError(
        err.message ||
          "AI service se connection nahi ho paya. Backend check karein."
      );
    } finally {
      setLoading(false);
    }
  }
  const suggestions = [
    "Current weather samjhao",
    "Abhi rainfall kitna hai?",
    "Agle 7 din ka forecast batao",
    "Agle 7 din ka temperature trend batao",
    "Agle 7 din mein kis din rain probability sabse zyada hai?",
    "Patna aur Gaya mein kaun thanda hai?",
    "Aaj ke weather ke hisaab se kya precautions lene chahiye?",
  ];
  return (
    <section className="section-block ai-assistant-section" id="ai-assistant">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LOCAL AI WEATHER INTELLIGENCE</p>
          <h2>AI Weather Assistant</h2>
        </div>
        <span className="section-badge">OLLAMA · QWEN 2.5</span>
      </div>
      <div className="ai-assistant-panel">
        <div className="ai-assistant-intro">
          <div className="ai-avatar">AI</div>
          <div>
            <h3>Ask About AI</h3>
            <p>
              Bihar weather data ke baare mein natural language mein
              questions poochhein.
            </p>
          </div>
        </div>
        <div className="ai-suggestions">
          {suggestions.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setQuestion(item)}
              disabled={loading}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="ai-chat-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="ai-empty-state">
              <span>✦</span>
              <p>
                Namaste! Main Bihar Weather Assistant hoon. {district} ke
                current weather ya forecast ke baare mein poochhein.
              </p>
            </div>
          )}
          {messages.map((message, index) => (
            <article
              className={`ai-message ${message.role}`}
              key={`${index}-${message.role}`}
            >
              <strong>
                {message.role === "user" ? "You" : "Weather AI"}
              </strong>
              <p>{message.text}</p>
              {message.role === "assistant" && (
                <small>
                  {message.model || "Local AI"}
                  {message.source ? ` · Weather source: ${message.source}` : ""}
                </small>
              )}
            </article>
          ))}
          {loading && (
            <div className="ai-loading">AI is analysing weather data...</div>
          )}
        </div>
        {error && <p className="ai-error">{error}</p>}
        <form className="ai-chat-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={`Ask something about ${district} weather...`}
            disabled={loading}
            aria-label="Ask a weather question"
          />
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Thinking..." : "Ask AI"}
          </button>
        </form>
        <p className="ai-disclaimer">
          AI responses are based on weather data supplied by the dashboard.
          Missing readings are not treated as zero. This is an educational
          prototype, not an official IMD service or warning system.
        </p>
      </div>
    </section>
  );
}
export default AIWeatherAssistant;
