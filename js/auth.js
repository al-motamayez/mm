const ACCOUNTS_KEY = "factory-local-accounts-v2";
const SESSION_KEY = "factory-session";
const PASSWORD_ITERATIONS = 310000;
const ADMIN_SALT = "al-motamayez-default-admin-v1";
const ADMIN_PASSWORD_HASH = "caad0c2163b93a3a9e25ebd02159897f36448f96e0c1f9cf9e4fc3cf1c4ebf33";

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
const message = document.querySelector("#auth-message");
const loginPanel = document.querySelector("#login-panel");
const signupPanel = document.querySelector("#signup-panel");

function normalizedUsername(value) {
  return value.trim().toLocaleLowerCase();
}

function createId() {
  return crypto.randomUUID();
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  if (!crypto.subtle) throw new Error("المتصفح لا يدعم حماية كلمات المرور.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const digest = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: new TextEncoder().encode(salt),
    iterations,
    hash: "SHA-256"
  }, key, 256);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readAccounts() {
  const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  if (!Array.isArray(accounts)) throw new Error("بيانات الحسابات المحلية غير صالحة.");
  if (!accounts.some((account) => account.usernameKey === "zero0")) {
    accounts.unshift({
      id: "default-admin-zero0",
      full_name: "ZERO0",
      username: "ZERO0",
      usernameKey: "zero0",
      passwordSalt: ADMIN_SALT,
      passwordHash: ADMIN_PASSWORD_HASH,
      passwordIterations: PASSWORD_ITERATIONS,
      role: "admin",
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }
  return accounts;
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
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
  showMessage("");
}

function startSession(account) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    accountId: account.id,
    role: account.role,
    username: account.username,
    fullName: account.full_name,
    roleName: roleNames[account.role]
  }));
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
  if (!fullName || !username || !password.trim() || password.length < 8) {
    showMessage("أكمل البيانات واختر كلمة مرور من 8 أحرف على الأقل.");
    return;
  }
  try {
    const accounts = readAccounts();
    const usernameKey = normalizedUsername(username);
    if (accounts.some((account) => account.usernameKey === usernameKey)) {
      showMessage("اسم المستخدم مسجل بالفعل.");
      return;
    }
    const passwordSalt = createId();
    accounts.push({
      id: createId(),
      full_name: fullName,
      username,
      usernameKey,
      passwordSalt,
      passwordHash: await hashPassword(password, passwordSalt),
      passwordIterations: PASSWORD_ITERATIONS,
      role: null,
      status: "pending",
      created_at: new Date().toISOString()
    });
    saveAccounts(accounts);
    signupForm.reset();
    showAuthMode("login");
    showMessage("تم إرسال طلب الحساب إلى الأدمن للمراجعة والتفعيل.", false);
  } catch (error) {
    showMessage(`تعذر إنشاء الحساب: ${error.message}`);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const usernameKey = normalizedUsername(loginForm.elements.username.value);
  const password = loginForm.elements.password.value;
  try {
    const accounts = readAccounts();
    const account = accounts.find((item) => item.usernameKey === usernameKey);
    if (!account || await hashPassword(password, account.passwordSalt, account.passwordIterations) !== account.passwordHash) {
      showMessage("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    if (account.status !== "active" || !roleDestinations[account.role]) {
      showMessage("حسابك معلق إلى أن يفعّله الأدمن ويحدد دورك.");
      return;
    }
    startSession(account);
  } catch (error) {
    showMessage(`تعذر تسجيل الدخول: ${error.message}`);
  }
});

try {
  readAccounts();
  showAuthMode("login");
} catch (error) {
  showMessage(`تعذر تحميل الحسابات: ${error.message}`);
}
