const supabaseClient = window.supabaseClient;
const AUTH_EMAIL_DOMAIN = "accounts.al-motamayez.invalid";

const roleDestinations = {
  admin: "dashboards/admin.html",
  cutting: "dashboards/cutting.html",
  sewing: "dashboards/sewing.html",
  worker: "dashboards/worker.html",
  client: "dashboards/client.html"
};

const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const message = document.querySelector("#auth-message");
const loginPanel = document.querySelector("#login-panel");
const signupPanel = document.querySelector("#signup-panel");
const signupButton = signupForm.querySelector('[type="submit"]');
signupButton.disabled = true;
let signupDisabledReason = "";

function usernameEmail(username) {
  return `${username.trim().toLocaleLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

function showMessage(text, isError = true) {
  message.textContent = text;
  message.classList.toggle("message-error", isError);
  message.classList.toggle("message-success", !isError);
  message.hidden = !text;
}

function showAuthMode(mode) {
  loginPanel.hidden = mode !== "login";
  signupPanel.hidden = mode !== "signup";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  showMessage(mode === "signup" ? signupDisabledReason : "");
}

async function findAccountByUsername(username) {
  const current = await supabaseClient
    .from("users")
    .select("id, name, username, role, status")
    .ilike("username", username)
    .maybeSingle();
  if (!current.error) return current.data;
  if (current.error.code !== "42703") throw current.error;

  const legacy = await supabaseClient
    .from("users")
    .select("id, name, username, role, created_at")
    .ilike("username", username)
    .maybeSingle();
  if (legacy.error) throw legacy.error;
  return legacy.data ? {
    ...legacy.data,
    status: legacy.data.role === "pending" ? "pending" : "active"
  } : null;
}

async function routeAuthenticatedUser(user) {
  const username = user.user_metadata?.username || user.email?.split("@")[0];
  if (!username) throw new Error("تعذر تحديد اسم المستخدم لحساب المصادقة.");
  const account = await findAccountByUsername(username);
  if (!account || account.status !== "active" || !roleDestinations[account.role]) {
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) throw signOutError;
    showAuthMode("login");
    showMessage(account ? "حسابك معلق إلى أن يفعّله الأدمن ويحدد دورك." : "بيانات حسابك غير موجودة في جدول users. تواصل مع الإدارة.");
    return;
  }

  window.location.assign(roleDestinations[account.role]);
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showAuthMode(button.dataset.authMode));
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fullName = signupForm.elements.fullName.value.trim();
  const username = signupForm.elements.username.value.trim();
  const password = signupForm.elements.password.value;
  if (!fullName || !/^[a-zA-Z0-9._-]{3,30}$/.test(username) || !password.trim() || password.length < 8) {
    showMessage("أدخل الاسم، واسم مستخدم من 3 إلى 30 حرفًا (إنجليزي أو أرقام أو . _ -)، وكلمة مرور من 8 أحرف على الأقل.");
    return;
  }
  if (username.toLocaleLowerCase() === "zero0") {
    showMessage("اسم المستخدم ZERO0 محجوز لحساب الإدارة.");
    return;
  }

  signupButton.disabled = true;
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: usernameEmail(username),
      password,
      options: { data: { full_name: fullName, username } }
    });
    if (error) throw error;
    if (!data.user) throw new Error("لم يُنشأ الحساب. حاول مرة أخرى.");
    if (!data.session) {
      showMessage("الحساب أُنشئ، لكن إعداد المشروع يطلب تأكيد بريد غير متاح لحساب اسم المستخدم. عطّل Confirm email في Supabase Auth ثم أعد المحاولة بحساب آخر.", true);
      return;
    }
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) throw signOutError;
    signupForm.reset();
    showAuthMode("login");
    showMessage("تم إرسال طلب الحساب إلى الأدمن للمراجعة والتفعيل.", false);
  } catch (error) {
    showMessage(`تعذر إنشاء الحساب: ${error.message}`);
  } finally {
    signupButton.disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username) || !password) {
    showMessage("أدخل اسم مستخدم صالحًا وكلمة المرور.");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: usernameEmail(username),
      password
    });
    if (error) {
      showMessage("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    if (!data.user) {
      showMessage("تعذر التحقق من بيانات الحساب.");
      return;
    }
    await routeAuthenticatedUser(data.user);
  } catch (profileError) {
    showMessage(`تعذر إتمام تسجيل الدخول: ${profileError.message}`);
  }
});

async function initializeAuth() {
  showAuthMode("login");
  const response = await fetch(`${supabaseClient.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseClient.supabaseKey }
  });
  if (!response.ok) throw new Error(`تعذر قراءة إعدادات المصادقة (${response.status}).`);
  const settings = await response.json();
  const { error: schemaError } = await supabaseClient
    .from("users")
    .select("id, name, username, role, status")
    .limit(0);
  if (schemaError) {
    signupDisabledReason = "قاعدة البيانات لا تزال على مخطط users القديم. يلزم ربط الحسابات بـSupabase Auth وإضافة status قبل التسجيل الآمن.";
    showMessage(signupDisabledReason);
    return;
  }
  if (!settings.mailer_autoconfirm) {
    signupDisabledReason = "إنشاء الحساب باسم المستخدم فقط يتطلب تعطيل Confirm email من Supabase Auth؛ لا يمكن إرسال رمز التأكيد إلى اسم مستخدم.";
    showMessage(signupDisabledReason);
    return;
  }
  signupButton.disabled = false;
}

initializeAuth().catch((error) => {
  signupDisabledReason = `تعذر تهيئة الاتصال بـ Supabase: ${error.message}`;
  showMessage(signupDisabledReason);
});
