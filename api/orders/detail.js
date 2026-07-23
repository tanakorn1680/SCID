// GET /api/orders/detail?id={order_id}
// รายละเอียด order รวม credential (ถ้า delivered แล้ว)

import { requireAuth, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }              from '../_lib/supabase.js';
import { decrypt }                    from '../_lib/crypto.js';

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

    // ดึงไอดีเฉพาะเมื่อ delivered แล้ว
    // V3 เขียนลง inventory (ผ่าน deliver_order RPC) — เช็คที่นี่ก่อน
    // ถ้าไม่เจอ (order เก่าก่อน migration) fallback ไปอ่าน credentials เดิม
    // credentials เป็น historical read-only ตาม decision — ไม่มีการเขียนใหม่ลงตารางนี้อีก
    if (order.status === 'delivered') {
      const { data: inv, error: invErr } = await supabaseAdmin
        .from('inventory')
        .select('gmail, password_enc, sold_at')
        .eq('order_id', orderId)
        .single();

      if (!invErr && inv) {
        let password = null, decryptFailed = false;
        try {
          password = decrypt(inv.password_enc);
        } catch (decryptErr) {
          console.error(`decrypt failed for order ${orderId} (inventory):`, decryptErr);
          decryptFailed = true;
        }
        credential = { gmail: inv.gmail, password, delivered_at: inv.sold_at, decrypt_failed: decryptFailed };
      } else {
        const { data: cred, error: credErr } = await supabaseAdmin
          .from('credentials')
          .select('gmail, password_enc, delivered_at')
          .eq('order_id', orderId)
          .single();

        if (!credErr && cred) {
          let password = null, decryptFailed = false;
          try {
            password = decrypt(cred.password_enc);
          } catch (decryptErr) {
            console.error(`decrypt failed for order ${orderId} (credentials):`, decryptErr);
            decryptFailed = true;
          }
          credential = { gmail: cred.gmail, password, delivered_at: cred.delivered_at, decrypt_failed: decryptFailed };
        }
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
-e 

export const config = { runtime: "nodejs" };
