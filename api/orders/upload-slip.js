// POST /api/orders/upload-slip
// Body: FormData { order_id, file }
// อัปโหลดสลิป → เปลี่ยน status เป็น awaiting_review

import { requireAuth, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }              from '../_lib/supabase.js';

// magic bytes สำหรับ JPEG / PNG / WEBP
const ALLOWED_SIGNATURES = [
  { bytes: [0xFF, 0xD8, 0xFF],             ext: 'jpg'  },  // JPEG
  { bytes: [0x89, 0x50, 0x4E, 0x47],       ext: 'png'  },  // PNG
  { bytes: [0x52, 0x49, 0x46, 0x46],       ext: 'webp', check: 'webp' }, // WEBP
];

function detectMime(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 12));

  for (const sig of ALLOWED_SIGNATURES) {
    const match = sig.bytes.every((b, i) => bytes[i] === b);
    if (!match) continue;

    // WEBP: ตรวจ byte 8-11 = "WEBP"
    if (sig.check === 'webp') {
      const webp = String.fromCharCode(...bytes.slice(8, 12));
      if (webp !== 'WEBP') continue;
    }
    return sig.ext;
  }
  return null;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile } = await requireAuth(req);

    const form     = await req.formData();
    const orderId  = form.get('order_id');
    const file     = form.get('file');

    if (!orderId || !file) {
      return Response.json(
        { success: false, error: 'ข้อมูลไม่ครบ' },
        { status: 400 }
      );
    }

    // ตรวจ order เป็นของ user นี้และยัง pending
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, status, user_id')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return Response.json(
        { success: false, error: 'ไม่พบออเดอร์' },
        { status: 404 }
      );
    }

    if (order.user_id !== profile.id) {
      return Response.json(
        { success: false, error: 'ไม่มีสิทธิ์' },
        { status: 403 }
      );
    }

    if (!['pending', 'awaiting_review'].includes(order.status)) {
      return Response.json(
        { success: false, error: 'ไม่สามารถอัปโหลดสลิปในสถานะนี้' },
        { status: 400 }
      );
    }

    // ตรวจ file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return Response.json(
        { success: false, error: 'ไฟล์ใหญ่เกิน 5MB' },
        { status: 400 }
      );
    }

    // ตรวจ magic bytes (ป้องกัน file type spoofing)
    const arrayBuffer = await file.arrayBuffer();
    const ext = detectMime(arrayBuffer);
    if (!ext) {
      return Response.json(
        { success: false, error: 'รองรับเฉพาะ JPG, PNG, WEBP เท่านั้น' },
        { status: 400 }
      );
    }

    // อัปโหลดไป storage path: {user_id}/{order_id}.{ext}
    const storagePath = `${profile.id}/${orderId}.${ext}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('slips')
      .upload(storagePath, arrayBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,  // รองรับ re-upload ก่อนแอดมินตรวจ
      });

    if (uploadErr) throw uploadErr;

    // อัปเดต order
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        status:    'awaiting_review',
        slip_path: storagePath,
      })
      .eq('id', orderId);

    if (updateErr) throw updateErr;

    return Response.json({ success: true });

  } catch (err) {
    return errorResponse(err);
  }
}
