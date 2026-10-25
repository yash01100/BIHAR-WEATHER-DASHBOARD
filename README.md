# Bihar Weather Intelligence Dashboard
A full-stack weather dashboard for exploring current weather conditions and five-day forecasts across 38 districts of Bihar, India.
> An independent student project using the Open-Meteo weather API. It is not an official IMD product or an officially affiliated forecasting system.
## Features
- Weather data for 38 Bihar districts
- Current conditions, including temperature, humidity, apparent temperature, precipitation and wind speed
- Five-day forecast with daily minimum and maximum temperatures
- Precipitation probability when provided by the API
- District selection and weather comparison in the frontend
- FastAPI backend with REST endpoints
- Five-minute in-memory cache for successful weather responses
- Error handling when the external weather provider is unavailable
- Responsive dark-themed dashboard
## Technology Stack
**Frontend**
- React
- Vite
- Recharts
**Backend**
- Python
- FastAPI
- HTTPX
**Weather data**
- Open-Meteo Forecast API
## Project Structure
```text
BIHAR-WEATHER-DASHBOARD/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── backend/
│   └── main.py
├── .gitignore
└── README.md
```
## Prerequisites
- Node.js and npm
- Python 3.11 or a compatible Python version
- Internet connection for live weather data
## Run Locally
### 1. Start the backend
Open PowerShell in the project root:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi "uvicorn[standard]" httpx
uvicorn main:app --reload
```
Backend base URL: `http://127.0.0.1:8000`
Interactive API documentation: `http://127.0.0.1:8000/docs`
### 2. Start the frontend
Open a second PowerShell terminal:
```powershell
cd "$HOME\OneDrive\Desktop\BIHAR-WEATHER-DASHBOARD\frontend"
npm install
npm run dev
```
Open the local URL printed by Vite, usually `http://localhost:5173`.
## API Endpoints
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API status and district count |
| GET | `/api/health` | Health check |
| GET | `/api/districts` | List supported districts |
| GET | `/api/weather/Patna` | Current conditions and five-day forecast for Patna |
Replace `Patna` with a supported district name.
## Data and Limitations
- Weather values are retrieved from Open-Meteo when the API is requested and the cached result is unavailable.
- The five-minute cache can return a previously fetched response until it expires.
- District coordinates represent approximate district headquarters or cities, not measurements from every location within a district.
- Forecasts and observations depend on the external provider's availability and data.
- This project does not claim official IMD data integration, government affiliation, or independently validated weather predictions.
## Future Improvements
- Automated tests for API routes and frontend behavior
- Deployment with production environment configuration
- Improved monitoring, accessibility and performance
- Additional verified data sources and documented validation
## Author
Developed as an independent student project to practice full-stack development, REST APIs and weather-data visualization.
