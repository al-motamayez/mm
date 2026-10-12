const SUPABASE_URL = "https://hglrljjevkukzkzxqeop.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_koCimF8vNYZrXb4izLWzUg_3LY5zSTK";

if (!window.supabase?.createClient) {
  throw new Error("تعذّر تحميل مكتبة Supabase.");
}

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
