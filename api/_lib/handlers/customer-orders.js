// api/_lib/handlers/customer-orders.js
// Business logic สำหรับ order lifecycle ฝั่งลูกค้า — รวมจาก
// orders/create.js + orders/detail.js + orders/my.js + orders/set-payment-method.js เดิม
// เหตุผลที่รวม: ทั้ง 4 endpoint แตะตาราง `orders` เป็นหลักตัวเดียว
// (create=insert, detail=select เดี่ยว, my=select list, set-payment-method=update field เดียว)
// ไม่มีตารางอื่นที่ endpoint ไหนต้อง lock ร่วมด้วยเหมือนกรณี fulfillment (inventory)
//
// ทุกฟังก์ชันรับ `profile` เป็นพารามิเตอร์ (ผ่าน requireAuth มาแล้วจาก router)
// แทนที่จะเรียก requireAuth เอง — ทำให้ handler เป็น pure function ทดสอบง่าย

import { supabaseAdmin } from '../supabase.js';
import { decrypt }       from '../crypto.js';
import { getProduct }    from '../products.js';

/**
 * create — สร้าง order ใหม่ ราคาคำนวณ server-side เสมอ
 * เดิมคือ POST /api/orders/create
 */
export async function createOrder(profile, { product_key }) {
  const product = await getProduct(product_key);
  if (!product) {
    return { httpStatus: 400, body: { success: false, error: 'ไม่พบสินค้า' } };
  }

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

  return { httpStatus: 200, body: { success: true, data: order } };
}

/**
 * detail — รายละเอียด order รวม credential (ถ้า delivered แล้ว)
 * เดิมคือ GET /api/orders/detail?id=
 */
export async function getOrderDetail(profile, orderId) {
  if (!orderId) {
    return { httpStatus: 400, body: { success: false, error: 'ไม่ระบุ order id' } };
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, product_label, amount, status, reject_reason, created_at, updated_at, user_id')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return { httpStatus: 404, body: { success: false, error: 'ไม่พบออเดอร์' } };
  }

  if (order.user_id !== profile.id) {
    return { httpStatus: 403, body: { success: false, error: 'ไม่มีสิทธิ์' } };
  }

  let credential = null;

  // V3 เขียนลง inventory (ผ่าน deliver_order RPC) — เช็คก่อน
  // ถ้าไม่เจอ (order เก่าก่อน migration) fallback ไปอ่าน credentials เดิม (historical read-only)
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

  return {
    httpStatus: 200,
    body: {
      success: true,
      data: {
        id:            order.id,
        product_label: order.product_label,
        amount:        order.amount,
        status:        order.status,
        reject_reason: order.reject_reason,
        created_at:    order.created_at,
        updated_at:    order.updated_at,
        credential,
      },
    },
  };
}

/**
 * my — รายการ order ของ user ที่ login อยู่
 * เดิมคือ GET /api/orders/my
 */
export async function listMyOrders(profile) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, product_label, amount, status, created_at, updated_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return { httpStatus: 200, body: { success: true, data } };
}

/**
 * setPaymentMethod — ผูกช่องทางชำระเงินที่ลูกค้าเลือกเข้ากับ order
 * เดิมคือ POST /api/orders/set-payment-method
 */
export async function setOrderPaymentMethod(profile, { order_id, payment_method_id }) {
  if (!order_id || !payment_method_id) {
    return { httpStatus: 400, body: { success: false, error: 'ข้อมูลไม่ครบ' } };
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, status, user_id')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) {
    return { httpStatus: 404, body: { success: false, error: 'ไม่พบออเดอร์' } };
  }

  if (order.user_id !== profile.id) {
    return { httpStatus: 403, body: { success: false, error: 'ไม่มีสิทธิ์' } };
  }

  if (order.status !== 'pending') {
    return {
      httpStatus: 400,
      body: { success: false, error: 'ไม่สามารถเปลี่ยนช่องทางชำระเงินในสถานะนี้' },
    };
  }

  const { data: method, error: methodErr } = await supabaseAdmin
    .from('payment_methods')
    .select('id, type, label, details')
    .eq('id', payment_method_id)
    .eq('is_active', true)
    .single();

  if (methodErr || !method) {
    return { httpStatus: 400, body: { success: false, error: 'ช่องทางชำระเงินนี้ไม่พร้อมใช้งาน' } };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('orders')
    .update({ payment_method_id })
    .eq('id', order_id);

  if (updateErr) throw updateErr;

  return { httpStatus: 200, body: { success: true, data: method } };
}
