// ============================================================
// js/api.js — Frontend API client
// เรียก /api/* เท่านั้น ไม่แตะ Supabase โดยตรง
// ============================================================

// ── Auth (Supabase JS ยังใช้สำหรับ login/register/session เท่านั้น)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

// supabase client ใช้สำหรับ Auth เท่านั้น — ไม่ query DB ตรงๆ
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ── Helper: ดึง token จาก session ──────────────────────────
async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ── Helper: fetch ไป API Route ─────────────────────────────
async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(path, { ...options, headers });
  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error ?? 'เกิดข้อผิดพลาด');
  }
  return json;
}

// ── Auth ────────────────────────────────────────────────────
export const auth = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(mapAuthError(error));
    return data;
  },

  async register(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(mapAuthError(error));
    return data;
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// ── Products ────────────────────────────────────────────────
export const products = {
  async list() {
    return apiFetch('/api/products');
  },
};

// ── Orders ──────────────────────────────────────────────────
export const orders = {
  async create(productKey) {
    return apiFetch('/api/orders/create', {
      method: 'POST',
      body: JSON.stringify({ product_key: productKey }),
    });
  },

  async myOrders() {
    return apiFetch('/api/orders/my');
  },

  async detail(orderId) {
    return apiFetch(`/api/orders/detail?id=${orderId}`);
  },

  async uploadSlip(orderId, file) {
    const token = await getToken();
    const form  = new FormData();
    form.append('order_id', orderId);
    form.append('file', file);

    const res  = await fetch('/api/orders/upload-slip', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      // ไม่ใส่ Content-Type → browser set multipart/form-data + boundary อัตโนมัติ
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'อัปโหลดสลิปไม่สำเร็จ');
    return json;
  },
};

// ── Admin ───────────────────────────────────────────────────
export const admin = {
  async stats() {
    return apiFetch('/api/admin/stats');
  },

  async orders({ status = null, page = 0, search = '' } = {}) {
    const params = new URLSearchParams({ page });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    return apiFetch(`/api/admin/orders?${params}`);
  },

  async slipUrl(orderId) {
    return apiFetch(`/api/admin/slip-url?order_id=${orderId}`);
  },

  async deliver(orderId, gmail, password) {
    return apiFetch('/api/admin/deliver', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, gmail, password }),
    });
  },

  async reject(orderId, reason) {
    return apiFetch('/api/admin/reject', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, reason }),
    });
  },
};

// ── Map Supabase auth error → ภาษาไทย ──────────────────────
function mapAuthError(error) {
  const msg = error.message ?? '';
  if (msg.includes('Invalid login credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (msg.includes('already registered'))        return 'อีเมลนี้ถูกใช้แล้ว';
  if (msg.includes('Email not confirmed'))       return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  console.error('Auth error:', error);
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}
