// ============================================================
// api/_lib/products.js
// รายการสินค้าและราคา — แก้ที่นี่ที่เดียว
// frontend ดึงผ่าน GET /api/products เท่านั้น (ไม่ได้อ่านไฟล์นี้โดยตรง)
// ============================================================

export const PRODUCTS = {
  account_real: {
    key:   'account_real',
    label: 'ไอดี Real Server',
    price: 150,   // บาท
  },
  account_cheat: {
    key:   'account_cheat',
    label: 'ไอดี Cheat Server',
    price: 80,
  },
  // เพิ่มสินค้าใหม่ที่นี่
};

/**
 * ดึงสินค้าจาก key
 * คืน null ถ้าไม่พบ
 */
export function getProduct(key) {
  return PRODUCTS[key] ?? null;
}
