from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
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
        raise HTTPException(status_code=404, detail="District not found. Check /api/districts.")
    now = time.monotonic()
    cached = weather_cache.get(district_name)
    if cached and now - cached["timestamp"] < CACHE_TTL_SECONDS:
        return cached["data"]
    api_key = os.getenv("VISUAL_CROSSING_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Weather API key is not configured on the server.")
    coordinates = DISTRICTS[district_name]
    location = f'{coordinates["latitude"]},{coordinates["longitude"]}'
    url = f"https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{location}"
    params = {
        "key": api_key,
        "unitGroup": "metric",
        "include": "current,days",
        "contentType": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            weather_data = response.json()
    except httpx.HTTPStatusError as exc:
        print(f"Visual Crossing request failed: HTTP {exc.response.status_code}", flush=True)
        if cached:
            return cached["data"]
        if exc.response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="Weather provider rate limit reached. Please try again later.",
                headers={"Retry-After": "300"},
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="Weather provider request failed. Check the API key and account quota.",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        print(f"Visual Crossing request failed: {type(exc).__name__}", flush=True)
        if cached:
            return cached["data"]
        raise HTTPException(status_code=502, detail="Weather provider is temporarily unavailable.") from exc
    current_raw = weather_data.get("currentConditions") or {}
    days_raw = weather_data.get("days") or []
    if not current_raw or not days_raw:
        raise HTTPException(status_code=502, detail="Weather provider returned incomplete weather data.")
    def weather_code(icon):
        icon = (icon or "").lower()
        if "thunder" in icon:
            return 95
        if "snow" in icon:
            return 71
        if "rain" in icon or "showers" in icon:
            return 61
        if "fog" in icon:
            return 45
        if "cloud" in icon:
            return 3 if "overcast" in icon else 2
        return 0
    current = {
        "temperature_2m": current_raw.get("temp"),
        "relative_humidity_2m": current_raw.get("humidity"),
        "apparent_temperature": current_raw.get("feelslike"),
        "is_day": 0 if "night" in (current_raw.get("icon") or "").lower() else 1,
        "precipitation": current_raw.get("precip", 0),
        "weather_code": weather_code(current_raw.get("icon")),
        "wind_speed_10m": current_raw.get("windspeed"),
        "conditions": current_raw.get("conditions"),
        "datetime": current_raw.get("datetime"),
    }
    daily = {
        "time": [day.get("datetime") for day in days_raw],
        "weather_code": [weather_code(day.get("icon")) for day in days_raw],
        "temperature_2m_max": [day.get("tempmax") for day in days_raw],
        "temperature_2m_min": [day.get("tempmin") for day in days_raw],
        "precipitation_probability_max": [day.get("precipprob") for day in days_raw],
    }
    result = {
        "district": district_name,
        "coordinates": coordinates,
        "source": "Visual Crossing",
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
    api_key = os.getenv("VISUAL_CROSSING_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Weather API key is not configured on the server.",
        )
    coordinates = DISTRICTS[district_name]
    location = f'{coordinates["latitude"]},{coordinates["longitude"]}'
    url = (
        "https://weather.visualcrossing.com/"
        f"VisualCrossingWebServices/rest/services/timeline/"
        f"{location}/{start_date.isoformat()}/{end_date.isoformat()}"
    )
    params = {
        "key": api_key,
        "unitGroup": "metric",
        "include": "days",
        "elements": "datetime,tempmax,tempmin,temp,precip,humidity",
        "contentType": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            weather_data = response.json()
    except httpx.HTTPStatusError as exc:
        print(
            f"Historical weather request failed: HTTP {exc.response.status_code}",
            flush=True,
        )
        if exc.response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="Weather provider rate limit reached. Please try again later.",
                headers={"Retry-After": "300"},
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="Historical weather provider request failed. Check API access and quota.",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        print(
            f"Historical weather request failed: {type(exc).__name__}",
            flush=True,
        )
        raise HTTPException(
            status_code=502,
            detail="Historical weather provider is temporarily unavailable.",
        ) from exc
    days = weather_data.get("days") or []
    if not days:
        raise HTTPException(
            status_code=502,
            detail="Historical weather provider returned no daily records.",
        )
    return {
        "district": district_name,
        "source": "Visual Crossing",
        "data_mode": "historical_data",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "record_count": len(days),
        "daily": {
            "time": [day.get("datetime") for day in days],
            "temperature_max": [day.get("tempmax") for day in days],
            "temperature_min": [day.get("tempmin") for day in days],
            "temperature_avg": [day.get("temp") for day in days],
            "rainfall": [day.get("precip") for day in days],
            "humidity": [day.get("humidity") for day in days],
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
        "input_source": "Visual Crossing historical daily data",
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
            "Input data comes from Visual Crossing, so provider differences may affect "
            "results. This is not an official IMD forecast."
        ),
    }
