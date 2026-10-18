const supabaseClient = window.supabaseClient;
const AUTH_EMAIL_DOMAIN = "accounts.al-motamayez.invalid";
const ADMIN_USERNAME = "ZERO0";
const ADMIN_AUTH_EMAIL = "mohamed01007033454@gmail.com";

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
const passwordRecoveryPanel = document.querySelector("#password-recovery-panel");
const signupButton = signupForm.querySelector('[type="submit"]');
signupButton.disabled = true;
let signupDisabledReason = "";

function hasPasswordRecoveryHash() {
  return new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery"
    || new URLSearchParams(window.location.search).get("type") === "recovery";
}

function showPasswordRecovery() {
  document.querySelector("#auth-tabs").hidden = true;
  loginPanel.hidden = true;
  signupPanel.hidden = true;
  passwordRecoveryPanel.hidden = false;
  showMessage("أدخل كلمة مرور جديدة لا تقل عن 8 أحرف.");
}

function usernameEmail(username) {
  return `${username.trim().toLocaleLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

function showMessage(text, isError = true) {
  message.textContent = text;
  message.classList.toggle("message-error", isError);
  message.classList.toggle("message-success", !isError);
  message.hidden = !text;
}

function showGenericFailure(messageText) {
  console.error(messageText);
  showMessage("تعذر إتمام الطلب الآن. حاول مرة أخرى لاحقًا.");
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
    .select("id, name, username, email, role, status")
    .ilike("username", username)
    .maybeSingle();
  if (!current.error) return current.data;
  if (current.error.code !== "42703") throw current.error;

  const withoutEmail = await supabaseClient
    .from("users")
    .select("id, name, username, role, status")
    .ilike("username", username)
    .maybeSingle();
  if (!withoutEmail.error) return withoutEmail.data;
  if (withoutEmail.error.code !== "42703") throw withoutEmail.error;

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

async function findAccountById(id) {
  let { data, error } = await supabaseClient
    .from("users")
    .select("id, name, username, role, status")
    .eq("id", id)
    .maybeSingle();
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role")
      .eq("id", id)
      .maybeSingle());
    if (!error && data) data.status = data.role === "pending" ? "pending" : "active";
  }
  if (error) throw error;
  return data;
}

async function createPendingAccount(user, fullName, username, phone) {
  let account = await findAccountById(user.id);
  if (!account) {
    const { error } = await supabaseClient.from("users").insert({
      id: user.id,
      name: fullName,
      username,
      email: user.email,
      phone,
      role: null,
      status: "pending"
    });
    if (error && error.code !== "23505") throw error;
    account = await findAccountById(user.id);
  }

  if (!account
    || account.username.toLocaleLowerCase() !== username.toLocaleLowerCase()
    || (account.status !== "pending" && account.role !== "pending")) {
    throw new Error("لم يتم حفظ طلب الحساب كطلب معلق في users.");
  }
}

async function recordAuthEvent(eventType) {
  const { error } = await supabaseClient.rpc("record_factory_auth_event", {
    requested_event_type: eventType
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("سجل الدخول اللحظي غير مهيأ. شغّل supabase/schema.sql كاملًا في SQL Editor.");
    }
    throw new Error(`تعذر تسجيل حدث المصادقة: ${error.message}`);
  }
}

function isExistingAuthAccountError(error) {
  return error.code === "user_already_exists"
    || error.code === "email_exists"
    || /user already registered|email.*already.*(registered|exists)/i.test(error.message);
}

async function loginEmailFor(identifier) {
  const normalized = identifier.trim();
  if (normalized.includes("@")) return normalized.toLocaleLowerCase();

  try {
    const account = await findAccountByUsername(normalized);
    if (account?.email) return account.email.toLocaleLowerCase();
  } catch (error) {
    if (!["42703", "42501", "PGRST301"].includes(error.code)) {
      console.error("تعذر البحث عن البريد المرتبط باسم المستخدم.", error);
      throw new Error("تعذر البحث عن الحساب في users. تحقق من اتصال Supabase وصلاحيات القراءة.");
    }
  }

  return normalized.toLocaleLowerCase() === ADMIN_USERNAME.toLocaleLowerCase()
    ? ADMIN_AUTH_EMAIL
    : usernameEmail(normalized);
}

async function routeAuthenticatedUser(user) {
  if (user.email?.toLocaleLowerCase() === ADMIN_AUTH_EMAIL) {
    const { error } = await supabaseClient.rpc("ensure_factory_admin_profile");
    if (error) {
      console.error("تعذر تجهيز ملف الأدمن الموثق في users.", error);
      throw new Error("تم التحقق من كلمة المرور، لكن تعذر تجهيز ملف الأدمن. أعد تشغيل supabase/schema.sql وتحقق من صلاحيات الدالة.");
    }
  }
  const account = await findAccountById(user.id);
  if (account?.status === "suspended") {
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) throw signOutError;
    showAuthMode("login");
    showMessage("حسابك متوقف مؤقتًا بواسطة الإدارة. تواصل مع الأدمن لإعادة تفعيله.");
    return;
  }
  if (!account || account.status !== "active" || !roleDestinations[account.role]) {
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) throw signOutError;
    showAuthMode("login");
    showMessage(account ? "حسابك بانتظار التفعيل من الإدارة." : "تعذر الوصول إلى الحساب. تواصل مع الإدارة.");
    return;
  }

  window.location.assign(roleDestinations[account.role]);
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showAuthMode(button.dataset.authMode));
});

document.querySelector("#request-password-reset").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const identifier = loginForm.elements.username.value.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const validUsername = /^[a-zA-Z0-9._-]{3,30}$/.test(identifier);
  if (!validEmail && !validUsername) {
    showMessage("اكتب البريد الإلكتروني أو اسم المستخدم أولاً لإرسال رابط إعادة التعيين.");
    loginForm.elements.username.focus();
    return;
  }

  button.disabled = true;
  try {
    const email = await loginEmailFor(identifier);
    const redirectTo = new URL(window.location.pathname, window.location.origin).toString();
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    showMessage("إذا كان البريد مرتبطًا بحساب، فسيصلك رابط إعادة تعيين كلمة المرور. افتح الرابط من هذا الجهاز.", false);
  } catch (error) {
    console.error("تعذر إرسال رابط إعادة تعيين كلمة المرور.", error);
    showMessage("تعذر إرسال رابط إعادة التعيين الآن. تحقق من البيانات وحاول لاحقًا.");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#password-recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  if (password.length < 8 || password !== form.elements.passwordConfirm.value) {
    showMessage(password.length < 8
      ? "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل."
      : "كلمتا المرور غير متطابقتين.");
    return;
  }

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("رابط إعادة التعيين غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.");

    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) {
      console.error("تم تغيير كلمة المرور لكن تعذر إنهاء جلسة الاستعادة.", signOutError);
      throw new Error("تم تغيير كلمة المرور، لكن تعذر إنهاء جلسة الاستعادة. أغلق الصفحة ثم سجّل الدخول بكلمة المرور الجديدة.");
    }
    window.history.replaceState(null, "", window.location.pathname);
    form.reset();
    passwordRecoveryPanel.hidden = true;
    document.querySelector("#auth-tabs").hidden = false;
    showAuthMode("login");
    showMessage("تم تغيير كلمة المرور. سجّل الدخول بالبريد وكلمة المرور الجديدة.", false);
  } catch (error) {
    console.error("تعذر تغيير كلمة المرور من رابط الاستعادة.", error);
    showMessage("تعذر تغيير كلمة المرور الآن. تأكد من صلاحية الرابط وحاول مجددًا.");
  } finally {
    button.disabled = false;
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fullName = signupForm.elements.fullName.value.trim();
  const phone = signupForm.elements.phone.value.trim();
  const username = signupForm.elements.username.value.trim();
  const password = signupForm.elements.password.value;
  if (!phone || !fullName || !/^[a-zA-Z0-9._-]{3,30}$/.test(username) || !password.trim() || password.length < 8) {
    showMessage("أدخل رقم التليفون والاسم، واسم مستخدم من 3 إلى 30 حرفًا (إنجليزي أو أرقام أو . _ -)، وكلمة مرور من 8 أحرف على الأقل.");
    return;
  }
  if (username.toLocaleLowerCase() === "zero0") {
    showMessage("اسم المستخدم ZERO0 محجوز لحساب الإدارة.");
    return;
  }

  signupButton.disabled = true;
  try {
    const email = usernameEmail(username);
    let { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, username, phone } }
    });
    if (error && isExistingAuthAccountError(error)) {
      const recovery = await supabaseClient.auth.signInWithPassword({ email, password });
      if (recovery.error) {
        throw new Error("الحساب موجود مسبقًا في المصادقة، لكن تعذر التحقق من كلمة المرور. سجّل الدخول بالحساب أو أعد تعيين كلمة مروره ثم حاول استعادة الطلب.");
      }
      data = recovery.data;
      error = null;
    }
    if (error) throw error;
    if (!data.user) throw new Error("لم يُنشأ الحساب. حاول مرة أخرى.");
    if (!data.session) {
      showMessage("تعذر إكمال إنشاء الحساب. حاول مرة أخرى لاحقًا أو تواصل مع الإدارة.");
      return;
    }
    try {
      await createPendingAccount(data.user, fullName, username, phone);
    } catch (profileError) {
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) throw signOutError;
      console.error("تعذر إنشاء صف الطلب المعلق في users بعد التسجيل.", profileError);
      if (profileError.code === "42703" || profileError.code === "42501") {
        throw new Error("مخطط users أو صلاحيات RLS لا تسمح بإضافة صف الطلب. شغّل تحديث supabase/schema.sql مع سياسة إدراج الحساب المعلق.");
      }
      throw new Error(`تعذر إضافة طلب الحساب إلى users: ${profileError.message}`);
    }
    try {
      await recordAuthEvent("signup");
    } catch (eventError) {
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) throw signOutError;
      throw eventError;
    }
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) throw signOutError;
    signupForm.reset();
    showAuthMode("login");
    showMessage("تم إرسال طلب الحساب إلى الأدمن للمراجعة والتفعيل.", false);
  } catch (error) {
    console.error("تعذر إنشاء طلب الحساب.", error);
    showMessage("تعذر إنشاء الحساب الآن. تحقق من البيانات وحاول مرة أخرى.");
  } finally {
    signupButton.disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  const validUsername = /^[a-zA-Z0-9._-]{3,30}$/.test(username);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  if ((!validUsername && !validEmail) || !password) {
    showMessage("أدخل اسم مستخدم صالحًا وكلمة المرور.");
    return;
  }

  try {
    window.setAuthPersistence(loginForm.elements.remember.checked);
    const email = await loginEmailFor(username);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      console.error("رفضت خدمة المصادقة محاولة تسجيل الدخول.", error);
      showMessage("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    if (!data.user) {
      showMessage("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    try {
      await recordAuthEvent("login");
    } catch (eventError) {
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) throw signOutError;
      throw eventError;
    }
    await routeAuthenticatedUser(data.user);
  } catch (profileError) {
    showGenericFailure("تعذر إكمال تسجيل الدخول.");
    console.error("تعذر إكمال تسجيل الدخول أو تحميل صلاحيات الحساب.", profileError);
  }
});

async function initializeAuth() {
  showAuthMode("login");
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;
  if (hasPasswordRecoveryHash()) {
    if (!session) {
      showMessage("رابط إعادة التعيين غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.");
      return;
    }
    showPasswordRecovery();
    return;
  }
  if (session?.user) {
    await routeAuthenticatedUser(session.user);
    return;
  }
  const response = await fetch(`${supabaseClient.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseClient.supabaseKey }
  });
  if (!response.ok) throw new Error(`تعذر قراءة إعدادات المصادقة (${response.status}).`);
  const settings = await response.json();
  if (!settings.mailer_autoconfirm) {
    signupDisabledReason = "إنشاء الحساب غير متاح مؤقتًا. تواصل مع الإدارة للمساعدة.";
    showMessage(signupDisabledReason);
    return;
  }
  signupButton.disabled = false;
}

initializeAuth().catch((error) => {
  console.error("تعذر تهيئة صفحة المصادقة.", error);
  signupDisabledReason = "تعذر إتمام الطلب الآن. حاول مرة أخرى لاحقًا.";
  showMessage(signupDisabledReason);
});
