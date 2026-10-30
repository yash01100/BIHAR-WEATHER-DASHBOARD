import { useCallback, useEffect, useState } from "react";
import { fetchWeather } from "./weatherApi";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./WeatherMaps.css";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://bihar-weather-api.onrender.com"
).replace(/\/$/, "");
const DARK_TILES =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
function readTemperature(data) {
  const value =
    data?.current?.temperature_2m ??
    data?.current_weather?.temperature ??
    data?.temperature_2m ??
    data?.temperature ??
    data?.current?.temperature;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function readCoordinates(data) {
  const coords = data?.coordinates ?? data?.location ?? {};
  const lat = Number(
    coords.latitude ?? coords.lat ?? data?.latitude ?? data?.lat
  );
  const lon = Number(
    coords.longitude ?? coords.lon ?? coords.lng ??
      data?.longitude ?? data?.lon
  );
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 23 && lat <= 28 &&
    lon >= 80 && lon <= 89
  ) {
    return [lat, lon];
  }
  return null;
}
function weatherEmoji(code) {
  if (code == null) return "???";
  if (code === 0) return "??";
  if ([1, 2].includes(code)) return "???";
  if (code === 3) return "??";
  if ([45, 48].includes(code)) return "???";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "???";
  if ([95, 96, 99].includes(code)) return "??";
  return "???";
}
function readWeatherCode(data) {
  const value =
    data?.current?.weather_code ??
    data?.current?.weathercode ??
    data?.current_weather?.weathercode ??
    data?.weather_code;
  return value == null ? null : Number(value);
}
function MapResize() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}
function MapFocus({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.coords, 9, { duration: 0.8 });
    }
  }, [map, target]);
  return null;
}
function DistrictWeatherMap({ districts, loading, error }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const matches = districts
    .filter((district) =>
      district.name.toLowerCase().includes(search.trim().toLowerCase())
    )
    .slice(0, 8);
  function chooseDistrict(district) {
    setSelected(district.name);
    setSearch(district.name);
    setSearchOpen(false);
  }
  return (
    <div className="weather-map-canvas">
      <div className="weather-map-search">
        <span aria-hidden="true">×</span>
        <input
          type="search"
          value={search}
          placeholder="Search Bihar district..."
          aria-label="Search Bihar district"
          onFocus={() => setSearchOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setSearchOpen(true);
            setSelected(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearchOpen(false);
            if (event.key === "Enter" && matches.length > 0) {
              chooseDistrict(matches[0]);
            }
          }}
        />
        {search && (
          <button
            type="button"
            className="weather-map-search-clear"
            aria-label="Clear district search"
            onClick={() => {
              setSearch("");
              setSelected(null);
              setSearchOpen(true);
            }}
          >
            ×
          </button>
        )}
        {searchOpen && search.trim() && (
          <div className="weather-map-search-results">
            {matches.length > 0 ? (
              matches.map((district) => (
                <button
                  type="button"
                  key={district.name}
                  onClick={() => chooseDistrict(district)}
                >
                  <span>{district.name}</span>
                  <small>
                    {district.temp == null
                      ? "Weather unavailable"
                      : `${district.temp.toFixed(1)}°C`}
                  </small>
                </button>
              ))
            ) : (
              <div className="weather-map-search-empty">
                {loading ? "Loading districts..." : "No matching district found"}
              </div>
            )}
          </div>
        )}
      </div>
      <MapContainer
        center={[25.8, 85.5]}
        zoom={7}
        minZoom={5}
        maxZoom={12}
        scrollWheelZoom
        className="weather-leaflet-map"
      >
        <MapResize />
        <MapFocus target={districts.find((district) => district.name === selected)} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={DARK_TILES}
          className="weather-base-tiles"
          subdomains="abc"
          maxZoom={20}
        />
        {districts.map((district) => (
          <CircleMarker
            key={district.name}
            center={district.coords}
            radius={district.name === selected ? 13 : 10}
            pathOptions={{
              color: district.name === selected ? "#ffffff" : "#071c19",
              weight: district.name === selected ? 4 : 3,
              fillColor: district.name === selected ? "#ffffff" : "#45ffe0",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="weather-map-popup">
                <strong>{district.name}</strong>
                <div className="weather-map-popup-temp">
                  {weatherEmoji(district.code)}{" "}
                  {district.temp == null
                    ? "Temperature unavailable"
                    : `${district.temp.toFixed(1)}°C`}
                </div>
                <small>
                  {district.temp == null
                    ? "Weather details unavailable"
                    : "Current temperature from the dashboard API"}
                </small>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {loading && (
        <div className="weather-map-status">Loading district weather...</div>
      )}
      {!loading && districts.length === 0 && (
        <div className="weather-map-status">
          {error || "District locations could not be loaded."}
        </div>
      )}
      {!loading && districts.length > 0 && (
        <div className="weather-map-count">
          {districts.length} district locations loaded
        </div>
      )}
    </div>
  );
}
function RainRadarMap({ districts }) {
  const [frame, setFrame] = useState(null);
  const [radarTime, setRadarTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const matches = districts
    .filter((district) =>
      district.name.toLowerCase().includes(search.trim().toLowerCase())
    )
    .slice(0, 8);
  function chooseDistrict(district) {
    setSelected(district.name);
    setSearch(district.name);
    setSearchOpen(false);
  }
  const loadRadar = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json",
        { signal }
      );
      if (!response.ok) throw new Error("Radar provider returned an error.");
      const json = await response.json();
      const frames = json?.radar?.past ?? [];
      const latest = frames[frames.length - 1];
      if (!json?.host || !latest?.path) {
        throw new Error("No radar frames are currently available.");
      }
      setFrame({ host: json.host, path: latest.path });
      setRadarTime(
        new Date(latest.time * 1000).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Could not load radar data.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadRadar(controller.signal);
    return () => controller.abort();
  }, [loadRadar, refreshKey]);
  const radarUrl = frame
    ? `${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`
    : null;
  return (
    <>
      <div className="weather-map-canvas">
        <div className="weather-map-search">
          <span aria-hidden="true">×</span>
          <input
            type="search"
            value={search}
            placeholder="Search district for radar..."
            aria-label="Search district on Rain Radar"
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchOpen(true);
              setSelected(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
              if (event.key === "Enter" && matches.length > 0) {
                chooseDistrict(matches[0]);
              }
            }}
          />
          {search && (
            <button
              type="button"
              className="weather-map-search-clear"
              aria-label="Clear radar district search"
              onClick={() => {
                setSearch("");
                setSelected(null);
                setSearchOpen(true);
              }}
            >
              ×
            </button>
          )}
          {searchOpen && search.trim() && (
            <div className="weather-map-search-results">
              {matches.length > 0 ? (
                matches.map((district) => (
                  <button
                    type="button"
                    key={district.name}
                    onClick={() => chooseDistrict(district)}
                  >
                    <span>{district.name}</span>
                    <small>
                      {district.temp == null
                        ? "Weather unavailable"
                        : `${district.temp.toFixed(1)}°C`}
                    </small>
                  </button>
                ))
              ) : (
                <div className="weather-map-search-empty">
                  No matching district found
                </div>
              )}
            </div>
          )}
        </div>
        <MapContainer
          center={[25.8, 85.5]}
          zoom={6}
          minZoom={4}
          maxZoom={12}
          scrollWheelZoom
          className="weather-leaflet-map"
        >
          <MapResize />
          <MapFocus
            target={districts.find(
              (district) => district.name === selected
            )}
          />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={DARK_TILES}
            className="weather-base-tiles"
            subdomains="abc"
            maxZoom={20}
          />
          {radarUrl && (
            <TileLayer
              key={radarUrl}
              url={radarUrl}
              opacity={0.72}
              maxNativeZoom={7}
              maxZoom={12}
              attribution='Radar: <a href="https://www.rainviewer.com/">RainViewer</a>'
            />
          )}
          {districts.map((district) => (
            <CircleMarker
              key={district.name}
              center={district.coords}
              radius={district.name === selected ? 9 : 5}
              pathOptions={{
                color: district.name === selected ? "#ffffff" : "#071c19",
                weight: district.name === selected ? 3 : 1,
                fillColor: district.name === selected ? "#ffffff" : "#45ffe0",
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <div className="weather-map-popup">
                  <strong>{district.name}</strong>
                  <div className="weather-map-popup-temp">
                    {weatherEmoji(district.code)}{" "}
                    {district.temp == null
                      ? "Temperature unavailable"
                      : `${district.temp.toFixed(1)}°C`}
                  </div>
                  <small>District weather from the dashboard API</small>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        {loading && (
          <div className="weather-map-status">Loading radar...</div>
        )}
        {error && (
          <div className="weather-map-status">
            {error} The base map may still be available.
          </div>
        )}
      </div>
      <div className="radar-map-controls">
        <span>
          {loading
            ? "Loading radar..."
            : radarTime
              ? `Radar frame: ${radarTime}`
              : "Radar timestamp unavailable"}
        </span>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh radar"}
        </button>
      </div>
      <div className="weather-map-attribution">
        Radar data by{" "}
        <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">
          RainViewer
        </a>
        . Radar coverage and freshness vary by location.
      </div>
    </>
  );
}
export default function WeatherMaps() {
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function loadDistricts() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/api/districts`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("District API request failed.");
        const payload = await response.json();
        const names = Array.isArray(payload)
          ? payload
          : payload?.districts ?? payload?.data ?? [];
        if (!Array.isArray(names) || names.length === 0) {
          throw new Error("The backend did not return a district list.");
        }
        const results = [];
        let cursor = 0;
        async function worker() {
          while (cursor < names.length) {
            const index = cursor++;
            const item = names[index];
            const name =
              typeof item === "string"
                ? item
                : item?.name ?? item?.district ?? item?.district_name;
            if (!name) continue;
            try {
              const data = await fetchWeather(name);
              if (controller.signal.aborted) return;
              const coords = readCoordinates(data);
              if (coords) {
                results.push({
                  name,
                  coords,
                  temp: readTemperature(data),
                  code: readWeatherCode(data),
                });
              }
            } catch (err) {
              if (err.name === "AbortError") throw err;
              // One unavailable district should not block other markers.
            }
          }
        }
        await Promise.all(
          Array.from(
            { length: Math.min(6, names.length) },
            () => worker()
          )
        );
        if (!controller.signal.aborted) {
          setDistricts(results);
          if (results.length === 0) {
            setError(
              "The weather API did not return usable coordinates. Check the district API response."
            );
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Could not load district weather.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadDistricts();
    return () => controller.abort();
  }, [refreshKey]);
  return (
    <section className="section-block weather-maps-section" id="weather-maps">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LIVE GEOSPATIAL VIEW</span>
          <h2>Bihar Weather Maps</h2>
          <p className="weather-maps-subtitle">
            Explore district temperatures and the latest available radar frames.
          </p>
        </div>
        <button
          type="button"
          className="weather-maps-refresh"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh district map"}
        </button>
      </div>
      <div className="weather-maps-grid">
        <article className="weather-map-panel">
          <div className="weather-map-panel-heading">
            <div>
              <span className="weather-map-label">01 / DISTRICTS</span>
              <h3>Live Weather Map</h3>
            </div>
            <span className="weather-map-live-dot">API</span>
          </div>
          <p className="weather-map-description">
            Select a marker to inspect the district temperature.
          </p>
          <DistrictWeatherMap
            districts={districts}
            loading={loading}
            error={error}
          />
        </article>
        <article className="weather-map-panel">
          <div className="weather-map-panel-heading">
            <div>
              <span className="weather-map-label">02 / PRECIPITATION</span>
              <h3>Rain Radar</h3>
            </div>
            <span className="weather-map-live-dot">RADAR</span>
          </div>
          <p className="weather-map-description">
            Historical radar frames are shown when available; this is not a rain forecast.
          </p>
          <RainRadarMap districts={districts} />
        </article>
      </div>
      <p className="footnote weather-maps-footnote">
        District weather is supplied by the dashboard backend. Radar imagery is
        supplied by RainViewer and may not cover every area of Bihar. Map
        backgrounds use CARTO and OpenStreetMap attribution.
      </p>
    </section>
  );
}
