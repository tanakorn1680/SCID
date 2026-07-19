// GET /api/auth/profile
// คืน profile ของ user ที่ login อยู่ (รวม role)

import { requireAuth, errorResponse } from '../_lib/auth.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const { profile } = await requireAuth(req);
    return Response.json({ success: true, data: profile });
  } catch (err) {
    return errorResponse(err);
  }
}
