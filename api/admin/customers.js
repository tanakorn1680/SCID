// GET /api/admin/customers
// GET /api/admin/customers?user_id=xxx  — รายละเอียด + ประวัติออเดอร์ของลูกค้าคนนั้น
// Admin only — รายชื่อลูกค้า + ยอดสั่งซื้อสะสม (อ่านอย่างเดียว ไม่มีแก้ไข)

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

export const config = { runtime: "nodejs" };

export async function GET(req) {
  try {
    await requireAdmin(req);

    const url    = new URL(req.url);
    const userId = url.searchParams.get('user_id');

    // ── รายละเอียดลูกค้าคนเดียว ────────────────────────────
    if (userId) {
      const [authRes, ordersRes] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(userId),
        supabaseAdmin
          .from('orders')
          .select('id, product_label, amount, status, created_at, updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (authRes.error) throw authRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const u = authRes.data.user;
      return Response.json({
        success: true,
        data: {
          email:           u.email,
          email_confirmed: !!u.email_confirmed_at,
          created_at:      u.created_at,
          orders:          ordersRes.data,
        },
      });
    }

    // ── รายการสมาชิกทั้งหมด (เดิม) ──────────────────────────
    const { data, error } = await supabaseAdmin.rpc('customer_summary');
    if (error) throw error;

    const result = data.map(row => ({
      ...row,
      total_spent: Number(row.total_spent),
      order_count: Number(row.order_count),
    }));

    return Response.json({ success: true, data: result });

  } catch (err) {
    console.error('GET /api/admin/customers failed:', err);
    return errorResponse(err);
  }
}
