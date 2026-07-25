// api/_lib/handlers/catalog-products.js
// Business logic สำหรับสินค้า — รวมจาก admin/products.js + public products.js เดิม
// เหตุผลที่รวม: ทั้งคู่แตะตาราง `products` เดียวกัน ต่างกันแค่ scope ของสิทธิ์
// (public เห็นเฉพาะ is_active=true, admin เห็น/แก้ได้ทุกอย่าง)
//
// สำคัญ: publicListProducts ไม่ต้อง auth เลย ต้องแยกจาก admin function ให้ชัด
// ที่ router — ห้ามเรียก requireAdmin ก่อนเข้าถึงฟังก์ชันนี้

import { supabaseAdmin } from '../supabase.js';

/**
 * public — สินค้าที่เปิดขายเท่านั้น ไม่ต้อง login
 * เดิมคือ GET /api/products
 */
export async function publicListProducts() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('key, label, category, price')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return { httpStatus: 200, body: { success: true, data } };
}

/**
 * admin: list — ทุกสินค้ารวม is_active=false
 */
export async function adminListProducts() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, key, label, category, price, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return { httpStatus: 200, body: { success: true, data } };
}

/**
 * admin: create
 */
export async function adminCreateProduct({ key, label, category, price, sort_order }) {
  if (!key || !label || !category || price == null) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'กรุณากรอกข้อมูลให้ครบ (รหัสสินค้า, ชื่อ, ประเภท, ราคา)' },
    };
  }

  if (!/^[a-z0-9_]+$/.test(key)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'รหัสสินค้าต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข และ _ เท่านั้น' },
    };
  }

  if (Number(price) < 0) {
    return { httpStatus: 400, body: { success: false, error: 'ราคาต้องไม่ติดลบ' } };
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({ key, label, category, price: Number(price), sort_order: sort_order ?? 0 })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { httpStatus: 400, body: { success: false, error: 'รหัสสินค้านี้มีอยู่แล้ว' } };
    }
    throw error;
  }

  return { httpStatus: 200, body: { success: true, data } };
}

/**
 * admin: update
 */
export async function adminUpdateProduct({ id, label, category, price, is_active, sort_order }) {
  if (!id) {
    return { httpStatus: 400, body: { success: false, error: 'ไม่ระบุ id' } };
  }

  const updates = {};
  if (label      !== undefined) updates.label      = label;
  if (category   !== undefined) updates.category   = category;
  if (is_active  !== undefined) updates.is_active  = is_active;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (price      !== undefined) {
    if (Number(price) < 0) {
      return { httpStatus: 400, body: { success: false, error: 'ราคาต้องไม่ติดลบ' } };
    }
    updates.price = Number(price);
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  if (!data) {
    return { httpStatus: 404, body: { success: false, error: 'ไม่พบสินค้า' } };
  }

  return { httpStatus: 200, body: { success: true, data } };
}

/**
 * admin: delete — เฉพาะที่ไม่มี inventory ผูกอยู่
 */
export async function adminDeleteProduct({ id }) {
  if (!id) {
    return { httpStatus: 400, body: { success: false, error: 'ไม่ระบุ id' } };
  }

  const { data: product, error: productErr } = await supabaseAdmin
    .from('products')
    .select('key')
    .eq('id', id)
    .single();

  if (productErr || !product) {
    return { httpStatus: 404, body: { success: false, error: 'ไม่พบสินค้า' } };
  }

  const { count, error: invErr } = await supabaseAdmin
    .from('inventory')
    .select('id', { count: 'exact', head: true })
    .eq('product_key', product.key);

  if (invErr) throw invErr;

  if (count > 0) {
    return {
      httpStatus: 400,
      body: { success: false, error: `สินค้านี้มีไอดีในคลัง ${count} รายการ ไม่สามารถลบได้ กรุณาปิดขายแทน` },
    };
  }

  const { error: deleteErr } = await supabaseAdmin.from('products').delete().eq('id', id);
  if (deleteErr) throw deleteErr;

  return { httpStatus: 200, body: { success: true } };
}
