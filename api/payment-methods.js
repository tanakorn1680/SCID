// GET /api/payment-methods
// Public — แสดงช่องทางชำระเงินที่เปิดใช้งาน (สำหรับหน้า checkout, ไม่ต้อง login)

import { supabaseAdmin } from './_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('payment_methods')
      .select('id, type, label, details')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return Response.json({ success: true, data });

  } catch (err) {
    console.error('GET /api/payment-methods failed:', err);
    return Response.json(
      { success: false, error: 'โหลดช่องทางชำระเงินไม่สำเร็จ' },
      { status: 500 }
    );
  }
}
