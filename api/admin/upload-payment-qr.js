// POST /api/admin/upload-payment-qr
// Body: FormData { file }
// Admin only — อัปโหลดรูป QR Code สำหรับช่องทางชำระเงินประเภท qr_code
// ต่างจาก upload-asset.js: ไฟล์นี้แค่อัปโหลดแล้วคืน URL เฉยๆ ไม่บันทึกอัตโนมัติ
// เพราะ QR ผูกกับ payment_methods.details (เฉพาะช่องทาง) ไม่ใช่ site-wide setting

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';
import { detectImageType }             from '../_lib/file-validation.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const form = await req.formData();
    const file = form.get('file');

    if (!file) {
      return Response.json(
        { success: false, error: 'ไม่พบไฟล์' },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return Response.json(
        { success: false, error: 'ไฟล์ใหญ่เกิน 5MB' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const ext = detectImageType(arrayBuffer);
    if (!ext) {
      return Response.json(
        { success: false, error: 'รองรับเฉพาะ JPG, PNG, WEBP เท่านั้น' },
        { status: 400 }
      );
    }

    const storagePath = `payment-qr-${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('site-assets')
      .upload(storagePath, arrayBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });

    if (uploadErr) throw uploadErr;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('site-assets')
      .getPublicUrl(storagePath);

    return Response.json({ success: true, data: { url: publicUrlData.publicUrl } });

  } catch (err) {
    console.error('POST /api/admin/upload-payment-qr failed:', err);
    return errorResponse(err);
  }
}

export const config = { runtime: "nodejs" };
