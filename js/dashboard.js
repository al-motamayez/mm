const STORAGE_KEY = "factory-data-v1";
const SESSION_KEY = "factory-session";
const ACCOUNTS_KEY = "factory-accounts-v1";
const PASSWORD_ITERATIONS = 210000;
const rolePages = {
  admin: "admin.html",
  cutting: "cutting.html",
  sewing: "sewing.html",
  worker: "worker.html",
  client: "client.html"
};
const roleNames = {
  admin: "مدير النظام",
  cutting: "مشرف القص",
  sewing: "مشرف الخياطة",
  worker: "عامل / عاملة",
  client: "عميل"
};

const seedData = {
  models: [],
  payments: [],
  users: [],
  leaves: [],
  cutting: [],
  sewing: [],
  tasks: []
};

const roleInfo = {
  admin: { title: "لوحة تحكم الإدارة", description: "نظرة شاملة على المصنع وإدارة بيانات التشغيل.", icon: "▦" },
  cutting: { title: "لوحة مشرف القص", description: "متابعة أوامر القص والكميات المطلوبة والمنفذة.", icon: "✂" },
  sewing: { title: "لوحة مشرف الخياطة", description: "متابعة خطوط الخياطة والإنتاج اليومي.", icon: "⌁" },
  worker: { title: "مهامي", description: "المهام المسندة إليك وحالة تنفيذها.", icon: "✓" },
  client: { title: "بوابة العميل", description: "موديلاتك وطلباتك والمدفوعات الخاصة بحسابك.", icon: "◇" }
};

function readSession() {
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  const account = Array.isArray(accounts) ? accounts.find((item) => item.id === session?.accountId) : null;
  if (!session || !account || account.status !== "active" || account.role !== session.role || !rolePages[session.role]) {
    window.location.replace("../login.html");
    return null;
  }
  session.username = account.username;
  session.fullName = account.fullName;
  session.roleName = roleNames[account.role];
  const currentPage = window.location.pathname.split("/").pop();
  const pageRole = document.body.dataset.dashboardRole;
  if (currentPage !== rolePages[session.role] || (pageRole && pageRole !== session.role)) {
    window.location.replace(rolePages[session.role]);
    return null;
  }
  return session;
}

function readData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return structuredClone(seedData);
  }
  const data = JSON.parse(saved);
  for (const key of Object.keys(seedData)) {
    if (!Array.isArray(data[key])) throw new Error(`بيانات المصنع غير صالحة: ${key}`);
  }
  return data;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readAccounts() {
  const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  if (!Array.isArray(accounts)) throw new Error("بيانات الحسابات غير صالحة.");
  return accounts;
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function usernameKey(value) {
  return value.trim().toLocaleLowerCase();
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  if (!crypto.subtle) throw new Error("المتصفح لا يدعم حماية كلمة المرور.");
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return `${new Intl.NumberFormat("ar-EG").format(value)} ج.م`;
}

function statusClass(value) {
  if (value === "قيد المراجعة" || value === "قيد التنفيذ") return "warning";
  if (value === "جديدة" || value === "قيد الإنتاج") return "info";
  if (value === "جاهز للتسليم") return "";
  return "muted";
}

function statusTag(value) {
  return `<span class="status ${statusClass(value)}">${escapeHtml(value)}</span>`;
}

function table(headers, rows) {
  if (!rows.length) return '<div class="empty-state">لا توجد بيانات لعرضها حاليًا.</div>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function panel(title, content, subtitle = "") {
  return `<section class="panel"><div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div>${content}</section>`;
}

function stat(label, value, note = "") {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}</article>`;
}

function modelRows(models, withActions = false) {
  return models.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.client)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.quantity)}</td><td>${statusTag(item.status)}</td>${withActions ? `<td><button class="row-action" type="button" data-edit-kind="models" data-index="${index}">تعديل</button> <button class="row-action" type="button" data-action="delete-model" data-index="${index}">حذف</button></td>` : ""}</tr>`);
}

function paymentRows(payments) {
  return payments.map((item, index) => `<tr><td>${escapeHtml(item.client)}</td><td>${money(item.amount)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.method)}</td><td><button class="row-action" type="button" data-edit-kind="payments" data-index="${index}">تعديل</button></td></tr>`);
}

function userRows(users) {
  return users.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.department)}</td><td><button class="row-action" type="button" data-edit-kind="users" data-index="${index}">تعديل</button></td></tr>`);
}

function pendingAccountRows(accounts) {
  const pending = accounts.filter((account) => account.status === "pending");
  return pending.map((account) => `<tr><td>${escapeHtml(account.fullName)}</td><td>${escapeHtml(account.username)}</td><td>${new Intl.DateTimeFormat("ar-EG").format(new Date(account.createdAt))}</td><td><select aria-label="الدور الجديد" data-pending-role="${escapeHtml(account.id)}"><option value="">اختر الدور</option><option value="client">عميل</option><option value="worker">عامل</option><option value="cutting">مشرف قص</option><option value="sewing">مشرف خياطة</option></select></td><td><button class="row-action" type="button" data-action="activate-account" data-account-id="${escapeHtml(account.id)}">تفعيل الحساب</button></td></tr>`);
}

function administratorRows(accounts) {
  return accounts.filter((account) => account.role === "admin" && account.status === "active").map((account) => `<tr><td>${escapeHtml(account.fullName)}</td><td><form class="account-edit-form form-grid" data-account-id="${escapeHtml(account.id)}"><div class="field"><label>اسم المستخدم</label><input name="username" value="${escapeHtml(account.username)}" required></div><div class="field"><label>كلمة مرور جديدة</label><input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="اتركها فارغة دون تغيير"></div><button class="row-action" type="submit">حفظ الحساب</button></form></td></tr>`);
}

function adminView(data, accounts) {
  const totalUnits = data.models.reduce((sum, item) => sum + Number(item.quantity), 0);
  const paid = data.payments.reduce((sum, item) => sum + Number(item.amount), 0);
  return `
    <div class="stats-grid">${stat("الموديلات الحالية", data.models.length, "ضمن أوامر التشغيل")}${stat("إجمالي القطع", new Intl.NumberFormat("ar-EG").format(totalUnits), "قطعة")}${stat("المدفوعات المسجلة", money(paid), "إجمالي الدفعات")}${stat("طلبات الانصراف", data.leaves.filter((item) => item.status === "قيد المراجعة").length, "بانتظار المراجعة")}</div>
    ${panel("إضافة موديل / أمر تشغيل", `<div class="panel-body"><form id="model-form" class="form-grid"><input type="hidden" name="editIndex" value=""><div class="field"><label for="model-name">اسم الموديل</label><input id="model-name" name="name" required></div><div class="field"><label for="model-client">العميل</label><input id="model-client" name="client" required></div><div class="field"><label for="model-quantity">الكمية</label><input id="model-quantity" name="quantity" type="number" min="1" required></div><div class="field"><label for="model-status">الحالة</label><select id="model-status" name="status"><option>قيد الإنتاج</option><option>مرحلة الخياطة</option><option>جاهز للتسليم</option></select></div><button class="button button-primary" type="submit">إضافة الموديل</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></form></div>`)}
    ${panel("الموديلات وأوامر التشغيل", table(["الموديل","العميل","الكمية","الحالة","إجراء"], modelRows(data.models, true)))}
    <div class="stats-grid">${panel("تسجيل دفعة مالية", `<div class="panel-body"><form id="payment-form" class="form-grid"><input type="hidden" name="editIndex" value=""><div class="field"><label for="payment-client">العميل</label><input id="payment-client" name="client" required></div><div class="field"><label for="payment-amount">المبلغ (ج.م)</label><input id="payment-amount" name="amount" type="number" min="1" required></div><div class="field"><label for="payment-method">طريقة الدفع</label><select id="payment-method" name="method"><option>تحويل بنكي</option><option>نقدي</option><option>محفظة إلكترونية</option></select></div><button class="button button-primary" type="submit">تسجيل الدفعة</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></form></div>`, "تُضاف الدفعات إلى سجل العميل")}${panel("إضافة مستخدم", `<div class="panel-body"><form id="user-form" class="form-grid"><input type="hidden" name="editIndex" value=""><div class="field"><label for="user-name">اسم المستخدم</label><input id="user-name" name="name" required></div><div class="field"><label for="user-role">الدور الوظيفي</label><select id="user-role" name="role"><option>عامل قص</option><option>عاملة خياطة</option><option>مشرف القص</option><option>مشرف الخياطة</option><option>مدير النظام</option></select></div><div class="field"><label for="user-department">القسم</label><input id="user-department" name="department" required></div><button class="button button-primary" type="submit">إضافة المستخدم</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></form></div>`, "إنشاء سجل موظف جديد")}</div>
    ${panel("سجل الدفعات المالية", table(["العميل","المبلغ","التاريخ","طريقة الدفع","إجراء"], paymentRows(data.payments)))}
    ${panel("طلبات وأذونات الانصراف", table(["الموظف","التاريخ","السبب","الحالة","إجراء"], data.leaves.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.reason)}</td><td>${statusTag(item.status)}</td><td>${item.status === "قيد المراجعة" ? `<button class="row-action" data-action="approve-leave" data-index="${index}" type="button">اعتماد</button> <button class="row-action" data-action="deny-leave" data-index="${index}" type="button">رفض</button>` : "—"}</td></tr>`)))}
    ${panel("طلبات الحسابات الجديدة", table(["الاسم الكامل","اسم المستخدم / الهاتف","تاريخ الطلب","تحديد الدور","إجراء"], pendingAccountRows(accounts)))}
    ${panel("إضافة أدمن جديد", `<div class="panel-body"><form id="admin-account-form" class="form-grid"><div class="field"><label for="admin-full-name">الاسم الكامل</label><input id="admin-full-name" name="fullName" required></div><div class="field"><label for="admin-username">اسم المستخدم</label><input id="admin-username" name="username" required></div><div class="field"><label for="admin-password">كلمة المرور</label><input id="admin-password" name="password" type="password" minlength="8" autocomplete="new-password" required></div><button class="button button-primary" type="submit">إنشاء أدمن مفعل</button></form></div>`)}
    ${panel("حسابات الأدمن", table(["الاسم الكامل","تعديل اسم المستخدم أو كلمة المرور"], administratorRows(accounts)))}
    ${panel("المستخدمون", table(["الاسم","الدور الوظيفي","القسم","إجراء"], userRows(data.users)))}`;
}

function cuttingView(data) {
  const total = data.cutting.reduce((sum, item) => sum + Number(item.total), 0);
  const cut = data.cutting.reduce((sum, item) => sum + Number(item.cut), 0);
  return `<div class="stats-grid">${stat("أوامر القص", data.cutting.length, "أوامر نشطة")}${stat("إجمالي المطلوب", new Intl.NumberFormat("ar-EG").format(total), "قطعة")}${stat("تم قصه", new Intl.NumberFormat("ar-EG").format(cut), "قطعة")}${stat("المتبقي", new Intl.NumberFormat("ar-EG").format(total - cut), "قطعة للقص")}</div>${panel("أوامر مرحلة القص", table(["رقم الأمر","الموديل","القماش","الكمية المطلوبة","المقصوص","التقدم"], data.cutting.map((item) => {
    const progress = item.total ? Math.min(100, Math.round(item.cut / item.total * 100)) : 0;
    return `<tr><td>${escapeHtml(item.order)}</td><td>${escapeHtml(item.model)}</td><td>${escapeHtml(item.fabric)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.total)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.cut)}</td><td><div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div></td></tr>`;
  })))}`;
}

function sewingView(data) {
  const target = data.sewing.reduce((sum, item) => sum + Number(item.target), 0);
  const produced = data.sewing.reduce((sum, item) => sum + Number(item.produced), 0);
  return `<div class="stats-grid">${stat("خطوط الخياطة", data.sewing.length, "خطوط نشطة")}${stat("المستهدف اليومي", new Intl.NumberFormat("ar-EG").format(target), "قطعة")}${stat("الإنتاج اليومي", new Intl.NumberFormat("ar-EG").format(produced), "قطعة منفذة")}${stat("نسبة الإنجاز", `${target ? Math.round(produced / target * 100) : 0}%`, "من المستهدف")}</div>${panel("متابعة خطوط الخياطة", table(["الخط","الموديل","المشرف","المستهدف اليومي","الإنتاج المنفذ","الحالة"], data.sewing.map((item) => `<tr><td>${escapeHtml(item.line)}</td><td>${escapeHtml(item.model)}</td><td>${escapeHtml(item.supervisor)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.target)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.produced)}</td><td>${statusTag(item.produced >= item.target ? "مكتمل" : "قيد التنفيذ")}</td></tr>`)))}`;
}

function workerView(data, session) {
  const tasks = data.tasks.filter((item) => item.worker === session.username);
  return `<div class="stats-grid">${stat("المهام المسندة إليّ", tasks.length, "حسب حساب العامل")}${stat("قيد التنفيذ", tasks.filter((item) => item.status === "قيد التنفيذ").length)}${stat("مهام جديدة", tasks.filter((item) => item.status === "جديدة").length)}</div>${panel("مهامي", table(["المهمة","الموديل","الكمية","موعد التسليم","الحالة"], tasks.map((item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.model)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.quantity)}</td><td>${escapeHtml(item.due)}</td><td>${statusTag(item.status)}</td></tr>`)))}`;
}

function clientView(data, session) {
  const models = data.models.filter((item) => item.client === session.username);
  const payments = data.payments.filter((item) => item.client === session.username);
  const totalPaid = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  return `<div class="stats-grid">${stat("موديلاتي", models.length, "مرتبطة بحسابك")}${stat("إجمالي الكميات", new Intl.NumberFormat("ar-EG").format(models.reduce((sum, item) => sum + Number(item.quantity), 0)), "قطعة")}${stat("الدفعات المسجلة", money(totalPaid), "إجمالي المدفوع")}</div>${panel("موديلاتي والطلبات", table(["الموديل","الكمية","حالة الطلب"], models.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.quantity)}</td><td>${statusTag(item.status)}</td></tr>`)))}${panel("دفعاتي المالية", table(["المبلغ","التاريخ","طريقة الدفع"], payments.map((item) => `<tr><td>${money(item.amount)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.method)}</td></tr>`)))}`;
}

function render(session, data, accounts) {
  const info = roleInfo[session.role];
  const username = escapeHtml(session.username);
  const navigation = `<div><p class="side-label">القائمة الرئيسية</p><a class="nav-link active" href="#"><span class="nav-icon">${info.icon}</span>${info.title}</a></div>`;
  document.querySelector("#app").innerHTML = `
    <aside class="sidebar"><a class="brand" href="../login.html"><img class="brand-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><span class="brand-copy"><strong>AL-MOTAMAYEZ</strong></span></a><nav>${navigation}</nav><div class="sidebar-bottom"><div class="profile-chip"><span class="avatar">${username.slice(0, 1)}</span><div class="profile-details"><strong>${username}</strong><span>${escapeHtml(session.roleName)}</span></div></div><button class="logout-button" id="logout" type="button">↪ تسجيل الخروج</button></div></aside>
    <main class="main-content"><header class="topbar"><div class="topbar-title"><h1>${info.title}</h1><p>${info.description}</p></div><div class="header-brand"><img class="header-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><div class="brand-copy"><strong>AL-MOTAMAYEZ</strong></div><span class="date-label">${new Intl.DateTimeFormat("ar-EG", { dateStyle: "full" }).format(new Date())}</span></div></header>
    ${session.role === "admin" ? adminView(data, accounts) : session.role === "cutting" ? cuttingView(data) : session.role === "sewing" ? sewingView(data) : session.role === "worker" ? workerView(data, session) : clientView(data, session)}
    <footer class="page-footer">AL-MOTAMAYEZ</footer></main>`;
  bindActions(session);
}

function bindActions(session) {
  document.querySelector("#logout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.replace("../login.html");
  });

  if (session.role !== "admin") return;
  const editConfigs = {
    models: { form: "model-form", collection: "models", fields: ["name", "client", "quantity", "status"] },
    payments: { form: "payment-form", collection: "payments", fields: ["client", "amount", "method"] },
    users: { form: "user-form", collection: "users", fields: ["name", "role", "department"] }
  };
  document.querySelectorAll("[data-edit-kind]").forEach((button) => button.addEventListener("click", () => {
    const config = editConfigs[button.dataset.editKind];
    const item = readData()[config.collection][Number(button.dataset.index)];
    const form = document.querySelector(`#${config.form}`);
    form.elements.editIndex.value = button.dataset.index;
    for (const field of config.fields) form.elements[field].value = item[field];
    form.querySelector('[type="submit"]').textContent = "حفظ التعديلات";
    form.querySelector("[data-cancel-edit]").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.elements[config.fields[0]].focus();
  }));
  document.querySelectorAll("[data-cancel-edit]").forEach((button) => button.addEventListener("click", () => {
    const form = button.closest("form");
    form.reset();
    form.elements.editIndex.value = "";
    form.querySelector('[type="submit"]').textContent = form.id === "payment-form" ? "تسجيل الدفعة" : form.id === "user-form" ? "إضافة المستخدم" : "إضافة الموديل";
    button.hidden = true;
  }));
  document.querySelector("#model-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = readData();
    const model = {
      name: String(formData.get("name")).trim(),
      client: String(formData.get("client")).trim(),
      quantity: Number(formData.get("quantity")),
      status: String(formData.get("status"))
    };
    const editIndex = String(formData.get("editIndex"));
    if (editIndex) data.models[Number(editIndex)] = model;
    else data.models.unshift(model);
    saveData(data);
    render(session, data, readAccounts());
  });
  document.querySelector("#payment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = readData();
    const payment = {
      client: String(formData.get("client")).trim(),
      amount: Number(formData.get("amount")),
      date: new Date().toISOString().slice(0, 10),
      method: String(formData.get("method"))
    };
    const editIndex = String(formData.get("editIndex"));
    if (editIndex) {
      payment.date = data.payments[Number(editIndex)].date;
      data.payments[Number(editIndex)] = payment;
    } else data.payments.unshift(payment);
    saveData(data);
    render(session, data, readAccounts());
  });
  document.querySelector("#user-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = readData();
    const user = {
      name: String(formData.get("name")).trim(),
      role: String(formData.get("role")),
      department: String(formData.get("department")).trim()
    };
    const editIndex = String(formData.get("editIndex"));
    if (editIndex) data.users[Number(editIndex)] = user;
    else data.users.unshift(user);
    saveData(data);
    render(session, data, readAccounts());
  });
  document.querySelector("#admin-account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName")).trim();
    const username = String(formData.get("username")).trim();
    const password = String(formData.get("password"));
    if (!fullName || !username || !password.trim() || password.length < 8) {
      window.alert("أكمل بيانات الأدمن واختر كلمة مرور من 8 أحرف على الأقل.");
      return;
    }
    const accounts = readAccounts();
    const key = usernameKey(username);
    if (accounts.some((account) => account.usernameKey === key)) {
      window.alert("اسم المستخدم مسجل بالفعل.");
      return;
    }
    try {
      const credentials = await hashPassword(password);
      accounts.push({
        id: crypto.randomUUID(),
        fullName,
        username,
        usernameKey: key,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        passwordIterations: credentials.iterations,
        role: "admin",
        status: "active",
        createdAt: new Date().toISOString()
      });
      saveAccounts(accounts);
      render(session, readData(), accounts);
    } catch (error) {
      window.alert(`تعذر إنشاء حساب الأدمن: ${error.message}`);
    }
  });
  document.querySelectorAll(".account-edit-form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = event.currentTarget;
    const formData = new FormData(target);
    const username = String(formData.get("username")).trim();
    const password = String(formData.get("password"));
    if (!username || (password && (!password.trim() || password.length < 8))) {
      window.alert("أدخل اسم مستخدم صالحًا، أو كلمة مرور جديدة من 8 أحرف على الأقل.");
      return;
    }
    const accounts = readAccounts();
    const account = accounts.find((item) => item.id === target.dataset.accountId);
    if (!account) {
      window.alert("تعذر العثور على حساب الأدمن.");
      return;
    }
    const key = usernameKey(username);
    if (accounts.some((item) => item.id !== account.id && item.usernameKey === key)) {
      window.alert("اسم المستخدم مسجل بالفعل.");
      return;
    }
    try {
      account.username = username;
      account.usernameKey = key;
      if (password) {
        const credentials = await hashPassword(password);
        account.passwordSalt = credentials.salt;
        account.passwordHash = credentials.hash;
        account.passwordIterations = credentials.iterations;
      }
      saveAccounts(accounts);
      if (session.accountId === account.id) {
        session.username = account.username;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
      render(session, readData(), accounts);
    } catch (error) {
      window.alert(`تعذر تعديل حساب الأدمن: ${error.message}`);
    }
  }));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.action === "activate-account") {
      const accounts = readAccounts();
      const account = accounts.find((item) => item.id === button.dataset.accountId && item.status === "pending");
      const roleSelect = [...document.querySelectorAll("[data-pending-role]")].find((item) => item.dataset.pendingRole === button.dataset.accountId);
      if (!account || !roleSelect || !roleNames[roleSelect.value] || roleSelect.value === "admin") {
        window.alert("اختر دورًا صالحًا قبل تفعيل الحساب.");
        return;
      }
      account.role = roleSelect.value;
      account.status = "active";
      account.activatedAt = new Date().toISOString();
      saveAccounts(accounts);
      render(session, readData(), accounts);
      return;
    }
    const data = readData();
    const index = Number(button.dataset.index);
    if (button.dataset.action === "delete-model") data.models.splice(index, 1);
    if (button.dataset.action === "approve-leave") data.leaves[index].status = "تم الاعتماد";
    if (button.dataset.action === "deny-leave") data.leaves[index].status = "مرفوض";
    saveData(data);
    render(session, data, readAccounts());
  }));
}

const session = readSession();
if (session) {
  try {
    render(session, readData(), readAccounts());
  } catch (error) {
    document.querySelector("#app").innerHTML = `<main class="main-content"><div class="notice">تعذر تحميل بيانات المصنع: ${escapeHtml(error.message)}. امسح بيانات هذا الموقع من المتصفح ثم أعد المحاولة.</div></main>`;
    console.error("تعذر تحميل بيانات لوحة المصنع.", error);
  }
}
