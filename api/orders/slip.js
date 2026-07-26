// api/orders/slip.js
// Router เท่านั้น — business logic อยู่ที่ _lib/handlers/order-slip.js
//
// POST /api/orders/slip   FormData{order_id, file}   → ลูกค้าอัปโหลด (requireAuth)
// GET  /api/orders/slip?order_id=                     → แอดมินขอ signed URL (requireAdmin)
//
// ⚠️ auth ต่างกันตาม method — POST ใช้ requireAuth (เจ้าของ order เท่านั้น)
// GET ใช้ requireAdmin (แอดมินเท่านั้น) ห้ามใช้ auth เดียวกันทั้งไฟล์

import { requireAuth, requireAdmin, errorResponse } from '../_lib/auth.js';
import { uploadSlip, getSignedSlipUrl }              from '../_lib/handlers/order-slip.js';
import { parseRequestUrl }                           from '../_lib/request-url.js';

export const config = { runtime: "nodejs" };

export default async function handler(req) {
  try {
    if (req.method === 'POST') {
      const { profile } = await requireAuth(req);
      const form = await req.formData();
      const { httpStatus, body } = await uploadSlip(profile, form);
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'GET') {
      await requireAdmin(req);
      const url     = parseRequestUrl(req);
      const orderId = url.searchParams.get('order_id');
      const { httpStatus, body } = await getSignedSlipUrl(orderId);
      return Response.json(body, { status: httpStatus });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/orders/slip failed:`, err);
    return errorResponse(err);
  }
}
