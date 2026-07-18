import { supabase } from '../config/supabase.js';
import { getSession } from './auth.js';

// ─────────────────────────────────────────
// SHOP
// ─────────────────────────────────────────
export const shop = {
  async getCategories() {
    const { data, error } = await supabase
      .from('product_categories')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async getProducts(categoryId = null) {
    let query = supabase
      .from('products')
      .select('id, name, description, price, category_id, product_categories(name)')
      .eq('is_active', true)
      .order('created_at');

    if (categoryId) query = query.eq('category_id', categoryId);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, data: [] };

    // ดึง stock ทุกสินค้าพร้อมกัน
    const ids = data.map(p => p.id);
    const stockMap = {};
    if (ids.length > 0) {
      const { data: stocks } = await supabase
        .from('inventory_items')
        .select('product_id')
        .in('product_id', ids)
        .eq('is_sold', false)
        .eq('is_reserved', false);
      (stocks || []).forEach(s => {
        stockMap[s.product_id] = (stockMap[s.product_id] || 0) + 1;
      });
    }

    const result = data.map(p => ({ ...p, stock: stockMap[p.id] || 0 }));
    return { success: true, data: result };
  }
};

// ─────────────────────────────────────────
// ORDERS (customer)
// ─────────────────────────────────────────
export const order = {
  async create(productId, note = null) {
    const { data, error } = await supabase.rpc('fn_create_order', {
      p_product_id: productId,
      p_note: note
    });
    if (error) return { success: false, error: error.message };
    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error || 'เกิดข้อผิดพลาด' };
    return { success: true, orderId: row.order_id };
  },

  async submitSlip(orderId, file) {
    const session = await getSession();
    if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };

    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${session.user.id}/${orderId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('payment-slips')
      .upload(path, file, { upsert: true });

    if (uploadError) return { success: false, error: 'อัปโหลดรูปไม่สำเร็จ: ' + uploadError.message };

    const { data, error } = await supabase.rpc('fn_submit_slip', {
      p_order_id: orderId,
      p_slip_storage_path: path
    });
    if (error) return { success: false, error: error.message };
    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error || 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async getMyOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(product_name, price, quantity)')
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async getMyCredential(orderId, encryptKey) {
    const { data, error } = await supabase.rpc('fn_get_my_credential', {
      p_order_id: orderId,
      p_encrypt_key: encryptKey
    });
    if (error) return { success: false, error: error.message };
    return { success: true, credential: data };
  }
};

// ─────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────
export const admin = {
  async getOrders(status = null, search = '') {
    let query = supabase
      .from('orders')
      .select(`
        id, status, total_amount, note, created_at, updated_at,
        slip_storage_path, slip_submitted_at, reject_reason,
        reviewed_at, reviewed_by,
        profiles!orders_user_id_fkey(email, display_name),
        order_items(product_name, price, quantity)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, data: [], total: 0 };

    let result = data || [];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(o =>
        o.id.toLowerCase().includes(s) ||
        o.profiles?.email?.toLowerCase().includes(s)
      );
    }

    return { success: true, data: result, total: count || 0 };
  },

  async getSlipSignedUrl(slipStoragePath) {
    if (!slipStoragePath) return { success: false, url: null };
    const { data, error } = await supabase.storage
      .from('payment-slips')
      .createSignedUrl(slipStoragePath, 600); // 10 นาที
    if (error || !data?.signedUrl) return { success: false, url: null };
    return { success: true, url: data.signedUrl };
  },

  async approve(orderId, encryptKey) {
    const { data, error } = await supabase.rpc('fn_admin_approve', {
      p_order_id: orderId,
      p_encrypt_key: encryptKey
    });
    if (error) return { success: false, error: error.message };
    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error };
    return { success: true };
  },

  async reject(orderId, reason) {
    const { data, error } = await supabase.rpc('fn_admin_reject', {
      p_order_id: orderId,
      p_reject_reason: reason
    });
    if (error) return { success: false, error: error.message };
    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error };
    return { success: true };
  },

  async getInventory(productId = null) {
    let query = supabase
      .from('inventory_items')
      .select('id, product_id, is_sold, is_reserved, sold_at, created_at, products(name)')
      .order('created_at', { ascending: false });
    if (productId) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async addInventory(productId, credentials, encryptKey) {
    // credentials = array of strings เช่น ["email:pass", "email:pass"]
    const rows = credentials.map(c => ({
      product_id: productId,
      credential_data: btoa(encryptKey + ':' + c) // placeholder — ใช้ pgp ผ่าน edge function จริงๆ
    }));
    // NOTE: การเข้ารหัสจริงต้องทำผ่าน server เท่านั้น
    // ตอนนี้ให้ admin เพิ่มผ่าน SQL โดยตรงก่อน
    return { success: false, error: 'กรุณาเพิ่ม inventory ผ่าน SQL Editor' };
  },

  async getAuditLogs() {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, profiles(email)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  }
};
