from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pathlib import Path as FilePath
from dotenv import load_dotenv
import time

load_dotenv(FilePath(__file__).with_name(".env"))
app = FastAPI(
    title="Bihar Weather Intelligence API",
    description="Live weather data for all 38 Bihar districts",
    version="2.0.0",
)

# In-memory weather cache
CACHE_TTL_SECONDS = 300
weather_cache = {}
weather_failures = {}
provider_retry_after = 0.0
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://bihar-weather-dashboard.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Approximate coordinates of district headquarters/cities.
DISTRICTS = {
    "Araria": {"latitude": 26.1490, "longitude": 87.5130},
    "Arwal": {"latitude": 25.2490, "longitude": 84.6960},
    "Aurangabad": {"latitude": 24.7520, "longitude": 84.3740},
    "Banka": {"latitude": 24.8870, "longitude": 86.9190},
    "Begusarai": {"latitude": 25.4180, "longitude": 86.1280},
    "Bhagalpur": {"latitude": 25.2425, "longitude": 86.9842},
    "Bhojpur": {"latitude": 25.5560, "longitude": 84.6600},
    "Buxar": {"latitude": 25.5640, "longitude": 83.9780},
    "Darbhanga": {"latitude": 26.1542, "longitude": 85.8918},
    "East Champaran": {"latitude": 26.6470, "longitude": 84.8720},
    "Gaya": {"latitude": 24.7914, "longitude": 85.0002},
    "Gopalganj": {"latitude": 26.4670, "longitude": 84.4400},
    "Jamui": {"latitude": 24.9260, "longitude": 86.2250},
    "Jehanabad": {"latitude": 25.2130, "longitude": 84.9870},
    "Kaimur": {"latitude": 25.0400, "longitude": 83.6100},
    "Katihar": {"latitude": 25.5390, "longitude": 87.5710},
    "Khagaria": {"latitude": 25.5030, "longitude": 86.4680},
    "Kishanganj": {"latitude": 26.1030, "longitude": 87.9550},
    "Lakhisarai": {"latitude": 25.1680, "longitude": 86.0940},
    "Madhepura": {"latitude": 25.9220, "longitude": 86.7920},
    "Madhubani": {"latitude": 26.3530, "longitude": 86.0710},
    "Munger": {"latitude": 25.3750, "longitude": 86.4730},
    "Muzaffarpur": {"latitude": 26.1209, "longitude": 85.3647},
    "Nalanda": {"latitude": 25.1982, "longitude": 85.5230},
    "Nawada": {"latitude": 24.8870, "longitude": 85.5430},
    "Patna": {"latitude": 25.5941, "longitude": 85.1376},
    "Purnia": {"latitude": 25.7771, "longitude": 87.4753},
    "Rohtas": {"latitude": 24.9500, "longitude": 84.0300},
    "Saharsa": {"latitude": 25.8830, "longitude": 86.6000},
    "Samastipur": {"latitude": 25.8620, "longitude": 85.7810},
    "Saran": {"latitude": 25.7840, "longitude": 84.7270},
    "Sheikhpura": {"latitude": 25.1390, "longitude": 85.8400},
    "Sheohar": {"latitude": 26.5150, "longitude": 85.2940},
    "Sitamarhi": {"latitude": 26.5940, "longitude": 85.4900},
    "Siwan": {"latitude": 26.2200, "longitude": 84.3560},
    "Supaul": {"latitude": 26.1260, "longitude": 86.6050},
    "Vaishali": {"latitude": 25.6850, "longitude": 85.2180},
    "West Champaran": {"latitude": 26.8020, "longitude": 84.5160},
}
@app.get("/")
def home():
    return {
        "message": "Bihar Weather Intelligence API is running!",
        "status": "success",
        "data_mode": "live_api",
        "district_count": len(DISTRICTS),
    }
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "bihar-weather-backend",
        "district_count": len(DISTRICTS),
    }
@app.get("/api/districts")
def get_districts():
    return {"districts": list(DISTRICTS.keys())}
@app.get("/api/coordinates/{district}")
def get_district_coordinates(district: str):
    district_name = next(
        (
            name
            for name in DISTRICTS
            if name.casefold() == district.casefold()
        ),
        None,
    )
    if district_name is None:
        raise HTTPException(
            status_code=404,
            detail="District not found. Check /api/districts.",
        )
    return {
        "district": district_name,
        "coordinates": DISTRICTS[district_name],
    }
@app.get("/api/weather/{district}")
async def get_weather(district: str):
    district_name = next(
        (name for name in DISTRICTS if name.casefold() == district.casefold()),
        None,
    )
    if district_name is None:
        raise HTTPException(
            status_code=404,
            detail="District not found. Check /api/districts.",
        )
    now = time.monotonic()
    cached = weather_cache.get(district_name)
    if cached and now - cached["timestamp"] < CACHE_TTL_SECONDS:
        return cached["data"]
    coordinates = DISTRICTS[district_name]
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": coordinates["latitude"],
        "longitude": coordinates["longitude"],
        "current": (
            "temperature_2m,relative_humidity_2m,"
            "apparent_temperature,is_day,precipitation,"
            "weather_code,wind_speed_10m"
        ),
        "daily": (
            "weather_code,temperature_2m_max,"
            "temperature_2m_min,precipitation_probability_max"
        ),
        "timezone": "Asia/Kolkata",
        "forecast_days": 7,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            weather_data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        print(
            f"Open-Meteo weather request failed: {type(exc).__name__}",
            flush=True,
        )
        if cached:
            return cached["data"]
        raise HTTPException(
            status_code=502,
            detail="Weather provider is temporarily unavailable.",
        ) from exc
    current_raw = weather_data.get("current") or {}
    daily_raw = weather_data.get("daily") or {}
    if not current_raw or not daily_raw:
        raise HTTPException(
            status_code=502,
            detail="Weather provider returned incomplete weather data.",
        )
    weather_descriptions = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Slight snow",
        73: "Moderate snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Thunderstorm with heavy hail",
    }
    weather_code_value = current_raw.get("weather_code")
    current = {
        "temperature_2m": current_raw.get("temperature_2m"),
        "relative_humidity_2m": current_raw.get("relative_humidity_2m"),
        "apparent_temperature": current_raw.get("apparent_temperature"),
        "is_day": current_raw.get("is_day"),
        "precipitation": current_raw.get("precipitation", 0),
        "weather_code": weather_code_value,
        "wind_speed_10m": current_raw.get("wind_speed_10m"),
        "conditions": weather_descriptions.get(
            weather_code_value, "Unknown"
        ),
        "datetime": current_raw.get("time"),
    }
    daily = {
        "time": daily_raw.get("time", []),
        "weather_code": daily_raw.get("weather_code", []),
        "temperature_2m_max": daily_raw.get("temperature_2m_max", []),
        "temperature_2m_min": daily_raw.get("temperature_2m_min", []),
        "precipitation_probability_max": daily_raw.get(
            "precipitation_probability_max", []
        ),
    }
    result = {
        "district": district_name,
        "coordinates": coordinates,
        "source": "Open-Meteo",
        "data_mode": "live_api",
        "current": current,
        "daily": daily,
    }
    weather_cache[district_name] = {
        "timestamp": time.monotonic(),
        "data": result,
    }
    weather_failures.pop(district_name, None)
    return result
from datetime import date
@app.get("/api/history/{district}")
async def get_historical_weather(
    district: str,
    start_date: date,
    end_date: date,
):
    district_name = next(
        (name for name in DISTRICTS if name.casefold() == district.casefold()),
        None,
    )
    if district_name is None:
        raise HTTPException(
            status_code=404,
            detail="District not found. Check /api/districts.",
        )
    if start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date.",
        )
    date_range = (end_date - start_date).days + 1
    if date_range > 31:
        raise HTTPException(
            status_code=400,
            detail="Maximum historical date range is 31 days.",
        )
    coordinates = DISTRICTS[district_name]
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": coordinates["latitude"],
        "longitude": coordinates["longitude"],
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": (
            "temperature_2m_max,temperature_2m_min,"
            "temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean"
        ),
        "timezone": "Asia/Kolkata",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            weather_data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        print(
            f"Open-Meteo historical request failed: {type(exc).__name__}",
            flush=True,
        )
        raise HTTPException(
            status_code=502,
            detail="Historical weather provider is temporarily unavailable.",
        ) from exc
    daily_raw = weather_data.get("daily") or {}
    days = daily_raw.get("time") or []
    if not days:
        raise HTTPException(
            status_code=502,
            detail="Historical weather provider returned no daily records.",
        )
    return {
        "district": district_name,
        "source": "Open-Meteo Historical Archive",
        "data_mode": "historical_data",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "record_count": len(days),
        "daily": {
            "time": days,
            "temperature_max": daily_raw.get("temperature_2m_max", []),
            "temperature_min": daily_raw.get("temperature_2m_min", []),
            "temperature_avg": daily_raw.get("temperature_2m_mean", []),
            "rainfall": daily_raw.get("precipitation_sum", []),
            "humidity": daily_raw.get("relative_humidity_2m_mean", []),
        },
    }
from pathlib import Path as FilePath
import json
MODEL_METRICS_PATH = (
    FilePath(__file__).parent / "ml" / "models" / "model_metrics.json"
)
@app.get("/api/model/metrics")
async def get_model_metrics():
    try:
        with open(MODEL_METRICS_PATH, "r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model metrics file not found."
        )
    except (json.JSONDecodeError, OSError):
        raise HTTPException(
            status_code=500,
            detail="Unable to read model metrics."
        )
from ml.predict import load_models, predict_rainfall
@app.get("/api/prediction/rainfall/{district}")
async def predict_next_day_rainfall(district: str):
    district_name = next(
        (name for name in DISTRICTS if name.casefold() == district.casefold()),
        None,
    )
    if district_name is None:
        raise HTTPException(status_code=404, detail="District not found.")
    # Use the most recently completed day, not instantaneous current conditions.
    from datetime import date, timedelta
    prediction_date = date.today() - timedelta(days=1)
    try:
        historical = await get_historical_weather(
            district=district_name,
            start_date=prediction_date,
            end_date=prediction_date,
        )
    except HTTPException:
        raise
    daily = historical.get("daily", {})
    required = {
        "temperature_max": daily.get("temperature_max", []),
        "temperature_min": daily.get("temperature_min", []),
        "humidity": daily.get("humidity", []),
        "rainfall": daily.get("rainfall", []),
    }
    if any(not values or values[0] is None for values in required.values()):
        raise HTTPException(
            status_code=502,
            detail="Latest completed daily weather record is incomplete.",
        )
    try:
        from ml.predict import classifier
        if classifier is None:
            load_models()
        prediction = predict_rainfall(
            district=district_name,
            temperature_max=required["temperature_max"][0],
            temperature_min=required["temperature_min"][0],
            humidity=required["humidity"][0],
            rainfall=required["rainfall"][0],
        )
    except Exception as exc:
        print(f"ML prediction failed: {type(exc).__name__}", flush=True)
        raise HTTPException(
            status_code=503,
            detail="Rainfall prediction model is temporarily unavailable.",
        ) from exc
    return {
        "district": district_name,
        "prediction_for": (prediction_date + timedelta(days=1)).isoformat(),
        "input_date": prediction_date.isoformat(),
        "input_source": "Open-Meteo Historical Archive",
        "training_source": "Open-Meteo Historical Archive",
        "data_mode": "experimental_ml_estimate",
        **prediction,
        "model_metrics": {
            "classifier_accuracy": 0.8837,
            "classifier_f1": 0.8714,
            "regressor_mae_mm": 6.7342,
        },
        "disclaimer": (
            "Experimental ML estimate based on historical archive training data. "
            "Input data comes from Open-Meteo Historical Archive. "
            "This is not an official IMD forecast."
        ),
    }
