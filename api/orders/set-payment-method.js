// POST /api/orders/set-payment-method
// Body: { order_id, payment_method_id }
// ผูกช่องทางชำระเงินที่ลูกค้าเลือกในหน้า checkout เข้ากับ order

import { requireAuth, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }              from '../_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile } = await requireAuth(req);

    const { order_id, payment_method_id } = await req.json();

    if (!order_id || !payment_method_id) {
      return Response.json(
        { success: false, error: 'ข้อมูลไม่ครบ' },
        { status: 400 }
      );
    }

    // ตรวจ order เป็นของ user นี้และยังไม่ชำระเงิน
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, status, user_id')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return Response.json(
        { success: false, error: 'ไม่พบออเดอร์' },
        { status: 404 }
      );
    }

    if (order.user_id !== profile.id) {
      return Response.json(
        { success: false, error: 'ไม่มีสิทธิ์' },
        { status: 403 }
      );
    }

    if (order.status !== 'pending') {
      return Response.json(
        { success: false, error: 'ไม่สามารถเปลี่ยนช่องทางชำระเงินในสถานะนี้' },
        { status: 400 }
      );
    }

    // ตรวจว่าช่องทางที่เลือกยังเปิดใช้งานอยู่
    const { data: method, error: methodErr } = await supabaseAdmin
      .from('payment_methods')
      .select('id, type, label, details')
      .eq('id', payment_method_id)
      .eq('is_active', true)
      .single();

    if (methodErr || !method) {
      return Response.json(
        { success: false, error: 'ช่องทางชำระเงินนี้ไม่พร้อมใช้งาน' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ payment_method_id })
      .eq('id', order_id);

    if (updateErr) throw updateErr;

    return Response.json({ success: true, data: method });

  } catch (err) {
    console.error('POST /api/orders/set-payment-method failed:', err);
    return errorResponse(err);
  }
}
