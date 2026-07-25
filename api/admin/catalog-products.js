// api/admin/catalog-products.js
// Router เท่านั้น — business logic อยู่ที่ _lib/handlers/catalog-products.js
//
// GET  /api/admin/catalog-products?scope=public   → public, ไม่ต้อง login (แทน /api/products เดิม)
// GET  /api/admin/catalog-products                → admin, list ทั้งหมด
// POST/PUT/DELETE                                  → admin CRUD
//
// ⚠️ จุดสำคัญที่สุดของไฟล์นี้: scope=public ต้องถูกเช็คและ return
// ก่อนเรียก requireAdmin เสมอ — ไม่งั้นหน้าร้านที่ไม่ได้ login จะพังทันที

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import {
  publicListProducts,
  adminListProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
} from '../_lib/handlers/catalog-products.js';

export default async function handler(req) {
  const url = new URL(req.url);

  // ── public path: ไม่ต้อง auth เลย ต้องอยู่ก่อนบรรทัด requireAdmin เสมอ ──
  if (req.method === 'GET' && url.searchParams.get('scope') === 'public') {
    try {
      const { httpStatus, body } = await publicListProducts();
      return Response.json(body, { status: httpStatus });
    } catch (err) {
      console.error('GET /api/admin/catalog-products?scope=public failed:', err);
      return Response.json({ success: false, error: 'โหลดสินค้าไม่สำเร็จ' }, { status: 500 });
    }
  }

  // ── ทุกอย่างจากบรรทัดนี้ลงไปคือ admin เท่านั้น ──
  try {
    await requireAdmin(req);

    if (req.method === 'GET') {
      const { httpStatus, body } = await adminListProducts();
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'POST') {
      const payload = await req.json();
      const { httpStatus, body } = await adminCreateProduct(payload);
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'PUT') {
      const payload = await req.json();
      const { httpStatus, body } = await adminUpdateProduct(payload);
      return Response.json(body, { status: httpStatus });
    }

    if (req.method === 'DELETE') {
      const payload = await req.json();
      const { httpStatus, body } = await adminDeleteProduct(payload);
      return Response.json(body, { status: httpStatus });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (err) {
    console.error(`${req.method} /api/admin/catalog-products failed:`, err);
    return errorResponse(err);
  }
}
