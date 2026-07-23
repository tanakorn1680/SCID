// /api/admin/settings
// Admin only — ตั้งค่าเว็บไซต์ (key-value)
//
// GET → ทุก setting ปัจจุบัน
// PUT { updates: { key1: value1, key2: value2, ... } } → อัปเดตหลาย key พร้อมกัน

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

export default async function handler(req) {
  try {
    await requireAdmin(req);

    if (req.method === 'GET') return await getSettings();
    if (req.method === 'PUT') return await putSettings(req);

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/admin/settings failed:`, err);
    return errorResponse(err);
  }
}

async function getSettings() {
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('key, value, updated_at');

  if (error) throw error;

  const settings = {};
  for (const row of data) settings[row.key] = row.value;

  return Response.json({ success: true, data: settings });
}

async function putSettings(req) {
  const { updates } = await req.json();

  if (!updates || typeof updates !== 'object' || !Object.keys(updates).length) {
    return Response.json(
      { success: false, error: 'ไม่มีข้อมูลที่จะอัปเดต' },
      { status: 400 }
    );
  }

  // upsert ทีละ key — site_settings เป็น key-value เดี่ยว key เป็น primary key อยู่แล้ว
  const rows = Object.entries(updates).map(([key, value]) => ({ key, value }));

  const { error } = await supabaseAdmin
    .from('site_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) throw error;

  return Response.json({ success: true });
}
