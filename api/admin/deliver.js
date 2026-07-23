// POST /api/admin/deliver
// Body: { order_id }
// Admin only — ยืนยันสลิป → ดึงไอดีตัวแรกที่พร้อมขายจากคลังอัตโนมัติ (atomic, กันขายซ้ำ)
// เปลี่ยนสถานะ inventory เป็น sold, order เป็น delivered — ทำใน 1 transaction ผ่าน RPC

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';
import { decrypt }                     from '../_lib/crypto.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const { order_id } = await req.json();

    if (!order_id) {
      return Response.json(
        { success: false, error: 'ไม่ระบุ order_id' },
        { status: 400 }
      );
    }

    // เรียก deliver_order() — atomic function ใน DB
    // จัดการ lock order, ดึง+lock inventory ตัวแรกที่ ready, เปลี่ยนสถานะทั้งคู่
    // ทั้งหมดใน transaction เดียว กัน race condition ถ้าแอดมิน 2 คนกดพร้อมกัน
    const { data, error } = await supabaseAdmin.rpc('deliver_order', {
      p_order_id: order_id,
    });

    if (error) {
      // error.message มาจาก RAISE EXCEPTION ใน SQL function
      if (error.message?.includes('ORDER_NOT_AWAITING_REVIEW')) {
        return Response.json(
          { success: false, error: 'ออเดอร์นี้ไม่ได้อยู่ในสถานะรอตรวจสลิปแล้ว' },
          { status: 400 }
        );
      }
      if (error.message?.includes('OUT_OF_STOCK')) {
        return Response.json(
          { success: false, error: 'ไอดีในคลังสำหรับสินค้านี้หมดแล้ว กรุณาเพิ่มไอดีเข้าคลังก่อน' },
          { status: 409 }
        );
      }
      throw error;
    }

    // RPC คืนเป็น array เสมอ (RETURNS TABLE) — เอาแถวแรก
    const result = data?.[0];
    if (!result) throw new Error('ไม่ได้รับข้อมูลไอดีจากระบบ');

    // ⚠️ ถึงจุดนี้ inventory ถูก mark เป็น sold และผูกกับ order แล้ว (RPC commit ไปแล้ว)
    // ถ้า decrypt fail ต้องแจ้งแอดมินทันที ไม่ใช่เงียบแล้วส่ง password ว่างไปโดยไม่รู้ตัว
    // เพราะลูกค้าจ่ายเงินแล้วและไอดีถูกล็อกให้ order นี้ไปแล้ว ไม่มีทาง "ลองใหม่" ง่ายๆ
    let password;
    try {
      password = decrypt(result.password_enc);
    } catch (decryptErr) {
      console.error(`decrypt failed for delivered inventory (order ${order_id}):`, decryptErr);
      return Response.json({
        success: false,
        error: `ส่งไอดีสำเร็จแต่ถอดรหัสรหัสผ่านไม่ได้ (Gmail: ${result.gmail}) กรุณาติดต่อผู้ดูแลระบบด่วน — ห้ามกดส่งซ้ำ`,
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      data: { gmail: result.gmail, password },
    });

  } catch (err) {
    console.error('POST /api/admin/deliver failed:', err);
    return errorResponse(err);
  }
}

export const config = { runtime: "nodejs" };
