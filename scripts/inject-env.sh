#!/bin/bash
# inject-env.sh — แทนที่ placeholder ด้วยค่าจริงจาก Vercel Environment Variables
# รันโดย Vercel build command ก่อน deploy

set -e

echo "🔧 Injecting environment variables..."

# ตรวจว่า env vars มีครบ
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ ERROR: SUPABASE_URL is not set"
  exit 1
fi
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ ERROR: SUPABASE_ANON_KEY is not set"
  exit 1
fi
if [ -z "$ENCRYPT_KEY" ]; then
  echo "❌ ERROR: ENCRYPT_KEY is not set"
  exit 1
fi

# แทนที่ทุกไฟล์ที่มี placeholder
find . -type f \( -name "*.html" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" | while read file; do
  sed -i \
    -e "s|__SUPABASE_URL__|${SUPABASE_URL}|g" \
    -e "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" \
    -e "s|__ENCRYPT_KEY__|${ENCRYPT_KEY}|g" \
    "$file"
done

echo "✅ Done injecting environment variables"
