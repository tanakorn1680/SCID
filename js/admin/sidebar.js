// ============================================================
// Admin Sidebar — shared component
// inject HTML แทน copy-paste markup ซ้ำในทุกหน้า admin/*.html
// ============================================================

export function renderAdminSidebar(activePageId) {
  // หมายเหตุ: ไม่มีลิงก์ไปสินค้า/สมาชิกที่นี่โดยเจตนา
  // Phase 4 สั่งเฉพาะ Dashboard, คลังไอดี, ตรวจสลิป, Audit Log
  // หน้าจัดการสินค้า/สมาชิกเต็มรูปแบบรออยู่ Phase ถัดไปตาม scope ที่ Frank กำหนด
  const links = [
    { id: 'dashboard', label: 'ภาพรวม', href: '/pages/admin/dashboard.html' },
    { id: 'orders', label: 'ออเดอร์ & ตรวจสลิป', href: '/pages/admin/orders.html' },
    { id: 'inventory', label: 'คลังไอดี', href: '/pages/admin/inventory.html' },
    { id: 'audit', label: 'Audit Log', href: '/pages/admin/audit.html' }
  ];

  const linksHtml = links.map(l => `
    <a href="${l.href}" class="sidebar-link${l.id === activePageId ? ' active' : ''}">${l.label}</a>
  `).join('');

  return `
    <div class="sidebar-title">Admin Panel</div>
    ${linksHtml}
    <a href="/pages/shop.html" class="sidebar-link" style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.15);padding-top:16px;">← กลับหน้าเว็บ</a>
  `;
}

export const ADMIN_SIDEBAR_CSS = `
  .admin-shell{ display:flex; min-height:100vh; }
  .sidebar{
    width:200px; background:#1A6BA0; color:#fff; padding:20px 0; flex-shrink:0;
    position:sticky; top:0; height:100vh; overflow-y:auto;
  }
  .sidebar-title{ font-family:'Baloo 2',sans-serif; font-size:16px; font-weight:700; padding:0 18px 18px; }
  .sidebar-link{
    display:block; padding:11px 18px; color:rgba(255,255,255,0.85); text-decoration:none; font-size:13.5px;
  }
  .sidebar-link.active{ background:rgba(255,255,255,0.12); font-weight:600; color:#fff; }
  .main-content{ flex:1; padding:24px; min-width:0; }

  @media (max-width:768px){
    .admin-shell{ flex-direction:column; }
    .sidebar{ width:100%; height:auto; position:static; padding:12px 0; }
    .sidebar-title{ display:none; }
    .sidebar{ display:flex; overflow-x:auto; gap:4px; padding:8px; }
    .sidebar-link{ flex-shrink:0; white-space:nowrap; padding:8px 14px; border-radius:8px; }
    .sidebar-link.active{ border-radius:8px; }
    .main-content{ padding:14px; }
  }
`;
