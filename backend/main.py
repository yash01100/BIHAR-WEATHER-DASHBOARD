from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import time
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
    global provider_retry_after
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
    if now < provider_retry_after:
        if cached:
            return cached["data"]
        raise HTTPException(
            status_code=503,
            detail="Weather provider is temporarily rate-limited. Please try again later.",
            headers={
                "Retry-After": str(max(1, int(provider_retry_after - now)))
            },
        )
    # Avoid repeatedly hitting Open-Meteo after a provider failure.
    cooldown = weather_failures.get(district_name)
    if cooldown and now < cooldown["retry_after"]:
        if cached:
            return cached["data"]
        raise HTTPException(
            status_code=503,
            detail="Weather provider is rate-limiting requests. Please try again in a few minutes.",
            headers={"Retry-After": str(max(1, int(cooldown["retry_after"] - now)))},
        )
    coordinates = DISTRICTS[district_name]
    params = {
        **coordinates,
        "current": (
            "temperature_2m,relative_humidity_2m,"
            "apparent_temperature,is_day,precipitation,"
            "weather_code,wind_speed_10m"
        ),
        "daily": (
            "weather_code,temperature_2m_max,temperature_2m_min,"
            "precipitation_probability_max"
        ),
        "timezone": "Asia/Kolkata",
        "forecast_days": 5,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params=params,
            )
            response.raise_for_status()
            weather_data = response.json()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        print(
            f"Open-Meteo request failed: HTTP {status_code}: {exc}",
            flush=True,
        )
        if status_code == 429:
            provider_retry_after = time.monotonic() + 300
            weather_failures[district_name] = {
                "retry_after": time.monotonic() + 300,
            }
            if cached:
                return cached["data"]
            raise HTTPException(
                status_code=503,
                detail="Weather provider is rate-limiting requests. Please try again in a few minutes.",
                headers={"Retry-After": "300"},
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="Weather provider is temporarily unavailable. Please try again.",
        ) from exc
    except httpx.HTTPError as exc:
        print(
            f"Open-Meteo request failed: {type(exc).__name__}: {exc}",
            flush=True,
        )
        weather_failures[district_name] = {
            "retry_after": time.monotonic() + 60,
        }
        if cached:
            return cached["data"]
        raise HTTPException(
            status_code=502,
            detail="Weather provider is temporarily unavailable. Please try again.",
        ) from exc
    result = {
        "district": district_name,
        "coordinates": coordinates,
        "source": "Open-Meteo",
        "data_mode": "live_api",
        "current": weather_data.get("current"),
        "daily": weather_data.get("daily"),
    }
    weather_cache[district_name] = {
        "timestamp": time.monotonic(),
        "data": result,
    }
    weather_failures.pop(district_name, None)
    return result

