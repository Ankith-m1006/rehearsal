# Deploy Rehearsal to Cloud Run (paste into Cloud Shell, project gen-lang-client-0589191977)

One block, no secrets in it (the two secrets are read from Secret Manager by name):

```bash
PN=$(gcloud projects describe gen-lang-client-0589191977 --format='value(projectNumber)'); SA=${PN}-compute@developer.gserviceaccount.com; for s in paypal-client-id paypal-client-secret; do gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor -q >/dev/null && echo "access ok: $s"; done; rm -rf rehearsal && git clone -q https://github.com/Ankith-m1006/rehearsal && cd rehearsal && gcloud run deploy rehearsal --source . --region asia-south1 --allow-unauthenticated --min-instances 0 --max-instances 1 --memory 512Mi --set-secrets PAYPAL_CLIENT_ID=paypal-client-id:latest,PAYPAL_CLIENT_SECRET=paypal-client-secret:latest --set-env-vars PUBLIC_URL=https://rehearsal-${PN}.asia-south1.run.app,SPIKE_ON_START=1,REHEARSAL_SYNTH_SECRET=$(openssl rand -hex 16) -q
```

If it asks to enable APIs (Cloud Build, Artifact Registry, Cloud Run), answer y.
Expected URL: https://rehearsal-1037019152152.asia-south1.run.app
