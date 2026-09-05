// api/_lib/handlers/admin-orders.js
// Business logic สำหรับ order lifecycle ฝั่งแอดมิน (list / approve / reject)
// รวมจาก admin/orders.js + admin/deliver.js + admin/reject.js เดิม
// เหตุผลที่รวม: ทั้ง 3 endpoint แก้ไข/อ่านตาราง `orders` เป็นหลัก
// (approve ก็คือ RPC ที่เปลี่ยน orders.status เป็น delivered, reject เปลี่ยนเป็น pending)
// เป็น order lifecycle เดียวกัน ไม่ใช่การรวมข้าม concern
//
// ไฟล์นี้ export ฟังก์ชันล้วน ไม่มี Response.json ปนกับ routing —
// api/admin/orders.js (router) เป็นตัวเดียวที่ตัดสินใจ HTTP response

import { supabaseAdmin } from '../supabase.js';
import { decrypt }       from '../crypto.js';

const PAGE_SIZE = 30;
const PENDING_EXPIRY_MINUTES = 10;

/**
 * expireAllPendingOrders — เวอร์ชัน global ของ auto-expire (ไม่จำกัด user_id)
 * เรียกก่อน list เสมอ เพื่อให้แอดมินเห็นสถานะล่าสุดโดยไม่ต้องรอให้ลูกค้า
 * เปิดหน้าประวัติของตัวเองก่อน (ซึ่งเป็น per-user check ใน customer-orders.js)
 */
async function expireAllPendingOrders() {
  const cutoff = new Date(Date.now() - PENDING_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  if (error) console.error('expireAllPendingOrders failed:', error);
}

/**
 * list — ดูออเดอร์ทั้งหมด พร้อม filter/pagination
 * เดิมคือ GET /api/admin/orders
 */
export async function listOrders(url) {
  await expireAllPendingOrders();

  const status = url.searchParams.get('status') || null;
  const page   = parseInt(url.searchParams.get('page') || '0', 10);
  const search = url.searchParams.get('search') || '';

  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, user_email, product_label, amount, status, slip_path, reject_reason, created_at, updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('user_email', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count ?? 0, page, page_size: PAGE_SIZE };
}

/**
 * approve — ยืนยันสลิป → ดึงไอดีจากคลังอัตโนมัติผ่าน deliver_order() RPC (atomic)
 * เดิมคือ POST /api/admin/deliver
 * คืนค่า { httpStatus, body } เพราะ error บางอย่างต้อง map เป็น status code เฉพาะ
 * (409 สำหรับ OUT_OF_STOCK, 500 สำหรับ decrypt fail) — router เอาไปใช้ตรงๆ
 */
export async function approveOrder(orderId) {
  if (!orderId) {
    return { httpStatus: 400, body: { success: false, error: 'ไม่ระบุ order_id' } };
  }

  const { data, error } = await supabaseAdmin.rpc('deliver_order', {
    p_order_id: orderId,
  });

  if (error) {
    if (error.message?.includes('ORDER_NOT_AWAITING_REVIEW')) {
      return {
        httpStatus: 400,
        body: { success: false, error: 'ออเดอร์นี้ไม่ได้อยู่ในสถานะรอตรวจสลิปแล้ว' },
      };
    }
    if (error.message?.includes('OUT_OF_STOCK')) {
      return {
        httpStatus: 409,
        body: { success: false, error: 'ไอดีในคลังสำหรับสินค้านี้หมดแล้ว กรุณาเพิ่มไอดีเข้าคลังก่อน' },
      };
    }
    throw error;
  }

  const result = data?.[0];
  if (!result) throw new Error('ไม่ได้รับข้อมูลไอดีจากระบบ');

  // ⚠️ ถึงจุดนี้ inventory ถูก mark เป็น sold และผูกกับ order แล้ว (RPC commit ไปแล้ว)
  // ถ้า decrypt fail ต้องแจ้งแอดมินทันที ไม่ใช่เงียบแล้วส่ง password ว่างไปโดยไม่รู้ตัว
  let password;
  try {
    password = decrypt(result.password_enc);
  } catch (decryptErr) {
    console.error(`decrypt failed for delivered inventory (order ${orderId}):`, decryptErr);
    return {
      httpStatus: 500,
      body: {
        success: false,
        error: `ส่งไอดีสำเร็จแต่ถอดรหัสรหัสผ่านไม่ได้ (Gmail: ${result.gmail}) กรุณาติดต่อผู้ดูแลระบบด่วน — ห้ามกดส่งซ้ำ`,
      },
    };
  }

  return {
    httpStatus: 200,
    body: { success: true, data: { gmail: result.gmail, password } },
  };
}

export async function getOrderDetail(orderId) {
  const { data, error } = await supabaseAdmin
    .from('inventory')
    .select('gmail, password_enc, sold_at, instruction_title, instruction_body, product_key')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { httpStatus: 200, body: { success: true, data: null } };

  let password = null;
  try { password = decrypt(data.password_enc); } catch { /* non-fatal */ }

  return {
    httpStatus: 200,
    body: {
      success: true,
      data: {
        gmail:             data.gmail,
        password,
        sold_at:           data.sold_at,
        instruction_title: data.instruction_title ?? null,
        instruction_body:  data.instruction_body  ?? null,
        product_key:       data.product_key,
      },
    },
  };
}

/**
 * deleteOrder — ลบออเดอร์ได้เฉพาะ cancelled และ delivered
 * - cancelled: ลบได้เลย ไม่มี inventory ผูกอยู่
 * - delivered: ต้อง reset inventory กลับเป็น ready ก่อน แล้วค่อยลบ order
 */
export async function deleteOrder(orderId) {
  if (!orderId) {
    return { httpStatus: 400, body: { success: false, error: 'ไม่ระบุ order_id' } };
  }

  // ดึง slip_path ก่อนลบ เพื่อลบไฟล์ใน Storage ด้วย
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, status, slip_path')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { httpStatus: 404, body: { success: false, error: 'ไม่พบออเดอร์' } };
  }

  if (!['cancelled', 'delivered'].includes(order.status)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'ลบได้เฉพาะออเดอร์ที่ยกเลิกหรือส่งแล้วเท่านั้น' },
    };
  }

  // 1) inventory → reset กลับเป็น ready (เฉพาะ delivered)
  if (order.status === 'delivered') {
    const { error: invErr } = await supabaseAdmin
      .from('inventory')
      .update({ status: 'ready', sold_at: null, order_id: null })
      .eq('order_id', orderId);
    if (invErr) throw invErr;
  }

  // 2) credentials → ลบทิ้ง (ไอดีที่ส่งไปแล้วไม่มีประโยชน์เก็บไว้ถ้าลบ order)
  const { error: credErr } = await supabaseAdmin
    .from('credentials')
    .delete()
    .eq('order_id', orderId);
  if (credErr) throw credErr;

  // 3) bank_notifications → set null เก็บประวัติสลิปไว้แต่ตัดความผูกกับ order
  const { error: bankErr } = await supabaseAdmin
    .from('bank_notifications')
    .update({ matched_order_id: null })
    .eq('matched_order_id', orderId);
  if (bankErr) throw bankErr;

  // 4) ลบสลิปออกจาก Storage (ถ้ามี) — non-fatal ถ้าลบไม่ได้ไม่ block
  if (order.slip_path) {
    await supabaseAdmin.storage
      .from('slips')
      .remove([order.slip_path])
      .catch(err => console.warn('Storage remove slip failed (non-fatal):', err));
  }

  // 5) ลบ order
  const { error: delErr } = await supabaseAdmin
    .from('orders')
    .delete()
    .eq('id', orderId);
  if (delErr) throw delErr;

  return { httpStatus: 200, body: { success: true } };
}

export async function rejectOrder(orderId, reason) {
  if (!orderId || !reason?.trim()) {
    return { httpStatus: 400, body: { success: false, error: 'กรุณาระบุเหตุผล' } };
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { httpStatus: 404, body: { success: false, error: 'ไม่พบออเดอร์' } };
  }

  if (order.status !== 'awaiting_review') {
    return {
      httpStatus: 400,
      body: { success: false, error: 'ออเดอร์นี้ไม่ได้อยู่ในสถานะรอตรวจสลิป' },
    };
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      status:        'pending',
      reject_reason: reason.trim(),
      slip_path:     null,
    })
    .eq('id', orderId);

  if (error) throw error;

  return { httpStatus: 200, body: { success: true } };
}
