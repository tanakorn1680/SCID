// GET /api/admin/stats
// Admin only — ตัวเลข dashboard

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    // นับแต่ละ status พร้อมกัน (Promise.all ลด latency)
    const [pending, awaiting, delivered, todayDelivered] = await Promise.all([

      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'awaiting_review'),

      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'delivered'),

      // delivered วันนี้
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'delivered')
        .gte('updated_at', new Date().toISOString().slice(0, 10)),  // YYYY-MM-DD

    ]);

    return Response.json({
      success: true,
      data: {
        pending:         pending.count         ?? 0,
        awaiting_review: awaiting.count        ?? 0,
        delivered:       delivered.count       ?? 0,
        today_delivered: todayDelivered.count  ?? 0,
      },
    });

  } catch (err) {
    return errorResponse(err);
  }
}
