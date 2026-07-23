// GET /api/products
// Public — แสดงรายการสินค้าที่เปิดขาย จัดกลุ่มตาม category (ไม่ต้อง login)

import { supabaseAdmin } from './_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('key, label, category, price')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return Response.json({ success: true, data });

  } catch (err) {
    console.error('GET /api/products failed:', err);
    return Response.json(
      { success: false, error: 'โหลดสินค้าไม่สำเร็จ' },
      { status: 500 }
    );
  }
}
