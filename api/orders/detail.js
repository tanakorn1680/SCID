// GET /api/orders/detail?id={order_id}
// รายละเอียด order รวม credential (ถ้า delivered แล้ว)

import { requireAuth, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }              from '../_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile } = await requireAuth(req);

    const url     = new URL(req.url);
    const orderId = url.searchParams.get('id');

    if (!orderId) {
      return Response.json(
        { success: false, error: 'ไม่ระบุ order id' },
        { status: 400 }
      );
    }

    // ดึง order พร้อมตรวจว่าเป็นของ user นี้
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, product_label, amount, status, reject_reason, created_at, updated_at, user_id')
      .eq('id', orderId)
      .single();

    if (error || !order) {
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

    let credential = null;

    // ดึง credential เฉพาะเมื่อ delivered แล้ว
    if (order.status === 'delivered') {
      const { data: cred, error: credErr } = await supabaseAdmin
        .from('credentials')
        .select('gmail, password_enc, delivered_at')
        .eq('order_id', orderId)
        .single();

      if (!credErr && cred) {
        // decrypt password
        const { data: decrypted, error: decErr } = await supabaseAdmin
          .rpc('decrypt_password', { enc: cred.password_enc });

        credential = {
          gmail:        cred.gmail,
          password:     decErr ? null : decrypted,
          delivered_at: cred.delivered_at,
        };
      }
    }

    return Response.json({
      success: true,
      data: {
        id:           order.id,
        product_label: order.product_label,
        amount:        order.amount,
        status:        order.status,
        reject_reason: order.reject_reason,
        created_at:    order.created_at,
        updated_at:    order.updated_at,
        credential,   // null ถ้ายังไม่ delivered
      },
    });

  } catch (err) {
    return errorResponse(err);
  }
}
