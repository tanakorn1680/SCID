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
      // userId อาจเป็น email (ถ้า customer_summary ไม่ return user_id)
      // รองรับทั้ง UUID และ email
      const isEmail = userId.includes('@');

      let authUser;
      if (isEmail) {
        // ค้นจาก email → listUsers แล้ว filter
        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) throw listErr;
        authUser = listData.users.find(u => u.email === userId);
      } else {
        const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userErr) throw userErr;
        authUser = userData.user;
      }

      if (!authUser) {
        return Response.json({ success: false, error: 'ไม่พบผู้ใช้' }, { status: 404 });
      }

      const { data: orders, error: ordersErr } = await supabaseAdmin
        .from('orders')
        .select('id, product_label, amount, status, created_at, updated_at')
        .eq('user_email', authUser.email)
        .order('created_at', { ascending: false })
        .limit(50);

      if (ordersErr) throw ordersErr;

      return Response.json({
        success: true,
        data: {
          email:           authUser.email,
          email_confirmed: !!authUser.email_confirmed_at,
          created_at:      authUser.created_at,
          orders:          orders ?? [],
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

export async function DELETE(req) {
  try {
    await requireAdmin(req);

    const { email } = await req.json();
    if (!email) return Response.json({ success: false, error: 'ไม่ระบุ email' }, { status: 400 });

    // หา user จาก email
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const user = listData.users.find(u => u.email === email);
    if (!user) return Response.json({ success: false, error: 'ไม่พบผู้ใช้' }, { status: 404 });

    // ลบจาก Supabase Auth
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteErr) throw deleteErr;

    return Response.json({ success: true });

  } catch (err) {
    console.error('DELETE /api/admin/customers failed:', err);
    return errorResponse(err);
  }
}
