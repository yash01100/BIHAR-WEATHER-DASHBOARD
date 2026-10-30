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
OUTPUT_DIR = BASE_DIR / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / "bihar_weather_history.csv"
START_DATE = "2021-01-01"
END_DATE = "2025-12-31"
API_URL = "https://archive-api.open-meteo.com/v1/archive"
def collect_district(client, district, coordinates):
    latitude, longitude = coordinates
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": (
            "temperature_2m_max,"
            "temperature_2m_min,"
            "precipitation_sum,"
            "relative_humidity_2m_mean"
        ),
        "timezone": "Asia/Kolkata",
    }
    response = client.get(API_URL, params=params, timeout=90)
    response.raise_for_status()
    daily = response.json().get("daily", {})
    return pd.DataFrame({
        "date": daily.get("time", []),
        "district": district,
        "temperature_max": daily.get("temperature_2m_max", []),
        "temperature_min": daily.get("temperature_2m_min", []),
        "rainfall": daily.get("precipitation_sum", []),
        "humidity": daily.get("relative_humidity_2m_mean", []),
    })
def main():
    all_frames = []
    print("Bihar Weather Dataset Collection Started")
    print(f"Districts: {len(DISTRICTS)}")
    print(f"Period: {START_DATE} to {END_DATE}")
    print("-" * 50)
    with httpx.Client() as client:
        for index, (district, coordinates) in enumerate(
            DISTRICTS.items(), start=1
        ):
            try:
                frame = collect_district(client, district, coordinates)
                if frame.empty:
                    print(f"[{index}/38] {district}: No records")
                    continue
                all_frames.append(frame)
                print(f"[{index}/38] {district}: {len(frame)} records collected")
            except (httpx.HTTPError, ValueError, KeyError) as error:
                print(f"[{index}/38] {district}: FAILED - {error}")
            time.sleep(1)
    if not all_frames:
        print("No data collected. Dataset was not saved.")
        return
    dataset = pd.concat(all_frames, ignore_index=True)
    dataset["date"] = pd.to_datetime(dataset["date"], errors="coerce")
    numeric_columns = [
        "temperature_max", "temperature_min", "rainfall", "humidity"
    ]
    for column in numeric_columns:
        dataset[column] = pd.to_numeric(dataset[column], errors="coerce")
    dataset = dataset.dropna(subset=["date", "district", "rainfall"])
    dataset = dataset.sort_values(["district", "date"]).reset_index(drop=True)
    dataset.to_csv(OUTPUT_FILE, index=False)
    print("-" * 50)
    print("Dataset collection completed!")
    print(f"Total records: {len(dataset)}")
    print(f"Districts collected: {dataset['district'].nunique()}")
    print(f"Missing values:\n{dataset.isnull().sum()}")
    print(f"Saved at: {OUTPUT_FILE}")
if __name__ == "__main__":
    main()
