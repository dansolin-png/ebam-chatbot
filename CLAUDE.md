# EBAM Project

## AWS
Always use AWS profile `ebam` and region `us-east-1` for all AWS CLI commands and SDK calls in this project.
- CLI: `--profile ebam --region us-east-1`
- Environment: `AWS_PROFILE=ebam`, `AWS_REGION=us-east-1`

## AWS Resources
- Lambda function name: `ebam-api`
- Amplify app ID: `d142ap2pr34amq` (https://main.d142ap2pr34amq.amplifyapp.com)
- API Gateway: `https://l7ha0wuja1.execute-api.us-east-1.amazonaws.com`

## Lambda Deployment — CRITICAL RULES

**Always deploy from `server/` directory using the full zip including `package/`.**

The `package/` directory contains all Python dependencies (fastapi, anthropic, boto3, etc.).
Excluding it causes `No module named 'fastapi'` and a complete outage.

### Correct deploy command:
```bash
cd server/
zip -r /tmp/ebam-deploy.zip . -x "venv/*" -x "*.pyc" -x "*/__pycache__/*" -x "__pycache__/*"
zip -d /tmp/ebam-deploy.zip ".env" "ebam.db" "lambda.zip" 2>/dev/null || true
aws s3 cp /tmp/ebam-deploy.zip s3://ebam-compliance-leads/deployments/ebam-deploy.zip --profile ebam --region us-east-1 --no-progress
aws lambda update-function-code --function-name ebam-api \
  --s3-bucket ebam-compliance-leads --s3-key deployments/ebam-deploy.zip \
  --profile ebam --region us-east-1
aws lambda wait function-updated --function-name ebam-api --profile ebam --region us-east-1
```

### NEVER exclude `package/` from the zip — it breaks Lambda (No module named 'fastapi').
### ALWAYS remove `.env` from the zip (use `zip -d` after building) — it injects AWS_PROFILE=ebam which breaks boto3 in Lambda.
### Always use S3 upload (zip is ~52MB, exceeds Lambda's direct upload limit).
### Lambda env var `PYTHONPATH=/var/task/package` must remain set.

## Frontend Deployment

Frontend is deployed manually to Amplify (not git-triggered — Amplify watches `main` branch but code is on `EBAM` branch).

```bash
cd web/
npm run build
cd dist/
zip -r /tmp/ebam-frontend.zip .   # zip contents, NOT the dist folder itself
```
Then use Amplify `create-deployment` + presigned URL upload + `start-deployment`.
