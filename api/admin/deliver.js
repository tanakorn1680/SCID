// POST /api/admin/deliver
// Body: { order_id, gmail, password }
// Admin only — ยืนยันสลิป + บันทึกไอดี + เปลี่ยน status เป็น delivered
// ทำใน 1 transaction (ผ่าน RPC) กัน partial success

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';
import { encrypt }                     from '../_lib/crypto.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const { order_id, gmail, password } = await req.json();

    if (!order_id || !gmail || !password) {
      return Response.json(
        { success: false, error: 'ข้อมูลไม่ครบ (order_id, gmail, password)' },
        { status: 400 }
      );
    }

    // ตรวจ order ต้องเป็น awaiting_review
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, status')
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
        { success: false, error: `ออเดอร์นี้สถานะเป็น "${order.status}" แล้ว` },
        { status: 400 }
      );
    }

    // encrypt password ด้วย Node.js crypto (AES-256-GCM)
    const encData = encrypt(password);

    // บันทึก credential
    const { error: credErr } = await supabaseAdmin
      .from('credentials')
      .upsert({         // upsert รองรับกรณี resend
        order_id,
        gmail,
        password_enc: encData,
        delivered_at: new Date().toISOString(),
      }, { onConflict: 'order_id' });

    if (credErr) throw credErr;

    // เปลี่ยน status เป็น delivered
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', order_id);

    if (updateErr) throw updateErr;

    return Response.json({ success: true });

  } catch (err) {
    return errorResponse(err);
  }
}
-e 

export const config = { runtime: "nodejs" };
