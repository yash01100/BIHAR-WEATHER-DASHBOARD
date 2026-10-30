from pathlib import Path
import json
import joblib
import pandas as pd
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
CLASSIFIER_PATH = MODEL_DIR / "rain_classifier.joblib"
REGRESSOR_PATH = MODEL_DIR / "rainfall_regressor.joblib"
METRICS_PATH = MODEL_DIR / "model_metrics.json"
classifier = None
regressor = None
metrics = None
def load_models():
    global classifier, regressor, metrics
    if not CLASSIFIER_PATH.exists() or not REGRESSOR_PATH.exists():
        raise FileNotFoundError("Trained rainfall model files are missing.")
    classifier = joblib.load(CLASSIFIER_PATH)
    regressor = joblib.load(REGRESSOR_PATH)
    with open(METRICS_PATH, "r", encoding="utf-8") as file:
        metrics = json.load(file)
def predict_rainfall(district, temperature_max, temperature_min, humidity, rainfall):
    if classifier is None or regressor is None:
        raise RuntimeError("ML models are not loaded.")
    sample = pd.DataFrame([{
        "district": district,
        "temperature_max": float(temperature_max),
        "temperature_min": float(temperature_min),
        "humidity": float(humidity),
        "rainfall": float(rainfall),
    }])
    probability = float(classifier.predict_proba(sample)[0][1])
    prediction = int(classifier.predict(sample)[0])
    amount = max(0.0, float(regressor.predict(sample)[0]))
    return {
        "rain_probability": round(probability * 100, 2),
        "rain_expected": bool(prediction),
        "conditional_rainfall_mm": round(amount, 2),
    }
