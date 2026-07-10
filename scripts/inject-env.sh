#!/usr/bin/env bash
# ============================================================
# inject-env.sh
#
# โปรเจกต์นี้เป็น static site ล้วน (ไม่มี framework/bundler)
# ดังนั้น Vercel Environment Variables จะไม่ถูก inject ให้อัตโนมัติ
# แบบที่ Next.js/Vite ทำ — script นี้เลยทำหน้าที่แทน:
#
#   1. อ่านค่า SUPABASE_URL / SUPABASE_ANON_KEY จาก Vercel Env Vars
#      (Vercel inject เป็น process env ให้ตอนรัน Build Command เสมอ
#      ไม่ว่าโปรเจกต์จะเป็น framework อะไรก็ตาม)
#   2. แทนที่ token __SUPABASE_URL__ / __SUPABASE_ANON_KEY__
#      ใน js/config/supabase.js ด้วยค่าจริง
#   3. ถ้าตัวแปรไม่ถูกตั้งไว้ ให้ build ล้มเหลวทันที (fail fast)
#      กันไม่ให้ deploy ไปพร้อม placeholder เงียบๆ โดยไม่รู้ตัว
#
# ตั้งค่าใน Vercel: Project Settings > Build & Deployment
#   Build Command: bash scripts/inject-env.sh
# ============================================================

set -euo pipefail

CONFIG_FILE="js/config/supabase.js"

if [ -z "${SUPABASE_URL:-}" ]; then
  echo "ERROR: ไม่พบ Environment Variable ชื่อ SUPABASE_URL"
  echo "  -> ไปตั้งค่าที่ Vercel Dashboard > Settings > Environment Variables"
  exit 1
fi

if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "ERROR: ไม่พบ Environment Variable ชื่อ SUPABASE_ANON_KEY"
  echo "  -> ไปตั้งค่าที่ Vercel Dashboard > Settings > Environment Variables"
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: ไม่พบไฟล์ $CONFIG_FILE (รันสคริปต์นี้จาก root ของโปรเจกต์หรือยัง?)"
  exit 1
fi

# ใช้ | เป็น delimiter ของ sed เพราะ SUPABASE_URL มี "/" อยู่ (https://...)
sed -i.bak \
  -e "s|__SUPABASE_URL__|${SUPABASE_URL}|g" \
  -e "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" \
  "$CONFIG_FILE"

rm -f "${CONFIG_FILE}.bak"

echo "✓ Injected SUPABASE_URL และ SUPABASE_ANON_KEY เข้า $CONFIG_FILE เรียบร้อย"
