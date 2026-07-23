// GET /api/settings
// Public — logo, banner, สี, ข้อความหน้าแรก ฯลฯ (ไม่ต้อง login)

import { supabaseAdmin } from './_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('key, value');

    if (error) throw error;

    const settings = {};
    for (const row of data) settings[row.key] = row.value;

    return Response.json({ success: true, data: settings });

  } catch (err) {
    console.error('GET /api/settings failed:', err);
    return Response.json(
      { success: false, error: 'โหลดการตั้งค่าไม่สำเร็จ' },
      { status: 500 }
    );
  }
}
