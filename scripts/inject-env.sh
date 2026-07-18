#!/bin/bash
# inject-env.sh — แทนที่ placeholder ด้วย env var จริงตอน Vercel build
# Vercel Environment Variables ที่ต้องตั้ง:
#   SUPABASE_URL       = https://xxxx.supabase.co
#   SUPABASE_ANON_KEY  = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

set -e

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set"
  exit 1
fi

sed -i \
  -e "s|__SUPABASE_URL__|${SUPABASE_URL}|g" \
  -e "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" \
  js/api.js

echo "✓ Supabase config injected"
