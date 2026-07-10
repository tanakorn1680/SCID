// ============================================================
// Edge Function: notify-discord
// รัน server-side บน Supabase — DISCORD_WEBHOOK_URL เก็บเป็น
// secret ที่นี่เท่านั้น ไม่เคยส่งไปฝั่ง frontend
//
// เรียกใช้จาก frontend ผ่าน supabase.functions.invoke('notify-discord', ...)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(JSON.stringify({ error: 'order_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ใช้ service role key ฝั่ง server เท่านั้น — ปลอดภัยเพราะรันใน Edge Function
    // ไม่ใช่ frontend ดังนั้น service role key ไม่หลุดออกไปไหน
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ดึงรายละเอียด order มา format ข้อความแจ้งเตือน
    // Phase 4 เพิ่ม: ชื่อสินค้า + เวลาที่ส่งสลิป ตามที่ Frank ระบุ
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, total_amount, slip_url, slip_submitted_at, created_at,
        profiles(email, display_name),
        order_items(products(name))
      `)
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // TODO: แทนที่ด้วย Discord Webhook URL จริง
    // ตั้งค่าผ่าน: supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
    const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');

    if (!webhookUrl) {
      console.warn('DISCORD_WEBHOOK_URL not configured — skipping notification');
      return new Response(JSON.stringify({ success: false, reason: 'webhook_not_configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const customerLabel = order.profiles?.display_name || order.profiles?.email || 'ไม่ทราบชื่อ';
    const productName = order.order_items?.[0]?.products?.name || 'ไม่ทราบสินค้า';
    const slipTime = order.slip_submitted_at
      ? new Date(order.slip_submitted_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      : '-';

    const discordPayload = {
      embeds: [{
        title: '🔔 ออเดอร์ใหม่รอตรวจสอบสลิป',
        color: 0xD9A330,
        fields: [
          { name: 'Order ID', value: `\`${order.id}\``, inline: false },
          { name: 'สินค้า', value: productName, inline: true },
          { name: 'ลูกค้า', value: customerLabel, inline: true },
          { name: 'ยอดเงิน', value: `฿${Number(order.total_amount).toLocaleString()}`, inline: true },
          { name: 'เวลาที่ส่งสลิป', value: slipTime, inline: true }
        ],
        timestamp: new Date().toISOString()
      }]
    };

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (!discordRes.ok) {
      console.error('Discord webhook failed:', await discordRes.text());
      return new Response(JSON.stringify({ success: false, reason: 'discord_request_failed' }), {
        status: 200, // ไม่ throw 500 — แจ้งเตือนล้มเหลวไม่ควร block flow หลักของลูกค้า
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('notify-discord error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
