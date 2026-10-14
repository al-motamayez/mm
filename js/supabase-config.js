const SUPABASE_URL = "https://hglrljjevkukzkzxqeop.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_koCimF8vNYZrXb4izLWzUg_3LY5zSTK";

if (!window.supabase?.createClient) {
  throw new Error("تعذّر تحميل مكتبة Supabase.");
}

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

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storage: authStorage
  }
});
