// GET /api/admin/slip-url?order_id={id}
// Admin only — สร้าง signed URL สำหรับดูสลิป (อายุ 10 นาที)

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const url     = new URL(req.url);
    const orderId = url.searchParams.get('order_id');

    if (!orderId) {
      return Response.json(
        { success: false, error: 'ไม่ระบุ order_id' },
        { status: 400 }
      );
    }

    // ดึง slip_path จาก order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('slip_path')
      .eq('id', orderId)
      .single();

    if (orderErr || !order?.slip_path) {
      return Response.json(
        { success: false, error: 'ไม่พบสลิป' },
        { status: 404 }
      );
    }

    // สร้าง signed URL อายุ 10 นาที
    const { data, error } = await supabaseAdmin.storage
      .from('slips')
      .createSignedUrl(order.slip_path, 60 * 10);

    if (error || !data?.signedUrl) throw error;

    return Response.json({ success: true, url: data.signedUrl });

  } catch (err) {
    return errorResponse(err);
  }
}
