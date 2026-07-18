// GET /api/admin/orders?status=awaiting_review&page=0
// Admin only — ดูออเดอร์ทั้งหมด พร้อม filter และ pagination

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

const PAGE_SIZE = 30;

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const url    = new URL(req.url);
    const status = url.searchParams.get('status') || null;
    const page   = parseInt(url.searchParams.get('page') || '0', 10);
    const search = url.searchParams.get('search') || '';    // ค้นหา email

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

    return Response.json({
      success: true,
      data,
      total: count ?? 0,
      page,
      page_size: PAGE_SIZE,
    });

  } catch (err) {
    return errorResponse(err);
  }
}
