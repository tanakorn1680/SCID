// api/admin/catalog-payment.js
// Router เท่านั้น — business logic อยู่ที่ _lib/handlers/catalog-payment.js
//
// GET  /api/admin/catalog-payment?scope=public   → public, ไม่ต้อง login (แทน /api/payment-methods เดิม)
// GET  /api/admin/catalog-payment                → admin, list ทั้งหมด
// POST/PUT/DELETE                                 → admin CRUD
//
// ⚠️ scope=public ต้องถูกเช็คก่อน requireAdmin เสมอ (ดูเหตุผลเดียวกับ catalog-products.js)

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import {
  publicListMethods,
  adminListMethods,
  adminCreateMethod,
  adminUpdateMethod,
  adminDeleteMethod,
} from '../_lib/handlers/catalog-payment.js';

export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET' && url.searchParams.get('scope') === 'public') {
    try {
      const { httpStatus, body } = await publicListMethods();
      return Response.json(body, { status: httpStatus });
    } catch (err) {
      console.error('GET /api/admin/catalog-payment?scope=public failed:', err);
      return Response.json({ success: false, error: 'โหลดช่องทางชำระเงินไม่สำเร็จ' }, { status: 500 });
    }
  }

  try {
    await requireAdmin(req);

    if (req.method === 'GET') {
      const { httpStatus, body } = await adminListMethods();
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'POST') {
      const payload = await req.json();
      const { httpStatus, body } = await adminCreateMethod(payload);
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'PUT') {
      const payload = await req.json();
      const { httpStatus, body } = await adminUpdateMethod(payload);
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'DELETE') {
      const payload = await req.json();
      const { httpStatus, body } = await adminDeleteMethod(payload);
      return Response.json(body, { status: httpStatus });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/admin/catalog-payment failed:`, err);
    return errorResponse(err);
  }
}
