#!/bin/bash
# Deploy Rehearsal to Cloud Run (run inside Cloud Shell from the repo folder). No secrets in this file:
# PayPal credentials come from Secret Manager by name.
set -e
PROJECT=gen-lang-client-0589191977
PN=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
URL=https://rehearsal-${PN}.asia-south1.run.app
SYNTH=$(gcloud run services describe rehearsal --region asia-south1 --format='value(spec.template.spec.containers[0].env)' 2>/dev/null | grep -o "REHEARSAL_SYNTH_SECRET', 'value': '[0-9a-f]*" | grep -o "[0-9a-f]*$" || true)
SYNTH=${SYNTH:-$(openssl rand -hex 16)}
EXTRA=""
gcloud secrets describe gemini-api-key >/dev/null 2>&1 && EXTRA=",GEMINI_API_KEY=gemini-api-key:latest"
gcloud run deploy rehearsal --source . --project $PROJECT --region asia-south1 --allow-unauthenticated \
  --min-instances 0 --max-instances 1 --memory 512Mi --timeout 300 \
  --set-secrets PAYPAL_CLIENT_ID=paypal-client-id:latest,PAYPAL_CLIENT_SECRET=paypal-client-secret:latest${EXTRA} \
  --set-env-vars PUBLIC_URL=$URL,SPIKE_ON_START=1,REHEARSAL_SYNTH_SECRET=$SYNTH -q
echo "DEPLOYED: $URL"
