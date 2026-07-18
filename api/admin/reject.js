// POST /api/admin/reject
// Body: { order_id, reason }
// Admin only — ปฏิเสธสลิป กลับเป็น pending ให้ลูกค้าส่งใหม่

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const { order_id, reason } = await req.json();

    if (!order_id || !reason?.trim()) {
      return Response.json(
        { success: false, error: 'กรุณาระบุเหตุผล' },
        { status: 400 }
      );
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return Response.json(
        { success: false, error: 'ไม่พบออเดอร์' },
        { status: 404 }
      );
    }

    if (order.status !== 'awaiting_review') {
      return Response.json(
        { success: false, error: 'ออเดอร์นี้ไม่ได้อยู่ในสถานะรอตรวจสลิป' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        status:        'pending',
        reject_reason: reason.trim(),
        slip_path:     null,   // ลบสลิปเดิมออก ให้อัปโหลดใหม่
      })
      .eq('id', order_id);

    if (error) throw error;

    return Response.json({ success: true });

  } catch (err) {
    return errorResponse(err);
  }
}
