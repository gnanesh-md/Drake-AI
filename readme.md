# GraphOCR / Curve Tracking

This repository contains a React frontend, a Node/Express backend, and a Python/FastAPI service for extracting graph curves from log images, editing the detected lines, and exporting LAS output.

## Repo layout

- `frontend/` - Vite + React application
- `js-backend/` - Express API for auth, password reset, uploads, projects, and point export
- `python-multiline/` - FastAPI service for graph segmentation, TIFF preprocessing, and LAS generation

## Current routes

- `/` - landing page
- `/signup` - sign up
- `/login` - login
- `/forgot-password` - OTP-based password reset
- `/dashboard` - current main curve-tracking workflow
- `/dashboard2` - older split-image workflow that still exists in the codebase

## Current frontend behavior

The current main screen is `frontend/src/Components/Dashboard/display5.jsx`.

That flow currently:

- uploads a `.tif` or `.tiff`
- sends the file to the Python `/segment-and-graph` endpoint
- draws detected graph lines on a canvas
- lets you adjust points and graph boundaries
- exports LAS files through the Python LAS endpoint

Auth and account flows use the Node backend through `frontend/src/config/constants.tsx`.

## Runtime configuration

The frontend now reads service URLs from env with hosted fallbacks:

- `VITE_NODE_API` -> defaults to `https://js-curvetracking.thedrake.ai`
- `VITE_GRAPH_API_URL` -> defaults to `https://python-curvetracking.thedrake.ai/segment-and-graph`
- `VITE_GRAPH_LAS` or legacy `VITE_GRAPH_Las` -> defaults to `https://python-curvetracking.thedrake.ai/generate-las-base64`

The checked-in `frontend/.env` currently sets:

```env
VITE_GRAPH_API_URL=https://python-curvetracking.thedrake.ai/segment-and-graph
VITE_GRAPH_Las=https://python-curvetracking.thedrake.ai/generate-las-base64
```

That means the frontend will still use the hosted Node backend unless you also add `VITE_NODE_API`.

## Local development env

For a fully local setup, use:

### `frontend/.env`

```env
VITE_NODE_API=http://127.0.0.1:5000
VITE_GRAPH_API_URL=http://127.0.0.1:8000/segment-and-graph
VITE_GRAPH_LAS=http://127.0.0.1:8000/generate-las-base64
```

Notes:

- `display5.jsx` supports both `VITE_GRAPH_LAS` and the older `VITE_GRAPH_Las`
- after changing frontend env values, restart Vite

### `js-backend/.env`

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
MONGODB_URI=mongodb://localhost:27017/graphocr
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=replace-with-a-secure-random-secret
PYTHON_SERVICE_URL=http://127.0.0.1:8123
PORT=5000
```

Notes:

- MongoDB falls back to `mongodb://localhost:27017/graphocr`
- CORS is now env-driven in `js-backend/app.js`
- `PYTHON_SERVICE_URL` is only used by `POST /api/decode-las`
- the frontend’s local Node example points to port `5000`

### `python-multiline/.env`

```env
YOLO_MODEL_PATH=models/extract_header_model.pt
GEMNI_KEY=your-gemini-api-key
OPENAI_KEY=your-openai-api-key
TIFF_CHUNK_MODEL_PATH=best.pt
```

Notes:

- `GEMNI_KEY` is intentionally spelled that way because `python-multiline/main.py` reads that exact env var
- `TIFF_CHUNK_MODEL_PATH` falls back to `python-multiline/best.pt` when unset
- the Python service also uses EasyOCR locally

## Run the stack locally

Before sharing or deploying this version:

- Keep all Python runtime dependencies in `python-multiline/requirements.txt`.
- Use `.venv` to manage the Python environment locally.
- Verify the same application version you are sharing works locally before deployment.

### 1. Start MongoDB

Use your local MongoDB instance, or run one with Docker:

```bash
docker run --name mongo-graphocr -p 27017:27017 -d mongo:latest
```

### 2. Start the Node backend

```bash
cd js-backend
npm install
npm start
```

Node backend responsibilities include:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /upload`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/points/save-points`
- `GET /api/points/export-points/:imageName`
- `POST /api/decode-las`

Important note:

- `js-backend/package.json` starts `nodemon ./bin/www`
- `js-backend/app.js` also contains `app.listen(process.env.PORT || 5000)`
- `js-backend/bin/www` creates an HTTP server with `process.env.PORT || 3000`
- if you are troubleshooting local startup, check these two listener paths first

### 3. Start the Python service

```bash
cd python-multiline
python -m venv ../.venv
. ../.venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Main Python endpoints:

- `POST /segment-and-graph`
- `POST /tiff-chunk-detect`
- `POST /create-las-file`
- `POST /generate-las-base64`
- `POST /create-las-from-coords`

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Vite runs with `--host`, so the dev server is exposed on your local network as well as localhost.

## Suggested terminal layout

Terminal 1:

```bash
cd js-backend && npm start
```

Terminal 2:

```bash
cd python-multiline && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 3:

```bash
cd frontend && npm run dev
```

## Other codebase notes

- `frontend/vite.config.js` still contains older proxy entries pointing at hosted services
- `python-multiline/main.py` is the current Python entry point
- files in `python-multiline/versions/` are older variants, not the main runtime path
- auth pages and project/image upload features still depend on the Node backend even though the main `/dashboard` curve extraction flow talks directly to Python
