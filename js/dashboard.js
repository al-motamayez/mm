const supabaseClient = window.supabaseClient;
const ADMIN_USERNAME = "ZERO0";
const ADMIN_AUTH_EMAIL = "mohamed01007033454@gmail.com";
let dashboardData;
let usersTableHasStatus = false;
let selectedClientId = "";
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
  const username = authEmail === ADMIN_AUTH_EMAIL
    ? ADMIN_USERNAME
    : user.user_metadata?.username || authEmail?.split("@")[0];
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
    clients: [],
    payments: [],
    settlements: [],
    deliveries: [],
    users: [],
    leaves: [],
    cutting: [],
    sewing: [],
    tasks: [],
    clientNotes: []
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
    _createdAt: record.created_at,
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
  const deliveriesPromise = session.role === "admin"
    ? supabaseClient.from("factory_deliveries")
      .select("id, order_id, customer_id, quantity, price_per_piece, amount, delivered_at, legacy_import")
      .order("delivered_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const [payments, leaves, tasks, settlements, deliveriesResult] = await Promise.all([
    readFlexibleRecords("payments"),
    readFlexibleRecords("leaves"),
    readFlexibleRecords("tasks"),
    readFlexibleRecords("settlements"),
    deliveriesPromise
  ]);
  if (["42P01", "PGRST205"].includes(deliveriesResult.error?.code)) {
    throw new Error("سجل التسليمات غير موجود في قاعدة البيانات. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (deliveriesResult.error) throw deliveriesResult.error;
  data.payments = payments;
  data.settlements = settlements;
  data.deliveries = deliveriesResult.data || [];
  data.leaves = leaves;
  data.tasks = tasks;
  data.clientNotes = session.role === "admin" ? await readFlexibleRecords("client_notes") : [];
  let orders;
  let ordersError;
  if (session.role === "admin") {
    ({ data: orders, error: ordersError } = await supabaseClient.rpc("read_factory_orders_admin"));
    if (ordersError?.code === "PGRST202") {
      throw new Error("دالة read_factory_orders_admin غير موجودة في قاعدة البيانات الحالية. شغّل ملف supabase/schema.sql كاملًا في SQL Editor ثم أعد تحميل الصفحة. لا تستبدلها بـ select('*')؛ فالدالة مطلوبة لحماية التفاصيل المالية من حسابات العملاء.");
    }
  } else if (session.role === "client") {
    ({ data: orders, error: ordersError } = await supabaseClient.rpc("read_factory_orders_client"));
    if (ordersError?.code === "PGRST202") {
      throw new Error("دالة قراءة طلبيات العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
    }
  } else {
    let ordersQuery = supabaseClient
      .from("orders")
      .select("id, model_name, model_number, total_pieces, archived_at, status, created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    ({ data: orders, error: ordersError } = await ordersQuery);
    if (ordersError?.code === "42703") {
      ordersQuery = supabaseClient
        .from("orders")
        .select("id, model_name, total_pieces, status, created_at")
        .order("created_at", { ascending: false });
      ({ data: orders, error: ordersError } = await ordersQuery);
    }
  }
  if (ordersError) throw ordersError;

  if (session.role === "admin") {
    const { data: clients, error: clientsError } = await supabaseClient
      .from("factory_clients")
      .select("id, user_id, name, phone, notes, account_period_started_at, created_at")
      .order("created_at", { ascending: false });
    if (clientsError) throw clientsError;
    data.clients = clients.map((client) => ({
      ...client,
      name: client.name || "",
      phone: client.phone || "",
      notes: client.notes || ""
    }));
  }
  const clientsById = new Map(data.clients.map((client) => [client.id, client]));

  let stages = [];
  if (session.role === "admin" || orders.length) {
    let stagesQuery = supabaseClient
      .from("production_stages")
      .select("id, order_id, stage_name, worker_name, fabric, line_name, target_quantity, completed_quantity, status, updated_at");
    if (session.role !== "admin") {
      stagesQuery = stagesQuery.in("order_id", orders.map((order) => order.id));
    }
    if (session.role === "cutting") {
      stagesQuery = stagesQuery.in("stage_name", ["cutting", "قص", "تقطيع"]);
    } else if (session.role === "sewing") {
      stagesQuery = stagesQuery.in("stage_name", ["sewing", "خياطة"]);
    }
    let { data, error } = await stagesQuery;
    if (error?.code === "42703") {
      stagesQuery = supabaseClient
        .from("production_stages")
        .select("id, order_id, stage_name, worker_name, status, updated_at");
      if (session.role !== "admin") {
        stagesQuery = stagesQuery.in("order_id", orders.map((order) => order.id));
      }
      if (session.role === "cutting") {
        stagesQuery = stagesQuery.in("stage_name", ["cutting", "قص", "تقطيع"]);
      } else if (session.role === "sewing") {
        stagesQuery = stagesQuery.in("stage_name", ["sewing", "خياطة"]);
      }
      ({ data, error } = await stagesQuery);
    }
    if (error) throw error;
    stages = data;
  }

  const ordersById = new Map(orders.map((order) => [order.id, order]));
  data.models = orders.map((order) => {
    const orderStages = stages.filter((stage) => stage.order_id === order.id);
    const cuttingStage = orderStages.find((stage) => ["cutting", "قص", "تقطيع"].includes(stage.stage_name));
    const sewingStage = orderStages.find((stage) => ["sewing", "خياطة"].includes(stage.stage_name));
    const completedPieces = orderStages
      .filter((stage) => ["cutting", "sewing", "finishing"].includes(stage.stage_name))
      .reduce((maximum, stage) => Math.max(maximum, Number(stage.completed_quantity || 0)), 0);
    return {
      id: order.id,
      clientId: order.client_id,
      customerId: order.customer_id,
      name: order.model_name || order.model_number || "موديل بدون اسم",
      modelNumber: order.model_number || "",
      client: clientsById.get(order.customer_id)?.name || "",
      quantity: order.total_pieces,
      completedPieces,
      colors: order.colors || "",
      sizes: order.sizes || "",
      deliveredPieces: Number(order.delivered_pieces || 0),
      archivedAt: order.archived_at || null,
      remainingPieces: Number(order.total_pieces) - Number(order.delivered_pieces || 0),
      pricePerPiece: Number(order.price_per_piece || 0),
      totalAmount: Number(order.total_amount || 0),
      paidAmount: Number(order.paid_amount || 0),
      remainingAmount: Number(order.remaining_amount || 0),
      status: order.status,
      fabric: cuttingStage?.fabric || "",
      line: sewingStage?.line_name || "",
      created_at: order.created_at
    };
  });
  const stageNames = new Map([
    ["cutting", "cutting"], ["قص", "cutting"], ["تقطيع", "cutting"],
    ["sewing", "sewing"], ["خياطة", "sewing"]
  ]);
  data.cutting = stages
    .filter((stage) => stageNames.get(stage.stage_name) === "cutting")
    .map((stage) => ({
      id: stage.id,
      order: stage.order_id,
      model: ordersById.get(stage.order_id)?.model_name || ordersById.get(stage.order_id)?.model_number || "موديل غير محدد",
      fabric: stage.fabric || "—",
      total: stage.target_quantity || ordersById.get(stage.order_id)?.total_pieces || 0,
      cut: stage.completed_quantity || 0,
      status: stage.status
    }));
  data.sewing = stages
    .filter((stage) => stageNames.get(stage.stage_name) === "sewing")
    .map((stage) => ({
      id: stage.id,
      line: stage.line_name || "—",
      model: ordersById.get(stage.order_id)?.model_name || ordersById.get(stage.order_id)?.model_number || "موديل غير محدد",
      supervisor: stage.worker_name || "—",
      target: stage.target_quantity || ordersById.get(stage.order_id)?.total_pieces || 0,
      produced: stage.completed_quantity || 0,
      status: stage.status
    }));

  data.users = session.role === "admin" ? await readUsers() : [];
  const clientsByUserId = new Map(data.clients.filter((client) => client.user_id).map((client) => [client.user_id, client]));
  data.payments = data.payments.map((payment) => {
    const clientId = payment.customerId
      || clientsById.get(payment.clientId || payment._ownerId)?.id
      || clientsByUserId.get(payment.clientId || payment._ownerId)?.id
      || payment.clientId
      || payment._ownerId;
    const client = clientsById.get(clientId)
      || clientsByUserId.get(payment.clientId || payment._ownerId);
    return {
      ...payment,
      customerId: clientId,
      clientId: payment.clientId || payment._ownerId,
      clientName: client?.name || payment.clientName || payment.client || "عميل غير معروف"
    };
  });
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
  if (["قيد المراجعة", "قيد التنفيذ", "قيد الإنتاج", "قيد الانتظار", "معلق", "تحت الإنشاء", "في الخط", "تحت التصنيع", "جار العمل"].includes(value)) return "warning";
  if (value === "جديدة" || value === "جاهز للتسليم") return "info";
  if (value === "جاهز للتسليم" || value === "مكتمل") return "";
  return "muted";
}

function statusTag(value) {
  return `<span class="status ${statusClass(value)}">${escapeHtml(value)}</span>`;
}

function table(headers, rows) {
  if (!rows.length) return '<div class="empty-state">لا توجد بيانات لعرضها حاليًا.</div>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function panel(title, content, subtitle = "", id = "") {
  return `<section class="panel"${id ? ` id="${id}"` : ""}><div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div>${content}</section>`;
}

function stat(label, value, note = "") {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}</article>`;
}

function orderCards(models, withActions = false) {
  if (!models.length) return '<div class="empty-state">لا توجد طلبيات لعرضها حاليًا.</div>';
  return `<div class="order-cards">${models.map((item) => {
    const index = dashboardData.models.findIndex((order) => order.id === item.id);
    return `<article class="order-card">
    <header class="order-card-heading"><div><p class="order-card-label">الموديل ${item.modelNumber ? `· رقم ${escapeHtml(item.modelNumber)}` : ""}</p><h3>${escapeHtml(item.name || item.modelNumber || "موديل بدون اسم")}</h3></div>${statusTag(item.status)}</header>
    <p class="order-card-client">العميل: <strong>${escapeHtml(item.client)}</strong></p>
    <dl class="order-card-details">
      <div><dt>الألوان</dt><dd>${escapeHtml(item.colors || "—")}</dd></div><div><dt>المقاسات</dt><dd>${escapeHtml(item.sizes || "—")}</dd></div>
      <div><dt>العدد الفعلي بعد القص</dt><dd>${item.quantity ? `${new Intl.NumberFormat("ar-EG").format(item.quantity)} قطعة` : "بانتظار الحصر بعد القص"}</dd></div><div><dt>الكمية المنجزة</dt><dd>${new Intl.NumberFormat("ar-EG").format(item.completedPieces)} قطعة</dd></div>
      <div><dt>الكمية المسلّمة فعليًا</dt><dd>${new Intl.NumberFormat("ar-EG").format(item.deliveredPieces)} قطعة</dd></div><div><dt>المتبقي (السالب يعني زيادة تسليم)</dt><dd>${item.quantity ? `${new Intl.NumberFormat("ar-EG").format(item.remainingPieces)} قطعة` : "بانتظار الحصر بعد القص"}</dd></div>
      <div><dt>سعر القطعة</dt><dd>${money(item.pricePerPiece)}</dd></div><div><dt>قيمة الكمية المسلّمة</dt><dd>${money(item.totalAmount)}</dd></div>
      <div><dt>المدفوع</dt><dd>${money(item.paidAmount)}</dd></div><div><dt>المتبقي من قيمة المسلّم</dt><dd>${money(item.remainingAmount)}</dd></div>
    </dl>
    ${withActions ? `<footer class="order-card-actions"><button class="row-action" type="button" data-edit-kind="models" data-index="${index}">تعديل الطلبية</button><button class="row-action" type="button" data-action="record-delivery" data-index="${index}">تسجيل تسليم</button>${item.status === "مكتمل" ? '<span class="status">مغلق / مؤرشف</span>' : `<button class="row-action order-close-action" type="button" data-action="close-order" data-index="${index}">اكتمل / إغلاق الطلب</button>`}</footer>` : ""}
  </article>`;
  }).join("")}</div>`;
}

function orderProgress(status) {
  const stages = ["قيد الانتظار", "معلق", "تحت الإنشاء", "في الخط", "تحت التصنيع", "جاهز للتسليم", "مكتمل"];
  const activeStatus = status === "قيد الإنتاج" ? "تحت التصنيع" : status;
  const activeIndex = Math.max(0, stages.indexOf(activeStatus));
  const steps = stages.map((stage, index) => `<span class="order-progress-step${index <= activeIndex ? " complete" : ""}${index === activeIndex ? " current" : ""}">${stage}</span>`).join("");
  return `<div class="order-progress" aria-label="تقدم الطلب: ${escapeHtml(activeStatus)}">${steps}</div>`;
}

function clientOrderRows(orders) {
  return orders.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.colors || "—")}</td><td>${escapeHtml(item.sizes || "—")}</td><td>${item.quantity ? new Intl.NumberFormat("ar-EG").format(item.quantity) : "بانتظار الحصر"}</td><td>${new Intl.NumberFormat("ar-EG").format(item.deliveredPieces)}</td><td>${item.quantity ? new Intl.NumberFormat("ar-EG").format(item.remainingPieces) : "بانتظار الحصر"}</td><td>${statusTag(item.status)}</td><td>${orderProgress(item.status)}</td></tr>`);
}

function clientOrderCards(orders) {
  if (!orders.length) return '<div class="empty-state">لا توجد طلبيات لعرضها حاليًا.</div>';
  return `<div class="order-cards">${orders.map((item) => `<article class="order-card client-order-card">
    <header class="order-card-heading"><div><p class="order-card-label">الموديل ${item.modelNumber ? `· رقم ${escapeHtml(item.modelNumber)}` : ""}</p><h3>${escapeHtml(item.name || item.modelNumber || "موديل بدون اسم")}</h3></div>${statusTag(item.status)}</header>
    <dl class="order-card-details">
      <div><dt>الألوان</dt><dd>${escapeHtml(item.colors || "—")}</dd></div><div><dt>المقاسات</dt><dd>${escapeHtml(item.sizes || "—")}</dd></div>
      <div><dt>العدد الفعلي بعد القص</dt><dd>${item.quantity ? new Intl.NumberFormat("ar-EG").format(item.quantity) : "بانتظار الحصر"}</dd></div><div><dt>الكمية المنجزة</dt><dd>${new Intl.NumberFormat("ar-EG").format(item.completedPieces)}</dd></div>
      <div><dt>الكمية المسلّمة</dt><dd>${new Intl.NumberFormat("ar-EG").format(item.deliveredPieces)}</dd></div><div><dt>المتبقي</dt><dd>${item.quantity ? new Intl.NumberFormat("ar-EG").format(item.remainingPieces) : "بانتظار الحصر بعد القص"}</dd></div>
      <div><dt>سعر القطعة</dt><dd>${money(item.pricePerPiece)}</dd></div><div><dt>إجمالي قيمة المسلّم</dt><dd>${money(item.totalAmount)}</dd></div>
      <div><dt>المدفوع على الطلب</dt><dd>${money(item.paidAmount)}</dd></div><div><dt>المتبقي</dt><dd>${money(item.remainingAmount)}</dd></div>
    </dl>
    ${orderProgress(item.status)}
  </article>`).join("")}</div>`;
}

function paymentRows(payments, withActions = false, clients = []) {
  return payments.map((item) => {
    const client = clients.find((entry) => entry.id === item.customerId);
    const settled = client?.account_period_started_at
      && new Date(item._createdAt || item.created_at).getTime() < new Date(client.account_period_started_at).getTime();
    const action = withActions
      ? `<td>${settled ? '<span class="status">فترة مصفّاة</span>' : `<button class="row-action" type="button" data-edit-kind="payments" data-record-id="${escapeHtml(item._recordId)}">تعديل</button>`}</td>`
      : "";
    return `<tr data-payment-client="${escapeHtml(item.customerId || "")}"><td>${escapeHtml(item.clientName || item.client || "—")}</td><td>${money(item.amount)}</td><td>${escapeHtml(item.date || "—")}</td><td>${escapeHtml(item.method || "—")}</td><td>${escapeHtml(item.reference || item.orderReference || "—")}</td><td>${escapeHtml(item.notes || "—")}</td>${action}</tr>`;
  });
}

function userRows(users, withActions = false) {
  return users.map((item) => {
    const suspended = item.status === "suspended";
    const actions = item.roleKey === "admin"
      ? "حساب إدارة محمي"
      : `${withActions && item.roleKey === "client" ? `<button class="row-action" type="button" data-edit-client="${escapeHtml(item.id)}">تعديل البيانات</button> ` : ""}<button class="row-action" type="button" data-action="toggle-user-status" data-account-id="${escapeHtml(item.id)}" data-next-status="${suspended ? "active" : "suspended"}">${suspended ? "إعادة تفعيل" : "توقيف / تعطيل"}</button> <button class="row-action" type="button" data-action="delete-user" data-account-id="${escapeHtml(item.id)}">حذف الحساب</button>`;
    return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.phone || "—")}</td><td>${escapeHtml(item.role)}</td><td>${suspended ? "متوقف" : "نشط"}</td><td>${actions}</td></tr>`;
  });
}

function clientAccountSummary(client, data) {
  const settlements = data.settlements
    .filter((entry) => entry.customerId === client.id)
    .sort((left, right) => new Date(right.date || right._createdAt).getTime() - new Date(left.date || left._createdAt).getTime());
  const latestSettlement = settlements[0] || null;
  const openingBalance = Number(latestSettlement?.balance || 0);
  const orders = data.models.filter((order) => order.customerId === client.id && !order.archivedAt);
  const deliveredTotal = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const orderPaid = orders.reduce((sum, order) => sum + Number(order.paidAmount || 0), 0);
  const periodStart = client.account_period_started_at || latestSettlement?.date || null;
  const payments = data.payments.filter((payment) =>
    payment.customerId === client.id
    && (!periodStart || new Date(payment._createdAt || payment.created_at).getTime() >= new Date(periodStart).getTime())
  );
  const paymentsTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const due = openingBalance + deliveredTotal;
  const paid = orderPaid + paymentsTotal;
  return {
    settlements,
    latestSettlement,
    openingBalance,
    orders,
    archivedOrders: data.models.filter((order) => order.customerId === client.id && order.archivedAt),
    deliveredTotal,
    orderPaid,
    payments,
    paymentsTotal,
    due,
    paid,
    balance: due - paid
  };
}

function clientAccountCards(data) {
  const clients = data.clients;
  if (!clients.length) return '<div class="empty-state">لا توجد حسابات عملاء مسجلة.</div>';
  return `<div class="client-account-grid">${clients.map((client) => {
    const summary = clientAccountSummary(client, data);
    const linkedUser = data.users.find((user) => user.id === client.user_id);
    const inProductionCount = summary.orders.filter((order) =>
      ["تحت الإنشاء", "في الخط", "تحت التصنيع", "قيد الإنتاج"].includes(order.status)
    ).length;
    const unpricedCount = summary.orders.filter((order) => order.pricePerPiece <= 0).length;
    const uncountedCount = summary.orders.filter((order) => order.quantity <= 0).length;
    return `<article class="client-account-card">
      <header><div><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.phone || "بدون هاتف")}${linkedUser ? ` · ${escapeHtml(linkedUser.username)}` : " · ملف عميل بلا حساب دخول"}</p></div>${statusTag(linkedUser?.status === "suspended" ? "متوقف" : "نشط")}</header>
      <div class="client-balance-grid"><div><span>إجمالي المطلوب</span><strong>${money(summary.due)}</strong></div><div><span>المدفوع</span><strong>${money(summary.paid)}</strong></div><div><span>الرصيد المتبقي</span><strong>${money(summary.balance)}</strong></div></div>
      <div class="client-activity-grid"><div><span>تحت الإنشاء / التصنيع</span><strong>${inProductionCount}</strong></div><div><span>لم يُحدد سعرها</span><strong>${unpricedCount}</strong></div><div><span>لم يُحدد عددها</span><strong>${uncountedCount}</strong></div></div>
      <p class="client-notes-preview">${escapeHtml(client.notes || "لا توجد ملاحظات مسجلة.")}</p>
      <div class="client-card-actions"><button class="button button-primary" type="button" data-open-client-details="${escapeHtml(client.id)}">التفاصيل</button><button class="button button-secondary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">＋ إضافة دفعة مالية</button><button class="row-action" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل بيانات العميل</button></div>
    </article>`;
  }).join("")}</div>`;
}

function clientDetailsView(client, data) {
  const summary = clientAccountSummary(client, data);
  const pricedOrders = summary.orders.filter((order) => order.pricePerPiece > 0);
  const unpricedOrders = summary.orders.filter((order) => order.pricePerPiece <= 0);
  const archivedOrders = summary.archivedOrders;
  const deliveries = data.deliveries.filter((delivery) => delivery.customer_id === client.id);
  const payments = data.payments.filter((payment) => payment.customerId === client.id);
  const financialEntries = [
    ...deliveries.map((delivery) => {
      const order = data.models.find((item) => item.id === delivery.order_id);
      return {
        type: "تسليم بضاعة",
        reference: order?.name || "طلب مؤرشف",
        detail: `${new Intl.NumberFormat("ar-EG").format(delivery.quantity)} قطعة × ${money(delivery.price_per_piece)}`,
        amount: Number(delivery.amount),
        date: delivery.delivered_at
      };
    }),
    ...payments.map((payment) => ({
      type: "دفعة مالية",
      reference: payment.reference || "—",
      detail: `${payment.method || "—"}${payment.notes ? ` · ${payment.notes}` : ""}`,
      amount: -Number(payment.amount || 0),
      date: payment._createdAt || payment.created_at || payment.date
    })),
    ...summary.settlements.map((entry) => ({
      type: "تصفية وترحيل رصيد",
      reference: "رصيد سابق مرحّل",
      detail: `افتتاحي ${money(entry.openingBalance)} · ختامي ${money(entry.balance)}`,
      amount: Number(entry.balance),
      date: entry.date || entry._createdAt
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const orderCard = (order, archived = false) => `<article class="order-card client-history-card">
    <header class="order-card-heading"><div><p class="order-card-label">${archived ? "طلب مؤرشف" : "طلب حالي"}${order.modelNumber ? ` · رقم ${escapeHtml(order.modelNumber)}` : ""}</p><h3>${escapeHtml(order.name || "موديل بدون اسم")}</h3></div>${statusTag(order.status)}</header>
    <dl class="order-card-details">
      <div><dt>العدد الإجمالي بعد القص</dt><dd>${order.quantity ? `${new Intl.NumberFormat("ar-EG").format(order.quantity)} قطعة` : "بانتظار الحصر"}</dd></div>
      <div><dt>المستلم</dt><dd>${new Intl.NumberFormat("ar-EG").format(order.deliveredPieces)} قطعة</dd></div>
      <div><dt>المتبقي</dt><dd>${order.quantity ? `${new Intl.NumberFormat("ar-EG").format(order.remainingPieces)} قطعة` : "بانتظار الحصر"}</dd></div>
      <div><dt>الألوان</dt><dd>${escapeHtml(order.colors || "—")}</dd></div>
      <div><dt>المقاسات</dt><dd>${escapeHtml(order.sizes || "—")}</dd></div>
      ${order.pricePerPiece > 0 ? `<div><dt>سعر القطعة</dt><dd>${money(order.pricePerPiece)}</dd></div><div><dt>إجمالي قيمة المسلّم</dt><dd>${money(order.totalAmount)}</dd></div>` : '<div><dt>التسعير</dt><dd>لم يُسعّر بعد</dd></div>'}
      ${archived ? `<div><dt>تاريخ الأرشفة</dt><dd>${escapeHtml(new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(order.archivedAt)))}</dd></div>` : ""}
    </dl>
  </article>`;
  return `<div class="clients-toolbar client-detail-toolbar"><div><h2>${escapeHtml(client.name)} · تفاصيل الحساب</h2><p>${escapeHtml(client.phone || "لا يوجد رقم هاتف")}${client.notes ? ` · ${escapeHtml(client.notes)}` : ""}</p></div><div class="client-detail-actions"><button class="button button-primary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">＋ إضافة دفعة مالية</button><button class="row-action" type="button" data-return-clients>العودة إلى العملاء</button></div></div>
    <div class="stats-grid client-finance-summary">${summary.latestSettlement ? stat("رصيد سابق مرحّل", money(summary.openingBalance), "افتتاح الفترة الحالية") : ""}${stat("إجمالي المطلوب", money(summary.due), "يشمل الرصيد السابق المرحّل")}${stat("المدفوع", money(summary.paid))}${stat("الرصيد المتبقي", money(summary.balance), summary.balance < 0 ? "رصيد دائن للعميل" : "مستحق على العميل")}</div>
    <section class="client-detail-section"><header class="section-heading"><div><h2>الموديلات التي تم تسعيرها</h2><p>يُحتسب المطلوب المالي على الكمية التي تم تسليمها.</p></div></header>${pricedOrders.length ? `<div class="order-cards">${pricedOrders.map((order) => orderCard(order)).join("")}</div>` : '<div class="empty-state">لا توجد موديلات مسعّرة في الفترة الحالية.</div>'}</section>
    <section class="client-detail-section"><header class="section-heading"><div><h2>موديلات لم تُسعّر بعد</h2><p>طلبات في القص أو الانتظار أو مراحل التشغيل الأخرى.</p></div></header>${unpricedOrders.length ? `<div class="order-cards">${unpricedOrders.map((order) => orderCard(order)).join("")}</div>` : '<div class="empty-state">لا توجد موديلات بانتظار التسعير.</div>'}</section>
    <section class="client-detail-section">${panel("السجل المالي الكامل للدفعات والتسليمات", financialEntries.length ? table(["النوع","الموديل / المرجع","التفاصيل","الأثر المالي","التاريخ"], financialEntries.map((entry) => `<tr><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.reference)}</td><td>${escapeHtml(entry.detail)}</td><td class="${entry.amount < 0 ? "financial-credit" : "financial-debit"}">${money(entry.amount)}</td><td>${escapeHtml(new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(entry.date)))}</td></tr>`)) : '<div class="empty-state">لا توجد حركات مالية مسجلة لهذا العميل حتى الآن.</div>')}</section>
    <section class="client-detail-section"><header class="section-heading"><div><h2>الفترات المالية السابقة</h2><p>الأوامر والتسليمات محفوظة في الأرشيف ولا تُحذف عند التصفية.</p></div><button class="button button-primary" type="button" data-settle-client="${escapeHtml(client.id)}">تصفية الحساب وترحيل الرصيد</button></header>
      ${summary.settlements.length ? `<div class="settlement-history">${summary.settlements.map((entry) => `<article class="settlement-card"><div><strong>رصيد سابق مرحّل</strong><small>${escapeHtml(entry.date || entry._createdAt)}</small></div><div><span>رصيد افتتاحي</span><strong>${money(entry.openingBalance)}</strong></div><div><span>قيمة التسليمات</span><strong>${money(entry.deliveredTotal)}</strong></div><div><span>المدفوع</span><strong>${money(Number(entry.orderPaidTotal || 0) + Number(entry.paymentsTotal || 0))}</strong></div><div><span>رصيد الفترة الختامي</span><strong>${money(entry.balance)}</strong></div></article>`).join("")}</div>` : '<div class="empty-state">لم تتم تصفية حساب العميل سابقًا.</div>'}
      ${archivedOrders.length ? `<h3 class="history-subheading">الموديلات والطلبات المؤرشفة</h3><div class="order-cards">${archivedOrders.map((order) => orderCard(order, true)).join("")}</div>` : ""}
    </section>`;
}

function pendingAccountRows(accounts) {
  const pending = accounts.filter((account) => account.status === "pending");
  return pending.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.username)}</td><td>${escapeHtml(account.phone || "—")}</td><td>${new Intl.DateTimeFormat("ar-EG").format(new Date(account.created_at))}</td><td><select aria-label="الدور الجديد" data-pending-role="${escapeHtml(account.id)}"><option value="">اختر الدور</option><option value="client">عميل</option><option value="worker">عامل</option><option value="cutting">مشرف قص</option><option value="sewing">مشرف خياطة</option></select></td><td><button class="row-action" type="button" data-action="activate-account" data-account-id="${escapeHtml(account.id)}">تفعيل الحساب</button></td></tr>`);
}

function adminView(data, accounts) {
  const activeOrders = data.models.filter((order) => !order.archivedAt);
  const totalUnits = activeOrders.reduce((sum, item) => sum + Number(item.quantity), 0);
  const paid = data.payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const clientOptions = data.clients.map((client) =>
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}${client.phone ? ` · ${escapeHtml(client.phone)}` : ""}</option>`
  ).join("");
  const paymentClientOptions = data.clients
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}${client.phone ? ` (${escapeHtml(client.phone)})` : ""}</option>`)
    .join("");
  const paymentFilterOptions = data.clients
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`)
    .join("");
  return `
    <section id="dashboard" class="dashboard-section"><div class="stats-grid">${stat("الموديلات الحالية", activeOrders.length, "ضمن أوامر التشغيل")}${stat("إجمالي القطع", new Intl.NumberFormat("ar-EG").format(totalUnits), "قطعة")}${stat("المدفوعات المسجلة", money(paid), "إجمالي الدفعات")}${stat("طلبات الانصراف", data.leaves.filter((item) => item.status === "قيد المراجعة").length, "بانتظار المراجعة")}</div></section>
    <section id="orders" class="dashboard-section">
      <div class="clients-toolbar"><div><h2>الموديلات والطلبيات</h2><p>سجّل الموديل أولاً، ثم حدّث العدد الفعلي بعد الفرش والقص.</p></div><button class="button button-primary" type="button" data-open-order-modal>＋ إضافة موديل / طلبية</button></div>
      ${panel("إدارة الموديلات والطلبيات", orderCards(activeOrders, true))}
      <div class="modal-backdrop" id="order-modal" hidden><section class="modal-card order-modal-card" role="dialog" aria-modal="true" aria-labelledby="order-modal-title"><button class="modal-close" type="button" data-close-order aria-label="إغلاق">×</button><h2 id="order-modal-title">إضافة موديل / طلبية</h2><p>يمكن ترك العدد فارغًا حتى انتهاء الفرش والقص، ثم إدخال العدد الفعلي عند تعديل الطلب.</p><form id="model-form" class="order-form modal-form"><input type="hidden" name="editIndex" value="">
        <section class="form-section"><h3>المعلومات الأساسية <span>إجباري</span></h3><div class="form-section-grid">
          <div class="field"><label for="model-client">العميل</label><select id="model-client" name="customerId" required><option value="">اختر العميل</option>${clientOptions}</select></div>
          <div class="field"><label for="model-name">اسم الموديل (اختياري عند إدخال الرقم)</label><input id="model-name" name="name"></div>
          <div class="field"><label for="model-number">رقم الموديل (اختياري عند إدخال الاسم)</label><input id="model-number" name="modelNumber"></div>
          <div class="field"><label for="model-quantity">العدد الفعلي بعد الفرش والقص</label><input id="model-quantity" name="quantity" type="number" min="0" step="1" placeholder="اتركه فارغًا حتى يتم الحصر"><small>يُسجّل لاحقًا بعد انتهاء مرحلة القص.</small></div>
        </div></section>
        <section class="form-section"><h3>التفاصيل التشغيلية <span>اختياري</span></h3><div class="form-section-grid">
          <div class="field"><label for="model-colors">الألوان</label><input id="model-colors" name="colors" placeholder="مثال: أسود، أبيض"></div>
          <div class="field"><label for="model-sizes">المقاسات</label><input id="model-sizes" name="sizes" placeholder="مثال: S، M، L، XL"></div>
          <input type="hidden" name="deliveredPieces" value="0"><div class="field"><label>إجمالي الكمية المسلّمة</label><output id="model-delivered-summary" class="calculated-value">0 قطعة</output></div>
          <div class="field"><label for="model-status">حالة الطلب</label><select id="model-status" name="status"><option>قيد الانتظار</option><option>معلق</option><option>تحت الإنشاء</option><option>في الخط</option><option>تحت التصنيع</option><option>قيد الإنتاج</option><option>جاهز للتسليم</option><option>مكتمل</option></select></div>
        </div></section>
        <section class="form-section"><h3>التفاصيل المالية <span>اختياري</span></h3><div class="form-section-grid">
          <div class="field"><label for="model-price">سعر القطعة (ج.م)</label><input id="model-price" name="pricePerPiece" type="number" min="0" step="0.01" value="0"></div>
          <div class="field"><label for="model-paid">العربون على الطلب (لا تكرره في سجل الدفعات)</label><input id="model-paid" name="paidAmount" type="number" min="0" step="0.01" value="0"></div>
          <div class="field"><label for="model-total">قيمة الكمية المسلّمة</label><output id="model-total" class="calculated-value">0 ج.م</output></div>
          <div class="field"><label for="model-remaining">المتبقي من قيمة المسلّم</label><output id="model-remaining" class="calculated-value">0 ج.م</output></div>
        </div></section>
        <div class="form-actions"><button class="button button-primary" type="submit">حفظ الطلبية</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button><button class="row-action" type="button" data-close-order>إغلاق</button></div>
      </form></section></div>
      <div class="modal-backdrop" id="delivery-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="delivery-modal-title"><button class="modal-close" type="button" data-close-delivery aria-label="إغلاق">×</button><h2 id="delivery-modal-title">تسجيل تسليم جديد</h2><p>أدخل كمية هذه الدفعة؛ ستُضاف إلى إجمالي ما تم تسليمه حتى الآن.</p><form id="delivery-form" class="modal-form"><input type="hidden" name="orderId"><label for="delivery-quantity">كمية التسليم</label><input id="delivery-quantity" name="quantity" type="number" min="1" step="1" required><div class="form-actions"><button class="button button-primary" type="submit">تسجيل التسليم</button><button class="row-action" type="button" data-close-delivery>إلغاء</button></div></form></section></div>
    </section>
    <section id="finance" class="dashboard-section">
      ${panel("تسجيل دفعة مالية", `<div class="panel-body"><form id="payment-form" class="form-grid payment-form"><input type="hidden" name="editIndex" value=""><div class="field"><label for="payment-client">العميل</label><select id="payment-client" name="customerId" required><option value="">اختر العميل</option>${paymentClientOptions}</select></div><div class="field"><label for="payment-amount">المبلغ المدفوع (ج.م)</label><input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="payment-date">تاريخ الدفعة</label><input id="payment-date" name="date" type="date" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}" required></div><div class="field"><label for="payment-method">طريقة الدفع</label><select id="payment-method" name="method"><option>تحويل بنكي</option><option>نقدي</option><option>محفظة إلكترونية</option></select></div><div class="field"><label for="payment-reference">رقم الطلبية / مرجع</label><input id="payment-reference" name="reference" autocomplete="off"></div><div class="field"><label for="payment-notes">ملاحظات</label><input id="payment-notes" name="notes"></div><div class="form-actions"><button class="button button-primary" type="submit">تسجيل الدفعة</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></div></form></div>`, "تُربط الدفعة بملف العميل المحدد")}
      ${panel("سجل الدفعات المالية", `<div class="panel-body"><div class="payment-filter field"><label for="payment-filter-client">تصفية حسب العميل</label><select id="payment-filter-client"><option value="">كل العملاء</option>${paymentFilterOptions}</select></div>${table(["العميل","المبلغ","التاريخ","طريقة الدفع","رقم الطلبية / المرجع","ملاحظات","إجراء"], paymentRows(data.payments, true, data.clients))}</div>`)}
    </section>
    <section id="workers-production" class="dashboard-section">${panel("طلبات وأذونات الانصراف", table(["الموظف","التاريخ","السبب","الحالة","إجراء"], data.leaves.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.reason)}</td><td>${statusTag(item.status)}</td><td>${item.status === "قيد المراجعة" ? `<button class="row-action" data-action="approve-leave" data-index="${index}" type="button">اعتماد</button> <button class="row-action" data-action="deny-leave" data-index="${index}" type="button">رفض</button>` : "—"}</td></tr>`)))}</section>
    <section id="clients" class="dashboard-section">
      <div class="clients-toolbar"><div><h2>العملاء</h2><p>إدارة ملفات العملاء ومتابعة الأرصدة.</p></div><button class="button button-primary" type="button" data-open-client-modal>＋ إضافة عميل جديد</button></div>
      ${clientAccountCards(data)}
      <div class="modal-backdrop" id="client-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="client-modal-title"><button class="modal-close" type="button" data-close-client aria-label="إغلاق">×</button><h2 id="client-modal-title">إضافة عميل جديد</h2><p>إنشاء ملف عميل للتعاملات والطلبيات، دون إنشاء بيانات دخول.</p><form id="client-form" class="modal-form"><input type="hidden" name="clientId"><label for="client-name">اسم العميل</label><input id="client-name" name="name" required><label for="client-phone">رقم الهاتف</label><input id="client-phone" name="phone" type="tel"><label for="client-notes">ملاحظات</label><textarea id="client-notes" name="notes" rows="3"></textarea><div class="form-actions"><button class="button button-primary" type="submit">حفظ العميل</button><button class="row-action" type="button" data-close-client>إلغاء</button></div></form></section></div>
    </section>
    <section id="client-details" class="dashboard-section">${data.clients.some((client) => client.id === selectedClientId) ? clientDetailsView(data.clients.find((client) => client.id === selectedClientId), data) : '<div class="empty-state">اختر عميلاً لعرض تفاصيل حسابه.</div>'}</section>
    <section id="accounts" class="dashboard-section">
      ${panel("طلبات الحسابات الجديدة", table(["الاسم الكامل","اسم المستخدم","رقم التليفون","تاريخ الطلب","تحديد الدور","إجراء"], pendingAccountRows(accounts)))}
      ${panel("حسابات المستخدمين", table(["الاسم","اسم المستخدم","رقم التليفون","الدور الوظيفي","الحالة","إجراء"], userRows(data.users)))}
    </section>`;
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
  const settlements = data.settlements
    .filter((entry) => entry._ownerId === session.accountId)
    .sort((left, right) => new Date(right.date || right._createdAt).getTime() - new Date(left.date || left._createdAt).getTime());
  const latestSettlement = settlements[0] || null;
  const openingBalance = Number(latestSettlement?.balance || 0);
  const currentOrders = data.models.filter((item) => !item.archivedAt);
  const archivedOrders = data.models.filter((item) => item.archivedAt);
  const payments = data.payments.filter((item) =>
    ((item.clientId || item._ownerId) === session.accountId || item.client === session.username)
    && (!latestSettlement || new Date(item._createdAt || item.created_at).getTime() >= new Date(latestSettlement.date || latestSettlement._createdAt).getTime())
  );
  const totalAmount = currentOrders.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const paymentsTotal = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const orderPaid = currentOrders.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const totalPaid = paymentsTotal + orderPaid;
  const due = openingBalance + totalAmount;
  const remaining = due - totalPaid;
  const deliveredUnits = currentOrders.reduce((sum, item) => sum + Number(item.quantity), 0);
  return `<section id="dashboard" class="dashboard-section"><div class="stats-grid">${stat("موديلاتي الحالية", currentOrders.length, "ضمن الفترة الحالية")}${stat("العدد الفعلي", new Intl.NumberFormat("ar-EG").format(deliveredUnits), "قطعة بعد القص")}${latestSettlement ? stat("رصيد سابق مرحّل", money(openingBalance), "افتتاح الفترة الحالية") : ""}${stat("إجمالي المطلوب", money(due), "يشمل الرصيد السابق المرحّل")}${stat("إجمالي المدفوع", money(totalPaid))}${stat("الرصيد المتبقي", money(remaining))}</div></section><section id="orders" class="dashboard-section">${panel("موديلاتي والطلبيات الحالية", clientOrderCards(currentOrders))}${archivedOrders.length ? panel("الطلبات المؤرشفة", clientOrderCards(archivedOrders)) : ""}</section><section id="finance" class="dashboard-section">${panel("دفعاتي المالية", table(["المبلغ","التاريخ","طريقة الدفع"], payments.map((item) => `<tr><td>${money(item.amount)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.method)}</td></tr>`)))}</section>`;
}

let sidebarCollapsed = false;
let activeDashboardView = "";

function navigationItems(role, info) {
  if (role === "admin") {
    return [
      { id: "dashboard", icon: "▦", label: "لوحة التحكم" },
      { id: "clients", icon: "◇", label: "إدارة العملاء" },
      { id: "orders", icon: "▤", label: "الموديلات والطلبيات" },
      { id: "workers-production", icon: "⌁", label: "العمال والإنتاج" },
      { id: "finance", icon: "ج.م", label: "الحسابات والماليات" },
      { id: "accounts", icon: "♙", label: "طلبات ومستخدمي النظام", last: true }
    ];
  }
  if (role === "client") {
    return [
      { id: "dashboard", icon: "▦", label: "لوحة التحكم" },
      { id: "orders", icon: "▤", label: "موديلاتي والطلبيات" },
      { id: "finance", icon: "ج.م", label: "الدفعات المالية" }
    ];
  }
  return [{ id: "dashboard", icon: info.icon, label: "لوحة التحكم" }];
}

function render(session, data, accounts) {
  const info = roleInfo[session.role];
  const username = escapeHtml(session.username);
  const navigation = navigationItems(session.role, info).map((item, index) =>
    `<a class="nav-link${index === 0 ? " active" : ""}${item.last ? " nav-link-last" : ""}" href="#${item.id}" data-sidebar-link aria-current="${index === 0 ? "page" : "false"}"><span class="nav-icon">${item.icon}</span><span class="nav-text">${item.label}</span></a>`
  ).join("");
  const collapsedClass = sidebarCollapsed ? " sidebar-collapsed" : "";
  const content = session.role === "admin"
    ? adminView(data, accounts)
    : session.role === "client"
      ? clientView(data, session)
      : `<section id="dashboard" class="dashboard-section">${session.role === "cutting" ? cuttingView(data) : session.role === "sewing" ? sewingView(data) : workerView(data, session)}</section>`;
  document.querySelector("#app").innerHTML = `
    <div class="app-shell${collapsedClass}">
      <button class="sidebar-backdrop" type="button" data-sidebar-close aria-label="إغلاق القائمة الجانبية"></button>
      <aside class="sidebar" id="sidebar"><a class="brand" href="../login.html"><img class="brand-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><span class="brand-copy"><strong>AL-MOTAMAYEZ</strong></span></a><nav aria-label="القائمة الرئيسية"><p class="side-label">القائمة الرئيسية</p>${navigation}</nav><div class="sidebar-bottom"><div class="profile-chip"><span class="avatar">${username.slice(0, 1)}</span><div class="profile-details"><strong>${username}</strong><span>${escapeHtml(session.roleName)}</span></div></div><button class="logout-button" id="logout" type="button">↪ تسجيل الخروج</button></div></aside>
      <main class="main-content"><header class="topbar"><div class="topbar-leading"><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="sidebar" aria-expanded="true" aria-label="طي القائمة الجانبية"><span aria-hidden="true">☰</span></button><div class="topbar-title"><h1>${info.title}</h1><p>${info.description}</p></div></div><div class="header-brand"><img class="header-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><div class="brand-copy"><strong>AL-MOTAMAYEZ</strong></div><span class="date-label">${new Intl.DateTimeFormat("ar-EG", { dateStyle: "full" }).format(new Date())}</span></div></header>
    ${content}
      <footer class="page-footer">AL-MOTAMAYEZ</footer></main>
    </div>`;
  activateDashboardView(window.location.hash.slice(1) || "dashboard", false);
  bindSidebar();
  bindActions(session);
}

function activateDashboardView(viewId, updateHash = true) {
  const sections = [...document.querySelectorAll(".main-content > .dashboard-section")];
  const availableViews = new Set(sections.map((section) => section.id));
  const selectedView = availableViews.has(viewId) ? viewId : sections[0]?.id;
  if (!selectedView) return;
  activeDashboardView = selectedView;
  sections.forEach((section) => {
    section.hidden = section.id !== selectedView;
  });
  const navigationView = selectedView === "client-details" ? "clients" : selectedView;
  document.querySelectorAll("[data-sidebar-link]").forEach((link) => {
    const active = link.hash === `#${navigationView}`;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  if (updateHash && window.location.hash !== `#${selectedView}`) {
    window.history.replaceState(null, "", `#${selectedView}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("hashchange", () => {
  if (document.querySelector(".main-content")) {
    activateDashboardView(window.location.hash.slice(1), false);
  }
});

function bindSidebar() {
  const app = document.querySelector(".app-shell");
  const toggle = document.querySelector("[data-sidebar-toggle]");
  const setExpanded = (expanded) => {
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "طي القائمة الجانبية" : "فتح القائمة الجانبية");
  };
  setExpanded(!window.matchMedia("(max-width: 800px)").matches && !sidebarCollapsed);
  toggle.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 800px)").matches) {
      app.classList.toggle("drawer-open");
      setExpanded(app.classList.contains("drawer-open"));
      return;
    }
    sidebarCollapsed = !sidebarCollapsed;
    app.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    setExpanded(!sidebarCollapsed);
  });
  document.querySelector("[data-sidebar-close]").addEventListener("click", () => {
    app.classList.remove("drawer-open");
    setExpanded(false);
  });
  document.querySelectorAll("[data-sidebar-link]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    activateDashboardView(link.hash.slice(1));
    if (window.matchMedia("(max-width: 800px)").matches) {
      app.classList.remove("drawer-open");
      setExpanded(false);
    }
  }));
}

async function refreshDashboard(session) {
  const data = await readDashboardData(session);
  dashboardData = data;
  const accounts = await readAccounts(session);
  render(session, data, accounts);
}

async function persistFactoryOrder(order, changes = {}) {
  const updated = { ...order, ...changes };
  const { data, error } = await supabaseClient.rpc("save_factory_order", {
    requested_order_id: updated.id || null,
    requested_customer_id: updated.customerId,
    requested_model_name: updated.name || "",
    requested_model_number: updated.modelNumber || "",
    requested_quantity: Number(updated.quantity),
    requested_status: updated.status,
    requested_fabric: updated.fabric || "",
    requested_line_name: updated.line || "",
    requested_colors: updated.colors || "",
    requested_sizes: updated.sizes || "",
    requested_delivered_pieces: Number(updated.deliveredPieces || 0),
    requested_price_per_piece: Number(updated.pricePerPiece || 0),
    requested_paid_amount: Number(updated.paidAmount || 0)
  });
  if (error?.code === "PGRST202") {
    throw new Error("دالة حفظ الطلبات المحدّثة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (error) throw error;
  return data;
}

function bindClientDetailActions(session) {
  document.querySelectorAll("#client-details [data-quick-client-payment]").forEach((button) => {
    button.addEventListener("click", () => openClientPayment(button.dataset.quickClientPayment));
  });
  document.querySelectorAll("[data-return-clients]").forEach((button) => button.addEventListener("click", () => {
    selectedClientId = "";
    activateDashboardView("clients");
  }));
  document.querySelectorAll("[data-settle-client]").forEach((button) => button.addEventListener("click", async () => {
    const client = dashboardData.clients.find((entry) => entry.id === button.dataset.settleClient);
    if (!client) {
      window.factoryUI.toast("تعذر العثور على ملف العميل.", "error");
      return;
    }
    const summary = clientAccountSummary(client, dashboardData);
    const balanceMessage = summary.balance >= 0
      ? `سيتم ترحيل مبلغ ${money(summary.balance)} كمستحق على العميل.`
      : `سيتم ترحيل مبلغ ${money(Math.abs(summary.balance))} كرصيد دائن للعميل.`;
    if (!await window.factoryUI.confirmAction({
      title: "تصفية الحساب وبدء فترة جديدة",
      message: `${balanceMessage} ستؤرشف موديلات وتسليمات الفترة الحالية دون حذفها.`,
      confirmLabel: "تصفية وترحيل الرصيد"
    })) return;

    button.disabled = true;
    let settlementSaved = false;
    try {
      const { data, error } = await supabaseClient.rpc("settle_factory_client_account", {
        requested_customer_id: client.id
      });
      if (error?.code === "PGRST202") throw new Error("دالة تصفية الحساب غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      settlementSaved = true;
      const balance = Number(data?.balance);
      if (!Number.isFinite(balance)) throw new Error("أُنجزت استجابة التصفية لكن لم تُعد قيمة الرصيد المرحّل.");
      await refreshDashboard(session);
      window.factoryUI.toast(balance >= 0
        ? `تمت التصفية وترحيل ${money(balance)} كمستحق على العميل.`
        : `تمت التصفية وترحيل ${money(Math.abs(balance))} كرصيد دائن للعميل.`);
    } catch (error) {
      button.disabled = false;
      window.factoryUI.toast(settlementSaved
        ? `تمت التصفية، لكن تعذر تحديث البيانات المعروضة: ${error.message}`
        : `تعذر تصفية حساب العميل: ${error.message}`, "error");
    }
  }));
}

function openClientPayment(clientId) {
  const client = dashboardData.clients.find((entry) => entry.id === clientId);
  if (!client) {
    window.factoryUI.toast("تعذر العثور على ملف العميل.", "error");
    return;
  }
  const form = document.querySelector("#payment-form");
  form.reset();
  form.elements.editIndex.value = "";
  form.elements.customerId.value = client.id;
  form.elements.date.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  form.querySelector('[type="submit"]').textContent = "تسجيل الدفعة";
  form.querySelector("[data-cancel-edit]").hidden = true;
  activateDashboardView("finance");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.amount.focus({ preventScroll: true });
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
  document.querySelectorAll("#clients [data-quick-client-payment]").forEach((button) => {
    button.addEventListener("click", () => openClientPayment(button.dataset.quickClientPayment));
  });
  const editConfigs = {
    models: { form: "model-form", collection: "models", fields: ["customerId", "name", "modelNumber", "colors", "sizes", "quantity", "pricePerPiece", "paidAmount", "status"] },
    payments: { form: "payment-form", collection: "payments", fields: ["customerId", "amount", "date", "method", "reference", "notes"] }
  };
  document.querySelectorAll("[data-edit-kind]").forEach((button) => button.addEventListener("click", () => {
    const config = editConfigs[button.dataset.editKind];
    const item = button.dataset.editKind === "payments"
      ? dashboardData.payments.find((payment) => payment._recordId === button.dataset.recordId)
      : dashboardData[config.collection][Number(button.dataset.index)];
    if (!item) {
      window.factoryUI.toast("تعذر العثور على السجل المطلوب تعديله.", "error");
      return;
    }
    const form = document.querySelector(`#${config.form}`);
    form.elements.editIndex.value = button.dataset.editKind === "payments" ? item._recordId : button.dataset.index;
    for (const field of config.fields) {
      form.elements[field].value = field === "quantity" && !item[field] ? "" : item[field];
    }
    form.querySelector('[type="submit"]').textContent = "حفظ التعديلات";
    form.querySelector("[data-cancel-edit]").hidden = false;
    if (button.dataset.editKind === "models") {
      form.elements.deliveredPieces.value = item.deliveredPieces;
      form.querySelector("#model-delivered-summary").textContent = `${new Intl.NumberFormat("ar-EG").format(item.deliveredPieces)} قطعة`;
      updateOrderTotals();
      activateDashboardView("orders");
      document.querySelector("#order-modal-title").textContent = "تعديل الموديل / الطلبية";
      document.querySelector("#order-modal").hidden = false;
    } else {
      activateDashboardView("finance");
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    form.elements[config.fields[0]].focus();
  }));
  const orderModal = document.querySelector("#order-modal");
  const orderForm = document.querySelector("#model-form");
  const closeOrderModal = () => {
    orderModal.hidden = true;
    orderForm.reset();
    orderForm.elements.editIndex.value = "";
    orderForm.querySelector('[type="submit"]').textContent = "حفظ الطلبية";
    orderForm.querySelector("[data-cancel-edit]").hidden = true;
    document.querySelector("#order-modal-title").textContent = "إضافة موديل / طلبية";
    updateOrderTotals();
  };
  document.querySelector("[data-open-order-modal]").addEventListener("click", () => {
    closeOrderModal();
    orderModal.hidden = false;
    orderForm.elements.customerId.focus();
  });
  document.querySelectorAll("[data-close-order]").forEach((button) => button.addEventListener("click", closeOrderModal));
  orderModal.addEventListener("click", (event) => {
    if (event.target === orderModal) closeOrderModal();
  });
  document.querySelectorAll("[data-cancel-edit]").forEach((button) => button.addEventListener("click", () => {
    const form = button.closest("form");
    if (form.id === "model-form") {
      closeOrderModal();
      return;
    }
    form.reset();
    form.elements.editIndex.value = "";
    form.querySelector('[type="submit"]').textContent = form.id === "payment-form" ? "تسجيل الدفعة" : form.id === "user-form" ? "إضافة المستخدم" : "حفظ الطلبية";
    button.hidden = true;
    if (form.id === "model-form") updateOrderTotals();
    if (form.id === "payment-form") form.elements.date.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }));
  const clientForm = document.querySelector("#client-form");
  const clientModal = document.querySelector("#client-modal");
  const closeClientModal = () => {
    clientModal.hidden = true;
    clientForm.reset();
    clientForm.elements.clientId.value = "";
    clientForm.querySelector('[type="submit"]').textContent = "حفظ العميل";
  };
  document.querySelector("[data-open-client-modal]").addEventListener("click", () => {
    closeClientModal();
    document.querySelector("#client-modal-title").textContent = "إضافة عميل جديد";
    clientModal.hidden = false;
    clientForm.elements.name.focus();
  });
  document.querySelectorAll("[data-close-client]").forEach((button) => button.addEventListener("click", closeClientModal));
  clientModal.addEventListener("click", (event) => {
    if (event.target === clientModal) closeClientModal();
  });
  clientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const clientId = String(formData.get("clientId"));
    const clientData = {
      name: String(formData.get("name")).trim(),
      phone: String(formData.get("phone")).trim(),
      notes: String(formData.get("notes")).trim()
    };
    if (!clientData.name) {
      window.factoryUI.toast("اسم العميل مطلوب.", "error");
      return;
    }
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      let query = supabaseClient.from("factory_clients");
      if (clientId) {
        const { error } = await query.update({ ...clientData, updated_at: new Date().toISOString() }).eq("id", clientId);
        if (error) throw error;
        const existing = dashboardData.clients.find((client) => client.id === clientId);
        if (existing?.user_id) {
          const { error: userError } = await supabaseClient.from("users")
            .update({ name: clientData.name, phone: clientData.phone, updated_at: new Date().toISOString() })
            .eq("id", existing.user_id);
          if (userError) throw userError;
        }
      } else {
        const { error } = await query.insert(clientData);
        if (error) throw error;
      }
      await refreshDashboard(session);
      clientModal.hidden = true;
      window.factoryUI.toast(clientId ? "تم تحديث بيانات العميل بنجاح." : "تمت إضافة العميل بنجاح.");
    } catch (error) {
      window.factoryUI.toast(`تعذر حفظ ملف العميل: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
  document.querySelectorAll("[data-edit-customer]").forEach((button) => button.addEventListener("click", () => {
    const client = dashboardData.clients.find((user) => user.id === button.dataset.editCustomer);
    if (!client) {
      window.factoryUI.toast("تعذر العثور على حساب العميل.", "error");
      return;
    }
    const form = document.querySelector("#client-form");
    form.elements.clientId.value = client.id;
    form.elements.name.value = client.name;
    form.elements.phone.value = client.phone;
    form.elements.notes.value = client.notes;
    form.querySelector('[type="submit"]').textContent = "حفظ تعديلات العميل";
    document.querySelector("#client-modal-title").textContent = "تعديل بيانات العميل";
    document.querySelector("#client-modal").hidden = false;
    activateDashboardView("clients");
    form.elements.name.focus();
  }));
  document.querySelectorAll("[data-open-client-details]").forEach((button) => button.addEventListener("click", () => {
    const client = dashboardData.clients.find((entry) => entry.id === button.dataset.openClientDetails);
    if (!client) {
      window.factoryUI.toast("تعذر العثور على ملف العميل.", "error");
      return;
    }
    selectedClientId = client.id;
    document.querySelector("#client-details").innerHTML = clientDetailsView(client, dashboardData);
    activateDashboardView("client-details");
    bindClientDetailActions(session);
  }));
  bindClientDetailActions(session);
  document.querySelector("#payment-filter-client").addEventListener("change", (event) => {
    const clientId = event.currentTarget.value;
    document.querySelectorAll("[data-payment-client]").forEach((row) => {
      row.hidden = Boolean(clientId) && row.dataset.paymentClient !== clientId;
    });
  });
  const deliveryModal = document.querySelector("#delivery-modal");
  const deliveryForm = document.querySelector("#delivery-form");
  const closeDeliveryModal = () => {
    deliveryModal.hidden = true;
    deliveryForm.reset();
  };
  document.querySelectorAll("[data-close-delivery]").forEach((button) => button.addEventListener("click", closeDeliveryModal));
  deliveryModal.addEventListener("click", (event) => {
    if (event.target === deliveryModal) closeDeliveryModal();
  });
  deliveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const order = dashboardData.models.find((item) => item.id === deliveryForm.elements.orderId.value);
    const quantity = Number(deliveryForm.elements.quantity.value);
    if (!order || !Number.isSafeInteger(quantity) || quantity <= 0) {
      window.factoryUI.toast("اختر طلبية وأدخل كمية تسليم صحيحة.", "error");
      return;
    }
    if (!order.quantity) {
      window.factoryUI.toast("سجّل العدد الفعلي بعد الفرش والقص قبل إدخال التسليمات.", "error");
      return;
    }
    const submitButton = deliveryForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    let deliverySaved = false;
    try {
      const { error } = await supabaseClient.rpc("record_factory_delivery", {
        requested_order_id: order.id,
        requested_quantity: quantity
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسجيل التسليم غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      deliverySaved = true;
      closeDeliveryModal();
      await refreshDashboard(session);
      window.factoryUI.toast("تم تسجيل التسليم وإضافته إلى إجمالي الكمية المسلّمة.");
    } catch (error) {
      window.factoryUI.toast(deliverySaved
        ? `تم تسجيل التسليم، لكن تعذر تحديث البيانات المعروضة: ${error.message}`
        : `تعذر تسجيل التسليم: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
  const updateOrderTotals = () => {
    if (!orderForm) return;
    const delivered = Number(orderForm.elements.deliveredPieces.value || 0);
    const price = Number(orderForm.elements.pricePerPiece.value || 0);
    const paid = Number(orderForm.elements.paidAmount.value || 0);
    const total = delivered * price;
    const formatAmount = (value) => `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(value)} ج.م`;
    orderForm.querySelector("#model-delivered-summary").textContent = `${new Intl.NumberFormat("ar-EG").format(delivered)} قطعة`;
    orderForm.elements.paidAmount.removeAttribute("max");
    orderForm.querySelector("#model-total").textContent = formatAmount(total);
    orderForm.querySelector("#model-remaining").textContent = formatAmount(total - paid);
  };
  ["deliveredPieces", "pricePerPiece", "paidAmount"].forEach((name) => orderForm.elements[name].addEventListener("input", updateOrderTotals));
  updateOrderTotals();
  document.querySelector("#model-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const quantityValue = String(formData.get("quantity")).trim();
    const quantity = quantityValue ? Number(quantityValue) : 0;
    const deliveredPieces = Number(formData.get("deliveredPieces"));
    const pricePerPiece = Number(formData.get("pricePerPiece"));
    const paidAmount = Number(formData.get("paidAmount"));
    const modelName = String(formData.get("name")).trim();
    const modelNumber = String(formData.get("modelNumber")).trim();
    const customerId = String(formData.get("customerId"));
    if (!modelName && !modelNumber) {
      window.factoryUI.toast("أدخل اسم الموديل أو رقمه على الأقل.", "error");
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(deliveredPieces) || deliveredPieces < 0) {
      window.factoryUI.toast("تحقق من إدخال أعداد صحيحة غير سالبة للكمية والتسليم.", "error");
      return;
    }
    if (quantity === 0 && deliveredPieces > 0) {
      window.factoryUI.toast("أدخل العدد الفعلي بعد القص قبل تسجيل أي تسليم.", "error");
      return;
    }
    const customer = dashboardData.clients.find((client) => client.id === customerId);
    if (!customer) {
      window.factoryUI.toast("اختر ملف عميل صالحًا للطلبية.", "error");
      return;
    }
    submitButton.disabled = true;
    try {
      const editIndex = String(formData.get("editIndex"));
      const existingOrder = editIndex ? dashboardData.models[Number(editIndex)] : null;
      await persistFactoryOrder({
        ...existingOrder,
        id: existingOrder?.id,
        customerId,
        name: modelName,
        modelNumber,
        quantity,
        deliveredPieces,
        pricePerPiece,
        paidAmount,
        status: String(formData.get("status")),
        fabric: String(formData.get("fabric") || "").trim(),
        line: String(formData.get("line") || "").trim(),
        colors: String(formData.get("colors") || "").trim(),
        sizes: String(formData.get("sizes") || "").trim()
      });
      closeOrderModal();
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
    const client = dashboardData.clients.find((user) => user.id === String(formData.get("customerId")));
    if (!client) {
      window.factoryUI.toast("اختر عميلاً من القائمة.", "error");
      return;
    }
    const payment = {
      customerId: client.id,
      clientId: client.user_id || null,
      clientName: client.name,
      amount: Number(formData.get("amount")),
      date: String(formData.get("date")),
      method: String(formData.get("method")),
      reference: String(formData.get("reference")).trim(),
      notes: String(formData.get("notes")).trim()
    };
    const editIndex = String(formData.get("editIndex"));
    const existingPayment = editIndex ? dashboardData.payments.find((item) => item._recordId === editIndex) : null;
    if (existingPayment && existingPayment.customerId !== client.id) {
      window.factoryUI.toast("لا يمكن نقل دفعة مسجلة إلى ملف عميل آخر.", "error");
      return;
    }
    submitButton.disabled = true;
    let paymentSaved = false;
    try {
      const { error } = await supabaseClient.rpc("save_factory_payment", {
        requested_record_id: existingPayment?._recordId || null,
        requested_customer_id: payment.customerId,
        requested_amount: payment.amount,
        requested_date: payment.date,
        requested_method: payment.method,
        requested_reference: payment.reference,
        requested_notes: payment.notes
      });
      if (error?.code === "PGRST202") throw new Error("دالة حفظ الدفعات غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      paymentSaved = true;
      form.reset();
      form.elements.editIndex.value = "";
      form.elements.date.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      form.querySelector('[data-cancel-edit]').hidden = true;
      submitButton.textContent = "تسجيل الدفعة";
      await refreshDashboard(session);
      window.factoryUI.toast(existingPayment ? "تم تحديث الدفعة بنجاح." : "تم تسجيل الدفعة بنجاح.");
    } catch (error) {
      window.factoryUI.toast(paymentSaved
        ? `تم حفظ الدفعة، لكن تعذر تحديث البيانات المعروضة: ${error.message}`
        : `تعذر حفظ الدفعة أونلاين: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.action === "record-delivery" || button.dataset.action === "close-order") {
      const order = dashboardData.models[Number(button.dataset.index)];
      if (!order) {
        window.factoryUI.toast("تعذر العثور على الطلبية. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      if (button.dataset.action === "record-delivery") {
        deliveryForm.elements.orderId.value = order.id;
        deliveryForm.elements.quantity.value = "";
        deliveryModal.hidden = false;
        deliveryForm.elements.quantity.focus();
        return;
      }
      if (!await window.factoryUI.confirmAction({
        title: "إغلاق وأرشفة الطلبية",
        message: `هل انتهى العمل على ${order.name || order.modelNumber || "الطلبية"}؟ سيتم إغلاقها بغض النظر عن فرق الكميات.`,
        confirmLabel: "اكتمل / إغلاق الطلب"
      })) return;
      button.disabled = true;
      try {
        await persistFactoryOrder(order, { status: "مكتمل" });
        await refreshDashboard(session);
        window.factoryUI.toast("تم إغلاق الطلبية وأرشفتها.");
      } catch (error) {
        button.disabled = false;
        window.factoryUI.toast(`تعذر إغلاق الطلبية: ${error.message}`, "error");
      }
      return;
    }
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
      const userId = account.id;
      try {
        const { error } = await supabaseClient.rpc("delete_user_by_admin", {
          target_user_id: userId
        });
        if (error) throw error;
      } catch (error) {
        button.disabled = false;
        window.factoryUI.toast(`تعذر حذف الحساب: ${error.message}`, "error");
        return;
      }
      window.factoryUI.toast("تم حذف الحساب بنجاح.");
      refreshDashboard(session).catch((refreshError) => window.factoryUI.toast(`حُذف الحساب، لكن تعذر تحديث اللوحة: ${refreshError.message}`, "error"));
      return;
    }
    const index = Number(button.dataset.index);
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
