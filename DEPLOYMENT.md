# Track Synex — Deployment Guide

This project contains both the **FastAPI AI Optimization Backend** and the **Vite React UI Website**.

---

## 🚀 Option 1: Deploy on Vercel (Instant Frontend Hosting)

1. Open [https://vercel.com/new](https://vercel.com/new) and log in with your GitHub account.
2. Select the repository: **`Sree97605-coder/SIH_AI-Powered_Automatic_Block_Planning`**.
3. In the configuration:
   - **Root Directory**: Select `frontend`
   - **Framework Preset**: `Vite` (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Click **Deploy**. Your website will be live with a free `*.vercel.app` public URL in seconds!

---

## 🚂 Option 2: Deploy on Render (Full-Stack Python Backend + UI)

The repository includes a pre-configured `render.yaml`:
1. Open [https://dashboard.render.com](https://dashboard.render.com) and click **New +** $\rightarrow$ **Blueprint** (or **Web Service**).
2. Connect your GitHub repository: `SIH_AI-Powered_Automatic_Block_Planning`.
3. Render will automatically detect `render.yaml`, build the React frontend, and launch the FastAPI server.
4. Click **Apply**. Both your UI and API will run on the same public `*.onrender.com` domain!

### Optional hosted MySQL database

The API supports MySQL as its primary data source and automatically falls back to the committed CSV files if MySQL is not configured or temporarily unavailable.

1. Create a hosted MySQL database with a provider such as Railway or Aiven. A MySQL server running only on your laptop cannot be reached by Render.
2. Add these environment variables to the Render web service:

```text
MYSQL_HOST=your-host
MYSQL_PORT=3306
MYSQL_DATABASE=your-database
MYSQL_USER=your-user
MYSQL_PASSWORD=your-password
```

3. From a machine with network access to the hosted database, run the import script from the repository root:

```powershell
$env:MYSQL_HOST = "your-host"
$env:MYSQL_PORT = "3306"
$env:MYSQL_DATABASE = "your-database"
$env:MYSQL_USER = "your-user"
$env:MYSQL_PASSWORD = "your-password"
python scripts/import_csv_to_mysql.py
```

The importer creates the six `rail_*` tables and loads the existing defects, slots, schedules, and unscheduled records. Never commit database passwords or put them in frontend `VITE_*` variables.

---

## ⚡ Option 3: Deploy on Railway / Fly.io (Containerized Docker)

The repository includes a multi-stage `Dockerfile`:
1. Open [https://railway.app](https://railway.app) $\rightarrow$ **New Project** $\rightarrow$ **Deploy from GitHub repo**.
2. Select `SIH_AI-Powered_Automatic_Block_Planning`.
3. Railway will build the multi-stage Docker container and deploy the app on a public URL.

---

## 💻 Option 4: Local Production Mode

Run the unified full-stack server locally on your machine:
```bash
# 1. Build the production UI bundle
cd frontend
npm run build
cd ..

# 2. Start the unified FastAPI + Static UI server
python -m uvicorn src.api:app --host 0.0.0.0 --port 8000
```
Open **`http://localhost:8000/`** in your browser to view the live production website!
