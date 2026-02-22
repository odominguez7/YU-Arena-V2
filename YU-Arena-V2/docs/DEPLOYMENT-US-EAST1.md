# YU Arena Deployment Reference (us-east1)

This document consolidates operational details for the live YU Arena service running in `us-east1`.

## Live Service

- App URL: `https://yu-arena-381932264033.us-east1.run.app`
- Health URL: `https://yu-arena-381932264033.us-east1.run.app/api/health`
- Cloud Run service: `yu-arena`
- Region: `us-east1`
- GCP project number: `381932264033`

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

## Notes

- Keep secrets out of git (`.env` is ignored).
- Prefer using environment variables for credentials and production values.
