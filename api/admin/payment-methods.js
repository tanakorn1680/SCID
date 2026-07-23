// /api/admin/payment-methods
// Admin only — จัดการช่องทางชำระเงิน
//
// GET    → list ทั้งหมด (รวม is_active=false)
// POST   { type, label, details, sort_order }              → เพิ่มช่องทางใหม่
// PUT    { id, label, details, is_active, sort_order }     → แก้ไข/เปิดปิด
// DELETE { id }                                              → ลบ

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

const VALID_TYPES = ['promptpay', 'bank', 'truemoney', 'qr_code'];

export default async function handler(req) {
  try {
    await requireAdmin(req);

    if (req.method === 'GET')    return await listMethods();
    if (req.method === 'POST')   return await createMethod(req);
    if (req.method === 'PUT')    return await updateMethod(req);
    if (req.method === 'DELETE') return await deleteMethod(req);

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/admin/payment-methods failed:`, err);
    return errorResponse(err);
  }
}

async function listMethods() {
  const { data, error } = await supabaseAdmin
    .from('payment_methods')
    .select('id, type, label, details, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return Response.json({ success: true, data });
}

async function createMethod(req) {
  const { type, label, details, sort_order } = await req.json();

  if (!type || !label) {
    return Response.json(
      { success: false, error: 'กรุณากรอกประเภทและชื่อช่องทาง' },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type)) {
    return Response.json(
      { success: false, error: `ประเภทต้องเป็นหนึ่งใน: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('payment_methods')
    .insert({
      type,
      label,
      details: details ?? {},
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return Response.json({ success: true, data });
}

async function updateMethod(req) {
  const { id, label, details, is_active, sort_order } = await req.json();

  if (!id) {
    return Response.json(
      { success: false, error: 'ไม่ระบุ id' },
      { status: 400 }
    );
  }

  const updates = {};
  if (label      !== undefined) updates.label      = label;
  if (details    !== undefined) updates.details    = details;
  if (is_active  !== undefined) updates.is_active  = is_active;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { data, error } = await supabaseAdmin
    .from('payment_methods')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  if (!data) {
    return Response.json(
      { success: false, error: 'ไม่พบช่องทางชำระเงิน' },
      { status: 404 }
    );
  }

  return Response.json({ success: true, data });
}

async function deleteMethod(req) {
  const { id } = await req.json();

  if (!id) {
    return Response.json(
      { success: false, error: 'ไม่ระบุ id' },
      { status: 400 }
    );
  }

  // order ที่เคยใช้ช่องทางนี้จะยัง reference id เดิมอยู่ (orders.payment_method_id ไม่ cascade)
  // ลบได้ตรงๆ ไม่ต้องกัน — ประวัติ order เก่ายังอ่าน label ที่บันทึกไว้ตอนนั้นผ่าน join ได้ถ้าจำเป็น
  const { error } = await supabaseAdmin
    .from('payment_methods')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return Response.json({ success: true });
}
