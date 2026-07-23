// POST /api/orders/create
// Body: { product_key: 'account_real' }
// สร้าง order ใหม่ — ราคาคำนวณ server-side เสมอ

import { requireAuth, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }              from '../_lib/supabase.js';
import { getProduct }                 from '../_lib/products.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile } = await requireAuth(req);

    const { product_key } = await req.json();

    // ตรวจ product_key (getProduct query DB — ต้อง await)
    const product = await getProduct(product_key);
    if (!product) {
      return Response.json(
        { success: false, error: 'ไม่พบสินค้า' },
        { status: 400 }
      );
    }

    // สร้าง order — amount ใช้จาก server ไม่รับจาก client
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id:       profile.id,
        user_email:    profile.email,
        product_key:   product.key,
        product_label: product.label,
        amount:        product.price,
        status:        'pending',
      })
      .select('id, product_label, amount, status, created_at')
      .single();

    if (error) throw error;

    return Response.json({ success: true, data: order });

  } catch (err) {
    return errorResponse(err);
  }
}
