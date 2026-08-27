// api/favicon.js
// GET /api/favicon — redirect ไปยัง logo_url จาก site_settings
// ใช้เป็น <link rel="icon" href="/api/favicon"> ในทุกหน้า
// browser จะ follow redirect ไปยังรูปจริงใน Supabase Storage อัตโนมัติ

import { supabaseAdmin } from './_lib/supabase.js';

export const config = { runtime: 'nodejs' };

// cache-control: 5 นาที — favicon ไม่ค่อยเปลี่ยน แต่ไม่ต้อง lock นานเกิน
const CACHE = 'public, max-age=300, stale-while-revalidate=3600';

// fallback SVG favicon — แสดงเมื่อยังไม่มี logo_url ตั้งค่าไว้
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#1A3A52"/>
  <circle cx="16" cy="16" r="8" fill="none" stroke="#2196C9" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="3" fill="#D4A843"/>
</svg>`;

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', 'logo_url')
      .single();

    if (!error && data?.value) {
      return Response.redirect(data.value, 302);
    }
  } catch (_) { /* ไม่มี logo_url → ใช้ fallback */ }

  // fallback: SVG inline ไม่ต้องพึ่ง external URL
  return new Response(FALLBACK_SVG, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': CACHE,
    },
  });
}
