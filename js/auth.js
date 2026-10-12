const ACCOUNTS_KEY = "factory-accounts-v1";
const SESSION_KEY = "factory-session";
const PASSWORD_ITERATIONS = 210000;

const roleNames = {
  admin: "مدير النظام",
  cutting: "مشرف القص",
  sewing: "مشرف الخياطة",
  worker: "عامل / عاملة",
  client: "عميل"
};

const roleDestinations = {
  admin: "dashboards/admin.html",
  cutting: "dashboards/cutting.html",
  sewing: "dashboards/sewing.html",
  worker: "dashboards/worker.html",
  client: "dashboards/client.html"
};

const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const setupForm = document.querySelector("#setup-form");
const message = document.querySelector("#auth-message");
const tabs = document.querySelector("#auth-tabs");
const loginPanel = document.querySelector("#login-panel");
const signupPanel = document.querySelector("#signup-panel");
const setupPanel = document.querySelector("#setup-panel");

function readAccounts() {
  const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  if (!Array.isArray(accounts)) throw new Error("تعذر قراءة بيانات الحسابات.");
  return accounts;
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function normalizedUsername(value) {
  return value.trim().toLocaleLowerCase();
}

function createAccountId() {
  return crypto.randomUUID();
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  if (!crypto.subtle) throw new Error("المتصفح لا يدعم حماية كلمة المرور. افتح الموقع عبر اتصال محلي آمن.");
  if (!salt) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const digest = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: new TextEncoder().encode(salt),
    iterations,
    hash: "SHA-256"
  }, key, 256);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { salt, hash, iterations };
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
  tabs.hidden = mode === "setup";
  setupPanel.hidden = mode !== "setup";
  showMessage("");
}

function initializeAuth() {
  const accounts = readAccounts();
  if (accounts.length === 0) {
    document.querySelector("#setup-username").value = "ZERO0";
    showAuthMode("setup");
  } else {
    showAuthMode("login");
  }
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showAuthMode(button.dataset.authMode));
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fullName = setupForm.elements.fullName.value.trim();
  const password = setupForm.elements.password.value;
  if (!fullName || !password.trim() || password.length < 8) {
    showMessage("أدخل الاسم الكامل وكلمة مرور من 8 أحرف على الأقل.");
    return;
  }
  try {
    const accounts = readAccounts();
    if (accounts.length !== 0) {
      showAuthMode("login");
      showMessage("تم إعداد حساب الأدمن مسبقًا. سجّل الدخول للمتابعة.");
      return;
    }
    const credentials = await hashPassword(password);
    const account = {
      id: createAccountId(),
      fullName,
      username: "ZERO0",
      usernameKey: normalizedUsername("ZERO0"),
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      passwordIterations: credentials.iterations,
      role: "admin",
      status: "active",
      createdAt: new Date().toISOString()
    };
    saveAccounts([account]);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      accountId: account.id,
      role: account.role,
      username: account.username,
      fullName: account.fullName,
      roleName: roleNames.admin
    }));
    window.location.href = roleDestinations.admin;
  } catch (error) {
    showMessage(error.message || "تعذر إعداد حساب الأدمن.");
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fullName = signupForm.elements.fullName.value.trim();
  const username = signupForm.elements.username.value.trim();
  const password = signupForm.elements.password.value;
  if (!fullName || !username || !password.trim() || password.length < 8) {
    showMessage("أكمل البيانات واختر كلمة مرور من 8 أحرف على الأقل.");
    return;
  }
  try {
    const accounts = readAccounts();
    const usernameKey = normalizedUsername(username);
    if (accounts.some((account) => account.usernameKey === usernameKey)) {
      showMessage("اسم المستخدم أو الهاتف مسجل بالفعل.");
      return;
    }
    const credentials = await hashPassword(password);
    accounts.push({
      id: createAccountId(),
      fullName,
      username,
      usernameKey,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      passwordIterations: credentials.iterations,
      role: null,
      status: "pending",
      createdAt: new Date().toISOString()
    });
    saveAccounts(accounts);
    signupForm.reset();
    showAuthMode("login");
    showMessage("تم استلام طلبك. حسابك قيد التفعيل من قبل الإدارة.", false);
  } catch (error) {
    showMessage(error.message || "تعذر إنشاء الحساب.");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  try {
    const accounts = readAccounts();
    const account = accounts.find((item) => item.usernameKey === normalizedUsername(username));
    if (!account) {
      showMessage("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    const credentials = await hashPassword(password, account.passwordSalt, account.passwordIterations);
    if (credentials.hash !== account.passwordHash) {
      showMessage("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    if (account.status !== "active" || !roleDestinations[account.role]) {
      showMessage("حسابك قيد التفعيل من قبل الإدارة.");
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      accountId: account.id,
      role: account.role,
      username: account.username,
      fullName: account.fullName,
      roleName: roleNames[account.role]
    }));
    window.location.href = roleDestinations[account.role];
  } catch (error) {
    showMessage(error.message || "تعذر تسجيل الدخول.");
  }
});

try {
  initializeAuth();
} catch (error) {
  showMessage(error.message || "تعذر تحميل الحسابات.");
}
