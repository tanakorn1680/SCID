// /api/admin/products
// Admin only — จัดการสินค้าและประเภทสินค้า
//
// GET    → list ทั้งหมด (รวม is_active=false)
// POST   { key, label, category, price }              → สร้างสินค้าใหม่
// PUT    { id, label, category, price, is_active }     → แก้ไข/เปิดปิดขาย
// DELETE { id }                                         → ลบ (เฉพาะที่ไม่มี inventory ผูกอยู่)

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

export default async function handler(req) {
  try {
    await requireAdmin(req);

    if (req.method === 'GET')    return await listProducts();
    if (req.method === 'POST')   return await createProduct(req);
    if (req.method === 'PUT')    return await updateProduct(req);
    if (req.method === 'DELETE') return await deleteProduct(req);

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/admin/products failed:`, err);
    return errorResponse(err);
  }
}

async function listProducts() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, key, label, category, price, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return Response.json({ success: true, data });
}

async function createProduct(req) {
  const { key, label, category, price, sort_order } = await req.json();

  if (!key || !label || !category || price == null) {
    return Response.json(
      { success: false, error: 'กรุณากรอกข้อมูลให้ครบ (รหัสสินค้า, ชื่อ, ประเภท, ราคา)' },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9_]+$/.test(key)) {
    return Response.json(
      { success: false, error: 'รหัสสินค้าต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข และ _ เท่านั้น' },
      { status: 400 }
    );
  }

  if (Number(price) < 0) {
    return Response.json(
      { success: false, error: 'ราคาต้องไม่ติดลบ' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      key,
      label,
      category,
      price: Number(price),
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {   // unique violation
      return Response.json(
        { success: false, error: 'รหัสสินค้านี้มีอยู่แล้ว' },
        { status: 400 }
      );
    }
    throw error;
  }

  return Response.json({ success: true, data });
}

async function updateProduct(req) {
  const { id, label, category, price, is_active, sort_order } = await req.json();

  if (!id) {
    return Response.json(
      { success: false, error: 'ไม่ระบุ id' },
      { status: 400 }
    );
  }

  const updates = {};
  if (label      !== undefined) updates.label      = label;
  if (category   !== undefined) updates.category   = category;
  if (is_active  !== undefined) updates.is_active  = is_active;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (price      !== undefined) {
    if (Number(price) < 0) {
      return Response.json(
        { success: false, error: 'ราคาต้องไม่ติดลบ' },
        { status: 400 }
      );
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
    return Response.json(
      { success: false, error: 'ไม่พบสินค้า' },
      { status: 404 }
    );
  }

  return Response.json({ success: true, data });
}

async function deleteProduct(req) {
  const { id } = await req.json();

  if (!id) {
    return Response.json(
      { success: false, error: 'ไม่ระบุ id' },
      { status: 400 }
    );
  }

  const { data: product, error: productErr } = await supabaseAdmin
    .from('products')
    .select('key')
    .eq('id', id)
    .single();

  if (productErr || !product) {
    return Response.json(
      { success: false, error: 'ไม่พบสินค้า' },
      { status: 404 }
    );
  }

  // กันลบสินค้าที่มีไอดีในคลังผูกอยู่ (ทั้ง ready และ sold) — ป้องกันข้อมูลกำพร้า
  const { count, error: invErr } = await supabaseAdmin
    .from('inventory')
    .select('id', { count: 'exact', head: true })
    .eq('product_key', product.key);

  if (invErr) throw invErr;

  if (count > 0) {
    return Response.json(
      {
        success: false,
        error: `สินค้านี้มีไอดีในคลัง ${count} รายการ ไม่สามารถลบได้ กรุณาปิดขายแทน`,
      },
      { status: 400 }
    );
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', id);

  if (deleteErr) throw deleteErr;

  return Response.json({ success: true });
}
