# Bihar Weather Intelligence Dashboard
A full-stack weather dashboard for exploring current weather conditions and five-day forecasts across 38 districts of Bihar, India.
> An independent student project using the Open-Meteo weather API. It is not an official IMD product or an officially affiliated forecasting system.
## Live Demo
- **Frontend:** https://bihar-weather-dashboard.vercel.app
- **Backend API:** https://bihar-weather-api.onrender.com
- **Interactive API Documentation:** https://bihar-weather-api.onrender.com/docs
- **GitHub Repository:** https://github.com/yash01100/BIHAR-WEATHER-DASHBOARD
## Features
- Weather data for 38 Bihar districts
- Current temperature, humidity, apparent temperature, precipitation and wind speed
- Five-day forecast with daily minimum and maximum temperatures
- Precipitation probability when provided by the API
- District selection and weather comparison
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
**Weather Data**
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
| GET | `/api/coordinates/{district}` | Get coordinates for a supported district |
| GET | `/api/weather/{district}` | Get current weather and five-day forecast |
Example: `/api/weather/Patna`
Replace `{district}` with a supported district name. API availability depends on the deployed backend and external weather provider.
## Data and Limitations
- Weather data is retrieved from Open-Meteo when a request is made and no valid cached result is available.
- The five-minute cache may return a previously fetched response until it expires.
- District coordinates represent approximate district headquarters or cities, not measurements from every location within a district.
- Weather data and forecasts depend on the external provider's availability and coverage.
- This project does not claim official IMD data integration, government affiliation, or independently validated weather predictions.
## Future Improvements
- Automated tests for API routes and frontend behavior
- Improved caching and external API rate-limit handling
- Improved monitoring, accessibility and performance
- Historical weather analysis using verified data sources
- Documented testing and forecast validation
## Author
Developed as an independent student project to practice full-stack development, REST APIs and weather-data visualization.
