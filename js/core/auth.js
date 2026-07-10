// ============================================================
// Auth Module
// จัดการ: สมัครสมาชิก, เข้าสู่ระบบ, ออกจากระบบ, session, profile
// ============================================================

import { supabase } from '../config/supabase.js';

// ─────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  // ตาม Security spec ใน Phase 0: min 8 chars
  if (password.length < 8) {
    return { valid: false, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };
  }
  return { valid: true };
}

// ─────────────────────────────────────────
// Register
// หมายเหตุ: การเข้ารหัส password ทำโดย Supabase Auth ฝั่ง server
// (bcrypt) — frontend ไม่ต้อง implement hashing เอง
// ─────────────────────────────────────────
export async function register(email, password, displayName) {
  if (!validateEmail(email)) {
    return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  }

  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    return { success: false, error: pwCheck.message };
  }

  // ตรวจอีเมลซ้ำ — Supabase จะ throw error อยู่แล้วถ้าซ้ำ
  // (UNIQUE constraint ที่ profiles.email + auth.users)
  // แต่เช็คก่อนเพื่อ UX ที่ชัดเจนกว่า generic error
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'อีเมลนี้ถูกใช้สมัครสมาชิกแล้ว' };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split('@')[0] }
    }
  });

  if (error) {
    return { success: false, error: mapAuthError(error) };
  }

  await logAudit('auth.register', 'user', data.user?.id, { email });

  return { success: true, user: data.user };
}

// ─────────────────────────────────────────
// Login
// ─────────────────────────────────────────
export async function login(email, password) {
  if (!validateEmail(email)) {
    return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return { success: false, error: mapAuthError(error) };
  }

  // เช็ค is_active — รองรับ admin สั่งระงับ user ในอนาคต
  const profile = await getProfile();
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return { success: false, error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อแอดมิน' };
  }

  await logAudit('auth.login', 'user', data.user?.id);

  return { success: true, user: data.user, profile };
}

// ─────────────────────────────────────────
// Logout
// ─────────────────────────────────────────
export async function logout() {
  const session = await getSession();
  if (session) {
    await logAudit('auth.logout', 'user', session.user.id);
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─────────────────────────────────────────
// Session & Profile
// ─────────────────────────────────────────
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) return null;
  return data;
}

export async function isLoggedIn() {
  const session = await getSession();
  return !!session;
}

export async function isAdmin() {
  const profile = await getProfile();
  return profile?.role === 'admin';
}

// ─────────────────────────────────────────
// รองรับ reset password ใน Phase ถัดไป
// เตรียม function ไว้แต่ยังไม่ผูก UI
// ─────────────────────────────────────────
export async function requestPasswordReset(email) {
  // TODO Phase 2: ผูกกับหน้า "ลืมรหัสผ่าน"
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/pages/reset-password.html`
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────
// Audit log helper (เรียกใช้ DB function ที่สร้างไว้ใน migration 002)
// ─────────────────────────────────────────
async function logAudit(action, targetType = null, targetId = null, payload = null) {
  try {
    await supabase.rpc('insert_audit_log', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_payload: payload,
      p_ip_address: null // IP จริงต้องดึงจาก server-side (Edge Function) Phase ถัดไป
    });
  } catch (e) {
    // audit log ไม่ควร block flow หลักถ้า fail
    console.warn('Audit log failed:', e);
  }
}

// ─────────────────────────────────────────
// Map Supabase error → ข้อความภาษาไทยที่เข้าใจง่าย
// ─────────────────────────────────────────
function mapAuthError(error) {
  const msg = error.message || '';

  if (msg.includes('Invalid login credentials')) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  }
  if (msg.includes('already registered')) {
    return 'อีเมลนี้ถูกใช้สมัครสมาชิกแล้ว';
  }
  if (msg.includes('Email not confirmed')) {
    return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  }

  // เคสที่ยังไม่เคยเจอมาก่อน: log ข้อความจริงจาก Supabase ไว้ใน console
  // ผู้ใช้จะเห็นแค่ข้อความทั่วไปด้านล่าง แต่เปิด DevTools Console ดูสาเหตุจริงได้ทันที
  console.error('Unhandled Supabase auth error:', error);
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

// ─────────────────────────────────────────
// Global session expiry handler
// ฟัง onAuthStateChange ทุกครั้งที่ token หมดอายุ หรือถูก signOut จากที่อื่น
// แทนที่จะล้มเหลวเงียบๆ ให้ redirect ไป login พร้อมแจ้งสาเหตุ
// เรียก setupSessionExpiryHandler() ครั้งเดียวตอน app init
// ─────────────────────────────────────────
export function setupSessionExpiryHandler() {
  // ไม่ติดตั้ง ถ้าอยู่ที่หน้า login อยู่แล้ว (กันวนซ้ำ)
  const isLoginPage = window.location.pathname.includes('/login');
  if (isLoginPage) return;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
      // เก็บ URL ปัจจุบันไว้ redirect กลับหลัง login ใหม่
      const returnUrl = encodeURIComponent(window.location.href);
      window.location.href = `/pages/login.html?expired=1&return=${returnUrl}`;
    }
  });
}
