const supabaseClient = window.supabaseClient;
const ADMIN_USERNAME = "ZERO0";
const ADMIN_AUTH_EMAIL = "mohamed01007033454@gmail.com";
let dashboardData;
let usersTableHasStatus = false;
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

const roleInfo = {
  admin: { title: "لوحة تحكم الإدارة", description: "نظرة شاملة على المصنع وإدارة بيانات التشغيل.", icon: "▦" },
  cutting: { title: "لوحة مشرف القص", description: "متابعة أوامر القص والكميات المطلوبة والمنفذة.", icon: "✂" },
  sewing: { title: "لوحة مشرف الخياطة", description: "متابعة خطوط الخياطة والإنتاج اليومي.", icon: "⌁" },
  worker: { title: "مهامي", description: "المهام المسندة إليك وحالة تنفيذها.", icon: "✓" },
  client: { title: "بوابة العميل", description: "موديلاتك وطلباتك والمدفوعات الخاصة بحسابك.", icon: "◇" }
};

async function readSession() {
  const { data: { session: authSession }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;
  if (!authSession) {
    window.location.replace("../login.html");
    return null;
  }
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError) throw authError;
  if (!user) {
    window.location.replace("../login.html");
    return null;
  }
  const authEmail = user.email?.toLocaleLowerCase();
  const username = user.user_metadata?.username
    || (authEmail === ADMIN_AUTH_EMAIL ? ADMIN_USERNAME : authEmail?.split("@")[0]);
  if (!username) throw new Error("تعذر تحديد اسم المستخدم لحساب المصادقة.");
  const account = await findAccountByUsername(username);
  if (!account || account.status !== "active" || !rolePages[account.role]) {
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) throw signOutError;
    window.location.replace("../login.html");
    return null;
  }
  const currentPage = window.location.pathname.split("/").pop();
  const pageRole = document.body.dataset.dashboardRole;
  if (currentPage !== rolePages[account.role] || (pageRole && pageRole !== account.role)) {
    window.location.replace(rolePages[account.role]);
    return null;
  }
  const session = {
    accountId: user.id,
    accountRowId: account.id,
    role: account.role,
    username: account.username,
    fullName: account.name,
    roleName: roleNames[account.role]
  };
  return session;
}

function emptyDashboardData() {
  return {
    models: [],
    payments: [],
    users: [],
    leaves: [],
    cutting: [],
    sewing: [],
    tasks: []
  };
}

async function readFlexibleRecords(collection) {
  const { data, error } = await supabaseClient
    .from("factory_records")
    .select("id, owner_id, payload, created_at")
    .eq("collection", collection)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((record) => ({
    ...record.payload,
    created_at: record.payload.created_at || record.created_at,
    _recordId: record.id,
    _ownerId: record.owner_id
  }));
}

async function saveFlexibleRecord(collection, payload, recordId = null, ownerId = null) {
  const cleanPayload = { ...payload };
  delete cleanPayload._recordId;
  delete cleanPayload._ownerId;
  const { error } = await supabaseClient
    .from("factory_records")
    .upsert({
      id: recordId || crypto.randomUUID(),
      collection,
      owner_id: ownerId,
      payload: cleanPayload
    }, { onConflict: "id" });
  if (error) throw error;
}

async function readDashboardData(session) {
  const data = emptyDashboardData();
  const [payments, leaves, tasks] = await Promise.all([
    readFlexibleRecords("payments"),
    readFlexibleRecords("leaves"),
    readFlexibleRecords("tasks")
  ]);
  data.payments = payments;
  data.leaves = leaves;
  data.tasks = tasks;
  let ordersQuery = supabaseClient
    .from("orders")
    .select("id, client_id, client_name, model_id, quantity, status, created_at")
    .order("created_at", { ascending: false });
  if (session.role === "client") ordersQuery = ordersQuery.eq("client_id", session.accountId);
  let { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError?.code === "42703") {
    ordersQuery = supabaseClient
      .from("orders")
      .select("id, client_name, model_id, quantity, status, created_at")
      .order("created_at", { ascending: false });
    if (session.role === "client") ordersQuery = ordersQuery.eq("client_name", session.username);
    ({ data: orders, error: ordersError } = await ordersQuery);
  }
  if (ordersError) throw ordersError;

  let stages = [];
  if (session.role !== "client" || orders.length) {
    let stagesQuery = supabaseClient
      .from("production_stages")
      .select("id, order_id, stage_name, worker_name, fabric, line_name, target_quantity, completed_quantity, status, updated_at");
    if (session.role === "client") {
      stagesQuery = stagesQuery.in("order_id", orders.map((order) => order.id));
    } else if (session.role === "cutting") {
      stagesQuery = stagesQuery.in("stage_name", ["cutting", "قص", "تقطيع"]);
    } else if (session.role === "sewing") {
      stagesQuery = stagesQuery.in("stage_name", ["sewing", "خياطة"]);
    }
    let { data, error } = await stagesQuery;
    if (error?.code === "42703") {
      stagesQuery = supabaseClient
        .from("production_stages")
        .select("id, order_id, stage_name, worker_name, status, updated_at");
      if (session.role === "client") {
        stagesQuery = stagesQuery.in("order_id", orders.map((order) => order.id));
      } else if (session.role === "cutting") {
        stagesQuery = stagesQuery.in("stage_name", ["cutting", "قص", "تقطيع"]);
      } else if (session.role === "sewing") {
        stagesQuery = stagesQuery.in("stage_name", ["sewing", "خياطة"]);
      }
      ({ data, error } = await stagesQuery);
    }
    if (error) throw error;
    stages = data;
  }

  const { data: models, error: modelsError } = await supabaseClient
    .from("models")
    .select("id, name, description, price, created_at")
    .order("created_at", { ascending: false });
  if (modelsError) throw modelsError;

  const modelNames = new Map(models.map((model) => [model.id, model.name]));
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  data.models = orders.map((order) => {
    const orderStages = stages.filter((stage) => stage.order_id === order.id);
    const cuttingStage = orderStages.find((stage) => ["cutting", "قص", "تقطيع"].includes(stage.stage_name));
    const sewingStage = orderStages.find((stage) => ["sewing", "خياطة"].includes(stage.stage_name));
    return {
      id: order.id,
      model_id: order.model_id,
      name: modelNames.get(order.model_id) || "موديل محذوف",
      client: order.client_name,
      quantity: order.quantity,
      status: order.status,
      fabric: cuttingStage?.fabric || "",
      line: sewingStage?.line_name || "",
      created_at: order.created_at
    };
  });
  data.catalogModels = models;
  const stageNames = new Map([
    ["cutting", "cutting"], ["قص", "cutting"], ["تقطيع", "cutting"],
    ["sewing", "sewing"], ["خياطة", "sewing"]
  ]);
  data.cutting = stages
    .filter((stage) => stageNames.get(stage.stage_name) === "cutting")
    .map((stage) => ({
      id: stage.id,
      order: stage.order_id,
      model: modelNames.get(ordersById.get(stage.order_id)?.model_id) || "موديل محذوف",
      fabric: stage.fabric || "—",
      total: stage.target_quantity || ordersById.get(stage.order_id)?.quantity || 0,
      cut: stage.completed_quantity || 0,
      status: stage.status
    }));
  data.sewing = stages
    .filter((stage) => stageNames.get(stage.stage_name) === "sewing")
    .map((stage) => ({
      id: stage.id,
      line: stage.line_name || "—",
      model: modelNames.get(ordersById.get(stage.order_id)?.model_id) || "موديل محذوف",
      supervisor: stage.worker_name || "—",
      target: stage.target_quantity || ordersById.get(stage.order_id)?.quantity || 0,
      produced: stage.completed_quantity || 0,
      status: stage.status
    }));

  data.users = session.role === "admin" ? await readUsers() : [];
  return data;
}

async function readUsers() {
  let { data, error } = await supabaseClient
    .from("users")
    .select("id, name, username, phone, role, status, created_at")
    .order("created_at", { ascending: false });
  usersTableHasStatus = !error;
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role, status, created_at")
      .order("created_at", { ascending: false }));
    usersTableHasStatus = !error;
  }
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role, created_at")
      .order("created_at", { ascending: false }));
    usersTableHasStatus = false;
  }
  if (error) throw error;
  return data
    .filter((account) => usersTableHasStatus
      ? ["active", "suspended"].includes(account.status)
      : account.role !== "pending")
    .map((account) => ({
      id: account.id,
      name: account.name,
      username: account.username,
      phone: account.phone || "",
      role: roleNames[account.role] || account.role,
      roleKey: account.role,
      status: account.status || "active"
    }));
}

async function readAccounts(session) {
  if (session.role !== "admin") return [];
  let { data, error } = await supabaseClient
    .from("users")
    .select("id, name, username, phone, role, status, created_at")
    .or("status.eq.pending,role.eq.pending")
    .order("created_at", { ascending: false });
  usersTableHasStatus = !error;
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role, status, created_at")
      .or("status.eq.pending,role.eq.pending")
      .order("created_at", { ascending: false }));
    usersTableHasStatus = !error;
  }
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role, created_at")
      .eq("role", "pending")
      .order("created_at", { ascending: false }));
    usersTableHasStatus = false;
  }
  if (error) throw error;
  return data.map((account) => ({
    ...account,
    status: account.status === "pending" || account.role === "pending" ? "pending" : account.status
  }));
}

async function findAccountByUsername(username) {
  let { data, error } = await supabaseClient
    .from("users")
    .select("id, name, username, role, status")
    .ilike("username", username)
    .maybeSingle();
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role, created_at")
      .ilike("username", username)
      .maybeSingle());
    if (!error && data) data.status = data.role === "pending" ? "pending" : "active";
  }
  if (error) throw error;
  return data;
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
  if (value === "قيد المراجعة" || value === "قيد التنفيذ" || value === "معلق" || value === "جار العمل") return "warning";
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

function catalogModelRows(models) {
  return models.map((model) => `<tr><td>${escapeHtml(model.name)}</td><td>${escapeHtml(model.description || "—")}</td><td>${money(Number(model.price || 0))}</td></tr>`);
}

function paymentRows(payments) {
  return payments.map((item, index) => `<tr><td>${escapeHtml(item.client)}</td><td>${money(item.amount)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.method)}</td><td><button class="row-action" type="button" data-edit-kind="payments" data-index="${index}">تعديل</button></td></tr>`);
}

function userRows(users) {
  return users.map((item) => {
    const suspended = item.status === "suspended";
    const actions = item.roleKey === "admin"
      ? "حساب إدارة محمي"
      : `<button class="row-action" type="button" data-action="toggle-user-status" data-account-id="${escapeHtml(item.id)}" data-next-status="${suspended ? "active" : "suspended"}">${suspended ? "إعادة تفعيل" : "توقيف / تعطيل"}</button> <button class="row-action" type="button" data-action="delete-user" data-account-id="${escapeHtml(item.id)}">حذف الحساب</button>`;
    return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.phone || "—")}</td><td>${escapeHtml(item.role)}</td><td>${suspended ? "متوقف" : "نشط"}</td><td>${actions}</td></tr>`;
  });
}

function pendingAccountRows(accounts) {
  const pending = accounts.filter((account) => account.status === "pending");
  return pending.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.username)}</td><td>${escapeHtml(account.phone || "—")}</td><td>${new Intl.DateTimeFormat("ar-EG").format(new Date(account.created_at))}</td><td><select aria-label="الدور الجديد" data-pending-role="${escapeHtml(account.id)}"><option value="">اختر الدور</option><option value="client">عميل</option><option value="worker">عامل</option><option value="cutting">مشرف قص</option><option value="sewing">مشرف خياطة</option></select></td><td><button class="row-action" type="button" data-action="activate-account" data-account-id="${escapeHtml(account.id)}">تفعيل الحساب</button></td></tr>`);
}

function adminView(data, accounts) {
  const totalUnits = data.models.reduce((sum, item) => sum + Number(item.quantity), 0);
  const paid = data.payments.reduce((sum, item) => sum + Number(item.amount), 0);
  return `
    <div class="stats-grid">${stat("الموديلات الحالية", data.models.length, "ضمن أوامر التشغيل")}${stat("إجمالي القطع", new Intl.NumberFormat("ar-EG").format(totalUnits), "قطعة")}${stat("المدفوعات المسجلة", money(paid), "إجمالي الدفعات")}${stat("طلبات الانصراف", data.leaves.filter((item) => item.status === "قيد المراجعة").length, "بانتظار المراجعة")}</div>
    ${panel("إضافة موديل / أمر تشغيل", `<div class="panel-body"><form id="model-form" class="form-grid"><input type="hidden" name="editIndex" value=""><div class="field"><label for="model-name">اسم الموديل</label><input id="model-name" name="name" required></div><div class="field"><label for="model-client">اسم مستخدم العميل</label><input id="model-client" name="client" autocomplete="off" required><small>استخدم اسم حساب العميل لربط الطلب بلوحته.</small></div><div class="field"><label for="model-quantity">الكمية</label><input id="model-quantity" name="quantity" type="number" min="1" required></div><div class="field"><label for="model-status">الحالة</label><select id="model-status" name="status"><option>جديد</option><option>قيد التنفيذ</option><option>تم الانتهاء</option></select></div><button class="button button-primary" type="submit">إضافة الموديل</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></form></div>`)}
    ${panel("الموديلات وأوامر التشغيل", table(["الموديل","العميل","الكمية","الحالة","إجراء"], modelRows(data.models, true)))}
    <div class="stats-grid">${panel("تسجيل دفعة مالية", `<div class="panel-body"><form id="payment-form" class="form-grid"><input type="hidden" name="editIndex" value=""><div class="field"><label for="payment-client">العميل</label><input id="payment-client" name="client" required></div><div class="field"><label for="payment-amount">المبلغ (ج.م)</label><input id="payment-amount" name="amount" type="number" min="1" required></div><div class="field"><label for="payment-method">طريقة الدفع</label><select id="payment-method" name="method"><option>تحويل بنكي</option><option>نقدي</option><option>محفظة إلكترونية</option></select></div><button class="button button-primary" type="submit">تسجيل الدفعة</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></form></div>`, "تُضاف الدفعات إلى سجل العميل")}</div>
    ${panel("كتالوج الموديلات", table(["الموديل","الوصف","السعر"], catalogModelRows(data.catalogModels)))}
    ${panel("سجل الدفعات المالية", table(["العميل","المبلغ","التاريخ","طريقة الدفع","إجراء"], paymentRows(data.payments)))}
    ${panel("طلبات وأذونات الانصراف", table(["الموظف","التاريخ","السبب","الحالة","إجراء"], data.leaves.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.reason)}</td><td>${statusTag(item.status)}</td><td>${item.status === "قيد المراجعة" ? `<button class="row-action" data-action="approve-leave" data-index="${index}" type="button">اعتماد</button> <button class="row-action" data-action="deny-leave" data-index="${index}" type="button">رفض</button>` : "—"}</td></tr>`)))}
    ${panel("طلبات الحسابات الجديدة", table(["الاسم الكامل","اسم المستخدم","رقم التليفون","تاريخ الطلب","تحديد الدور","إجراء"], pendingAccountRows(accounts)))}
    ${panel("المستخدمون", table(["الاسم","اسم المستخدم","رقم التليفون","الدور الوظيفي","الحالة","إجراء"], userRows(data.users)))}`;
}

function cuttingView(data) {
  const total = data.cutting.reduce((sum, item) => sum + Number(item.total), 0);
  return `<div class="stats-grid">${stat("أوامر القص", data.cutting.length, "أوامر نشطة")}${stat("إجمالي المطلوب", new Intl.NumberFormat("ar-EG").format(total), "قطعة")}${stat("حالة المرحلة", data.cutting.filter((item) => item.status === "مكتمل").length, "مراحل مكتملة")}${stat("متبقي", data.cutting.filter((item) => item.status !== "مكتمل").length, "مراحل قيد العمل")}</div>${panel("أوامر مرحلة القص", table(["رقم الأمر","الموديل","الكمية المطلوبة","الحالة"], data.cutting.map((item) => `<tr><td>${escapeHtml(item.order.slice(0, 8))}</td><td>${escapeHtml(item.model)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.total)}</td><td>${statusTag(item.status)}</td></tr>`)))}`;
}

function sewingView(data) {
  return `<div class="stats-grid">${stat("مراحل الخياطة", data.sewing.length, "مراحل نشطة")}${stat("مراحل مكتملة", data.sewing.filter((item) => item.status === "مكتمل").length, "حسب حالة المرحلة")}${stat("مراحل قيد العمل", data.sewing.filter((item) => item.status !== "مكتمل").length, "حسب حالة المرحلة")}</div>${panel("متابعة مراحل الخياطة", table(["رقم الأمر","الموديل","العامل","الحالة"], data.sewing.map((item) => `<tr><td>${escapeHtml(item.order.slice(0, 8))}</td><td>${escapeHtml(item.model)}</td><td>${escapeHtml(item.supervisor)}</td><td>${statusTag(item.status)}</td></tr>`)))}`;
}

function workerView(data, session) {
  const tasks = data.tasks.filter((item) => item.worker === session.username);
  return `<div class="stats-grid">${stat("المهام المسندة إليّ", tasks.length, "حسب حساب العامل")}${stat("قيد التنفيذ", tasks.filter((item) => item.status === "قيد التنفيذ").length)}${stat("مهام جديدة", tasks.filter((item) => item.status === "جديدة").length)}</div>${panel("مهامي", table(["المهمة","الموديل","الكمية","موعد التسليم","الحالة"], tasks.map((item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.model)}</td><td>${new Intl.NumberFormat("ar-EG").format(item.quantity)}</td><td>${escapeHtml(item.due)}</td><td>${statusTag(item.status)}</td></tr>`)))}`;
}

function clientView(data, session) {
  const models = data.models;
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

async function refreshDashboard(session) {
  const data = await readDashboardData(session);
  dashboardData = data;
  const accounts = await readAccounts(session);
  render(session, data, accounts);
}

function bindActions(session) {
  document.querySelector("#logout").addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      window.factoryUI.toast(`تعذر تسجيل الخروج: ${error.message}`, "error");
      return;
    }
    window.location.replace("../login.html");
  });

  if (session.role !== "admin") return;
  const editConfigs = {
    models: { form: "model-form", collection: "models", fields: ["name", "client", "quantity", "fabric", "line", "status"] },
    payments: { form: "payment-form", collection: "payments", fields: ["client", "amount", "method"] }
  };
  document.querySelectorAll("[data-edit-kind]").forEach((button) => button.addEventListener("click", () => {
    const config = editConfigs[button.dataset.editKind];
    const item = dashboardData[config.collection][Number(button.dataset.index)];
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
  document.querySelector("#model-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const editIndex = String(formData.get("editIndex"));
      const existingOrder = editIndex ? dashboardData.models[Number(editIndex)] : null;
      const { error } = await supabaseClient.rpc("save_factory_order", {
        requested_order_id: existingOrder?.id || null,
        requested_model_name: String(formData.get("name")).trim(),
        requested_client_name: String(formData.get("client")).trim(),
        requested_quantity: Number(formData.get("quantity")),
        requested_status: String(formData.get("status")),
        requested_fabric: String(formData.get("fabric")).trim(),
        requested_line_name: String(formData.get("line")).trim()
      });
      if (error) {
        if (error.code === "PGRST202") {
          throw new Error("دالة حفظ أوامر التشغيل غير منشأة في Supabase. شغّل supabase/schema.sql من SQL Editor.");
        }
        throw error;
      }
      form.reset();
      form.elements.editIndex.value = "";
      form.querySelector('[data-cancel-edit]').hidden = true;
      submitButton.textContent = "إضافة الموديل";
      await refreshDashboard(session);
      window.factoryUI.toast(editIndex ? "تم تحديث أمر التشغيل بنجاح." : "تم حفظ أمر التشغيل بنجاح.");
    } catch (error) {
      window.factoryUI.toast(`تعذر حفظ أمر التشغيل أونلاين: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
  document.querySelector("#payment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const payment = {
      client: String(formData.get("client")).trim(),
      amount: Number(formData.get("amount")),
      date: new Date().toISOString().slice(0, 10),
      method: String(formData.get("method"))
    };
    const editIndex = String(formData.get("editIndex"));
    const existingPayment = editIndex ? dashboardData.payments[Number(editIndex)] : null;
    if (existingPayment) payment.date = existingPayment.date;
    submitButton.disabled = true;
    try {
      const { data: client, error } = await supabaseClient
        .from("users")
        .select("id")
        .ilike("username", payment.client)
        .maybeSingle();
      if (error) throw error;
      if (!client) throw new Error("لا يوجد حساب مستخدم بهذا الاسم لربط الدفعة به.");
      await saveFlexibleRecord("payments", payment, existingPayment?._recordId, client.id);
      form.reset();
      form.elements.editIndex.value = "";
      form.querySelector('[data-cancel-edit]').hidden = true;
      submitButton.textContent = "تسجيل الدفعة";
      await refreshDashboard(session);
      window.factoryUI.toast(existingPayment ? "تم تحديث الدفعة بنجاح." : "تم تسجيل الدفعة بنجاح.");
    } catch (error) {
      window.factoryUI.toast(`تعذر حفظ الدفعة أونلاين: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.action === "activate-account") {
      const roleSelect = [...document.querySelectorAll("[data-pending-role]")].find((item) => item.dataset.pendingRole === button.dataset.accountId);
      if (!roleSelect || !["client", "worker", "cutting", "sewing"].includes(roleSelect.value)) {
        window.factoryUI.toast("اختر دورًا صالحًا قبل تفعيل الحساب.", "error");
        return;
      }
      const accountName = button.closest("tr")?.cells[0]?.textContent || "";
      if (!await window.factoryUI.confirmAction({
        title: "تفعيل الحساب",
        message: `هل تريد تفعيل طلب حساب ${accountName} بالدور المحدد؟`,
        confirmLabel: "تفعيل"
      })) return;
      button.disabled = true;
      let accountUpdate = supabaseClient
        .from("users")
        .update(usersTableHasStatus
          ? { role: roleSelect.value, status: "active", updated_at: new Date().toISOString() }
          : { role: roleSelect.value })
        .eq("id", button.dataset.accountId);
      accountUpdate = usersTableHasStatus
        ? accountUpdate.or("status.eq.pending,role.eq.pending")
        : accountUpdate.eq("role", "pending");
      const { data, error } = await accountUpdate
        .select("id")
        .maybeSingle();
      if (error) {
        button.disabled = false;
        window.factoryUI.toast(`تعذر تفعيل الحساب: ${error.message}`, "error");
        return;
      }
      if (!data) {
        button.disabled = false;
        window.factoryUI.toast("لم يعد طلب الحساب معلقًا. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      window.factoryUI.toast("تم تفعيل الحساب بنجاح.");
      refreshDashboard(session).catch((error) => window.factoryUI.toast(`تعذر تحديث اللوحة: ${error.message}`, "error"));
      return;
    }
    if (button.dataset.action === "toggle-user-status") {
      const nextStatus = button.dataset.nextStatus;
      if (!usersTableHasStatus || !["active", "suspended"].includes(nextStatus)) {
        window.factoryUI.toast("يتطلب تغيير الحالة تحديث users لتضمين حالة suspended. شغّل supabase/schema.sql.", "error");
        return;
      }
      const account = dashboardData.users.find((user) => user.id === button.dataset.accountId);
      if (!account) {
        window.factoryUI.toast("تعذر العثور على الحساب. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      const suspending = nextStatus === "suspended";
      if (!await window.factoryUI.confirmAction({
        title: suspending ? "إيقاف الحساب" : "إعادة تفعيل الحساب",
        message: suspending
          ? `هل تريد إيقاف حساب ${account.name}؟ لن يتمكن من استخدام النظام.`
          : `هل تريد إعادة تفعيل حساب ${account.name}؟`,
        confirmLabel: suspending ? "توقيف / تعطيل" : "إعادة تفعيل",
        danger: suspending
      })) return;
      button.disabled = true;
      const { data, error } = await supabaseClient
        .from("users")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", button.dataset.accountId)
        .in("status", ["active", "suspended"])
        .select("id")
        .maybeSingle();
      if (error) {
        button.disabled = false;
        window.factoryUI.toast(`تعذر تغيير حالة الحساب: ${error.message}`, "error");
        return;
      }
      if (!data) {
        button.disabled = false;
        window.factoryUI.toast("لم يتغير الحساب. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      window.factoryUI.toast(suspending ? "تم إيقاف الحساب بنجاح." : "تمت إعادة تفعيل الحساب بنجاح.");
      refreshDashboard(session).catch((refreshError) => window.factoryUI.toast(`تغيرت حالة الحساب، لكن تعذر تحديث اللوحة: ${refreshError.message}`, "error"));
      return;
    }
    if (button.dataset.action === "delete-user") {
      const account = dashboardData.users.find((user) => user.id === button.dataset.accountId);
      if (!account) {
        window.factoryUI.toast("تعذر العثور على الحساب. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      if (!await window.factoryUI.confirmAction({
        title: "حذف الحساب نهائيًا",
        message: `هل تريد حذف حساب ${account.name} نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`,
        confirmLabel: "حذف الحساب",
        danger: true
      })) return;
      button.disabled = true;
      const { data, error } = await supabaseClient
        .from("users")
        .delete()
        .eq("id", account.id)
        .select("id")
        .maybeSingle();
      if (error) {
        button.disabled = false;
        window.factoryUI.toast(`تعذر حذف الحساب: ${error.message}`, "error");
        return;
      }
      if (!data) {
        button.disabled = false;
        window.factoryUI.toast("لم يُحذف الحساب. قد لا تملك صلاحية الحذف أو ربما حُذف بالفعل.", "error");
        return;
      }
      window.factoryUI.toast("تم حذف الحساب بنجاح.");
      refreshDashboard(session).catch((refreshError) => window.factoryUI.toast(`حُذف الحساب، لكن تعذر تحديث اللوحة: ${refreshError.message}`, "error"));
      return;
    }
    const index = Number(button.dataset.index);
    if (button.dataset.action === "delete-model") {
      const order = dashboardData.models[index];
      if (!order) {
        window.factoryUI.toast("تعذر العثور على أمر التشغيل. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      if (!await window.factoryUI.confirmAction({
        title: "حذف أمر التشغيل",
        message: `هل تريد حذف أمر التشغيل للموديل ${order.name}؟`,
        confirmLabel: "حذف الأمر",
        danger: true
      })) {
        return;
      }
      const { error } = await supabaseClient.from("orders").delete().eq("id", order.id);
      if (error) {
        window.factoryUI.toast(`تعذر حذف أمر التشغيل: ${error.message}`, "error");
        return;
      }
      if (order.model_id) {
        const { count, error: countError } = await supabaseClient
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("model_id", order.model_id);
        if (countError) {
          window.factoryUI.toast(`حُذف أمر التشغيل، لكن تعذر التحقق من استخدام الموديل: ${countError.message}`, "error");
          return;
        }
        if (count === 0) {
          const { error: modelError } = await supabaseClient.from("models").delete().eq("id", order.model_id);
          if (modelError) {
            window.factoryUI.toast(`حُذف أمر التشغيل، لكن تعذر حذف الموديل غير المستخدم: ${modelError.message}`, "error");
            return;
          }
        }
      }
      window.factoryUI.toast("تم حذف أمر التشغيل بنجاح.");
      refreshDashboard(session).catch((error) => window.factoryUI.toast(`حُذف أمر التشغيل، لكن تعذر تحديث اللوحة: ${error.message}`, "error"));
      return;
    }
    if (button.dataset.action === "approve-leave" || button.dataset.action === "deny-leave") {
      const leave = dashboardData.leaves[index];
      if (!leave?._recordId) {
        window.factoryUI.toast("تعذر العثور على طلب الانصراف. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      const approved = button.dataset.action === "approve-leave";
      if (!await window.factoryUI.confirmAction({
        title: approved ? "اعتماد طلب الانصراف" : "رفض طلب الانصراف",
        message: `هل تريد ${approved ? "اعتماد" : "رفض"} طلب انصراف ${leave.name}؟`,
        confirmLabel: approved ? "اعتماد" : "رفض",
        danger: !approved
      })) {
        return;
      }
      leave.status = approved ? "تم الاعتماد" : "مرفوض";
      try {
        await saveFlexibleRecord("leaves", leave, leave._recordId, leave._ownerId);
        await refreshDashboard(session);
        window.factoryUI.toast(approved ? "تم اعتماد طلب الانصراف." : "تم رفض طلب الانصراف.");
      } catch (error) {
        window.factoryUI.toast(`تعذر تحديث طلب الانصراف أونلاين: ${error.message}`, "error");
      }
    }
  }));
}

async function initializeDashboard() {
  const session = await readSession();
  if (session) await refreshDashboard(session);
}

initializeDashboard().catch((error) => {
  document.querySelector("#app").innerHTML = `<main class="main-content"><div class="notice">تعذر تحميل بيانات المصنع: ${escapeHtml(error.message)}.</div></main>`;
  window.factoryUI.toast(`تعذر تحميل بيانات المصنع: ${error.message}`, "error");
  console.error("تعذر تحميل بيانات لوحة المصنع.", error);
});
