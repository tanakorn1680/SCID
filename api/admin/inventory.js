// /api/admin/inventory
// Admin only — จัดการคลังไอดี
//
// GET    ?product_key=xxx&status=ready   → list พร้อม filter
// GET    ?id=xxx                         → ดู credential (email+password) แบบ lazy-load (decrypt เฉพาะแถวที่ขอ)
// POST   { product_key, lines }          → bulk เพิ่ม (lines = "email:password" ต่อบรรทัด)
// DELETE { id }                          → ลบรายการที่ยัง status='ready' เท่านั้น
// DELETE { id, force: true }             → force delete ไอดีที่มี order ผูกอยู่ (สำหรับลบไอดีทดสอบ)

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';
import { encrypt, decrypt }            from '../_lib/crypto.js';
import { parseRequestUrl }             from '../_lib/request-url.js';

export const config = { runtime: "nodejs" };

export async function GET(req) {
  try {
    await requireAdmin(req);
    const url = parseRequestUrl(req);
    if (url.searchParams.get('id')) {
      return await getCredential(url);
    }
    return await listInventory(url);
  } catch (err) {
    console.error('GET /api/admin/inventory failed:', err);
    return errorResponse(err);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    return await bulkAddInventory(req);
  } catch (err) {
    console.error('POST /api/admin/inventory failed:', err);
    return errorResponse(err);
  }
}

export async function DELETE(req) {
  try {
    await requireAdmin(req);
    return await deleteInventory(req);
  } catch (err) {
    console.error('DELETE /api/admin/inventory failed:', err);
    return errorResponse(err);
  }
}


async function listInventory(url) {
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

async function getCredential(url) {
  const id = url.searchParams.get('id');

  const { data, error } = await supabaseAdmin
    .from('inventory')
    .select('id, gmail, password_enc, status, order_id, sold_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return Response.json(
      { success: false, error: 'ไม่พบรายการนี้' },
      { status: 404 }
    );
  }

  let password = null;
  try {
    password = decrypt(data.password_enc);
  } catch {
    return Response.json(
      { success: false, error: 'ถอดรหัสไม่สำเร็จ' },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    data: {
      id:       data.id,
      gmail:    data.gmail,
      password,
      status:   data.status,
      order_id: data.order_id,
      sold_at:  data.sold_at,
    },
  });
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
  const body = await req.json();
  const { id, force } = body;

  if (!id) {
    return Response.json(
      { success: false, error: 'ไม่ระบุ id' },
      { status: 400 }
    );
  }

  if (force === true) {
    // Force delete — ใช้สำหรับลบไอดีทดสอบที่มี order ผูกอยู่
    // ไม่มีเงื่อนไข status หรือ order_id — ลบตรงๆ โดย admin ยืนยันแล้ว
    const { data, error } = await supabaseAdmin
      .from('inventory')
      .delete()
      .eq('id', id)
      .select('id')
      .single();

    if (error || !data) {
      return Response.json(
        { success: false, error: 'ไม่พบรายการ หรือลบไม่สำเร็จ' },
        { status: 400 }
      );
    }

    return Response.json({ success: true, forced: true });
  }

  // ปกติ — ลบได้เฉพาะ status='ready' และไม่มี order ผูก (กันลบไอดีที่ขายไปแล้วโดยไม่ตั้งใจ)
  const { data, error } = await supabaseAdmin
    .from('inventory')
    .delete()
    .eq('id', id)
    .eq('status', 'ready')
    .is('order_id', null)
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
