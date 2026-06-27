# SimCity BuildIt — เมนูสั่งซื้อ

เว็บไซต์แบบ Static (HTML/CSS/JS ในไฟล์เดียว) พร้อม deploy ขึ้น Vercel

## วิธี Deploy ขึ้น Vercel (เลือกวิธีใดวิธีหนึ่ง)

### วิธีที่ 1 — ลากวาง (เร็วที่สุด)
1. เข้า https://vercel.com → New Project
2. เลือก "Deploy" แบบ Drag & Drop แล้วลากโฟลเดอร์ที่แตกไฟล์ zip นี้ทั้งโฟลเดอร์ลงไป
3. กด Deploy รอประมาณ 10-20 วินาที เสร็จเลย

### วิธีที่ 2 — Vercel CLI
```bash
npm install -g vercel   # ถ้ายังไม่มี
cd simcity-deploy        # โฟลเดอร์ที่แตกจาก zip
vercel --prod
```

### วิธีที่ 3 — เชื่อมกับ Git
1. Push โฟลเดอร์นี้ขึ้น GitHub/GitLab/Bitbucket
2. เข้า Vercel → New Project → Import Git Repository
3. Framework Preset เลือก "Other" (เพราะเป็น static HTML ล้วน) → Deploy

## โครงสร้างไฟล์
```
simcity-deploy/
├── index.html     ← หน้าเว็บหลัก (ไฟล์เดิมของคุณ เปลี่ยนชื่อเป็น index.html)
└── vercel.json     ← ตั้งค่า security headers + caching
```

## หมายเหตุ
- ไม่ต้องมี build step, ไม่ต้องมี package.json — Vercel จะ serve ไฟล์ static ตรงๆ
- ปุ่ม "แจ้งออเดอร์" ในหน้านี้ลิงก์ไปที่ Facebook Messenger (m.me) ของเพจที่ตั้งค่าไว้ในโค้ด ถ้าต้องการเปลี่ยนเพจ ให้แก้ค่า `pageUsername` ในไฟล์ index.html
