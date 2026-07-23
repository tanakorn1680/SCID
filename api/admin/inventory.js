// /api/admin/inventory
// Admin only — จัดการคลังไอดี
//
// GET    ?product_key=xxx&status=ready   → list พร้อม filter
// POST   { product_key, lines }          → bulk เพิ่ม (lines = "email:password" ต่อบรรทัด)
// DELETE { id }                          → ลบรายการที่ยัง status='ready' เท่านั้น (กันลบของที่ขายไปแล้ว)

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';
import { encrypt }                     from '../_lib/crypto.js';

export default async function handler(req) {
  try {
    await requireAdmin(req);

    if (req.method === 'GET')    return await listInventory(req);
    if (req.method === 'POST')   return await bulkAddInventory(req);
    if (req.method === 'DELETE') return await deleteInventory(req);

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/admin/inventory failed:`, err);
    return errorResponse(err);
  }
}

async function listInventory(req) {
  const url        = new URL(req.url);
  const productKey = url.searchParams.get('product_key') || null;
  const status     = url.searchParams.get('status') || null;

  let query = supabaseAdmin
    .from('inventory')
    .select('id, product_key, gmail, status, order_id, sold_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (productKey) query = query.eq('product_key', productKey);
  if (status)     query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  // สรุปจำนวนคงเหลือต่อสินค้า (status='ready') — ใช้แสดงบนหน้า inventory
  // ใช้ RPC ที่ GROUP BY ใน SQL แทนดึงทุกแถวมานับใน JS (เร็วกว่ามากเมื่อคลังมีของเยอะ)
  const { data: readyCounts, error: countErr } = await supabaseAdmin
    .rpc('inventory_ready_counts');

  if (countErr) throw countErr;

  const summary = {};
  for (const row of readyCounts) {
    summary[row.product_key] = Number(row.ready_count);
  }

  return Response.json({ success: true, data, ready_summary: summary });
}

async function bulkAddInventory(req) {
  const { product_key, lines } = await req.json();

  if (!product_key || !lines?.trim()) {
    return Response.json(
      { success: false, error: 'กรุณาระบุสินค้าและรายการไอดี' },
      { status: 400 }
    );
  }

  // ตรวจว่า product_key มีจริง
  const { data: product, error: productErr } = await supabaseAdmin
    .from('products')
    .select('key')
    .eq('key', product_key)
    .single();

  if (productErr || !product) {
    return Response.json(
      { success: false, error: 'ไม่พบสินค้านี้' },
      { status: 400 }
    );
  }

  // แต่ละบรรทัด: email:password (แยกด้วย : ตัวแรกที่เจอ เผื่อ password มี : อยู่ในตัว)
  const rawLines = lines.split('\n').map(l => l.trim()).filter(Boolean);

  if (!rawLines.length) {
    return Response.json(
      { success: false, error: 'ไม่พบรายการที่ถูกต้อง' },
      { status: 400 }
    );
  }

  const rows = [];
  const invalidLines = [];

  for (const line of rawLines) {
    const sepIndex = line.indexOf(':');
    if (sepIndex === -1) {
      invalidLines.push(line);
      continue;
    }
    const gmail    = line.slice(0, sepIndex).trim();
    const password = line.slice(sepIndex + 1).trim();
    if (!gmail || !password) {
      invalidLines.push(line);
      continue;
    }
    rows.push({
      product_key,
      gmail,
      password_enc: encrypt(password),
      status: 'ready',
    });
  }

  if (invalidLines.length) {
    return Response.json(
      {
        success: false,
        error: `พบ ${invalidLines.length} บรรทัดที่รูปแบบไม่ถูกต้อง (ต้องเป็น email:password)`,
      },
      { status: 400 }
    );
  }

  const { error: insertErr } = await supabaseAdmin
    .from('inventory')
    .insert(rows);

  if (insertErr) throw insertErr;

  return Response.json({ success: true, added: rows.length });
}

async function deleteInventory(req) {
  const { id } = await req.json();

  if (!id) {
    return Response.json(
      { success: false, error: 'ไม่ระบุ id' },
      { status: 400 }
    );
  }

  // ลบได้เฉพาะที่ยัง ready — กันลบไอดีที่ผูกกับ order ที่ขายไปแล้ว (ห้ามข้อมูลสูญหาย)
  const { data, error } = await supabaseAdmin
    .from('inventory')
    .delete()
    .eq('id', id)
    .eq('status', 'ready')
    .select('id')
    .single();

  if (error || !data) {
    return Response.json(
      { success: false, error: 'ไม่พบรายการ หรือรายการนี้ถูกขายไปแล้ว ไม่สามารถลบได้' },
      { status: 400 }
    );
  }

  return Response.json({ success: true });
}
