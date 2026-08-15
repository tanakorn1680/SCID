// js/admin-toast.js
// Toast notification system สำหรับทุกหน้า Admin
// ใช้งาน: import { toast } from '/js/admin-toast.js';
//         toast.success('บันทึกสำเร็จ', 'ข้อมูลถูกอัปเดตแล้ว');
//         toast.error('เกิดข้อผิดพลาด', err.message);
//         toast.info('กำลังโหลด...');
//         toast.warning('คำเตือน', 'ข้อความ');

const ICONS = {
  success: `<svg class="admin-toast-icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`,
  error:   `<svg class="admin-toast-icon error"   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info:    `<svg class="admin-toast-icon info"    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg class="admin-toast-icon warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

// สร้าง container ครั้งเดียว
function getContainer() {
  let el = document.getElementById('admin-toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'admin-toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function show(type, title, message = '', duration = 3200) {
  const container = getContainer();

  const el = document.createElement('div');
  el.className = `admin-toast ${type}`;
  el.innerHTML = `
    ${ICONS[type] ?? ICONS.info}
    <div class="admin-toast-body">
      <div class="admin-toast-title">${title}</div>
      ${message ? `<div class="admin-toast-msg">${message}</div>` : ''}
    </div>
    <button class="admin-toast-close" aria-label="ปิด">&#x2715;</button>
  `;

  // ปุ่มปิด
  el.querySelector('.admin-toast-close').addEventListener('click', () => dismiss(el));

  container.appendChild(el);

  // auto dismiss
  const timer = setTimeout(() => dismiss(el), duration);
  el._timer = timer;

  return el;
}

function dismiss(el) {
  if (!el || el._dismissed) return;
  el._dismissed = true;
  clearTimeout(el._timer);
  el.classList.add('leaving');
  el.addEventListener('animationend', () => el.remove(), { once: true });
  // fallback ถ้า animation ไม่ทำงาน
  setTimeout(() => el.remove(), 350);
}

export const toast = {
  success: (title, msg, dur) => show('success', title, msg, dur),
  error:   (title, msg, dur) => show('error',   title, msg, dur ?? 4500),
  info:    (title, msg, dur) => show('info',     title, msg, dur),
  warning: (title, msg, dur) => show('warning',  title, msg, dur),
};
