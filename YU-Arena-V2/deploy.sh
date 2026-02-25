#!/usr/bin/env bash
# Redeploy YU Arena to Google Cloud Run
# Run from project root: ./deploy.sh
#
# Set PROJECT_ID if different: PROJECT_ID=your-project ./deploy.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-clawd-prueba}"
REGION="${REGION:-us-east1}"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/yu-arena/yu-arena:latest"

echo "Building and deploying YU Arena..."
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "  Image:   ${IMAGE}"
echo

gcloud builds submit --tag "${IMAGE}" .

echo
echo "Deploying to Cloud Run..."
gcloud run deploy yu-arena \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080

echo
echo "Done. Check: https://yu-arena-381932264033.us-east1.run.app/api/health"
