// api/favicon.js
// GET /api/favicon — fetch รูปจาก logo_url แล้ว pipe bytes กลับโดยตรง
// ไม่ redirect เพราะ Chrome mobile ไม่ follow redirect สำหรับ favicon

import { supabaseAdmin } from './_lib/supabase.js';

export const config = { runtime: 'nodejs' };

const CACHE = 'public, max-age=300, stale-while-revalidate=3600';

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#1A3A52"/>
  <circle cx="16" cy="16" r="8" fill="none" stroke="#2196C9" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="3" fill="#D4A843"/>
</svg>`;

function fallback() {
  return new Response(FALLBACK_SVG, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': CACHE },
  });
}

export async function GET() {
  try {
    // ดึง logo_url จาก site_settings
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', 'logo_url')
      .single();

    if (error || !data?.value) return fallback();

    // fetch รูปจาก Supabase Storage โดยตรง แล้ว pipe กลับ
    const upstream = await fetch(data.value);
    if (!upstream.ok) return fallback();

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const buffer = await upstream.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': CACHE,
      },
    });
  } catch (_) {
    return fallback();
  }
}
