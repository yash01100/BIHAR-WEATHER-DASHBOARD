import time
from pathlib import Path
import httpx
import pandas as pd
DISTRICTS = {
    "Araria": (26.1490, 87.5130),
    "Arwal": (25.2490, 84.6960),
    "Aurangabad": (24.7520, 84.3740),
    "Banka": (24.8870, 86.9190),
    "Begusarai": (25.4180, 86.1280),
    "Bhagalpur": (25.2425, 86.9842),
    "Bhojpur": (25.5560, 84.6600),
    "Buxar": (25.5640, 83.9780),
    "Darbhanga": (26.1542, 85.8918),
    "East Champaran": (26.6470, 84.8720),
    "Gaya": (24.7914, 85.0002),
    "Gopalganj": (26.4670, 84.4400),
    "Jamui": (24.9260, 86.2250),
    "Jehanabad": (25.2130, 84.9870),
    "Kaimur": (25.0400, 83.6100),
    "Katihar": (25.5390, 87.5710),
    "Khagaria": (25.5030, 86.4680),
    "Kishanganj": (26.1030, 87.9550),
    "Lakhisarai": (25.1680, 86.0940),
    "Madhepura": (25.9220, 86.7920),
    "Madhubani": (26.3530, 86.0710),
    "Munger": (25.3750, 86.4730),
    "Muzaffarpur": (26.1209, 85.3647),
    "Nalanda": (25.1982, 85.5230),
    "Nawada": (24.8870, 85.5430),
    "Patna": (25.5941, 85.1376),
    "Purnia": (25.7771, 87.4753),
    "Rohtas": (24.9500, 84.0300),
    "Saharsa": (25.8830, 86.6000),
    "Samastipur": (25.8620, 85.7810),
    "Saran": (25.7840, 84.7270),
    "Sheikhpura": (25.1390, 85.8400),
    "Sheohar": (26.5150, 85.2940),
    "Sitamarhi": (26.5940, 85.4900),
    "Siwan": (26.2200, 84.3560),
    "Supaul": (26.1260, 86.6050),
    "Vaishali": (25.6850, 85.2180),
    "West Champaran": (26.8020, 84.5160),
}
BASE_DIR = Path(__file__).resolve().parent
CSV_FILE = BASE_DIR / "data" / "bihar_weather_history.csv"
API_URL = "https://archive-api.open-meteo.com/v1/archive"
def main():
    existing = pd.read_csv(CSV_FILE)
    completed = set(existing["district"].unique())
    missing = {
        name: coords
        for name, coords in DISTRICTS.items()
        if name not in completed
    }
    print("Existing districts:", len(completed))
    print("Districts to retry:", len(missing))
    if not missing:
        print("All districts already collected.")
        return
    new_frames = []
    with httpx.Client(timeout=90) as client:
        for index, (district, coords) in enumerate(missing.items(), 1):
            latitude, longitude = coords
            params = {
                "latitude": latitude,
                "longitude": longitude,
                "start_date": "2021-01-01",
                "end_date": "2025-12-31",
                "daily": (
                    "temperature_2m_max,"
                    "temperature_2m_min,"
                    "precipitation_sum,"
                    "relative_humidity_2m_mean"
                ),
                "timezone": "Asia/Kolkata",
            }
            success = False
            for attempt in range(1, 4):
                try:
                    response = client.get(API_URL, params=params)
                    if response.status_code == 429:
                        wait = 60 * attempt
                        print(
                            f"{district}: Rate limited. Waiting {wait}s "
                            f"(attempt {attempt}/3)"
                        )
                        time.sleep(wait)
                        continue
                    response.raise_for_status()
                    daily = response.json()["daily"]
                    frame = pd.DataFrame({
                        "date": daily["time"],
                        "district": district,
                        "temperature_max": daily["temperature_2m_max"],
                        "temperature_min": daily["temperature_2m_min"],
                        "rainfall": daily["precipitation_sum"],
                        "humidity": daily["relative_humidity_2m_mean"],
                    })
                    new_frames.append(frame)
                    print(
                        f"[{index}/{len(missing)}] {district}: "
                        f"{len(frame)} records collected"
                    )
                    success = True
                    break
                except (httpx.HTTPError, ValueError, KeyError) as error:
                    print(f"{district}: attempt {attempt} failed: {error}")
                    time.sleep(30 * attempt)
            if not success:
                print(f"{district}: Still pending")
            time.sleep(20)
    if new_frames:
        new_data = pd.concat(new_frames, ignore_index=True)
        combined = pd.concat([existing, new_data], ignore_index=True)
        combined = combined.drop_duplicates(
            subset=["district", "date"]
        )
        combined = combined.sort_values(
            ["district", "date"]
        ).reset_index(drop=True)
        combined.to_csv(CSV_FILE, index=False)
    final = pd.read_csv(CSV_FILE)
    print("-" * 50)
    print("Total records:", len(final))
    print("Districts collected:", final["district"].nunique())
    print("Pending districts:", sorted(set(DISTRICTS) - set(final["district"].unique())))
    print("Dataset saved:", CSV_FILE)
if __name__ == "__main__":
    main()
