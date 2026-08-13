// api/admin/catalog-products.js
// Router เท่านั้น — business logic อยู่ที่ _lib/handlers/catalog-products.js
//
// GET  /api/admin/catalog-products?scope=public          → public list (ไม่ต้อง login)
// GET  /api/admin/catalog-products                       → admin list ทั้งหมด
// GET  /api/admin/catalog-products?resource=product-image&product_key=xxx → list รูปของสินค้า
// POST /api/admin/catalog-products                       → admin create product (JSON)
// POST /api/admin/catalog-products?resource=product-image → upload รูปสินค้า (FormData)
// PUT  /api/admin/catalog-products                       → admin update product (JSON)
// PUT  /api/admin/catalog-products?resource=product-image → set cover (JSON)
// DELETE /api/admin/catalog-products                     → admin delete product (JSON)
// DELETE /api/admin/catalog-products?resource=product-image → ลบรูปสินค้า (JSON)
//
// ⚠️ จุดสำคัญที่สุด: scope=public ต้องถูกเช็คและ return
// ก่อนเรียก requireAdmin เสมอ — ไม่งั้นหน้าร้านที่ไม่ได้ login จะพังทันที

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import {
  publicListProducts,
  adminListProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
} from '../_lib/handlers/catalog-products.js';
import {
  adminListImages,
  adminUploadImage,
  adminDeleteImage,
  adminSetCover,
} from '../_lib/handlers/catalog-product-images.js';
import { parseRequestUrl } from '../_lib/request-url.js';

// runtime: nodejs จำเป็นสำหรับ FormData / streaming APIs
export const config = { runtime: 'nodejs' };

// ─────────────────────────────────────────────────────────────
export async function GET(req) {
  const url = parseRequestUrl(req);

  // ── public path: ไม่ต้อง auth — ต้องอยู่ก่อน requireAdmin เสมอ ──
  if (url.searchParams.get('scope') === 'public') {
    try {
      const { httpStatus, body } = await publicListProducts();
      return Response.json(body, { status: httpStatus });
    } catch (err) {
      console.error('GET catalog-products?scope=public failed:', err);
      return Response.json({ success: false, error: 'โหลดสินค้าไม่สำเร็จ' }, { status: 500 });
    }
  }

  // ── admin เท่านั้นจากนี้ไป ──
  try {
    await requireAdmin(req);

    // list รูปของสินค้า 1 ตัว
    if (url.searchParams.get('resource') === 'product-image') {
      const product_key = url.searchParams.get('product_key');
      const { httpStatus, body } = await adminListImages({ product_key });
      return Response.json(body, { status: httpStatus });
    }

    // list สินค้าทั้งหมด (admin)
    const { httpStatus, body } = await adminListProducts();
    return Response.json(body, { status: httpStatus });
  } catch (err) {
    console.error('GET catalog-products (admin) failed:', err);
    return errorResponse(err);
  }
}

// ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    await requireAdmin(req);
    const url = parseRequestUrl(req);

    // upload รูปสินค้า (FormData)
    if (url.searchParams.get('resource') === 'product-image') {
      const form = await req.formData();
      const { httpStatus, body } = await adminUploadImage(form);
      return Response.json(body, { status: httpStatus });
    }

    // สร้างสินค้า (JSON)
    const payload = await req.json();
    const { httpStatus, body } = await adminCreateProduct(payload);
    return Response.json(body, { status: httpStatus });
  } catch (err) {
    console.error('POST catalog-products failed:', err);
    return errorResponse(err);
  }
}

// ─────────────────────────────────────────────────────────────
export async function PUT(req) {
  try {
    await requireAdmin(req);
    const url = parseRequestUrl(req);

    // set cover image
    if (url.searchParams.get('resource') === 'product-image') {
      const payload = await req.json();
      const { httpStatus, body } = await adminSetCover(payload);
      return Response.json(body, { status: httpStatus });
    }

    // update สินค้า (JSON)
    const payload = await req.json();
    const { httpStatus, body } = await adminUpdateProduct(payload);
    return Response.json(body, { status: httpStatus });
  } catch (err) {
    console.error('PUT catalog-products failed:', err);
    return errorResponse(err);
  }
}

// ─────────────────────────────────────────────────────────────
export async function DELETE(req) {
  try {
    await requireAdmin(req);
    const url = parseRequestUrl(req);

    // ลบรูปสินค้า
    if (url.searchParams.get('resource') === 'product-image') {
      const payload = await req.json();
      const { httpStatus, body } = await adminDeleteImage(payload);
      return Response.json(body, { status: httpStatus });
    }

    // ลบสินค้า (JSON)
    const payload = await req.json();
    const { httpStatus, body } = await adminDeleteProduct(payload);
    return Response.json(body, { status: httpStatus });
  } catch (err) {
    console.error('DELETE catalog-products failed:', err);
    return errorResponse(err);
  }
}
