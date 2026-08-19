// api/bank-amount.js
// รับ notification จากแอป Bank Amount Reader และ serve ข้อมูลออเดอร์ที่รอจับคู่
//
// GET  /api/bank-amount?action=pending
//   Authorization: Bearer {DEVICE_TOKEN}
//   → คืนออเดอร์ที่สถานะ pending_payment เรียงตาม created_at
//   → แอพ Android ดึงทุก 10 วินาที เพื่อแสดงรายการรอจับคู่
//
// POST /api/bank-amount
//   Authorization: Bearer {DEVICE_TOKEN}
//   Body: { amount, currency, bank, timestamp, notification_id, is_test }
//   → บันทึก bank_notification → auto_match → approve

import { supabaseAdmin } from './_lib/supabase.js';
import { approveOrder }  from './_lib/handlers/admin-orders.js';
import { parseRequestUrl } from './_lib/request-url.js';

export const config = { runtime: 'nodejs' };

const DEVICE_TOKEN = process.env.DEVICE_TOKEN;

// ─── Token check (shared) ─────────────────────────────────────────────────
function checkToken(req) {
  const auth = req.headers.get('authorization') || '';
  return DEVICE_TOKEN && auth === `Bearer ${DEVICE_TOKEN}`;
}

// ─── GET: รายการออเดอร์ที่รอจับคู่ ─────────────────────────────────────────
export async function GET(req) {
  if (!checkToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url    = parseRequestUrl(req);
  const action = url.searchParams.get('action');

  if (action !== 'pending') {
    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // ดึงออเดอร์ที่ยังรอชำระ (pending_payment) ใน 2 ชั่วโมงล่าสุด
  // จำกัด 2 ชั่วโมง: ออเดอร์เก่ากว่านี้ไม่น่า match แล้ว + ลด payload
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, product_label, amount, unique_amount, status, created_at, user_email')
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('GET /api/bank-amount?action=pending error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    count:   data.length,
    orders:  data.map(o => ({
      id:            o.id,
      product_label: o.product_label,
      amount:        o.amount,
      unique_amount: o.unique_amount,
      created_at:    o.created_at,
      user_email:    o.user_email,  // แอดมินเห็นได้เพราะ device เท่านั้น
    })),
  });
}

export async function POST(req) {
  if (!checkToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { amount, currency = 'THB', bank, timestamp, notification_id, is_test = false } = body;

  // ตรวจ field ครบ
  if (!amount || !bank || !timestamp || !notification_id) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ========================================================
  // บันทึก notification (ป้องกัน duplicate ด้วย UNIQUE constraint)
  // ========================================================
  const { error: insertErr } = await supabaseAdmin
    .from('bank_notifications')
    .insert({ amount, currency, bank, timestamp, notification_id, is_test });

  if (insertErr) {
    // duplicate notification_id → ถือว่า OK แค่ ignore
    if (insertErr.code === '23505') {
      return Response.json({ status: 'duplicate, ignored' }, { status: 200 });
    }
    console.error('bank_notifications insert error:', insertErr);
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  // is_test → ไม่จับคู่ order จริง
  if (is_test) {
    return Response.json({ status: 'test_received' }, { status: 200 });
  }

  // ========================================================
  // จับคู่ order จาก unique_amount
  // ========================================================
  const { data: matchedOrderId, error: matchErr } = await supabaseAdmin
    .rpc('auto_match_payment', {
      p_amount:          amount,
      p_notification_id: notification_id,
      p_bank:            bank,
      p_timestamp:       timestamp,
    });

  if (matchErr) {
    console.error('auto_match_payment error:', matchErr);
    return Response.json({ status: 'saved, match_failed', error: matchErr.message }, { status: 200 });
  }

  if (!matchedOrderId) {
    // ไม่เจอ order ที่ตรงกัน — notification บันทึกไว้แล้ว แอดมินตรวจเองได้
    return Response.json({ status: 'saved, no_match' }, { status: 200 });
  }

  // อัปเดต bank_notifications ให้รู้ว่า match order ไหน
  await supabaseAdmin
    .from('bank_notifications')
    .update({ matched_order_id: matchedOrderId })
    .eq('notification_id', notification_id);

  // ========================================================
  // Approve order อัตโนมัติ (deliver_order RPC)
  // ========================================================
  const { httpStatus, body: approveBody } = await approveOrder(matchedOrderId);

  if (httpStatus === 200 && approveBody.success) {
    console.log(`Auto-approved order ${matchedOrderId} from notification ${notification_id}`);
    return Response.json({
      status:    'matched_and_approved',
      order_id:  matchedOrderId,
    }, { status: 200 });
  }

  // approve ไม่สำเร็จ (เช่น out of stock) — order อยู่ที่ awaiting_review
  // แอดมินจะเห็นและ approve เองได้
  console.warn(`Auto-approve failed for order ${matchedOrderId}:`, approveBody);
  return Response.json({
    status:   'matched_awaiting_review',
    order_id: matchedOrderId,
    reason:   approveBody.error,
  }, { status: 200 });
}
