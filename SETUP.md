# Phase 1 — Setup Guide

## 1. สร้าง Supabase Project
1. ไปที่ https://supabase.com → New Project
2. รอ provision เสร็จ (~2 นาที)

## 2. รัน Migration (เรียงตามลำดับ)
ไปที่ **Supabase Dashboard → SQL Editor** แล้ว copy-paste รันตามลำดับ:
1. `supabase/migrations/001_init_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_seed_data.sql`
4. `supabase/migrations/004_product_stock.sql` *(Phase 2 — เพิ่ม rating + stock function)*
5. `supabase/migrations/005_seed_demo_products.sql` *(Phase 2 — สินค้าตัวอย่างพร้อม inventory ทดสอบ)*
6. `supabase/migrations/006_checkout_reservation.sql` *(Phase 3 — ระบบจองไอดี + สร้างออเดอร์แบบ atomic)*
7. `supabase/migrations/007_storage_slips.sql` *(Phase 3 — สร้าง Storage bucket สำหรับสลิป)*
8. `supabase/migrations/008_admin_foundation.sql` *(Phase 4 — order status 'delivered' + เตรียม encryption)*
9. `supabase/migrations/009_admin_functions.sql` *(Phase 4 — function จัดการคลังไอดี/ตรวจสลิป/ส่งไอดี/dashboard)*

⚠️ **ก่อนรัน migration 008-009 ต้องตั้งค่า encryption key ก่อน** (ดูขั้นตอนที่ 7 ด้านล่าง)
ถ้ารัน migration ก่อนตั้ง key, function จะรันได้ปกติแต่ encrypt/decrypt จะ error
เพราะ `current_setting('app.encryption_key')` ยังไม่มีค่า

## 3. ใส่ค่า Config
`js/config/supabase.js` ไม่ได้ใส่ URL/anon key ตรงๆ ในโค้ดแล้ว
(กัน secret หลุดขึ้น git repo) ใช้ **Vercel Environment Variables** แทน
แล้วให้ build script แทนที่ตอน deploy — ดูขั้นตอนเต็มในข้อ 9-10

หาค่า URL/anon key ได้จาก **Supabase Dashboard → Settings → API**
ใช้ **anon public key เท่านั้น** ห้ามใช้ service_role key

## 4. สร้าง Admin คนแรก
1. สมัครสมาชิกผ่านหน้า `/pages/login.html` ตามปกติ
2. ไปที่ **SQL Editor** รันคำสั่ง:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

## 5. Deploy Edge Function (Discord Webhook) — Phase 3
ต้องใช้ Supabase CLI เพราะ Edge Function รัน server-side ไม่ใช่ static file:

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_ID

# ตั้งค่า secret — Webhook URL จะไม่หลุดไปฝั่ง frontend เด็ดขาด
supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL

# Deploy function
supabase functions deploy notify-discord
```

**วิธีหา Discord Webhook URL:**
1. ไปที่ Discord Server → Settings → Integrations → Webhooks
2. New Webhook → เลือก channel ที่ต้องการแจ้งเตือน → Copy Webhook URL

ถ้ายังไม่ตั้งค่า `DISCORD_WEBHOOK_URL` ระบบจะยังทำงานปกติ (สร้าง order, อัปโหลดสลิปได้)
แค่จะไม่มีการแจ้งเตือนเข้า Discord เท่านั้น (ดู log ใน Supabase Dashboard → Edge Functions)

## 6. ใส่ข้อมูลการชำระเงินจริง — Phase 3
เปิดไฟล์ `pages/checkout.html` ค้นหาและแก้ไข 3 จุดนี้:

1. **QR Code**: แทนที่ `../images/qr-placeholder.png` ด้วยรูป QR Code จริง (วางไฟล์ใน `images/`)
2. **เลขบัญชี + ธนาคาร + ชื่อบัญชี**: ค้นหาคำว่า `รอใส่ข้อมูลจริง` และ `XXX-X-XXXXX-X` แล้วแก้เป็นข้อมูลจริง
3. ทดสอบปุ่ม "คัดลอก" ว่า copy เลขบัญชีที่ถูกต้องหลังแก้ไขแล้ว

## 7. ตั้งค่า Encryption Key — Phase 4 (สำคัญมาก ห้ามข้าม)
ไอดี (Gmail + รหัสผ่าน) ในคลังจะถูกเข้ารหัสก่อนเก็บ ต้องตั้ง key ก่อนใช้ migration 008-009:

1. สร้าง key แบบสุ่มที่ปลอดภัย (รันใน terminal เครื่องตัวเอง ไม่ใช่ใน Supabase):
```bash
openssl rand -base64 32
```
2. คัดลอกค่าที่ได้ ไปรันใน **Supabase SQL Editor**:
```sql
ALTER DATABASE postgres SET app.encryption_key = 'ค่าที่ได้จากขั้นตอนที่ 1';
```
3. **เก็บ key นี้ไว้ที่ปลอดภัยแยกต่างหาก** (เช่น password manager) — ถ้า key หาย จะ decrypt ไอดีเก่าไม่ได้อีกเลย ไม่มีทาง recover
4. ห้ามเปลี่ยน key หลังจากเริ่มเก็บข้อมูลจริงแล้ว เพราะไอดีเก่าทั้งหมดจะ decrypt ไม่ได้ทันที (ถ้าจำเป็นต้องเปลี่ยน ต้อง decrypt ของเก่าด้วย key เก่าก่อน แล้ว encrypt ใหม่ด้วย key ใหม่)

## 8. (ทางเลือก) ปิด Email Confirmation สำหรับทดสอบ
**Dashboard → Authentication → Providers → Email**
ปิด "Confirm email" ชั่วคราวถ้าต้องการทดสอบโดยไม่ต้องเช็คอีเมลจริง
(แนะนำให้เปิดกลับก่อนใช้งานจริง)

## 9. ทดสอบ Local
โปรเจกต์นี้เป็น static site ไม่มี build step จริง เวลาทดสอบ local
ต้อง inject ค่า Supabase เองก่อน (เพราะ `vercel dev` ไม่รัน buildCommand
ของ production เหมือนกันเป๊ะทุกกรณี):

```bash
export SUPABASE_URL="https://khtxjptilymgraqwtemp.supabase.co"
export SUPABASE_ANON_KEY="<anon-key-จาก-Supabase-Dashboard>"
bash scripts/inject-env.sh

npm i -g vercel
vercel dev
```
เข้า `http://localhost:3000/pages/login.html` เพื่อทดสอบสมัคร/login

⚠️ หลังทดสอบเสร็จ `js/config/supabase.js` จะมีค่าจริงถูกเขียนทับไว้แล้ว
**อย่า commit ไฟล์นี้ทั้งที่มีค่าจริงอยู่** — รัน `git checkout js/config/supabase.js`
เพื่อคืนค่าเป็น placeholder (`__SUPABASE_URL__`) ก่อน commit ทุกครั้ง

## 10. Deploy
1. Push code ขึ้น GitHub แล้ว import เข้า Vercel ตามปกติ
2. ไปที่ **Vercel Dashboard → Project Settings → Environment Variables**
   เพิ่ม 2 ตัวแปร (ใส่ทั้ง Production/Preview/Development ตามต้องการ):
   - `SUPABASE_URL` = `https://khtxjptilymgraqwtemp.supabase.co`
   - `SUPABASE_ANON_KEY` = ค่า anon public key จาก Supabase Dashboard
3. ไปที่ **Project Settings → Build & Deployment** ตรวจว่า
   **Build Command** ตั้งเป็น `bash scripts/inject-env.sh`
   (มาพร้อม `vercel.json` แล้ว ปกติไม่ต้องแก้เอง)
4. Deploy ใหม่ — Vercel จะรัน script inject ค่าให้อัตโนมัติทุกครั้งที่ build
   ไม่ต้องแก้โค้ด ไม่ต้อง commit secret ลง repo

**ทำไมต้องทำแบบนี้แทนใส่ค่าตรงในโค้ด:** เว็บนี้ไม่มี framework/bundler
ดังนั้น Vercel จะไม่ inject Environment Variable ให้อัตโนมัติแบบ Next.js/Vite
`scripts/inject-env.sh` เลยทำหน้าที่แทนที่ placeholder token ด้วยค่าจริง
ตอน build แทน — ได้ทั้งความสะดวก (แก้ค่าได้จาก Dashboard ไม่ต้องแก้โค้ด)
และความปลอดภัย (secret ไม่ค้างอยู่ใน git history)

---

## Phase 1 Checklist
- [x] Database schema ครบ 8 tables ตาม Phase 0
- [x] RLS policy ครบทุก table
- [x] Auth: register / login / logout
- [x] Email validation + duplicate check
- [x] Password hashing (Supabase Auth จัดการ — bcrypt)
- [x] Role: customer / admin พร้อม guard
- [x] หน้า: landing, login/register, shop, product, history, admin dashboard
- [x] API wrapper พร้อม stub function สำหรับ Phase 2

## Phase 2 Checklist
- [x] หน้ารวมสินค้า: Hero banner + category tabs + product card grid
- [x] การ์ดสินค้าแสดง: รูป, ชื่อ, rating, ราคา, สถานะสต็อก, ปุ่มดูรายละเอียด
- [x] หน้ารายละเอียดสินค้า: คำอธิบายยาว (รองรับ line break), คุณสมบัติจาก metadata jsonb, หมายเหตุ, ราคา
- [x] Stock คำนวณจาก inventory จริง (status='available') ผ่าน SECURITY DEFINER function — ไม่เปิด raw data
- [x] ปุ่ม "ซื้อสินค้า" ซ่อนอัตโนมัติเมื่อสต็อก=0 → แสดง "สินค้าหมด" แทน
- [x] ไม่มี hardcode สินค้าในโค้ด — ดึงจาก Supabase ทั้งหมด
- [x] Responsive grid: 2 คอลัมน์ (mobile) → 3 (tablet) → 4 (desktop)
- [x] รองรับเพิ่มสินค้า/category ใหม่ไม่จำกัดโดยไม่แก้โค้ดหน้าเว็บ
- [ ] ระบบ Checkout → Phase 3 ✅ เสร็จแล้ว ดูด้านล่าง
- [ ] อัปโหลดสลิป + ตรวจสลิป → Phase 3 ✅ อัปโหลดเสร็จแล้ว (ตรวจสอบรอ Phase 4)
- [ ] ส่งไอดีอัตโนมัติ → Phase 4
- [ ] Discord webhook notify → Phase 3 ✅ เสร็จแล้ว (ส่งแค่ฝั่ง "แจ้งมีออเดอร์ใหม่")
- [ ] Reset password UI → Phase 3/4 (function เตรียมไว้แล้วใน auth.js)

## Phase 3 Checklist
- [x] หน้า Checkout: สรุปสินค้า, ราคา, ข้อมูลผู้ซื้อจาก profile (อีเมล)
- [x] กดยืนยัน → สร้าง order จริงในฐานข้อมูล (status เริ่มต้น = 'pending' / รอชำระเงิน)
- [x] ล็อคไอดี 1 ชิ้นแบบ atomic ด้วย `FOR UPDATE SKIP LOCKED` — กัน race condition เมื่อมีคนซื้อพร้อมกัน
- [x] จองสต็อก 7 นาที (อยู่ในช่วง 5-10 ที่กำหนด) พร้อม countdown timer หน้า checkout
- [x] หมดเวลาจอง → `release_expired_reservations()` ปล่อยคืนสต็อกอัตโนมัติ (เรียกแบบ lazy ทุกครั้งก่อนสั่งซื้อใหม่)
- [x] แสดง QR Code / เลขบัญชี / ชื่อบัญชี / ยอดชำระ (เป็น placeholder — ดูขั้นตอนที่ 6 ด้านบน)
- [x] อัปโหลดสลิป: เลือกไฟล์ → preview → เปลี่ยนรูปได้ก่อนส่ง → ปุ่มส่งกดได้เมื่อเลือกไฟล์แล้วเท่านั้น
- [x] สลิปอัปโหลดไป Supabase Storage (bucket private, path แยกตาม user_id)
- [x] หลังส่งสลิปสำเร็จ → status เปลี่ยนเป็น 'awaiting_slip_review' + บันทึก `slip_submitted_at`
- [x] Discord webhook แจ้งแอดมิน ผ่าน Edge Function (webhook URL เป็น server secret ไม่หลุดไป frontend)
- [x] ยังไม่ตัดสต็อกจริง (แค่ reserve ชั่วคราว) ตามข้อกำหนด
- [x] ยังไม่ส่งไอดีให้ลูกค้า ตามข้อกำหนด
- [x] ยังไม่มีระบบแอดมิน ตามข้อกำหนด
- [ ] ตรวจสอบสลิป (admin อนุมัติ/ปฏิเสธ) → Phase 4 ✅ เสร็จแล้ว
- [ ] ส่งไอดีจริงให้ลูกค้า → Phase 4 ✅ เสร็จแล้ว
- [ ] Admin Dashboard เต็มรูปแบบ → Phase 4 ✅ เสร็จแล้ว

## Phase 4 Checklist
- [x] Dashboard: รอตรวจสอบสลิป, รอส่งไอดี, ส่งสำเร็จวันนี้, สต็อกแยกตามสินค้า — อัปเดตแบบ real-time ผ่าน Supabase Realtime subscription
- [x] คลังไอดี: เพิ่ม/แก้ไข/ลบทีละรายการ — Gmail + รหัสผ่าน (เข้ารหัสก่อนเก็บด้วย pgcrypto)
- [x] คลังไอดี: ค้นหาด้วย Gmail + กรองตามประเภทสินค้า + กรองตามสถานะ
- [x] ลบไอดี: ป้องกันไม่ให้ลบไอดีที่สถานะ 'sold' (ผูกกับออเดอร์จริงแล้ว)
- [x] ตรวจสอบสลิป: แสดงรูปเต็ม (คลิกซูมได้), รายละเอียดออเดอร์, ข้อมูลลูกค้า, เวลาที่ส่งสลิป
- [x] ปุ่มยืนยัน/ปฏิเสธ/ส่งใหม่ ตามสถานะออเดอร์
- [x] ยืนยันการชำระเงิน → ส่งไอดีเป็น atomic เดียวกัน (กันแอดมิน 2 คนกดพร้อมกัน)
- [x] ถ้าไม่มีสต็อกตอนกดยืนยัน → แจ้งเตือนทันที ไม่ดำเนินการต่อ (ตามข้อกำหนด)
- [x] ปฏิเสธสลิป: ต้องระบุเหตุผล → กลับสถานะเป็น 'pending' ให้ลูกค้าส่งสลิปใหม่
- [x] ส่งใหม่: เลือกไอดีใหม่ + ยืนยันก่อนส่ง + บันทึกประวัติเพิ่ม **ไม่ลบของเดิม**
- [x] Audit Log: บันทึกครบทุก action ที่ Frank ระบุ (เพิ่ม/แก้ไข/ลบไอดี, ยืนยัน/ปฏิเสธสลิป, ส่งไอดี, ส่งใหม่) พร้อมวันเวลา/ผู้ดำเนินการ/Order ID
- [x] ค้นหาออเดอร์: Order ID, อีเมลลูกค้า, ประเภทสินค้า, สถานะ — พร้อม filter UI
- [x] Discord แจ้งเตือนพร้อม Order ID, สินค้า, ยอดชำระ, เวลาที่ส่งสลิป (ขยายจาก Phase 3 เดิม)
- [x] ห้ามส่งไอดีอัตโนมัติ — ทุกครั้งต้องแอดมินกดยืนยันเองเท่านั้น
- [x] ไอดี 1 รายการขายได้ครั้งเดียว (atomic lock กันขายซ้ำ)
- [x] ไม่มี hardcode — ทุกอย่างดึงจาก Supabase
- [x] รองรับเพิ่มประเภทสินค้าใหม่โดยไม่ต้องแก้โค้ด (dropdown ดึงจาก DB อัตโนมัติ)
- [ ] หน้าจัดการสินค้า (products.html) → ไม่อยู่ใน scope Phase 4 ตามที่ระบุ รอ Phase ถัดไป
- [ ] หน้าจัดการสมาชิก (users.html) → ไม่อยู่ใน scope Phase 4 ตามที่ระบุ รอ Phase ถัดไป

## Phase 5 Checklist
- [x] `history.html` (rebuild): แสดง Order ID, วันที่, ชื่อสินค้า, ราคา, สถานะ badge 5 สี ครบ (รอชำระ/รอตรวจสลิป/รอส่งไอดี/ส่งแล้ว/ยกเลิก)
- [x] เรียงจากออเดอร์ล่าสุดก่อน (default order ใน `getMyOrders()`)
- [x] ปุ่ม "ดูรายละเอียด →" link ไปหน้า `order-detail.html?id=xxx`
- [x] ออเดอร์ที่ยัง pending → ปุ่ม "ชำระเงิน →" ไป checkout แทน (ไม่แสดงปุ่ม "ดูรายละเอียด" เพราะยังไม่มีอะไรให้ดู)
- [x] Real-time: badge สถานะอัปเดตทันทีโดยไม่ต้อง reload เมื่อแอดมินเปลี่ยนสถานะ (Supabase Realtime subscription filter เฉพาะ user นี้)
- [x] Toast notification "ออเดอร์ของคุณได้รับการดำเนินการเรียบร้อยแล้ว" เมื่อ status เปลี่ยนเป็น delivered
- [x] Pulse animation บน card ที่เพิ่งอัปเดต
- [x] `order-detail.html` (ใหม่): หน้ารายละเอียดออเดอร์ครบทุก field — ข้อมูลสินค้า, วันที่สั่งซื้อ, วันที่ส่งสลิป, วันที่แอดมินส่งไอดี, รูปสลิปเต็ม (คลิกซูมได้)
- [x] Timeline 4 ขั้นตอน: สร้างออเดอร์ → ส่งสลิป → แอดมินยืนยัน → ส่งไอดี (พร้อม timestamp แต่ละขั้น)
- [x] ขั้นตอนที่ยังไม่ถึง → แสดงข้อความรอ เช่น "กำลังรอแอดมินตรวจสอบ…"
- [x] Credential box: Gmail + รหัสผ่าน — รหัสผ่าน **ซ่อน (blur) ไว้ก่อน** ตามข้อกำหนด
- [x] ปุ่มแสดง/ซ่อนรหัสผ่าน (toggle)
- [x] ปุ่มคัดลอก Gmail + คัดลอกรหัสผ่าน แยกกัน
- [x] หน้า pending/awaiting → แสดง pending message แทน credential
- [x] Real-time: หน้า detail อัปเดตอัตโนมัติเมื่อสถานะเปลี่ยน (subscribe เฉพาะ order นี้ ไม่ทั้ง table)
- [x] Security: ทุก request ผ่าน RLS + `get_my_delivered_credential()` ตรวจ `auth.uid() = orders.user_id` ก่อน decrypt — ลูกค้าเข้าถึงเฉพาะออเดอร์ตัวเองเท่านั้น
- [x] `/order-detail` clean URL เพิ่มใน `vercel.json`
- [x] ไม่แก้ระบบแอดมินหรือ Checkout ตามขอบเขตที่กำหนด

## Migration 011 (Phase 6 - Frank's Recommendation)
รัน `supabase/migrations/011_site_settings.sql` ใน SQL Editor

จากนั้นตั้งค่าในตาราง site_settings ผ่าน Supabase Dashboard → Table Editor:
```
payment.bank_name   → ชื่อธนาคาร เช่น ธนาคารกสิกรไทย
payment.account_no  → เลขบัญชี เช่น 123-4-56789-0
payment.account_name → ชื่อบัญชี
payment.qr_url      → URL รูป QR Code (upload ไปที่ Supabase Storage แล้ว copy URL)
```

## Phase 6 Checklist — Security & Performance
- [x] Magic bytes validation สำหรับ slip upload — ตรวจ FF D8 FF (JPEG), 89 50 4E 47 (PNG), RIFF/WEBP แทนเชื่อ MIME type จาก browser
- [x] XSS fix ใน shop.html — escape image_url ก่อนใส่ใน src attribute
- [x] Pagination ใน admin inventory (50/หน้า) และ orders (30/หน้า) — ป้องกัน OOM เมื่อข้อมูลมาก
- [x] `loading="lazy"` บนรูปภาพใน shop.html และ product.html
- [x] `setupSessionExpiryHandler()` ทุกหน้าที่ต้องการ auth — redirect ไป login พร้อมข้อความเมื่อ token หมดอายุ
- [x] Session expiry message ใน login.html เมื่อมี `?expired=1`
- [x] `showFatalError()` helper + try/catch รอบ init() ทุกหน้า — ไม่ให้ error เงียบ
- [x] @media breakpoints สำหรับ login, product, checkout, order-detail, history
- [x] Space Mono font import สม่ำเสมอทุกหน้า
- [x] `site_settings` table — ข้อมูลการชำระเงิน/ชื่อเว็บ/ประกาศ แก้ได้จาก DB ไม่ต้องแก้โค้ด
- [x] checkout.html ดึงข้อมูลธนาคาร/QR จาก `site_settings` พร้อม 5-minute cache
- [x] `exportUtil` — Export CSV ของ Orders, Inventory (ไม่รวม password), Audit Logs
- [x] Export buttons ใน admin dashboard
- [x] ไม่มีฟีเจอร์ใหม่ที่นอกเหนือ Phase 6 spec
