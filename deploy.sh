#!/usr/bin/env bash
# Usage: ./deploy.sh [auto|rules|bedrock]
#   auto    (default) try Bedrock, fall back to built-in checks if it fails
#   rules   built-in checks only (never calls Bedrock)
#   bedrock Bedrock only (errors if unavailable)
set -euo pipefail
cd "$(dirname "$0")"

REGION=ap-northeast-1
STACK=code-buddy
ENGINE="${1:-auto}"

aws cloudformation deploy --region "$REGION" --stack-name "$STACK" \
  --template-file template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides Engine="$ENGINE" --no-fail-on-empty-changeset

FN=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue" --output text)

rm -f build.zip
(cd src && zip -q ../build.zip index.mjs rules.mjs i18n.mjs index.html)
aws lambda update-function-code --region "$REGION" --function-name "$FN" --zip-file fileb://build.zip \
  --query 'LastUpdateStatus' --output text
aws lambda wait function-updated --region "$REGION" --function-name "$FN"

URL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text)
echo "$URL"

echo "Self-test:"
curl -s -o /dev/null -w "  GET /          -> HTTP %{http_code}\n" "$URL"
curl -s -X POST "${URL}review" -H 'content-type: application/json' \
  -d '{"code":"if x = 5:\n    pass\n","language":"Python"}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  POST /review   -> engine:", d.get("engine", "ERROR " + str(d.get("error"))), "|", len(d.get("issues", [])), "issue(s)")'
curl -s -X POST "${URL}speak" -H 'content-type: application/json' -d '{"text":"Hello","lang":"en"}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  POST /speak    ->", "audio ok" if d.get("audio") else "ERROR " + str(d.get("error")))'
