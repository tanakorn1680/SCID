// ============================================================
// API Wrapper
// จุดรวม query ทั้งหมด — หน้าเว็บไม่ควร query supabase ตรงๆ
// เพื่อให้ centralize error handling และง่ายต่อการ debug/extend
// ============================================================

import { supabase } from '../config/supabase.js';

// ─────────────────────────────────────────
// Shop — Public (พร้อมใช้งาน Phase 1)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Site Settings — ดึง config จาก DB แทน hardcode
// ใช้ทั้ง frontend (checkout, shop) และ admin (settings page Phase 7+)
// ─────────────────────────────────────────
export const settings = {
  _cache: null,
  _cacheTime: 0,
  CACHE_TTL: 5 * 60 * 1000, // 5 นาที — settings เปลี่ยนไม่บ่อย ไม่ต้องดึงทุก request

  async getAll() {
    // คืน cache ถ้ายังไม่หมดอายุ — ลด DB round-trip
    if (this._cache && Date.now() - this._cacheTime < this.CACHE_TTL) {
      return { success: true, data: this._cache };
    }

    const { data, error } = await supabase.rpc('get_site_settings_public');
    if (error) return { success: false, error: error.message, data: {} };

    this._cache = data || {};
    this._cacheTime = Date.now();
    return { success: true, data: this._cache };
  },

  async get(key, defaultValue = '') {
    const result = await this.getAll();
    return result.data?.[key] ?? defaultValue;
  }
};

export const shop = {
  async getCategories() {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async getProducts(categoryId = null) {
    let query = supabase
      .from('products')
      .select('*, product_categories(name, slug)')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, data: [] };

    // ดึงสต็อกทุกตัวทีเดียวด้วย bulk function — กัน N+1 query
    // (ดู migration 004_product_stock.sql)
    if (data.length > 0) {
      const ids = data.map(p => p.id);
      const { data: stockRows } = await supabase.rpc('get_products_stock_bulk', {
        p_product_ids: ids
      });

      const stockMap = new Map((stockRows || []).map(r => [r.product_id, r.stock_count]));
      data.forEach(p => {
        p.stock_count = stockMap.get(p.id) ?? 0;
      });
    }

    return { success: true, data };
  },

  // ใช้แยกตอนต้องการ stock สดล่าสุดของสินค้าตัวเดียว
  // เช่น refresh หน้า product.html โดยไม่ต้อง re-fetch ข้อมูลสินค้าทั้งหมด
  async getStock(productId) {
    const { data, error } = await supabase.rpc('get_product_stock', {
      p_product_id: productId
    });

    if (error) return { success: false, error: error.message, data: 0 };
    return { success: true, data };
  },

  async getProduct(productId) {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_categories(name, slug)')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (error) return { success: false, error: error.message, data: null };

    const { data: stockCount } = await supabase.rpc('get_product_stock', {
      p_product_id: productId
    });
    data.stock_count = stockCount ?? 0;

    return { success: true, data };
  }
};

// ─────────────────────────────────────────
// Orders — Customer
// โครงสร้างพร้อม แต่ create() ยังไม่ implement logic จริง
// (Phase 3 — implement จริงแล้ว ใช้ atomic function ป้องกัน race condition)
// ─────────────────────────────────────────
export const order = {
  async getMyOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name, image_url))')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  // Phase 4: ลูกค้าดูไอดีของตัวเองหลังแอดมินยืนยันส่งแล้ว
  // ใช้ RPC แยกจาก admin (migration 010) — RLS เดิมปิด inventory ไว้
  // ฟังก์ชันนี้ตรวจสิทธิ์เข้มงวดว่า order เป็นของ user ที่เรียกจริงก่อน decrypt
  async getDeliveredCredential(orderId) {
    const { data, error } = await supabase.rpc('get_my_delivered_credential', {
      p_order_id: orderId
    });

    if (error) return { success: false, error: 'ไม่สามารถดึงข้อมูลไอดีได้', data: null };

    const row = data?.[0];
    if (!row) return { success: true, data: null }; // ยังไม่เคยส่งไอดี ไม่ใช่ error

    return { success: true, data: row };
  },

  async getMyOrderDetail(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name, image_url, price))')
      .eq('id', orderId)
      .single();

    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data };
  },

  // สร้าง order + ล็อคไอดี 1 ชิ้นแบบ atomic ที่ DB (migration 006)
  // ห้ามทำ logic "เช็คสต็อกแล้วค่อย insert" ฝั่ง JS เด็ดขาด
  // เพราะมี gap ของเวลาให้ race condition เกิดได้เสมอเมื่อมีคนซื้อพร้อมกัน
  async create(productId) {
    const { data, error } = await supabase.rpc('create_order_with_reservation', {
      p_product_id: productId
    });

    if (error) {
      return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' };
    }

    const row = data?.[0];
    if (row?.out_error) {
      return { success: false, error: row.out_error };
    }

    return {
      success: true,
      orderId: row.out_order_id,
      reservationExpiresAt: row.out_reservation_expires_at
    };
  },

  // ── ระบบ submitSlip ใหม่ ──
  // path: slips/{order_id}.{ext} — ชัดเจน เดาได้ ไม่ขึ้นกับ user_id
  // bucket public → getPublicUrl() ได้เลย ไม่ต้อง signed URL
  async submitSlip(orderId, file) {
    const ext = (() => {
      const n = file.name.toLowerCase();
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
      if (n.endsWith('.png')) return 'png';
      if (n.endsWith('.webp')) return 'webp';
      return 'jpg';
    })();

    const storagePath = `slips/${orderId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('payment-slips')
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error('submitSlip upload error:', uploadError);
      return { success: false, error: 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่' };
    }

    // บันทึก path ดิบ — admin ใช้ getPublicUrl(path) ตอนแสดงผล
    const { data: submitData, error: submitError } = await supabase.rpc('submit_order_slip', {
      p_order_id: orderId,
      p_slip_url: storagePath
    });

    if (submitError) {
      return { success: false, error: 'บันทึกสถานะไม่สำเร็จ กรุณาติดต่อแอดมิน' };
    }

    const row = submitData?.[0];
    if (!row?.success) {
      return { success: false, error: row?.error || 'เกิดข้อผิดพลาด' };
    }

    try {
      await supabase.functions.invoke('notify-discord', { body: { order_id: orderId } });
    } catch (e) {
      console.warn('Discord notification failed (non-blocking):', e);
    }

    return { success: true };
  }
};

// ─────────────────────────────────────────
// Admin
// โครงสร้างพร้อม สำหรับ Phase 2 ผูก UI จัดการ
// ─────────────────────────────────────────
export const admin = {
  async getOrders(filters = {}) {
    let query = supabase
      .from('orders')
      .select('*, profiles(email, display_name), order_items(*, products(name))')
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_categories(name)')
      .order('sort_order', { ascending: true });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async createProduct(payload) {
    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select()
      .single();

    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data };
  },

  async updateProduct(id, payload) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data };
  },

  async getUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  async toggleUserActive(userId, isActive) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId)
      .select()
      .single();

    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data };
  },

  // ───── Dashboard (Phase 4) ─────
  // รวมทุกตัวเลขที่ dashboard ต้องการเป็น RPC เดียว ลด round-trip
  async getDashboardStats() {
    const { data, error } = await supabase.rpc('get_dashboard_stats');
    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data: data?.[0] || null };
  },

  // ───── Order status update (เดิมเป็น stub throw error — implement จริงแล้ว) ─────
  // ใช้สำหรับ manual override เท่านั้น flow หลัก (ยืนยันสลิป/ปฏิเสธ/ส่งไอดี)
  // ต้องผ่าน approveSlipAndDeliver / rejectSlip ด้านล่างเพื่อ atomic + audit log
  async updateOrderStatus(orderId, status) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single();

    if (error) return { success: false, error: error.message, data: null };
    return { success: true, data };
  },

  // ───── generate fresh signed URL จาก slip path ─────
  // เรียกตอน admin เปิด modal ดูสลิป — ไม่ใช้ URL ที่เก็บใน DB โดยตรง
  // เพราะ URL ใน DB อาจเป็น signed URL เก่าที่หมดอายุแล้ว (ออเดอร์เก่า)
  // หรือเป็น storage path ดิบ (ออเดอร์ใหม่หลังแก้บั๊ก)
  // ฟังก์ชันนี้รองรับทั้ง 2 กรณีโดยตรวจจาก pattern ของ value
  // bucket payment-slips เป็น PUBLIC — ใช้ public URL แทน signed URL
  // รองรับ slip_url ทุก format ที่มีใน DB:
  //   format A: URL เต็ม (https://...supabase.co/storage/v1/object/...) — ใช้ได้เลย
  //   format B: path ดิบ "{user_id}/{filename}" — สร้าง public URL
  //   format C: UUID เปล่า (บั๊กเก่า) — ต้องหา path จริงจาก Storage list
  // แสดงรูปสลิป — bucket เป็น public ใช้ getPublicUrl() ได้เลย
  // รองรับทุก format ที่มีใน DB:
  //   "slips/{order_id}.jpg"          → path ใหม่ (หลัง deploy ระบบนี้)
  //   "{user_id}/{filename}.jpg"      → path เก่า (มี / คั่น)
  //   "https://...supabase.co/..."    → URL เต็ม (ออเดอร์เก่ามาก)
  //   "{uuid}"                        → UUID เปล่า (บั๊กเก่า — list Storage)
  async getSlipUrl(slipUrlOrPath, order = null) {
    if (!slipUrlOrPath) return { success: false, url: null };

    // format A: URL เต็ม — ใช้ได้เลย
    if (slipUrlOrPath.startsWith('http')) {
      return { success: true, url: slipUrlOrPath };
    }

    // format B: path ดิบ มี / คั่น ("slips/xxx.jpg" หรือ "{uid}/xxx.jpg")
    if (slipUrlOrPath.includes('/')) {
      const { data } = supabase.storage.from('payment-slips').getPublicUrl(slipUrlOrPath);
      return { success: true, url: data.publicUrl };
    }

    // format C: UUID เปล่า — บั๊กเก่าบันทึก user_id ไว้เป็น slip_url
    // list ไฟล์ใน folder นั้น (UUID = folder name = user_id)
    const { data: files, error } = await supabase.storage
      .from('payment-slips')
      .list(slipUrlOrPath, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (error || !files?.length) {
      console.error('getSlipUrl list failed:', error, 'folder:', slipUrlOrPath);
      return { success: false, url: null };
    }

    // หาไฟล์ที่ตรงกับ order.id ก่อน ถ้าไม่เจอใช้ไฟล์ล่าสุด
    const match = (order?.id && files.find(f => f.name.startsWith(order.id))) || files[0];
    const { data } = supabase.storage
      .from('payment-slips')
      .getPublicUrl(`${slipUrlOrPath}/${match.name}`);
    return { success: true, url: data.publicUrl };
  },,

  // ───── ตรวจสอบสลิป (Phase 4) ─────
  // ยืนยันสลิป + ส่งไอดี เป็น atomic เดียวกันที่ DB (migration 009)
  // ห้ามแยกเป็น 2 ขั้นตอนจาก JS เพราะมี race condition ถ้าแอดมิน 2 คนกดพร้อมกัน
  async approveSlipAndDeliver(orderId) {
    const { data, error } = await supabase.rpc('admin_approve_slip_and_deliver', {
      p_order_id: orderId
    });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error || 'ไม่สำเร็จ' };
    return { success: true };
  },

  async rejectSlip(orderId, reason) {
    const { data, error } = await supabase.rpc('admin_reject_slip', {
      p_order_id: orderId,
      p_reason: reason
    });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error || 'ไม่สำเร็จ' };
    return { success: true };
  },

  // ───── ส่งใหม่ (Phase 4) — ตามข้อกำหนด "บันทึกประวัติทุกครั้ง ไม่ลบประวัติเดิม" ─────
  async resendInventory(orderId, reason) {
    const { data, error } = await supabase.rpc('admin_resend_inventory', {
      p_order_id: orderId,
      p_reason: reason
    });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error || 'ไม่สำเร็จ' };
    return { success: true };
  },

  // ───── ประวัติการส่งไอดีของ order หนึ่งๆ (รวมทุกครั้งที่เคยส่ง ไม่ใช่แค่ล่าสุด) ─────
  async getDeliveryHistory(orderId) {
    const { data, error } = await supabase
      .from('delivery_history')
      .select('*, inventory(gmail_address)')
      .eq('order_id', orderId)
      .order('delivered_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  },

  // ───── คลังไอดี (Phase 4) ─────
  // เดิมเป็น stub addInventory() — implement จริงแล้วพร้อม encryption (migration 009)
  async addInventory(productId, gmail, password) {
    const { data, error } = await supabase.rpc('admin_add_inventory', {
      p_product_id: productId,
      p_gmail: gmail,
      p_password: password
    });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด อาจเป็นเพราะ gmail นี้มีอยู่แล้ว' };
    return { success: true, id: data };
  },

  async updateInventory(id, gmail, password = null) {
    const { error } = await supabase.rpc('admin_update_inventory', {
      p_id: id,
      p_gmail: gmail,
      p_password: password
    });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
    return { success: true };
  },

  async deleteInventory(id) {
    const { data, error } = await supabase.rpc('admin_delete_inventory', { p_id: id });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

    const row = data?.[0];
    if (!row?.success) return { success: false, error: row?.error || 'ไม่สำเร็จ' };
    return { success: true };
  },

  // decrypt credential — เรียกเฉพาะตอนแอดมินกดดูรายละเอียด ไม่ดึงมาตอน list
  // (ป้องกัน decrypt โดยไม่จำเป็นทุกครั้งที่โหลดตาราง)
  async getInventoryCredential(id) {
    const { data, error } = await supabase.rpc('admin_get_inventory_credential', { p_id: id });

    if (error) return { success: false, error: 'ไม่สามารถถอดรหัสได้', data: null };
    return { success: true, data: data?.[0] || null };
  },

  // list พร้อม search + filter ตามข้อกำหนด "ค้นหา กรองตามประเภทสินค้า"
  // ไม่ดึง encrypted_credential มาด้วย — ลด payload และไม่จำเป็นตอน list view
  async getInventoryList({ productId = null, status = null, search = '', page = 0, pageSize = 50 } = {}) {
    // pagination ป้องกันดึงทั้งหมดเมื่อคลังใหญ่ขึ้น
    // page=0 = หน้าแรก, pageSize=50 = 50 รายการต่อหน้า
    const from = page * pageSize;
    const to   = from + pageSize - 1;

    let query = supabase
      .from('inventory')
      .select('id, product_id, gmail_address, status, created_at, delivered_at, products(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (productId) query = query.eq('product_id', productId);
    if (status)    query = query.eq('status', status);
    if (search)    query = query.ilike('gmail_address', `%${search}%`);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, data: [], total: 0 };
    return { success: true, data, total: count ?? 0, page, pageSize };
  },

  // ───── ระบบค้นหาออเดอร์ (Phase 4) ─────
  async searchOrders({ orderId = '', email = '', productId = null, status = null, page = 0, pageSize = 50 } = {}) {
    const from = page * pageSize;
    const to   = from + pageSize - 1;

    let query = supabase
      .from('orders')
      .select('id, user_id, status, total_amount, slip_url, slip_submitted_at, reject_reason, profiles(email, display_name), order_items(*, products(name, category_id))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (orderId) query = query.ilike('id', `%${orderId}%`);
    if (status)  query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, data: [], total: 0 };

    // filter email/productId ฝั่ง client เพราะเป็น nested field
    let filtered = data || [];
    if (email) {
      filtered = filtered.filter(o =>
        o.profiles?.email?.toLowerCase().includes(email.toLowerCase())
      );
    }
    if (productId) {
      filtered = filtered.filter(o =>
        o.order_items?.some(item => item.product_id === productId)
      );
    }

    return { success: true, data: filtered, total: count ?? 0, page, pageSize };
  },

  // ───── Audit Log (Phase 4) ─────
  // join profiles เพื่อแสดง "ผู้ดำเนินการ" ตามข้อกำหนด
  async getAuditLogs({ targetType = null, limit = 100 } = {}) {
    let query = supabase
      .from('audit_logs')
      .select('*, profiles(email, display_name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (targetType) query = query.eq('target_type', targetType);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  }
};

// หมายเหตุ: ไม่มี notify.discord() wrapper ที่นี่โดยเจตนา
// Discord แจ้งเตือนเรียกตรงผ่าน supabase.functions.invoke('notify-discord', ...)
// ดูตัวอย่างใน order.submitSlip() ด้านบน — Edge Function เก็บ webhook URL เป็น secret

// ─────────────────────────────────────────
// Export utilities — Phase 6 backup & recovery
// ดาวน์โหลดข้อมูลเป็น CSV โดยไม่ต้องมี backend เพิ่ม
// ─────────────────────────────────────────
export const exportUtil = {
  // แปลง array of objects เป็น CSV string
  _toCSV(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines   = [
      headers.map(escape).join(','),
      ...rows.map(r => headers.map(h => escape(r[h])).join(','))
    ];
    return lines.join('\n');
  },

  _download(csv, filename) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async exportOrders() {
    const result = await admin.searchOrders({ pageSize: 9999 });
    if (!result.success) return { success: false, error: result.error };
    const flat = result.data.map(o => ({
      id: o.id,
      user_email: o.profiles?.email || '',
      status: o.status,
      total_amount: o.total_amount,
      created_at: o.created_at,
      slip_submitted_at: o.slip_submitted_at || '',
      reviewed_at: o.reviewed_at || '',
      reject_reason: o.reject_reason || ''
    }));
    this._download(this._toCSV(flat), `orders_${Date.now()}.csv`);
    return { success: true };
  },

  async exportInventory() {
    const result = await admin.getInventoryList({ pageSize: 9999 });
    if (!result.success) return { success: false, error: result.error };
    // ไม่ export password ออกมา — เหตุผลด้านความปลอดภัย
    // ถ้าต้องการจริงให้ทำผ่าน Supabase Dashboard โดยตรง
    const flat = result.data.map(i => ({
      id: i.id,
      product: i.products?.name || '',
      gmail: i.gmail_address || '',
      status: i.status,
      created_at: i.created_at,
      delivered_at: i.delivered_at || ''
    }));
    this._download(this._toCSV(flat), `inventory_${Date.now()}.csv`);
    return { success: true };
  },

  async exportAuditLogs() {
    const result = await admin.getAuditLogs({ limit: 9999 });
    if (!result.success) return { success: false, error: result.error };
    const flat = result.data.map(l => ({
      id: l.id,
      action: l.action,
      actor: l.profiles?.email || '',
      target_type: l.target_type || '',
      target_id: l.target_id || '',
      created_at: l.created_at
    }));
    this._download(this._toCSV(flat), `audit_logs_${Date.now()}.csv`);
    return { success: true };
  }
};
