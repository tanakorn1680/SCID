// GET /api/orders/my
// คืนรายการออเดอร์ของ user ที่ login อยู่

import { requireAuth, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }              from '../_lib/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile } = await requireAuth(req);

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, product_label, amount, status, created_at, updated_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return Response.json({ success: true, data });

  } catch (err) {
    return errorResponse(err);
  }
}
