from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pathlib import Path as FilePath
from dotenv import load_dotenv
import time
import os
import asyncio
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

load_dotenv(FilePath(__file__).with_name(".env"))
app = FastAPI(
    title="Bihar Weather Intelligence API",
    description="Live weather data for all 38 Bihar districts",
    version="2.0.0",
)

# In-memory weather cache
CACHE_TTL_SECONDS = 21600  # 6 hours
HISTORY_CACHE_TTL_SECONDS = 86400  # 24 hours
VISUAL_CROSSING_API_KEY = os.getenv("VISUAL_CROSSING_API_KEY")
weather_cache = {}
history_cache = {}
weather_failures = {}
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

def _weather_code_from_vc(day_or_current):
    """Convert Visual Crossing conditions/icons to WMO-style codes used by the UI."""
    icon = (day_or_current.get("icon") or "").lower()
    conditions = (day_or_current.get("conditions") or "").lower()
    if "thunder" in icon or "thunder" in conditions:
        return 95
    if "snow" in icon or "snow" in conditions:
        return 71
    if "fog" in icon or "fog" in conditions:
        return 45
    if "rain" in icon or "drizzle" in icon or "rain" in conditions:
        return 61
    if "cloud" in icon or "overcast" in conditions:
        return 3 if "overcast" in conditions else 2
    if "partly" in icon:
        return 2
    return 0


def _visual_crossing_day(day):
    return {
        "weather_code": _weather_code_from_vc(day),
        "temperature_2m_max": day.get("tempmax"),
        "temperature_2m_min": day.get("tempmin"),
        "precipitation_probability_max": day.get("precipprob"),
    }


def _visual_crossing_current(current):
    code = _weather_code_from_vc(current)
    descriptions = {
        0: "Clear sky", 2: "Partly cloudy", 3: "Overcast", 45: "Fog",
        61: "Rain", 71: "Snow", 95: "Thunderstorm",
    }
    return {
        "temperature_2m": current.get("temp"),
        "relative_humidity_2m": current.get("humidity"),
        "apparent_temperature": current.get("feelslike"),
        "is_day": None,
        "precipitation": current.get("precip"),
        "weather_code": code,
        "wind_speed_10m": current.get("windspeed"),
        "conditions": current.get("conditions") or descriptions.get(code, "Unknown"),
        "datetime": current.get("datetime"),
    }


async def _fetch_visual_crossing(district_name, start_date=None, end_date=None):
    if not VISUAL_CROSSING_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Visual Crossing API key is not configured on the backend.",
        )
    coordinates = DISTRICTS[district_name]
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    start = start_date or today
    end = end_date or (today + timedelta(days=7))
    location = f'{coordinates["latitude"]},{coordinates["longitude"]}'
    url = (
        "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/"
        f"services/timeline/{location}/{start.isoformat()}/{end.isoformat()}"
    )
    params = {
        "unitGroup": "metric",
        "include": "current,days",
        "key": VISUAL_CROSSING_API_KEY,
        "contentType": "json",
        "timezone": "Asia/Kolkata",
    }
    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        print(f"Visual Crossing request failed for {district_name}: {type(exc).__name__}, status={status}", flush=True)
        raise HTTPException(
            status_code=502,
            detail="Visual Crossing weather service is temporarily unavailable.",
        ) from exc

    days = payload.get("days") or []
    if not days:
        raise HTTPException(status_code=502, detail="Visual Crossing returned no daily weather records.")

    if start_date is not None:
        return {
            "district": district_name,
            "source": "Visual Crossing Historical Timeline",
            "data_mode": "historical_data",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
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

    current_raw = payload.get("currentConditions") or days[0]
    return {
        "district": district_name,
        "coordinates": coordinates,
        "source": "Visual Crossing",
        "data_mode": "live_api",
        "current": _visual_crossing_current(current_raw),
        "daily": {
            "time": [day.get("datetime") for day in days],
            "weather_code": [_visual_crossing_day(day)["weather_code"] for day in days],
            "temperature_2m_max": [day.get("tempmax") for day in days],
            "temperature_2m_min": [day.get("tempmin") for day in days],
            "precipitation_probability_max": [day.get("precipprob") for day in days],
        },
    }


@app.get("/api/weather/bulk")
async def get_bulk_weather():
    """Fetch cached weather for all 38 districts, with limited provider concurrency."""
    now = time.monotonic()
    district_names = list(DISTRICTS.keys())
    results = {}
    missing = []
    for name in district_names:
        cached = weather_cache.get(name)
        if cached and now - cached["timestamp"] < CACHE_TTL_SECONDS:
            results[name] = cached["data"]
        else:
            missing.append(name)

    semaphore = asyncio.Semaphore(5)

    async def fetch_one(name):
        async with semaphore:
            try:
                result = await _fetch_visual_crossing(name)
                weather_cache[name] = {"timestamp": time.monotonic(), "data": result}
                return name, result, None
            except HTTPException as exc:
                return name, None, exc.detail

    fetched = await asyncio.gather(*(fetch_one(name) for name in missing))
    unavailable = []
    for name, result, error in fetched:
        if result is not None:
            results[name] = result
        else:
            unavailable.append(name)

    if not results and unavailable:
        raise HTTPException(status_code=502, detail="Weather data is temporarily unavailable for all districts.")
    return {
        "districts": results,
        "data_mode": "live_api" if not unavailable else ("partial" if results else "unavailable"),
        "unavailable": unavailable,
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

    try:
        result = await _fetch_visual_crossing(district_name)
    except HTTPException:
        if cached:
            return cached["data"]
        raise

    weather_cache[district_name] = {"timestamp": time.monotonic(), "data": result}
    return result


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
        raise HTTPException(status_code=404, detail="District not found. Check /api/districts.")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date.")
    date_range = (end_date - start_date).days + 1
    if date_range > 31:
        raise HTTPException(status_code=400, detail="Maximum historical date range is 31 days.")

    cache_key = (district_name, start_date.isoformat(), end_date.isoformat())
    cached = history_cache.get(cache_key)
    if cached and time.monotonic() - cached["timestamp"] < HISTORY_CACHE_TTL_SECONDS:
        return cached["data"]

    result = await _fetch_visual_crossing(district_name, start_date, end_date)
    history_cache[cache_key] = {"timestamp": time.monotonic(), "data": result}
    return result


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
        "input_source": "Visual Crossing Historical Timeline",
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
            "Input data comes from Visual Crossing; the model was trained on Open-Meteo data. "
            "This is not an official IMD forecast."
        ),
    }
# ============================================================
# LOCAL AI WEATHER ASSISTANT
# Uses local Ollama model and existing weather API data.
# ============================================================
from pydantic import BaseModel, Field
class AIWeatherChatRequest(BaseModel):
    district: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=500)
@app.post("/api/ai/chat")
async def ai_weather_chat(request: AIWeatherChatRequest):
    district_name = next(
        (
            name for name in DISTRICTS
            if name.casefold() == request.district.strip().casefold()
        ),
        None,
    )
    if district_name is None:
        raise HTTPException(
            status_code=404,
            detail="District not found. Check /api/districts.",
        )
    question = request.message.strip()
    if not question:
        raise HTTPException(
            status_code=400,
            detail="Please enter a question.",
        )
    # Deterministic comparison between two Bihar districts.
    import re
    comparison_match = re.search(
        r"\b(compare|comparison|compare karo|compare kar|ke comparison mein|kis district|which district|kaun sa district|kaunsa district|kaun|kahan|zyada|jyada|kam|higher|lower|hotter|colder|cooler|warmer|thanda|thandi|thande|garam|garmi|thand|humidity|humid|nami|wind|hawa|pawan|breeze)\b",
        question,
        re.IGNORECASE,
    )
    if comparison_match:
        district_matches = []
        for name in DISTRICTS:
            match = re.search(
                r"(?<!\w)" + re.escape(name) + r"(?!\w)",
                question,
                re.IGNORECASE,
            )
            if match:
                district_matches.append((match.start(), name))
        mentioned_districts = [
            name for _, name in sorted(district_matches)
        ]
        if len(mentioned_districts) >= 2:
            first_district = mentioned_districts[0]
            second_district = mentioned_districts[1]
            first_data, second_data = await asyncio.gather(
                get_weather(first_district),
                get_weather(second_district),
            )
            first_current = first_data.get("current") or {}
            second_current = second_data.get("current") or {}
            forecast_requested = bool(re.search(
                r"\b(tomorrow|kal|next day|agle din|forecast|next-day)\b",
                question,
                re.IGNORECASE,
            ))
            if forecast_requested:
                first_daily = first_data.get("daily") or {}
                second_daily = second_data.get("daily") or {}
                first_dates = first_daily.get("time") or []
                second_dates = second_daily.get("time") or []
                today_text = datetime.now(
                    ZoneInfo("Asia/Kolkata")
                ).date().isoformat()
                next_index = next(
                    (
                        i for i, date_text in enumerate(first_dates)
                        if date_text > today_text
                    ),
                    None,
                )
                def comparison_daily_value(daily, key, index):
                    values = daily.get(key)
                    if isinstance(values, list) and index < len(values):
                        return values[index]
                    return None
                if (
                    next_index is not None
                    and next_index < len(second_dates)
                ):
                    first_max = comparison_daily_value(
                        first_daily, "temperature_2m_max", next_index
                    )
                    second_max = comparison_daily_value(
                        second_daily, "temperature_2m_max", next_index
                    )
                    first_min = comparison_daily_value(
                        first_daily, "temperature_2m_min", next_index
                    )
                    second_min = comparison_daily_value(
                        second_daily, "temperature_2m_min", next_index
                    )
                    forecast_date = first_dates[next_index]
                    answer_lines = [
                        f"Next-day forecast comparison ({forecast_date}):"
                    ]
                    if all(
                        isinstance(v, (int, float))
                        for v in [first_max, second_max]
                    ):
                        answer_lines.extend([
                            f"Maximum temperature:",
                            f"{first_district}: {first_max:.1f}°C",
                            f"{second_district}: {second_max:.1f}°C",
                            f"Maximum temperature difference: {abs(first_max - second_max):.1f}°C",
                        ])
                        if first_max > second_max:
                            answer_lines.append(
                                f"{first_district} ka maximum temperature zyada rahega."
                            )
                        elif second_max > first_max:
                            answer_lines.append(
                                f"{second_district} ka maximum temperature zyada rahega."
                            )
                        else:
                            answer_lines.append(
                                "Dono districts ka maximum temperature barabar rahega."
                            )
                    else:
                        answer_lines.append(
                            "Maximum temperature forecast unavailable hai."
                        )
                    if all(
                        isinstance(v, (int, float))
                        for v in [first_min, second_min]
                    ):
                        answer_lines.extend([
                            "Minimum temperature:",
                            f"{first_district}: {first_min:.1f}°C",
                            f"{second_district}: {second_min:.1f}°C",
                            f"Minimum temperature difference: {abs(first_min - second_min):.1f}°C",
                        ])
                    else:
                        answer_lines.append(
                            "Minimum temperature forecast unavailable hai."
                        )
                    answer = "\n".join(answer_lines)
                else:
                    answer = (
                        "Next-day forecast comparison unavailable hai. "
                        "Dono districts ki forecast dates verify nahi ho paayi."
                    )
            else:
                temperature_question = bool(re.search(
                    r"temperature|temp|degree|degrees|hot|hotter|cold|colder|cool|cooler|warm|warmer|garmi|garam|thand|thanda|thandi|thande|taapman|tapman",
                    question,
                    re.IGNORECASE,
                ))
                humidity_question = bool(re.search(
                    r"\b(humidity|humid|moisture|nami|chipchipa|chipchipahat)\b",
                    question,
                    re.IGNORECASE,
                ))
                wind_question = bool(re.search(
                    r"wind|breeze|windy|hawa|pawan|vaayu|tez hawa",
                    question,
                    re.IGNORECASE,
                ))
                if humidity_question:
                    field = "relative_humidity_2m"
                    label = "humidity"
                    unit = "%"
                    difference_unit = "percentage points"
                elif wind_question:
                    field = "wind_speed_10m"
                    label = "wind speed"
                    unit = "km/h"
                    difference_unit = "km/h"
                else:
                    field = "temperature_2m"
                    label = "temperature"
                    unit = "°C"
                    difference_unit = "°C"
                first_value = first_current.get(field)
                second_value = second_current.get(field)
                if (
                    isinstance(first_value, (int, float))
                    and isinstance(second_value, (int, float))
                ):
                    difference = abs(first_value - second_value)
                    if first_value > second_value:
                        if field == "temperature_2m":
                            result_text = (
                                f"{second_district}, {first_district} se "
                                f"{difference:.1f}\u00b0C thanda hai."
                            )
                        elif field == "relative_humidity_2m":
                            result_text = (
                                f"{first_district} mein humidity "
                                f"{second_district} se "
                                f"{difference:.1f} percentage points zyada hai."
                            )
                        else:
                            result_text = (
                                f"{first_district} mein hawa ki speed "
                                f"{second_district} se {difference:.1f} km/h zyada hai."
                            )
                    elif second_value > first_value:
                        if field == "temperature_2m":
                            result_text = (
                                f"{first_district}, {second_district} se "
                                f"{difference:.1f}\u00b0C thanda hai."
                            )
                        elif field == "relative_humidity_2m":
                            result_text = (
                                f"{second_district} mein humidity "
                                f"{first_district} se "
                                f"{difference:.1f} percentage points zyada hai."
                            )
                        else:
                            result_text = (
                                f"{second_district} mein hawa ki speed "
                                f"{first_district} se {difference:.1f} km/h zyada hai."
                            )
                    else:
                        result_text = (
                            f"Dono districts mein {label} barabar hai."
                        )
                    answer = (
                        f"{first_district}: {first_value:.1f}{unit}\n"
                        f"{second_district}: {second_value:.1f}{unit}\n"
                        f"Difference: {difference:.1f} {difference_unit}\n"
                        f"{result_text}"
                    )
                else:
                    answer = (
                        f"{label.capitalize()} comparison unavailable hai. "
                        "Ek ya dono districts ki reading API se available nahi hai."
                    )
            return {
                "district": district_name,
                "answer": answer,
                "model": "Backend Comparison Logic",
                "weather_source": first_data.get("source", "Unknown"),
                "data_mode": first_data.get("data_mode", "Unknown"),
                "forecast_days_available": 1 if forecast_requested else 0,
            }    # Get actual weather from the existing weather API function.
    weather_data = await get_weather(district_name)
    current = weather_data.get("current") or {}
    daily = weather_data.get("daily") or {}
    dates = daily.get("time") or []
    def daily_value(key, index):
        values = daily.get(key)
        if isinstance(values, list) and index < len(values):
            return values[index]
        return None
    forecast = []
    for index, forecast_date in enumerate(dates[1:8], start=1):
        forecast.append({
            "date": forecast_date,
            "weather_code": daily_value("weather_code", index),
            "maximum_temperature_c": daily_value(
                "temperature_2m_max", index
            ),
            "minimum_temperature_c": daily_value(
                "temperature_2m_min", index
            ),
            "precipitation_probability_percent": daily_value(
                "precipitation_probability_max", index
            ),
        })

    # Deterministic forecast trend analysis using verified provider data.
    trend_requested = bool(re.search(
        r"\b(trend|pattern|increase|increasing|decrease|decreasing|rise|rising|fall|falling|badhega|badhegi|badhta|ghatega|ghategi|kam hoga|sabse zyada|sabse kam|highest|lowest|maximum|minimum)\b|rain\s*(chance|probability)|rainfall\s*(chance|probability)|precipitation\s*(chance|probability)|baarish.*(chance|probability)|temperature.*(trend|change)",
        question,
        re.IGNORECASE,
    ))
    if trend_requested:
        question_lower = question.lower()
        rain_focus = bool(re.search(
            r"\b(rain|rainfall|precipitation|baarish|barish)\b",
            question_lower,
        ))
        temperature_focus = bool(re.search(
            r"\b(temp|temperature|garmi|thand)\b",
            question_lower,
        ))
        general_trend = bool(re.search(
            r"\b(trend|pattern)\b",
            question_lower,
        ))
        rain_only = rain_focus and not temperature_focus and not general_trend
        temperature_only = temperature_focus and not rain_focus
        def get_trend_points(key):
            values = daily.get(key)
            points = []
            if isinstance(values, list):
                for index in range(1, min(len(dates), 8)):
                    value = values[index] if index < len(values) else None
                    if (
                        isinstance(value, (int, float))
                        and not isinstance(value, bool)
                    ):
                        points.append((dates[index], float(value)))
            return points
        def describe_trend(points, label, unit):
            if len(points) < 2:
                return (
                    f"{label}: trend calculate karne ke liye "
                    "sufficient forecast readings available nahi hain."
                )
            first_date, first_value = points[0]
            last_date, last_value = points[-1]
            difference = last_value - first_value
            if difference > 0.05:
                direction = "badh raha hai"
            elif difference < -0.05:
                direction = "ghat raha hai"
            else:
                direction = "lagbhag stable hai"
            return (
                f"{label}: {first_value:.1f}{unit} ({first_date}) "
                f"se {last_value:.1f}{unit} ({last_date}) tak "
                f"{direction}. Difference: {abs(difference):.1f}{unit}."
            )
        max_points = get_trend_points("temperature_2m_max")
        min_points = get_trend_points("temperature_2m_min")
        rain_points = get_trend_points("precipitation_probability_max")
        if rain_only:
            answer_lines = [
                f"{district_name} ka agle 7 din ka rain probability analysis "
                f"({len(forecast)} available forecast days):"
            ]
        elif temperature_only:
            answer_lines = [
                f"{district_name} ka agle 7 din ka temperature analysis "
                f"({len(forecast)} available forecast days):"
            ]
        else:
            answer_lines = [
                f"{district_name} ka forecast trend analysis "
                f"({len(forecast)} available forecast days):"
            ]
        if not rain_only:
            answer_lines.append(
                describe_trend(max_points, "Maximum temperature", "\u00b0C")
            )
            answer_lines.append(
                describe_trend(min_points, "Minimum temperature", "\u00b0C")
            )
            if max_points:
                hottest_date, hottest_value = max(
                    max_points, key=lambda point: point[1]
                )
                answer_lines.append(
                    f"Highest forecast maximum temperature: "
                    f"{hottest_value:.1f}\u00b0C on {hottest_date}."
                )
            else:
                answer_lines.append(
                    "Maximum temperature forecast unavailable hai."
                )
        if not temperature_only:
            if rain_points:
                highest_probability = max(
                    value for _, value in rain_points
                )
                highest_dates = [
                    date
                    for date, value in rain_points
                    if abs(value - highest_probability) < 1e-9
                ]
                if len(highest_dates) == 1:
                    date_text = f"on {highest_dates[0]}"
                else:
                    date_text = (
                        "on all tied dates: " + ", ".join(highest_dates)
                    )
                answer_lines.append(
                    f"Highest forecast rain probability: "
                    f"{highest_probability:.1f}% {date_text}. "
                    "Yeh probability hai, guaranteed rainfall nahi."
                )
            else:
                answer_lines.append(
                    "Rain probability forecast unavailable hai."
                )
        answer = "\n".join(answer_lines)
        return {
            "district": district_name,
            "answer": answer,
            "model": "Backend Forecast Trend Analysis",
            "weather_source": weather_data.get("source", "Unknown"),
            "data_mode": weather_data.get("data_mode", "Unknown"),
            "forecast_days_available": len(forecast),
            "analysis_type": "forecast_trend",
        }
    # Deterministic 7-day forecast response (no local Ollama required).
    forecast_question = bool(re.search(
        r"\b(forecast|7[- ]day)\b|agle\s+(?:7|saat)\s+din|next\s+7\s+days",
        question,
        re.IGNORECASE,
    ))
    if forecast_question:
        answer_lines = [
            f"{district_name} ka agle 7 din ka weather forecast:"
        ]
        if not forecast:
            answer_lines.append(
                "Abhi 7-day forecast readings available nahi hain."
            )
        for index, day in enumerate(forecast, start=1):
            parts = [f"{index}. {day['date']}"]
            maximum = day.get("maximum_temperature_c")
            minimum = day.get("minimum_temperature_c")
            rain = day.get("precipitation_probability_percent")
            if isinstance(maximum, (int, float)):
                parts.append(f"Max: {maximum:.1f}°C")
            else:
                parts.append("Max temperature unavailable")
            if isinstance(minimum, (int, float)):
                parts.append(f"Min: {minimum:.1f}°C")
            else:
                parts.append("Min temperature unavailable")
            if isinstance(rain, (int, float)):
                parts.append(f"Rain probability: {rain:.1f}%")
            else:
                parts.append("Rain probability unavailable")
            answer_lines.append(" | ".join(parts))
        answer_lines.append(
            "Note: Rain probability possibility batati hai, "
            "guaranteed rainfall nahi."
        )
        return {
            "district": district_name,
            "answer": "\n".join(answer_lines),
            "model": "Backend 7-Day Forecast",
            "weather_source": weather_data.get("source", "Unknown"),
            "data_mode": weather_data.get("data_mode", "Unknown"),
            "forecast_days_available": len(forecast),
            "analysis_type": "seven_day_forecast",
        }
    # Deterministic current-weather summary from verified API readings.
    current_weather_requested = bool(re.search(
        r"\b(current weather|current conditions|weather right now|weather now|"
        r"weather samjhao|mausam samjhao|abhi ka mausam|aaj ka mausam|"
        r"mausam kaisa|abhi weather|current mausam)\b",
        question,
        re.IGNORECASE,
    ))
    question_lower = question.casefold()
    special_request = any(
        term in question_lower
        for term in (
            "rain", "rainfall", "precipitation", "baarish", "barish",
            "precaution", "precautions", "safety",
        )
    ) or any(term in question for term in ("???????", "????"))
    if current_weather_requested and not special_request:
        points = []
        temperature = current.get("temperature_2m")
        feels_like = current.get("apparent_temperature")
        humidity = current.get("relative_humidity_2m")
        wind = current.get("wind_speed_10m")
        conditions = current.get("conditions")
        precipitation = current.get("precipitation")
        valid_number = lambda value: (
            isinstance(value, (int, float)) and not isinstance(value, bool)
        )
        if valid_number(temperature):
            temperature_text = f"{temperature:.1f}\u00b0C"
            if valid_number(feels_like):
                temperature_text += f" (feels like {feels_like:.1f}\u00b0C)"
            points.append(f"Temperature: {temperature_text}.")
        else:
            points.append("Current temperature reading unavailable hai.")
        if valid_number(humidity):
            points.append(f"Humidity: {humidity:.1f}%.")
        else:
            points.append("Humidity reading unavailable hai.")
        if valid_number(wind):
            points.append(f"Wind speed: {wind:.1f} km/h.")
        else:
            points.append("Wind speed reading unavailable hai.")
        if isinstance(conditions, str) and conditions.strip():
            points.append(f"Weather condition: {conditions.strip()}.")
        else:
            points.append("Weather condition reading unavailable hai.")
        if precipitation is None:
            points.append(
                "Current rainfall reading unavailable hai; "
                "iska matlab zero rainfall nahi hai."
            )
        elif valid_number(precipitation):
            points.append(f"Current precipitation: {precipitation:.1f} mm.")
        answer = (
            f"{district_name} ka current weather, available API readings ke basis par:\n- "
            + "\n- ".join(points)
        )
        return {
            "district": district_name,
            "answer": answer,
            "model": "Backend Current Weather Summary",
            "weather_source": weather_data.get("source", "Unknown"),
            "data_mode": weather_data.get("data_mode", "Unknown"),
            "forecast_days_available": len(forecast),
        }
    # Deterministic current rainfall response (no local Ollama required).
    if re.search(
        r"\b(rain|rainfall|precipitation|baarish|barish)\b",
        question,
        re.IGNORECASE,
    ):
        precipitation = current.get("precipitation")
        if (
            isinstance(precipitation, (int, float))
            and not isinstance(precipitation, bool)
        ):
            answer = (
                f"{district_name} ke liye available current precipitation "
                f"reading {precipitation:.2f} mm hai."
            )
        else:
            answer = (
                f"{district_name} ke liye current rainfall reading "
                "available nahi hai. API ne rainfall value provide nahi ki; "
                "iska matlab zero rainfall nahi hai."
            )
        return {
            "district": district_name,
            "answer": answer,
            "model": "Backend Current Rainfall Summary",
            "weather_source": weather_data.get("source", "Unknown"),
            "data_mode": weather_data.get("data_mode", "Unknown"),
            "forecast_days_available": len(forecast),
        }
    # Deterministic weather precautions response (no local Ollama required).
    if re.search(
        r"\b(precaution|precautions|safety|savdhani|bachav|suraksha)\b",
        question,
        re.IGNORECASE,
    ):
        precaution_points = []
        temperature = current.get("temperature_2m")
        humidity = current.get("relative_humidity_2m")
        wind = current.get("wind_speed_10m")
        conditions = current.get("conditions")
        precipitation = current.get("precipitation")
        if isinstance(temperature, (int, float)) and not isinstance(temperature, bool):
            precaution_points.append(
                f"Current temperature {temperature:.1f}°C hai. "
                "Outdoor activity ke dauran hydration maintain karein."
            )
        if isinstance(humidity, (int, float)) and not isinstance(humidity, bool):
            precaution_points.append(
                f"Humidity {humidity:.1f}% hai. "
                "Comfort ke liye breathable clothes pehnein."
            )
        if isinstance(wind, (int, float)) and not isinstance(wind, bool):
            precaution_points.append(
                f"Wind speed {wind:.1f} km/h record hui hai."
            )
        if isinstance(conditions, str) and conditions.strip():
            if conditions.casefold() == "clear":
                precaution_points.append(
                    "Sky clear hai. Bahar jaate waqt sunglasses ya sun protection "
                    "general precaution ke roop mein use kar sakte hain."
                )
            else:
                precaution_points.append(
                    f"Recorded weather condition: {conditions}."
                )
        if precipitation is None:
            precaution_points.append(
                "Rainfall reading unavailable hai. Is data se baarish "
                "hone ya na hone ki confirmation nahi hoti."
            )
        elif isinstance(precipitation, (int, float)) and not isinstance(precipitation, bool):
            precaution_points.append(
                f"Available precipitation reading: {precipitation:.2f} mm."
            )
        precaution_points.append(
            "Visibility reading unavailable hai. Driving ke waqt actual "
            "road conditions dekhein aur normal traffic rules follow karein."
        )
        answer = (
            "Available current weather data ke basis par:\n- "
            + "\n- ".join(precaution_points)
        )
        return {
            "district": district_name,
            "answer": answer,
            "model": "Backend Weather Precautions",
            "weather_source": weather_data.get("source", "Unknown"),
            "data_mode": weather_data.get("data_mode", "Unknown"),
            "forecast_days_available": len(forecast),
        }
    # Send only verified weather fields to AI.
    current_context = {
        "temperature_c": current.get("temperature_2m"),
        "feels_like_c": current.get("apparent_temperature"),
        "relative_humidity_percent": current.get("relative_humidity_2m"),
        "wind_speed_kmh": current.get("wind_speed_10m"),
        "precipitation_mm": ("Unavailable - API returned no value" if current.get("precipitation") is None else current.get("precipitation")),
        "conditions": current.get("conditions"),
        "observation_time": current.get("datetime"),
    }
    weather_context = {
        "district": district_name,
        "weather_source": weather_data.get("source", "Unknown"),
        "data_mode": weather_data.get("data_mode", "Unknown"),
        "current_weather": current_context,
        "forecast_next_days": forecast,
    }
    system_prompt = """
You are Bihar Weather Assistant for an educational weather dashboard.
Answer in simple, natural Hindi/Hinglish. Be accurate, practical and cautious.
STRICT DATA RULES:
1. Use only weather values present in the supplied JSON.
2. Never guess, calculate or invent missing weather readings.
3. Never interpret null, missing or unavailable data as zero.
4. Current temperature and feels-like temperature are in Celsius.
5. Relative humidity is in percent.
6. Wind speed is in kilometres per hour.
7. Precipitation is in millimetres.
8. If precipitation is unavailable, explicitly say rainfall reading is unavailable.
9. Unavailable rainfall does NOT mean there is no rain.
10. Never advise that an umbrella or raincoat is unnecessary when rainfall data is unavailable.
11. Visibility data is unavailable. Never claim visibility is clear, safe or unsafe.
12. Do not make driving or road-safety claims based on unavailable visibility data.
13. Do not invent day/night information, weather alerts or official warnings.
14. Never call this dashboard an official IMD product.
PRECAUTION RULES:
15. Give practical precautions only when supported by available weather data.
16. For clear conditions, sunglasses or sun protection may be suggested as general advice, not as a guarantee of UV conditions.
17. For humidity, breathable clothing and hydration can be suggested.
18. For wind, give proportionate advice; do not suggest loose clothes or sudden-movement restrictions merely because wind is present.
19. If a relevant reading is unavailable, say that no data-based conclusion can be made.
20. Never turn missing information into reassurance or a warning.
FORECAST RULES:
21. Use only dates and values in forecast_next_days.
22. Do not invent forecast dates, temperatures or rainfall probabilities.
23. Write dates in a readable format such as 9 November 2026.
24. Clearly distinguish maximum and minimum temperatures.
25. If a forecast field is unavailable, say so instead of guessing.
RESPONSE STYLE:
26. Use natural, concise Hindi/Hinglish.
27. Do not repeat values or sentences.
28. For simple questions, answer in 1-3 sentences.
29. For current weather explanations, use at most 5 short bullets.
30. For precautions, use short actionable bullets and mention relevant unavailable data.
31. Always include units with numerical values.
32. For unrelated questions, politely explain your weather-assistant purpose.
"""
    ollama_payload = {
        "model": "qwen2.5:1.5b",
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": (
                    "WEATHER DATA (JSON):\n"
                    + json.dumps(weather_context, ensure_ascii=False)
                    + "\n\nUSER QUESTION:\n"
                    + question
                ),
            },
        ],
        "options": {
            "temperature": 0.1,
            "top_p": 0.8,
            "num_predict": 180,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "http://127.0.0.1:11434/api/chat",
                json=ollama_payload,
            )
            response.raise_for_status()
            result = response.json()
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=503,
            detail="Local AI service unavailable. Please start Ollama.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="AI response timed out. Please try again.",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="AI service returned an invalid response.",
        ) from exc
    answer = (
        result.get("message", {}).get("content", "")
        if isinstance(result, dict)
        else ""
    )
    # Prevent AI from interpreting missing precipitation as zero rainfall.
    if current.get("precipitation") is None:
        import re
        answer = re.sub(
            r"\b(no rainfall|no rain|no precipitation|zero rainfall|zero precipitation)\b",
            "rainfall data is unavailable",
            answer,
            flags=re.IGNORECASE,
        )
    if (
        current.get("precipitation") is None
        and re.search(r"\b(rain|rainfall|precipitation|baarish|barish)\b", question, re.IGNORECASE)
    ):
        answer = (
            f"{district_name} ke liye current rainfall reading "
            "available nahi hai. API ne rainfall value provide nahi ki."
        )
    # Deterministic precautions: do not rely on small-model free-form output.
    if re.search(
        r"\b(precaution|precautions|safety|सावधानी|बचाव)\b",
        question,
        re.IGNORECASE,
    ):
        precaution_points = []
        temperature = current.get("temperature_2m")
        humidity = current.get("relative_humidity_2m")
        wind = current.get("wind_speed_10m")
        conditions = current.get("conditions")
        precipitation = current.get("precipitation")
        if isinstance(temperature, (int, float)):
            precaution_points.append(
                f"Current temperature {temperature:.1f}°C hai. "
                "Outdoor activity ke dauran hydration maintain karein."
            )
        if isinstance(humidity, (int, float)):
            precaution_points.append(
                f"Humidity {humidity:.1f}% hai. "
                "Comfort ke liye breathable clothes pehnein."
            )
        if isinstance(wind, (int, float)):
            precaution_points.append(
                f"Wind speed {wind:.1f} km/h record hui hai."
            )
        if isinstance(conditions, str) and conditions.strip():
            if conditions.casefold() == "clear":
                precaution_points.append(
                    "Sky clear hai. Bahar jaate waqt sunglasses use kar sakte hain."
                )
            else:
                precaution_points.append(
                    f"Recorded weather condition: {conditions}."
                )
        if precipitation is None:
            precaution_points.append(
                "Rainfall reading unavailable hai. Is data se yeh confirm "
                "nahi hota ki baarish hogi ya nahi."
            )
        elif isinstance(precipitation, (int, float)):
            precaution_points.append(
                f"Available precipitation reading: {precipitation} mm."
            )
        precaution_points.append(
            "Visibility reading unavailable hai. Driving ke waqt "
            "actual road conditions dekhein aur normal traffic rules follow karein."
        )
        answer = (
            "Aaj ke available weather data ke basis par:\n- "
            + "\n- ".join(precaution_points)
        )
    if not answer.strip():
        raise HTTPException(
            status_code=502,
            detail="AI could not generate a response.",
        )
    return {
        "district": district_name,
        "answer": answer.strip(),
        "model": "qwen2.5:1.5b",
        "weather_source": weather_data.get("source", "Unknown"),
        "data_mode": weather_data.get("data_mode", "Unknown"),
        "forecast_days_available": len(forecast),
    }
