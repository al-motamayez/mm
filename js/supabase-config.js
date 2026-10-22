const SUPABASE_URL = "https://hglrljjevkukzkzxqeop.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_koCimF8vNYZrXb4izLWzUg_3LY5zSTK";

if (!window.supabase?.createClient) {
  throw new Error("تعذّر تحميل مكتبة Supabase.");
}
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("إعدادات الاتصال بـ Supabase غير مكتملة.");
}

window.factorySupabaseConfig = Object.freeze({
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY
});

let persistAuthSession = true;
const authStorage = {
  getItem(key) {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const selectedStorage = persistAuthSession ? window.localStorage : window.sessionStorage;
    const otherStorage = persistAuthSession ? window.sessionStorage : window.localStorage;
    otherStorage.removeItem(key);
    selectedStorage.setItem(key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

window.setAuthPersistence = (shouldPersist) => {
  persistAuthSession = Boolean(shouldPersist);
};

window.supabaseClient = window.supabase.createClient(
  window.factorySupabaseConfig.url,
  window.factorySupabaseConfig.publishableKey,
  {
    global: {
      headers: { apikey: window.factorySupabaseConfig.publishableKey }
    },
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storage: authStorage
    }
  }
);
