# YU Arena Deployment Reference (us-east1)

This document consolidates operational details for the live YU Arena service running in `us-east1`.

## Live Service

- App URL: `https://yu-arena-381932264033.us-east1.run.app`
- Health URL: `https://yu-arena-381932264033.us-east1.run.app/api/health`
- Cloud Run service: `yu-arena`
- Region: `us-east1`
- GCP project number: `381932264033`

---

## How to Redeploy

Run these commands from the project root (`YU-Arena-V2/`):

```bash
# 1. Set your GCP project (replace with your actual project ID, e.g. clawd-prueba)
export PROJECT_ID=clawd-prueba
export REGION=us-east1

# 2. Build and push the Docker image
gcloud builds submit --tag us-central1-docker.pkg.dev/${PROJECT_ID}/yu-arena/yu-arena:latest .

# 3. Deploy to Cloud Run (preserves existing env vars; add --update-env-vars to change them)
gcloud run deploy yu-arena \
  --image us-central1-docker.pkg.dev/${PROJECT_ID}/yu-arena/yu-arena:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --port 8080
```

**If your project uses a different region** (e.g. `us-central1`), change `REGION` accordingly.

**To update Twilio env vars during deploy:**
```bash
gcloud run deploy yu-arena \
  --image us-central1-docker.pkg.dev/${PROJECT_ID}/yu-arena/yu-arena:latest \
  --region ${REGION} \
  --update-env-vars "TWILIO_ACCOUNT_SID=AC...,TWILIO_AUTH_TOKEN=...,TWILIO_WHATSAPP_FROM=+14155238886,BASE_URL=https://yu-arena-381932264033.us-east1.run.app"
```

---

## API Quick Checks

```bash
BASE="https://yu-arena-381932264033.us-east1.run.app"

curl -s "$BASE/api/health"
curl -i "$BASE/api/auth/me"
```

Expected:
- `/api/health` returns JSON with `status: "ok"` and `service: "yu-arena"`.
- `/api/auth/me` returns `401` without a Bearer token.

## Local Agent Runner

`run-agents.sh` now defaults to the same live service URL:

```bash
./run-agents.sh
```

Override at runtime if needed:

```bash
BASE_URL="https://your-other-service.run.app" ./run-agents.sh
```

## WhatsApp (Twilio) Setup

To send WhatsApp messages to rush list members when a drop is launched:

1. **Twilio Console** → Messaging → Try it out → Send a WhatsApp message
2. Get your **sandbox number** (e.g. `+14155238886`) and **join code**
3. Set Cloud Run env vars:
   - `TWILIO_ACCOUNT_SID` — from Twilio Console
   - `TWILIO_AUTH_TOKEN` — from Twilio Console
   - `TWILIO_WHATSAPP_FROM` — your WhatsApp sandbox number (e.g. `+14155238886`)
   - `BASE_URL` — `https://yu-arena-381932264033.us-east1.run.app` (for claim links)

4. **Recipients must join the sandbox**: Each recipient (e.g. Omi D at +16178720742) must:
   - Open WhatsApp on their phone
   - Send a new message to the sandbox number `+14155238886`
   - Type exactly: `join <your-code>` (replace `<your-code>` with the code shown in Twilio Console → Messaging → Try it out)
   - Wait for the confirmation reply
   - After 24h of no messages, they may need to re-join

5. **Verify**: In Settings, click "Test WhatsApp" next to a rush list member. Errors (e.g. "Recipient must join the sandbox") are shown in the UI.

```bash
gcloud run services update yu-arena \
  --region us-east1 \
  --set-env-vars "TWILIO_ACCOUNT_SID=AC...,TWILIO_AUTH_TOKEN=...,TWILIO_WHATSAPP_FROM=+14155238886,BASE_URL=https://yu-arena-381932264033.us-east1.run.app"
```

## Notes

- Keep secrets out of git (`.env` is ignored).
- Prefer using environment variables for credentials and production values.
- Use Secret Manager for sensitive values in production.
