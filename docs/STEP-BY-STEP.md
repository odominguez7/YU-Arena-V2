# YU Arena — Step-by-Step Build & Deploy Guide

This is a manual, sequential guide. Each step has a **checkpoint test** — do not move to the next step until the test passes.

---

## Prerequisites

Before you start, make sure you have:

- [ ] **Node.js 18+** installed (`node --version` should show v18 or higher)
- [ ] **npm** installed (comes with Node.js)
- [ ] **Google Cloud CLI** (`gcloud`) installed — [install guide](https://cloud.google.com/sdk/docs/install)
- [ ] **Docker** installed — [install guide](https://docs.docker.com/get-docker/)
- [ ] A **Google Cloud project** with billing enabled
- [ ] A **terminal** open in the project root folder (`H2 - Cursor folder/`)

---

## STEP 1: Install Server Dependencies

**What you do:**

```bash
cd server
npm install
```

**Checkpoint test:**

```bash
ls node_modules/.package-lock.json
```

Expected: the file exists (no "No such file" error). Also:

```bash
npx tsc --version
```

Expected: prints a TypeScript version number (e.g., `Version 5.6.x`).

---

## STEP 2: Verify Server Compiles

**What you do:**

```bash
cd server
npx tsc --noEmit
```

**Checkpoint test:**

The command produces **zero errors** and exits silently. If you see errors, something is wrong with the source files — re-read the error messages carefully.

---

## STEP 3: Install Frontend Dependencies

**What you do:**

```bash
cd web
npm install
```

**Checkpoint test:**

```bash
npx tsc --version
```

Expected: prints TypeScript version.

---

## STEP 4: Verify Frontend Compiles

**What you do:**

```bash
cd web
npx tsc --noEmit
```

**Checkpoint test:**

Zero errors, silent exit.

---

## STEP 5: Create Your .env File

**What you do:**

```bash
# From the project root (not server/ or web/)
cp .env.example .env
```

You can leave all defaults for local development.

**Checkpoint test:**

```bash
cat .env
```

Expected: you see the environment variables (PORT=3001, SCOUT_API_KEY, etc.).

---

## STEP 6: Start the API Server

**What you do:**

```bash
cd server
npm run dev
```

You should see:

```
YU Arena API running on http://0.0.0.0:3001
WebSocket at ws://0.0.0.0:3001/ws?roomId=<id>
```

**Leave this terminal running.** Open a **new terminal** for the next steps.

**Checkpoint test (in new terminal):**

```bash
curl http://localhost:3001/api/health
```

Expected:

```json
{"status":"ok","service":"yu-arena","timestamp":"..."}
```

---

## STEP 7: Run Smoke Tests

**What you do (in the new terminal):**

```bash
cd server
npm test
```

**Checkpoint test:**

All tests should show PASS:

```
=== YU Arena Smoke Tests ===

  PASS: Health check returns 200
  PASS: Create room without auth returns 401
  PASS: Create room returns 201
  ...
  PASS: Get events returns 200

=== Results: 16 passed, 0 failed ===
```

If any test fails, stop and fix the issue before continuing.

---

## STEP 8: Start the Frontend

**What you do (in yet another terminal, or stop the test):**

```bash
cd web
npm run dev
```

You should see:

```
VITE v5.x.x  ready in XXms
  ➜  Local:   http://localhost:5173/
```

**Checkpoint test:**

1. Open **http://localhost:5173** in your browser.
2. You should see the YU Arena dashboard with the header "YU Arena".
3. You should see a "Rooms" section (may say "No rooms yet").

---

## STEP 9: End-to-End Test via curl

With both server and frontend running, test the full flow:

**Create a room:**

```bash
curl -X POST http://localhost:3001/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-scout-key-demo" \
  -d '{"name": "Demo Room"}'
```

Copy the `id` from the response. Then:

**Create an opportunity:**

```bash
curl -X POST http://localhost:3001/api/rooms/ROOM_ID/opportunities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-scout-key-demo" \
  -d '{"title": "Sunday 3pm open slot"}'
```

**Checkpoint test:**

1. Refresh the browser at http://localhost:5173
2. You should see "Demo Room" in the room list
3. Click it — you should see the opportunity and event entries

---

## STEP 10: Build the Docker Image

**What you do:**

```bash
# From the project root
docker build -t yu-arena .
```

This runs the multi-stage Dockerfile:
- Stage 1: installs deps, compiles TypeScript, builds React
- Stage 2: copies only production artifacts into a slim image

**Checkpoint test:**

```bash
docker images | grep yu-arena
```

Expected: you see `yu-arena` with a recent timestamp.

---

## STEP 11: Test Docker Locally

**What you do:**

```bash
docker run -p 8080:8080 \
  -e SCOUT_API_KEY=yu-scout-key-demo \
  -e CLOSER_API_KEY=yu-closer-key-demo \
  yu-arena
```

**Checkpoint test:**

```bash
curl http://localhost:8080/api/health
```

Expected: `{"status":"ok","service":"yu-arena",...}`

Also open **http://localhost:8080** in browser — you should see the full dashboard.

Stop the container with Ctrl+C when done.

---

## STEP 12: Set Up Google Cloud

**What you do:**

```bash
# Login to Google Cloud
gcloud auth login

# Set your project (replace with your actual project ID)
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create an Artifact Registry repo for Docker images
gcloud artifacts repositories create yu-arena \
  --repository-format=docker \
  --location=us-central1 \
  --description="YU Arena container images"
```

**Checkpoint test:**

```bash
gcloud config get-value project
```

Expected: prints your project ID.

```bash
gcloud services list --enabled | grep -E "run|cloudbuild|artifact"
```

Expected: you see all three services listed.

---

## STEP 13: Build & Push to Google Cloud

**What you do:**

```bash
# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Tag and push the image
# Replace YOUR_PROJECT_ID with your actual project ID
docker tag yu-arena us-central1-docker.pkg.dev/YOUR_PROJECT_ID/yu-arena/yu-arena:latest
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/yu-arena/yu-arena:latest
```

**Alternative (build in the cloud, no local Docker needed):**

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/yu-arena/yu-arena:latest .
```

**Checkpoint test:**

```bash
gcloud artifacts docker images list us-central1-docker.pkg.dev/YOUR_PROJECT_ID/yu-arena
```

Expected: you see the `yu-arena` image listed.

---

## STEP 14: Deploy to Cloud Run

**What you do:**

```bash
gcloud run deploy yu-arena \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/yu-arena/yu-arena:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,SCOUT_API_KEY=yu-scout-key-demo,CLOSER_API_KEY=yu-closer-key-demo" \
  --memory 512Mi \
  --min-instances 1 \
  --max-instances 3 \
  --session-affinity
```

Key flags explained:
- `--allow-unauthenticated` — lets anyone access the dashboard
- `--min-instances 1` — keeps one instance warm (needed for WebSocket)
- `--session-affinity` — routes same client to same instance (needed for WebSocket)
- `--memory 512Mi` — enough for Node.js + SQLite

**Checkpoint test:**

The command outputs a URL like:

```
Service URL: https://yu-arena-XXXXX-uc.a.run.app
```

Test it:

```bash
curl https://yu-arena-XXXXX-uc.a.run.app/api/health
```

Expected: `{"status":"ok","service":"yu-arena",...}`

Open the URL in your browser — you should see the full YU Arena dashboard.

---

## STEP 15: Update CORS for Production

After deploy, get your Cloud Run URL and set it as the FRONTEND_URL:

```bash
gcloud run services update yu-arena \
  --region us-central1 \
  --set-env-vars "NODE_ENV=production,SCOUT_API_KEY=yu-scout-key-demo,CLOSER_API_KEY=yu-closer-key-demo,FRONTEND_URL=https://yu-arena-XXXXX-uc.a.run.app"
```

**Checkpoint test:**

Open the Cloud Run URL in browser. Create a room via curl using the Cloud Run URL. Verify it appears in the browser dashboard.

---

## STEP 16: Demo the Full Agent Loop

Run this full sequence against your deployed URL to demonstrate two agents working together:

```bash
# Set your URL
export BASE=https://yu-arena-XXXXX-uc.a.run.app

# 1. Scout creates a room
curl -s -X POST $BASE/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-scout-key-demo" \
  -d '{"name": "Recovery Session — Feb 2026"}'

# Copy the room ID from the response, then:
export ROOM=<paste-room-id>

# 2. Scout posts a message
curl -s -X POST $BASE/api/rooms/$ROOM/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-scout-key-demo" \
  -d '{"text": "Scanning for open capacity in the weekend window..."}'

# 3. Scout creates opportunities
curl -s -X POST $BASE/api/rooms/$ROOM/opportunities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-scout-key-demo" \
  -d '{"title": "Saturday 2pm — 2 open slots"}'

# Copy opportunity ID, then:
export OPP=<paste-opp-id>

# 4. Closer claims
curl -s -X POST $BASE/api/opportunities/$OPP/claim \
  -H "Authorization: Bearer yu-closer-key-demo"

# 5. Closer resolves
curl -s -X POST $BASE/api/opportunities/$OPP/resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-closer-key-demo" \
  -d '{"outcome": "Both slots filled — bookings confirmed"}'

# 6. Closer posts outcome
curl -s -X POST $BASE/api/rooms/$ROOM/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer yu-closer-key-demo" \
  -d '{"text": "Resolved Saturday 2pm — 2 slots recovered."}'
```

**Checkpoint test:**

Open the Cloud Run URL in browser, click the room, and verify you see:
- The event stream with all messages and actions
- The opportunity showing as "resolved"
- Both Scout and Closer in the agent presence bar

---

## Summary Checklist

| Step | What | Test |
|------|------|------|
| 1 | Install server deps | `npx tsc --version` works |
| 2 | Compile server | `npx tsc --noEmit` = 0 errors |
| 3 | Install frontend deps | `npx tsc --version` works |
| 4 | Compile frontend | `npx tsc --noEmit` = 0 errors |
| 5 | Create .env | `cat .env` shows vars |
| 6 | Start server | `/api/health` returns ok |
| 7 | Smoke tests | All pass, 0 failed |
| 8 | Start frontend | Dashboard loads in browser |
| 9 | E2E curl test | Room + opportunity visible in UI |
| 10 | Docker build | Image appears in `docker images` |
| 11 | Docker run locally | `/api/health` on :8080 works |
| 12 | GCP setup | Project set, APIs enabled |
| 13 | Push image | Image in Artifact Registry |
| 14 | Deploy Cloud Run | Service URL returns health ok |
| 15 | Update CORS | Dashboard works at Cloud Run URL |
| 16 | Demo agent loop | Full Scout+Closer flow visible |
