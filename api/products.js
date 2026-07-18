// GET /api/products
// Public — แสดงรายการสินค้าและราคา (ไม่ต้อง login)

import { PRODUCTS } from './_lib/products.js';

export default function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const list = Object.values(PRODUCTS).map(p => ({
    key:   p.key,
    label: p.label,
    price: p.price,
  }));

  return Response.json({ success: true, data: list });
}
