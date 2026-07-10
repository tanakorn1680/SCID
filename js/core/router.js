// ============================================================
// Router / Page Guard
// เรียกใช้ตอนต้นของทุกหน้าที่ต้องการ auth check
// ============================================================

import { getSession, getProfile } from './auth.js';
import { ROLES } from '../config/supabase.js';

const PATHS = Object.freeze({
  LOGIN: '/pages/login.html',
  SHOP: '/pages/shop.html',
  ADMIN_DASHBOARD: '/pages/admin/dashboard.html'
});

/**
 * เรียกใช้ในหน้าที่ต้อง login (customer หรือ admin)
 * ใช้ใน: history.html
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirectTo(PATHS.LOGIN);
    return null;
  }
  return session;
}

/**
 * เรียกใช้ในหน้า admin เท่านั้น
 * ใช้ใน: admin/*.html
 */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    redirectTo(PATHS.LOGIN);
    return null;
  }

  const profile = await getProfile();
  if (!profile || profile.role !== ROLES.ADMIN) {
    // customer พยายามเข้า admin → เด้งกลับหน้า shop ไม่ใช่ login
    // (เพราะ login แล้ว แค่ไม่มีสิทธิ์)
    redirectTo(PATHS.SHOP);
    return null;
  }

  return { session, profile };
}

/**
 * เรียกใช้ในหน้า login/register
 * ถ้า login อยู่แล้ว → เด้งไปหน้าที่เหมาะกับ role ไม่ต้องเห็นหน้า login ซ้ำ
 */
export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (!session) return;

  const profile = await getProfile();
  if (profile?.role === ROLES.ADMIN) {
    redirectTo(PATHS.ADMIN_DASHBOARD);
  } else {
    redirectTo(PATHS.SHOP);
  }
}

function redirectTo(path) {
  window.location.href = path;
}
