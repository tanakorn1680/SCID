// POST /api/admin/upload-asset
// Body: FormData { asset_key, file }
// Admin only — อัปโหลด logo/banner เข้า site-assets bucket (public)
// asset_key ต้องตรงกับ site_settings key ที่จะเก็บ url (เช่น 'logo_url', 'banner_url')

import { requireAdmin, errorResponse } from '../_lib/auth.js';
import { supabaseAdmin }               from '../_lib/supabase.js';
import { detectImageType }             from '../_lib/file-validation.js';

const ALLOWED_ASSET_KEYS = ['logo_url', 'banner_url'];

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAdmin(req);

    const form     = await req.formData();
    const assetKey = form.get('asset_key');
    const file     = form.get('file');

    if (!assetKey || !file) {
      return Response.json(
        { success: false, error: 'ข้อมูลไม่ครบ' },
        { status: 400 }
      );
    }

    if (!ALLOWED_ASSET_KEYS.includes(assetKey)) {
      return Response.json(
        { success: false, error: 'ประเภทรูปภาพไม่ถูกต้อง' },
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

    // ใช้ timestamp กัน browser cache รูปเก่าค้างหลังอัปโหลดใหม่
    const storagePath = `${assetKey}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('site-assets')
      .upload(storagePath, arrayBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('site-assets')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    // บันทึก url ลง site_settings ทันที
    const { error: settingsErr } = await supabaseAdmin
      .from('site_settings')
      .upsert({ key: assetKey, value: publicUrl }, { onConflict: 'key' });

    if (settingsErr) throw settingsErr;

    return Response.json({ success: true, data: { url: publicUrl } });

  } catch (err) {
    console.error('POST /api/admin/upload-asset failed:', err);
    return errorResponse(err);
  }
}

export const config = { runtime: "nodejs" };
