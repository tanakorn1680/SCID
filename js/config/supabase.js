// ============================================================
// Supabase Client Configuration
// จุดเดียวที่ init client — ไฟล์อื่นทั้งหมด import จากที่นี่
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// TODO: แทนที่ด้วยค่าจริงจาก Supabase Dashboard > Settings > API
// ใช้ ANON KEY เท่านั้น — ห้ามใช้ SERVICE_ROLE key ใน frontend เด็ดขาด
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// ─────────────────────────────────────────
// Role constants — ใช้ตรงนี้แทนเขียน string ตรงๆ ทุกที่
// ป้องกัน typo และง่ายต่อการเพิ่ม role ใหม่ใน Phase ถัดไป
// ─────────────────────────────────────────
export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  ADMIN: 'admin'
});

// ─────────────────────────────────────────
// Order status constants
// ─────────────────────────────────────────
export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  AWAITING_SLIP_REVIEW: 'awaiting_slip_review',
  PAID: 'paid',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
});

// ─────────────────────────────────────────
// Reservation TTL — ต้องตรงกับค่าใน migration 006 (release_expired_reservations)
// ใช้แสดง countdown ในหน้า checkout เท่านั้น ความถูกต้องจริงอยู่ที่ DB
// ─────────────────────────────────────────
export const RESERVATION_TTL_MINUTES = 7;

// หมายเหตุ: Discord Webhook URL ไม่ใส่ไว้ที่นี่โดยเจตนา
// เพราะ frontend code อ่านได้ทุกคน ถ้าใส่ URL ตรงนี้ใครก็เอาไปยิง spam
// แจ้งเตือนปลอมเข้า Discord ของแอดมินได้ทันที
// → ต้องเรียกผ่าน Supabase Edge Function ที่เก็บ secret ฝั่ง server เท่านั้น
// ดู: supabase/functions/notify-discord/index.ts
