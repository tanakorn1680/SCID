import { supabase } from '../config/supabase.js';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  return data;
}

export async function isAdmin() {
  const profile = await getProfile();
  return profile?.role === 'admin';
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  return { success: true, user: data.user };
}

export async function register(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName } }
  });
  if (error) return { success: false, error: error.message };
  return { success: true, user: data.user };
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = '/pages/login.html';
}

// redirect ถ้าไม่ได้ login
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/pages/login.html';
    return false;
  }
  return true;
}

// redirect ถ้าไม่ใช่ admin
export async function requireAdmin() {
  const ok = await requireAuth();
  if (!ok) return false;
  const admin = await isAdmin();
  if (!admin) {
    window.location.href = '/pages/shop.html';
    return false;
  }
  return true;
}
