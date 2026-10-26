const supabaseClient = window.supabaseClient;
const ADMIN_USERNAME = "ZERO0";
const ADMIN_AUTH_EMAIL = "mohamed01007033454@gmail.com";
let dashboardData;
let usersTableHasStatus = false;
let selectedClientId = "";
let clientManagementTab = "summary";
let activeClientProfileTab = "overview";
let realtimeChannel = null;
let presenceChannel = null;
let realtimeRefreshTimer = null;
let realtimeRefreshRunning = false;
let realtimeRefreshPending = false;
let realtimeEditProtectionBound = false;
let realtimeNotifications = [];
let notificationStorageAccount = "";
let onlineUserCount = 0;
let onlineUsers = [];
let activeFinanceTab = "payments";
let activeAdminCuttingTab = "active";
let activeWorkforceTab = "employees";
let activeSewingDashboardTab = "workflow";
let selectedWorkforceEmployeeId = "";
let selectedWorkforceProfileTab = "finance";
let showNewWorkforceEmployeeModal = false;
let pendingWorkforceLateDecision = null;
let pendingWorkforceAbsenceDecision = null;
let modelImageLightboxBound = false;
let productionDetailsModalBound = false;
let cuttingEditorModalBound = false;
let sewingEditorModalBound = false;
let activeCuttingEditorTrigger = null;
let activeSewingEditorTrigger = null;
let selectedWorkforceMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
let selectedWorkforceCutoffDate = "";
const REALTIME_NOTIFICATION_MESSAGE = "تحديث جديد في البرنامج";
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
const WORKER_JOB_TITLES = ["غير محدد", "مشرف أصل", "مشرف خياطة", "مشرف قص", "موظف إداري", "إمبلاج", "خياطة", "قص", "تشطيب", "مكواة", "تكييس", "عامل إنتاج", "أخرى"];
const SIZE_OPTIONS = {
  men: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  women: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  children: Array.from({ length: 8 }, (_, index) => String((index + 1) * 2))
};
const SIZE_TYPE_LABELS = { men: "رجالي", women: "حريمي", children: "أطفال" };
const WORK_STAGES = [
  ["cutting", "قص"],
  ["sewing", "خياطة"],
  ["finishing", "تشطيب"],
  ["ironing", "مكوى"],
  ["printing", "طباعة"],
  ["packaging", "تكييس / أمبلاج"],
  ["sorting", "فرز"]
];
const FACTORY_ORDER_STATUSES = [
  "قيد الانتظار",
  "قيد الفرش",
  "تم الفرش",
  "جاهز للقص",
  "تم القص",
  "في انتظار الخياطة",
  "جاري الخياطة",
  "تمت الخياطة",
  "جاري التشطيب",
  "تم التشطيب",
  "جاري المكواة",
  "تم الكي",
  "جاري الطباعة",
  "تمت الطباعة",
  "جاري التكييس",
  "تم التكييس",
  "جاري الفرز",
  "تم الفرز",
  "جاهز للتسليم",
  "تم التسليم"
];
const LOCKED_FACTORY_ORDER_STATUSES = ["تم التسليم"];
const DEFAULT_MODEL_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" rx="12" fill="#f1f4f2"/><path d="M80 28a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM43 101c3-19 17-29 37-29s34 10 37 29" fill="none" stroke="#9aa8a0" stroke-linecap="round" stroke-width="7"/><path d="M24 108h112" stroke="#c7d0ca" stroke-linecap="round" stroke-width="4"/></svg>'
)}`;
const WORKFLOW_MANAGED_FACTORY_ORDER_STATUSES = [
  "في انتظار الخياطة", "جاري الخياطة", "تمت الخياطة",
  "جاري التشطيب", "تم التشطيب", "جاري المكواة", "تم الكي",
  "جاري الطباعة", "تمت الطباعة", "جاري التكييس", "تم التكييس",
  "جاري الفرز", "تم الفرز", "مكتمل", "جاهز للتسليم"
];
const INITIAL_READY_STAGE_BY_STATUS = {
  "تم القص": "sewing",
  "في انتظار الخياطة": "sewing",
  "جاري الخياطة": "sewing",
  "تمت الخياطة": "sewing",
  "جاري التشطيب": "finishing",
  "تم التشطيب": "finishing",
  "جاري المكواة": "ironing",
  "تم الكي": "ironing",
  "جاري الطباعة": "printing",
  "تمت الطباعة": "printing",
  "جاري التكييس": "packaging",
  "تم التكييس": "packaging",
  "جاري الفرز": "sorting",
  "تم الفرز": "sorting"
};

function isFactoryOrderWorkflowManaged(order) {
  return WORKFLOW_MANAGED_FACTORY_ORDER_STATUSES
    .includes(canonicalFactoryOrderStatus(order.storedStatus || order.status))
    || ["متاح للخياطة", "قيد الخياطة", "قيد التنفيذ", "مكتمل"].includes(order.sewingStageStatus || "");
}

function factoryOrderStatusForSave(order, requestedStatus) {
  if (order && isFactoryOrderWorkflowManaged(order)) {
    return order.storedStatus || order.status;
  }
  return requestedStatus;
}
const roleInfo = {
  admin: { title: "لوحة تحكم الإدارة", description: "نظرة شاملة على المصنع وإدارة بيانات التشغيل.", icon: "▦" },
  cutting: { title: "لوحة مشرف القص", description: "متابعة أوامر الإدارة وتسجيل بيانات الفرش والقص.", icon: "✂" },
  sewing: { title: "لوحة مشرف الخياطة", description: "متابعة خطوط الخياطة والإنتاج اليومي.", icon: "⌁" },
  worker: { title: "مهامي", description: "المهام المسندة إليك وحالة تنفيذها.", icon: "✓" },
  client: { title: "بوابة العميل", description: "موديلاتك وطلباتك والمدفوعات الخاصة بحسابك.", icon: "◇" }
};

async function readSession() {
  const { data: { session: authSession }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;
  if (!authSession) {
    window.location.replace("../index.html");
    return null;
  }
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError) throw authError;
  if (!user) {
    window.location.replace("../index.html");
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
    window.location.replace("../index.html");
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
    roleName: roleNames[account.role],
    jobTitle: account.job_title || "",
    canSubmitProduction: account.role === "worker" && account.can_submit_production === true
  };
  return session;
}

function emptyDashboardData() {
  return {
    models: [],
    clients: [],
    fabrics: [],
    fabricReservations: [],
    fabricTransactions: [],
    authEvents: [],
    cashTransactions: [],
    clientFabricStock: [],
    payments: [],
    accountAdjustments: [],
    settlements: [],
    deliveries: [],
    clientModelRequests: [],
    modelCatalog: [],
    cuttingRequests: [],
    users: [],
    leaves: [],
    cutting: [],
    cuttingStories: [],
    sewing: [],
    tasks: [],
    clientNotes: [],
    personalAttendance: [],
    personalAdvances: [],
    personalPayroll: [],
    workerAdvances: [],
    workerPayroll: [],
    workerExpenses: [],
    workforceAttendance: [],
    workforceViolations: [],
    workforceProfiles: [],
    workforceSettings: [],
    workforceSettlements: [],
    productionSubmissions: [],
    finishedGoods: []
  };
}

function reportDashboardFailure(session, publicMessage, error) {
  console.error(publicMessage, error);
  const message = session.role === "admin"
    ? `${publicMessage}: ${dashboardErrorMessage(error)}`
    : `${publicMessage}. حاول مرة أخرى لاحقًا أو تواصل مع الإدارة.`;
  window.factoryUI.toast(message, "error");
}

function dashboardErrorMessage(error) {
  if (!error || typeof error !== "object") return String(error || "خطأ غير معروف");
  const parts = [error.message, error.details, error.hint]
    .filter((value, index, values) => typeof value === "string" && value && values.indexOf(value) === index);
  if (error.code && !parts.some((part) => part.includes(error.code))) parts.push(`رمز الخطأ: ${error.code}`);
  return parts.join(" · ") || "خطأ غير معروف";
}

function logSupabaseRpcError(rpcName, error) {
  console.error(`Supabase RPC ${rpcName} failed`, {
    code: error?.code || "",
    message: error?.message || String(error || "Unknown error"),
    details: error?.details || "",
    hint: error?.hint || "",
    status: error?.status || ""
  });
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

async function deleteFlexibleRecord(collection, recordId) {
  const { error } = await supabaseClient
    .from("factory_records")
    .delete()
    .eq("id", recordId)
    .eq("collection", collection)
    .select("id")
    .single();
  if (error) throw error;
}

async function saveFlexibleRecordsBatch(collection, records) {
  const rows = records.map(({ payload, ownerId }) => {
    const cleanPayload = { ...payload };
    delete cleanPayload._recordId;
    delete cleanPayload._ownerId;
    return {
      id: crypto.randomUUID(),
      collection,
      owner_id: ownerId || null,
      payload: cleanPayload
    };
  });
  const { error } = await supabaseClient
    .from("factory_records")
    .upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function readDashboardData(session) {
  const data = emptyDashboardData();
  const fabricTransactionsPromise = ["admin", "cutting"].includes(session.role)
    ? supabaseClient.from("factory_fabric_transactions")
      .select("id, fabric_id, order_id, transaction_type, quantity, notes, actor_id, created_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const fabricReservationsPromise = ["admin", "cutting"].includes(session.role)
    ? supabaseClient.from("factory_cutting_request_reservations")
      .select("request_id, fabric_id, quantity")
    : Promise.resolve({ data: [], error: null });
  const fabricPromises = ["admin", "cutting"].includes(session.role)
    ? [
      (() => {
        let query = supabaseClient.from("factory_fabrics")
          .select("id, stock_scope, customer_id, name, fabric_type, color_name, color_hex, unit, quantity_available, received_at, received_by, created_at, updated_at")
          .order("name", { ascending: true });
        if (session.role === "cutting") query = query.eq("stock_scope", "incoming");
        return query;
      })(),
      fabricTransactionsPromise
    ]
    : [Promise.resolve({ data: [], error: null }), Promise.resolve({ data: [], error: null })];
  const authEventsPromise = session.role === "admin"
    ? supabaseClient.from("factory_auth_events")
      .select("id, user_id, event_type, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(100)
    : Promise.resolve({ data: [], error: null });
  const productionSubmissionsPromise = ["admin", "worker"].includes(session.role)
    ? supabaseClient.from("factory_worker_production_submissions")
      .select("id, worker_id, parent_submission_id, worker_name, job_title, model_name, model_number, quantity, colors, image_path, notes, status, created_at, updated_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const finishedGoodsPromise = ["admin", "client"].includes(session.role)
    ? supabaseClient.from("factory_finished_goods")
      .select("id, submission_id, order_id, customer_id, model_name, model_number, quantity, colors, image_path, worker_name, confirmed_at")
      .order("confirmed_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const deliveriesPromise = ["admin", "client"].includes(session.role)
    ? supabaseClient.from("factory_deliveries")
      .select("id, order_id, customer_id, quantity, price_per_piece, amount, recipient_name, expected_delivery_date, delivered_at, legacy_import")
      .order("delivered_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const cashTransactionsPromise = session.role === "admin"
    ? supabaseClient.from("factory_cash_transactions")
      .select("id, customer_id, order_id, direction, category, description, amount, payment_method, occurred_at, created_by, created_at")
      .order("occurred_at", { ascending: false })
    : session.role === "client"
      ? supabaseClient.rpc("read_factory_client_cash_transactions")
      : Promise.resolve({ data: [], error: null });
  const clientFabricStockPromise = session.role === "client"
    ? supabaseClient.rpc("read_factory_client_fabric_stock")
    : Promise.resolve({ data: [], error: null });
  const clientModelRequestsPromise = ["admin", "client"].includes(session.role)
    ? supabaseClient.from("factory_client_model_requests")
      .select("id, client_id, user_id, model_name, model_number, quantity, notes, image_path, status, created_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const cuttingStoriesPromise = session.role === "admin"
    ? supabaseClient.from("factory_cutting_stories")
    .select("id, customer_id, customer_name, submitted_by_name, model_name, model_number, source_order_id, catalog_model_id, cutting_request_id, factory_model_code, size_data, color_ply_data, total_pieces, ply_count, fabric, fabric_details, fabric_id, fabric_quantity, bolt_count, fabric_unit, fabric_lines, technical_notes, model_image_url, status, approved_order_id, approved_action, archived_at, created_at, approved_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const cuttingRequestsPromise = ["admin", "cutting"].includes(session.role)
    ? supabaseClient.from("factory_cutting_requests")
      .select("id, source_order_id, catalog_model_id, customer_id, requested_by, status, completed_story_id, fabric_id, roll_details, operational_notes, archived_at, created_at, submitted_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const modelCatalogPromise = ["admin", "cutting"].includes(session.role)
    ? supabaseClient.from("factory_model_catalog")
      .select("id, customer_id, model_name, client_model_code, model_serial, factory_model_code, model_image_url, archived_at, created_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const workforceRecords = session.role === "admin"
    ? Promise.all([
      readFlexibleRecords("workforce_attendance"),
      readFlexibleRecords("workforce_violations"),
      readFlexibleRecords("workforce_profiles"),
      readFlexibleRecords("workforce_settings"),
      readFlexibleRecords("workforce_settlements")
    ])
    : ["worker", "cutting", "sewing"].includes(session.role)
      ? Promise.all([
        readFlexibleRecords("workforce_attendance"),
        readFlexibleRecords("workforce_violations"),
        readFlexibleRecords("workforce_profiles"),
        readFlexibleRecords("workforce_settings"),
        readFlexibleRecords("workforce_settlements")
      ])
      : Promise.resolve([[], [], [], [], []]);
  const accountAdjustmentsPromise = ["admin", "client"].includes(session.role)
    ? readFlexibleRecords("account_adjustments")
    : Promise.resolve([]);
  const [payments, leaves, tasks, settlements, deliveriesResult, cashTransactionsResult, clientFabricStockResult, personalAttendance, personalAdvances, personalPayroll, workerAdvances, workerPayroll, workerExpenses, fabricsResult, fabricTransactionsResult, fabricReservationsResult, authEventsResult, productionSubmissionsResult, finishedGoodsResult, clientModelRequestsResult, cuttingStoriesResult, cuttingRequestsResult, modelCatalogResult, workforceRecordsResult, accountAdjustments] = await Promise.all([
    readFlexibleRecords("payments"),
    readFlexibleRecords("leaves"),
    readFlexibleRecords("tasks"),
    readFlexibleRecords("settlements"),
    deliveriesPromise,
    cashTransactionsPromise,
    clientFabricStockPromise,
    ["cutting", "sewing", "worker"].includes(session.role) ? readFlexibleRecords("attendance") : Promise.resolve([]),
    ["cutting", "sewing", "worker"].includes(session.role) ? readFlexibleRecords("advances") : Promise.resolve([]),
    ["cutting", "sewing", "worker"].includes(session.role) ? readFlexibleRecords("payroll") : Promise.resolve([]),
    session.role === "admin" ? readFlexibleRecords("advances") : Promise.resolve([]),
    session.role === "admin" ? readFlexibleRecords("payroll") : Promise.resolve([]),
    session.role === "worker" ? readFlexibleRecords("worker_expenses") : Promise.resolve([]),
    ...fabricPromises,
    fabricReservationsPromise,
    authEventsPromise,
    productionSubmissionsPromise,
    finishedGoodsPromise,
    clientModelRequestsPromise,
    cuttingStoriesPromise,
    cuttingRequestsPromise,
    modelCatalogPromise,
    workforceRecords,
    accountAdjustmentsPromise
  ]);
  if (["42P01", "PGRST205"].includes(deliveriesResult.error?.code)) {
    throw new Error("سجل التسليمات غير موجود في قاعدة البيانات. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (deliveriesResult.error) throw deliveriesResult.error;
  if (session.role === "client" && cashTransactionsResult.error?.code === "PGRST202") {
    throw new Error("دالة قراءة مصروفات حساب العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (cashTransactionsResult.error) throw cashTransactionsResult.error;
  if (session.role === "client" && clientFabricStockResult.error?.code === "PGRST202") {
    throw new Error("دالة قراءة مخزون قماش العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (clientFabricStockResult.error) throw clientFabricStockResult.error;
  if (["42P01", "PGRST205"].includes(fabricsResult.error?.code)
      || ["42P01", "PGRST205"].includes(fabricTransactionsResult.error?.code)) {
    throw new Error("جداول مخزون القماش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (fabricsResult.error) throw fabricsResult.error;
  if (fabricTransactionsResult.error) throw fabricTransactionsResult.error;
  if (["42P01", "PGRST205"].includes(fabricReservationsResult.error?.code)) {
    throw new Error("جدول حجوزات مخزون القماش غير موجود. شغّل أحدث نسخة من supabase/schema.sql في SQL Editor.");
  }
  if (fabricReservationsResult.error) throw fabricReservationsResult.error;
  if (authEventsResult.error) throw authEventsResult.error;
  if (["42P01", "PGRST205"].includes(productionSubmissionsResult.error?.code)
      || ["42P01", "PGRST205"].includes(finishedGoodsResult.error?.code)) {
    throw new Error("جداول تسليم إنتاج العمال غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (["42703", "PGRST204"].includes(productionSubmissionsResult.error?.code)) {
    throw new Error("حقول التسليمات التابعة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (productionSubmissionsResult.error) throw productionSubmissionsResult.error;
  if (finishedGoodsResult.error) throw finishedGoodsResult.error;
  if (clientModelRequestsResult.error) throw clientModelRequestsResult.error;
  if (["42P01", "PGRST205"].includes(cuttingStoriesResult.error?.code)) {
    throw new Error("سجل قصص القص غير موجود. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (["42703", "PGRST204"].includes(cuttingStoriesResult.error?.code)) {
    throw new Error("حقول ربط قصة القص بالموديل غير موجودة. شغّل أحدث نسخة من supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (cuttingStoriesResult.error) throw cuttingStoriesResult.error;
  if (["42P01", "PGRST205"].includes(cuttingRequestsResult.error?.code)) {
    throw new Error("جدول طلبات القص غير موجود. شغّل أحدث نسخة من supabase/schema.sql في SQL Editor.");
  }
  if (cuttingRequestsResult.error) throw cuttingRequestsResult.error;
  if (["42P01", "PGRST205"].includes(modelCatalogResult.error?.code)) {
    throw new Error("سجل الموديلات غير موجود. شغّل أحدث نسخة من supabase/schema.sql في SQL Editor.");
  }
  if (modelCatalogResult.error) throw modelCatalogResult.error;
  data.payments = payments;
  data.accountAdjustments = accountAdjustments;
  data.settlements = settlements;
  data.deliveries = deliveriesResult.data || [];
  data.cashTransactions = cashTransactionsResult.data || [];
  data.clientFabricStock = clientFabricStockResult.data || [];
  data.fabrics = fabricsResult.data || [];
  data.fabricTransactions = fabricTransactionsResult.data || [];
  data.fabricReservations = fabricReservationsResult.data || [];
  data.authEvents = authEventsResult.data || [];
  const productionSubmissions = productionSubmissionsResult.data || [];
  data.productionSubmissions = productionSubmissions.map((submission) => ({
    ...submission,
    parentSubmission: productionSubmissions.find((parent) => parent.id === submission.parent_submission_id) || null,
    imageUrl: submission.image_path
      ? supabaseClient.storage.from("factory-model-images").getPublicUrl(submission.image_path).data.publicUrl
      : ""
  }));
  data.finishedGoods = (finishedGoodsResult.data || []).map((item) => ({
    ...item,
    imageUrl: item.image_path
      ? supabaseClient.storage.from("factory-model-images").getPublicUrl(item.image_path).data.publicUrl
      : ""
  }));
  data.clientModelRequests = (clientModelRequestsResult.data || []).map((request) => ({
    ...request,
    imageUrl: request.image_path
      ? supabaseClient.storage.from("factory-model-images").getPublicUrl(request.image_path).data.publicUrl
      : ""
  }));
  data.cuttingStories = cuttingStoriesResult.data || [];
  data.cuttingRequests = cuttingRequestsResult.data || [];
  data.modelCatalog = modelCatalogResult.data || [];
  [data.workforceAttendance, data.workforceViolations, data.workforceProfiles, data.workforceSettings, data.workforceSettlements] = workforceRecordsResult;
  data.personalAttendance = personalAttendance;
  data.personalAdvances = personalAdvances;
  data.personalPayroll = personalPayroll;
  data.workerAdvances = workerAdvances;
  data.workerPayroll = workerPayroll;
  data.workerExpenses = workerExpenses;
  if (session.role === "cutting") {
    const { data: cuttingClients, error: cuttingClientsError } = await supabaseClient.rpc("read_factory_cutting_clients");
    if (cuttingClientsError?.code === "PGRST202") {
      throw new Error("دالة قراءة قائمة العملاء لمشرف القص غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
    }
    if (cuttingClientsError) throw cuttingClientsError;
    data.clients = cuttingClients || [];
  }
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
  } else if (["cutting", "sewing"].includes(session.role)) {
    let ordersQuery = supabaseClient
      .from("orders")
      .select("id, customer_id, model_name, model_number, factory_model_code, client_model_code, sender_name, colors, color_names, color_size_distribution, production_type, work_stages, sizes, original_total_pieces, total_pieces, model_image_url, model_image_url_2, priority, archived_at, workflow_archived_at, status, created_at")
      .order("created_at", { ascending: false });
    ({ data: orders, error: ordersError } = await ordersQuery);
    if (ordersError?.code === "42703") {
      data.orderReadWarning = "تم تحميل بيانات الطلبات الأساسية فقط؛ سجل الموديلات والقصات والتكرار يتطلب تشغيل أحدث نسخة من supabase/schema.sql.";
      ordersQuery = supabaseClient
        .from("orders")
        .select("id, customer_id, model_name, model_number, sender_name, colors, color_names, sizes, original_total_pieces, total_pieces, model_image_url, priority, status, created_at")
        .order("created_at", { ascending: false });
      ({ data: orders, error: ordersError } = await ordersQuery);
    }
    if (ordersError) {
      console.error("Failed to load orders for factory supervisor", {
        role: session.role,
        code: ordersError.code || "",
        message: ordersError.message || String(ordersError)
      });
      data.orderReadWarning = "تعذر تحميل بيانات الطلبات؛ تحقق من تشغيل أحدث ملف supabase/schema.sql وصلاحيات قاعدة البيانات. بقية بيانات اللوحة متاحة.";
      orders = [];
      ordersError = null;
    }
  } else {
    orders = [];
    ordersError = null;
  }
  if (ordersError) throw ordersError;

  data.orderExpenses = [];
  if (session.role === "admin") {
    const { data: orderExpenses, error: orderExpensesError } = await supabaseClient
      .rpc("read_factory_order_expenses_admin");
    if (orderExpensesError?.code === "PGRST202") {
      throw new Error("دالة قراءة مصروفات الموديلات غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
    }
    if (orderExpensesError) throw orderExpensesError;
    data.orderExpenses = orderExpenses || [];
  }

  if (session.role === "admin") {
    const { data: clients, error: clientsError } = await supabaseClient
      .from("factory_clients")
      .select("id, user_id, name, brand_name, code_letter, client_number, phone, cash_phone, instagram, whatsapp, notes, account_period_started_at, created_at")
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
    const stageColumns = session.role === "sewing"
      ? "id, order_id, stage_name, color_ply_data, line_name, target_quantity, completed_quantity, status, updated_at"
      : "id, order_id, stage_name, worker_name, cutter_name, fabric, fabric_details, fabric_id, external_fabric_source, external_fabric_unit, fabric_quantity, bolt_count, layer_count, color_ply_data, technical_notes, line_name, target_quantity, completed_quantity, status, updated_at";
    let stagesQuery = supabaseClient
      .from("production_stages")
      .select(stageColumns);
    if (session.role !== "admin") {
      stagesQuery = stagesQuery.in("order_id", orders.map((order) => order.id));
    }
    if (session.role === "cutting") {
      stagesQuery = stagesQuery.in("stage_name", ["cutting", "قص", "تقطيع"]);
    } else if (session.role === "sewing") {
      stagesQuery = stagesQuery.in("stage_name", ["sewing", "خياطة", "cutting", "قص", "تقطيع"]);
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
        stagesQuery = stagesQuery.in("stage_name", ["sewing", "خياطة", "cutting", "قص", "تقطيع"]);
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
      .filter((stage) => ["cutting", "sewing", "finishing", "ironing", "printing", "packaging"].includes(stage.stage_name))
      .reduce((maximum, stage) => Math.max(maximum, Number(stage.completed_quantity || 0)), 0);
    const originalQuantity = Number(order.original_total_pieces ?? order.total_pieces ?? 0);
    const deliveredPieces = Number(order.delivered_pieces || 0);
    const recordedDeliveryPieces = data.deliveries
      .filter((delivery) => delivery.order_id === order.id)
      .reduce((total, delivery) => total + Number(delivery.quantity || 0), 0);
    const deliveredQuantityComplete = Number(order.total_pieces || 0) > 0
      && Math.max(deliveredPieces, recordedDeliveryPieces) >= Number(order.total_pieces);
    const storedStatus = factoryOrderDeliveredStatus(order.delivery_status)
      || factoryOrderDeliveredStatus(order.status)
      ? deliveredQuantityComplete || Number(order.total_pieces || 0) <= 0
        ? "تم التسليم"
        : "جاهز للتسليم"
      : order.status || "";
    const sewingStageStatus = sewingStage?.status || "";
    const effectiveStatus = effectiveFactoryOrderStatus({
      storedStatus,
      sewingStageStatus
    });
    return {
      id: order.id,
      clientId: order.client_id,
      customerId: order.customer_id,
      modelSerial: Number(order.model_serial || 0),
      factoryModelCode: order.factory_model_code || "",
      clientModelCode: order.client_model_code || "",
      createdAt: order.created_at || "",
      name: order.model_name || order.model_number || "موديل بدون اسم",
      modelNumber: order.model_number || "",
      senderName: order.sender_name || "",
      colorNames: {
        ...Object.fromEntries(parseColorPlyData(cuttingStage?.color_ply_data).map((entry) => [entry.color, entry.name]).filter(([, name]) => name)),
        ...parseColorNames(order.color_names)
      },
      client: clientsById.get(order.customer_id)
        ? `${clientsById.get(order.customer_id).name}${clientsById.get(order.customer_id).brand_name ? ` · ${clientsById.get(order.customer_id).brand_name}` : ""}`
        : "",
      quantity: order.total_pieces,
      originalQuantity,
      completedPieces,
      colors: order.colors || "",
      colorPlyData: cuttingStage?.color_ply_data || null,
      colorSizeDistribution: order.color_size_distribution || { colors: [] },
      productionType: order.production_type || "full_cutting",
      workStages: order.work_stages || ["cutting", "sewing", "finishing"],
      pricingMode: order.pricing_mode || "total",
      stagePrices: order.stage_prices || {},
      sizes: cuttingSizePickerValue(order.sizes, cuttingStage?.color_ply_data),
      modelImageUrl: order.model_image_url || "",
      modelImageUrl2: order.model_image_url_2 || "",
      modelImageUrls: [order.model_image_url || "", order.model_image_url_2 || ""],
      priority: order.priority || "عادي",
      deliveredPieces,
      deliveryHistory: data.deliveries
        .filter((delivery) => delivery.order_id === order.id)
        .sort((left, right) => new Date(left.delivered_at).getTime() - new Date(right.delivered_at).getTime()),
      archivedAt: order.archived_at || null,
      workflowArchivedAt: order.workflow_archived_at || null,
      remainingPieces: Math.max(Number(order.total_pieces) - Number(order.delivered_pieces || 0), 0),
      quantityDifference: deliveredPieces - originalQuantity,
      pricePerPiece: Number(order.price_per_piece || 0),
      totalAmount: Number(order.total_amount || 0),
      expectedAmount: Number(order.expected_total_amount
        ?? Math.max(Number(order.total_pieces || 0) - deliveredPieces, 0) * Number(order.price_per_piece || 0)),
      operationalExpenses: Number(order.operational_expenses || 0),
      expenseEntries: data.orderExpenses.filter((expense) => expense.order_id === order.id),
      paidAmount: Number(order.paid_amount || 0),
      remainingAmount: Number(order.remaining_amount || 0),
      expectedDeliveryDate: order.expected_delivery_date || "",
      status: effectiveStatus.status,
      ledgerStatus: effectiveStatus.status,
      cuttingStageStatus: cuttingStage?.status || "",
      sewingStageStatus,
      deliveryStatus: order.delivery_status || "",
      storedStatus,
      displayStatus: effectiveStatus.status === "قيد الفرش" && Number(cuttingStage?.layer_count) > 0
        ? `قيد الفرش - تم فرش ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(cuttingStage.layer_count)} راقات`
        : effectiveStatus.label,
      cuttingPlys: Number(cuttingStage?.layer_count || 0),
      fabric: cuttingStage?.fabric || "",
      fabricDetails: cuttingStage?.fabric_details || "",
      fabricId: cuttingStage?.fabric_id || (cuttingStage?.external_fabric_source ? "external" : ""),
      externalFabricSource: cuttingStage?.external_fabric_source || "",
      externalFabricUnit: cuttingStage?.external_fabric_unit || "متر",
      fabricUnit: cuttingStage?.external_fabric_unit || data.fabrics.find((fabric) => fabric.id === cuttingStage?.fabric_id)?.unit || "متر",
      fabricQuantity: Number(cuttingStage?.fabric_quantity || 0),
      boltCount: Number(cuttingStage?.bolt_count || 0),
      layerCount: Number(cuttingStage?.layer_count || 0),
      colorPlyData: cuttingStage?.color_ply_data || null,
      cuttingNotes: cuttingStage?.technical_notes || "",
      cutterName: cuttingStage?.cutter_name || "",
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
      workflowArchivedAt: ordersById.get(stage.order_id)?.workflow_archived_at || null,
      customerId: ordersById.get(stage.order_id)?.customer_id || "",
      client: clientsById.get(ordersById.get(stage.order_id)?.customer_id)?.name || "",
      model: ordersById.get(stage.order_id)?.model_name || ordersById.get(stage.order_id)?.model_number || "موديل غير محدد",
      modelNumber: ordersById.get(stage.order_id)?.model_number || "",
      factoryModelCode: ordersById.get(stage.order_id)?.factory_model_code || "",
      clientModelCode: ordersById.get(stage.order_id)?.client_model_code || "",
      sizes: cuttingSizePickerValue(ordersById.get(stage.order_id)?.sizes, stage.color_ply_data),
      colors: ordersById.get(stage.order_id)?.colors || "",
      modelImageUrl: ordersById.get(stage.order_id)?.model_image_url || "",
      modelImageUrls: [ordersById.get(stage.order_id)?.model_image_url || "", ordersById.get(stage.order_id)?.model_image_url_2 || ""],
      fabric: stage.fabric || data.fabrics.find((fabric) => fabric.id === stage.fabric_id)?.name || stage.external_fabric_source || "",
      fabricDetails: stage.fabric_details || "",
      fabricId: stage.fabric_id || (stage.external_fabric_source ? "external" : ""),
      externalFabricSource: stage.external_fabric_source || "",
      externalFabricUnit: stage.external_fabric_unit || "متر",
      fabricUnit: stage.external_fabric_unit || data.fabrics.find((fabric) => fabric.id === stage.fabric_id)?.unit || "متر",
      fabricQuantity: Number(stage.fabric_quantity || 0),
      boltCount: Number(stage.bolt_count || 0),
      layerCount: Number(stage.layer_count || 0),
      colorPlyData: stage.color_ply_data || null,
      technicalNotes: stage.technical_notes || "",
      cutterName: stage.cutter_name || "",
      priority: ordersById.get(stage.order_id)?.priority || "عادي",
      total: stage.target_quantity || ordersById.get(stage.order_id)?.total_pieces || 0,
      originalTotal: Number(ordersById.get(stage.order_id)?.original_total_pieces ?? ordersById.get(stage.order_id)?.total_pieces ?? 0),
      colorNames: {
        ...Object.fromEntries(parseColorPlyData(stage.color_ply_data).map((entry) => [entry.color, entry.name]).filter(([, name]) => name)),
        ...parseColorNames(ordersById.get(stage.order_id)?.color_names)
      },
      workStages: ordersById.get(stage.order_id)?.work_stages || [],
      cut: stage.completed_quantity || 0,
      status: stage.status,
      orderStatus: ordersById.get(stage.order_id)?.status || stage.status,
      senderName: ordersById.get(stage.order_id)?.sender_name || "",
      createdAt: ordersById.get(stage.order_id)?.created_at || ""
    }));
  data.sewing = stages
    .filter((stage) => stageNames.get(stage.stage_name) === "sewing")
    .map((stage) => {
      const order = ordersById.get(stage.order_id);
      const cuttingStage = stages.find((candidate) =>
        candidate.order_id === stage.order_id && stageNames.get(candidate.stage_name) === "cutting"
      );
      return {
        id: stage.id,
        order: stage.order_id,
        workflowArchivedAt: order?.workflow_archived_at || null,
        line: stage.line_name || "—",
        model: order?.model_name || order?.model_number || "موديل غير محدد",
        modelNumber: order?.model_number || "",
        factoryModelCode: order?.factory_model_code || "",
        clientModelCode: order?.client_model_code || "",
        client: clientsById.get(order?.customer_id)?.name || "",
        modelImageUrl: order?.model_image_url || "",
        modelImageUrls: [order?.model_image_url || "", order?.model_image_url_2 || ""],
        colors: order?.colors || "",
        colorNames: {
          ...Object.fromEntries(parseColorPlyData(cuttingStage?.color_ply_data).map((entry) => [entry.color, entry.name]).filter(([, name]) => name)),
          ...parseColorNames(order?.color_names)
        },
        colorPlyData: cuttingStage?.color_ply_data || null,
        colorSizeDistribution: order?.color_size_distribution || { colors: [] },
        sizes: cuttingSizePickerValue(order?.sizes, cuttingStage?.color_ply_data),
        cutterName: cuttingStage?.cutter_name || "",
        fabric: cuttingStage?.fabric || data.fabrics.find((fabric) => fabric.id === cuttingStage?.fabric_id)?.name || cuttingStage?.external_fabric_source || "",
        fabricDetails: cuttingStage?.fabric_details || "",
        fabricId: cuttingStage?.fabric_id || (cuttingStage?.external_fabric_source ? "external" : ""),
        externalFabricSource: cuttingStage?.external_fabric_source || "",
        fabricQuantity: Number(cuttingStage?.fabric_quantity || 0),
        fabricUnit: cuttingStage?.external_fabric_unit || data.fabrics.find((fabric) => fabric.id === cuttingStage?.fabric_id)?.unit || "متر",
        boltCount: Number(cuttingStage?.bolt_count || 0),
        layerCount: Number(cuttingStage?.layer_count || 0),
        cuttingPlys: Number(cuttingStage?.layer_count || 0),
        cuttingNotes: cuttingStage?.technical_notes || "",
        workStages: order?.work_stages || [],
        technicalNotes: stage.technical_notes || "",
        orderStatus: order?.status || "",
        supervisor: stage.worker_name || "—",
        originalQuantity: Number(order?.original_total_pieces ?? order?.total_pieces ?? 0),
        target: stage.target_quantity || order?.total_pieces || 0,
        produced: stage.completed_quantity || 0,
        stageStatus: stage.status === "قيد التنفيذ" ? "قيد الخياطة" : stage.status,
        status: stage.status === "متاح للخياطة"
          ? "في انتظار الخياطة"
          : stage.status === "قيد التنفيذ" ? "قيد الخياطة" : stage.status
      };
    });

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
  data.voidedPayments = data.payments.filter((payment) => payment.accountVoided === true);
  data.payments = data.payments.filter((payment) => payment.accountVoided !== true);
  return data;
}

async function readUsers() {
  let { data, error } = await supabaseClient
    .from("users")
    .select("id, name, username, phone, role, status, job_title, can_submit_production, created_at")
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
      status: account.status || "active",
      jobTitle: account.job_title || "",
      canSubmitProduction: account.can_submit_production === true
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
    .select("id, name, username, role, status, job_title, can_submit_production")
    .ilike("username", username)
    .maybeSingle();
  if (error?.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("users")
      .select("id, name, username, role, status")
      .ilike("username", username)
      .maybeSingle());
  }
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
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  return `${new Intl.NumberFormat("ar-EG-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(rounded)} ج.م`;
}

function canonicalFactoryOrderStatus(status) {
  const aliases = {
    "معلق": "قيد الانتظار",
    "تحت الإنشاء": "قيد الانتظار",
    "تم الفرش / جاهز للقص": "جاهز للقص",
    "معلق - في انتظار الخياطة": "في انتظار الخياطة",
    "متاح للخياطة": "في انتظار الخياطة",
    "قيد الخياطة": "جاري الخياطة",
    "في الخياطة": "جاري الخياطة",
    "في الخط": "جاري الخياطة",
    "متاح للإمبلاج / التعبئة": "تمت الخياطة",
    "مكتمل": "تمت الخياطة",
    "تم التسليم بالكامل": "تم التسليم",
    "تم التسليم والإغلاق": "تم التسليم"
  };
  const normalizedStatus = String(status || "").trim();
  const englishAliases = {
    delivered: "تم التسليم",
    "fully delivered": "تم التسليم",
    "ready for delivery": "جاهز للتسليم",
    "ready to deliver": "جاهز للتسليم"
  };
  return aliases[normalizedStatus] || englishAliases[normalizedStatus.toLocaleLowerCase()] || normalizedStatus || "قيد الانتظار";
}

function factoryOrderDeliveredStatus(status) {
  return canonicalFactoryOrderStatus(status) === "تم التسليم";
}

function factoryOrderIsReceivable(order) {
  const status = effectiveFactoryOrderStatus(order).status;
  return ["جاهز للتسليم", "تم التسليم"].includes(canonicalFactoryOrderStatus(status));
}

function factoryOrderHasCompleteDelivery(order) {
  const totalPieces = Number(order.quantity ?? order.total_pieces ?? 0);
  const deliveries = order.deliveryHistory || order.deliveries || [];
  const deliveredPieces = deliveries.reduce(
    (total, delivery) => total + Number(delivery.quantity || 0),
    0
  );
  return totalPieces > 0
    && Math.max(deliveredPieces, Number(order.deliveredPieces ?? order.delivered_pieces ?? 0)) >= totalPieces;
}

function factoryOrderHasReachedDelivery(order) {
  const status = canonicalFactoryOrderStatus(effectiveFactoryOrderStatus(order).status);
  return ["جاهز للتسليم", "تم التسليم"].includes(status);
}

function factoryOrderLedgerAmounts(order) {
  const orderBalance = addMoney(order.totalAmount || 0, order.expectedAmount || 0);
  return factoryOrderIsReceivable(order)
    ? { deliveredAmount: orderBalance, pendingAmount: 0 }
    : { deliveredAmount: 0, pendingAmount: orderBalance };
}

function effectiveFactoryOrderStatus(order) {
  const sewingStageStatus = order.sewingStageStatus || "";
  if (["متاح للخياطة", "في انتظار الخياطة"].includes(sewingStageStatus)) {
    return { status: "في انتظار الخياطة", label: "في انتظار الخياطة" };
  }
  if (["قيد الخياطة", "قيد التنفيذ"].includes(sewingStageStatus)) {
    return { status: "جاري الخياطة", label: "قيد الخياطة" };
  }

  const storedStatus = canonicalFactoryOrderStatus(order.storedStatus || order.status);
  if (sewingStageStatus === "مكتمل"
      && ["تم القص", "في انتظار الخياطة", "جاري الخياطة", "تمت الخياطة"].includes(storedStatus)) {
    return { status: "تمت الخياطة", label: "ما بعد الخياطة" };
  }
  return { status: storedStatus, label: storedStatus };
}

function factoryOrderStatusSequence(order) {
  const statuses = [...FACTORY_ORDER_STATUSES.slice(0, 8)];
  const stageStatuses = {
    finishing: ["جاري التشطيب", "تم التشطيب"],
    ironing: ["جاري المكواة", "تم الكي"],
    printing: ["جاري الطباعة", "تمت الطباعة"],
    packaging: ["جاري التكييس", "تم التكييس"],
    sorting: ["جاري الفرز", "تم الفرز"]
  };
  (order.workStages || []).forEach((stage) => {
    if (stageStatuses[stage]) statuses.push(...stageStatuses[stage]);
  });
  statuses.push(...FACTORY_ORDER_STATUSES.slice(8));
  return statuses;
}

function factoryOrderPipelineCategory(order) {
  const sewingStageStatus = order.sewingStageStatus || "";
  if (["متاح للخياطة", "في انتظار الخياطة"].includes(sewingStageStatus)) return "waiting_sewing";
  if (["قيد الخياطة", "قيد التنفيذ"].includes(sewingStageStatus)) return "sewing";
  if (sewingStageStatus === "مكتمل") return "post_sewing";

  const status = canonicalFactoryOrderStatus(order.storedStatus || order.status);
  if ([
    "تمت الخياطة", "جاري التشطيب", "تم التشطيب", "جاري المكواة", "تم الكي",
    "جاري الطباعة", "تمت الطباعة", "جاري التكييس", "تم التكييس",
    "جاري الفرز", "تم الفرز", "مكتمل", "جاهز للتسليم", "تم التسليم"
  ].includes(status)) return "post_sewing";
  if (["جاري الخياطة"].includes(status)) return "sewing";
  if (["في انتظار الخياطة", "تم القص"].includes(status)) return "waiting_sewing";

  if (["مكتمل", "تم القص"].includes(order.cuttingStageStatus || "")
      && (order.workStages || []).includes("sewing")) return "waiting_sewing";
  if (["قيد الانتظار", "قيد الفرش", "تم الفرش", "جاهز للقص"].includes(status)) return "before_cutting";
  return "unclassified";
}

function factoryOrderPipelineGroups(orders) {
  const groups = [
    { key: "before_cutting", label: "قبل القص", orders: [] },
    { key: "waiting_sewing", label: "في انتظار الخياطة", orders: [] },
    { key: "sewing", label: "قيد الخياطة / جاري الخياطة", orders: [] },
    { key: "post_sewing", label: "ما بعد الخياطة", orders: [] },
    { key: "unclassified", label: "حالات غير مصنفة", orders: [] }
  ];
  const groupsByKey = new Map(groups.map((group) => [group.key, group]));
  for (const order of orders) {
    if (LOCKED_FACTORY_ORDER_STATUSES.includes(canonicalFactoryOrderStatus(order.storedStatus || order.status))) continue;
    groupsByKey.get(factoryOrderPipelineCategory(order)).orders.push(order);
  }
  return groups;
}

function cuttingDetailsMarkup(order) {
  const sizeData = parseSizeData(order.sizes);
  const sizes = orderedSizeEntries(sizeData);
  const colors = parseColorPlyData(order.colorPlyData, order.colors);
  const breakdown = colors.flatMap((color) => sizes.map((size, index) => {
    const occurrence = sizes.slice(0, index + 1).filter((entry) => entry === size).length;
    const totalOccurrences = sizes.filter((entry) => entry === size).length;
    const colorName = order.colorNames?.[color.color] || color.name || "اسم اللون غير مسجل";
    return `<tr><td>${escapeHtml(colorName)}</td><td>${escapeHtml(size)}${totalOccurrences > 1 ? ` · تكرار ${occurrence} من ${totalOccurrences}` : ""}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(color.plys)} راقات</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(color.plys)} قطعة</td></tr>`;
  }));
  const cuttingDetails = [
    ["مسؤول القص", order.cutterName || "—"],
    ["الخامة", order.fabric || order.externalFabricSource || "—"],
    ...(order.fabricDetails ? [["تفاصيل الخامة", order.fabricDetails]] : []),
    ["مصدر الخامة", order.fabricId === "external" ? "خامة خارجية / مورد" : order.fabricId ? "خامة العميل من المخزن" : "—"],
    ["كمية القماش", `${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(order.fabricQuantity || 0)} ${order.fabricUnit || "متر"}`],
    ["عدد الأتواب", new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.boltCount || 0)],
    ["إجمالي الراقات", new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.layerCount || order.cuttingPlys || 0)]
  ];
  return `<section class="cutting-details-section"><h3 class="modal-subheading">تفاصيل القص والخامات</h3><dl class="cutting-details-grid">${cuttingDetails.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
    ${breakdown.length ? table(["اللون","المقاس","الرقات","العدد الناتج"], breakdown) : '<p class="empty-state">لم تُسجل تفاصيل المقاسات والرقات بعد.</p>'}
    ${order.cuttingNotes ? `<p class="cutting-details-notes"><strong>ملاحظات القص:</strong> ${escapeHtml(order.cuttingNotes)}</p>` : ""}
  </section>`;
}

function cuttingOrderDetailsMarkup(item) {
  return `<header class="production-details-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<div><small>تفاصيل أمر القص</small><h2>${escapeHtml(item.model || item.name || "موديل بدون اسم")}</h2><p>كود الموديل بالنظام: ${escapeHtml(item.factoryModelCode || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(item.clientModelCode || "—")} · العميل: ${escapeHtml(item.client || "—")}</p></div>${statusTag(item.displayStatus || item.orderStatus || item.status)}</header>
    <dl class="sewing-order-facts"><div><dt>رقم الطلب</dt><dd>${escapeHtml(item.order || item.id || "—")}</dd></div><div><dt>العدد الإجمالي</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.total ?? item.quantity ?? 0)} قطعة</dd></div><div><dt>العدد المنجز في القص</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.cut || 0)} قطعة</dd></div><div><dt>الأولوية</dt><dd>${escapeHtml(item.priority || "عادي")}</dd></div><div><dt>تم الإرسال بواسطة</dt><dd>${escapeHtml(item.senderName || "—")}</dd></div><div><dt>الأقسام المطلوبة</dt><dd>${escapeHtml(workStageLabels(item.workStages).join("، ") || "—")}</dd></div><div><dt>الألوان</dt><dd>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</dd></div><div><dt>المقاسات</dt><dd>${escapeHtml(sizeSummary(item.sizes) || "—")}</dd></div></dl>
    <h3 class="modal-subheading">توزيع المقاسات والألوان</h3>${modelSizeColorCardsMarkup(item)}
    ${cuttingDetailsMarkup(item)}
    ${item.technicalNotes || item.cuttingNotes ? `<p class="cutting-details-notes"><strong>التعليمات الفنية:</strong> ${escapeHtml(item.technicalNotes || item.cuttingNotes)}</p>` : ""}`;
}

function sewingOrderDetailsMarkup(item) {
  return `<header class="production-details-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<div><small>تفاصيل أمر الخياطة</small><h2>${escapeHtml(item.model || "موديل بدون اسم")}</h2><p>كود الموديل بالنظام: ${escapeHtml(item.factoryModelCode || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(item.clientModelCode || item.modelNumber || "—")}</p></div>${statusTag(item.status)}</header>
    <dl class="sewing-order-facts"><div><dt>إجمالي العدد</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.target || 0)} قطعة</dd></div><div><dt>العدد المطلوب الأصلي</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.originalQuantity || 0)} قطعة</dd></div><div><dt>المنجز بالخياطة</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.produced || 0)} قطعة</dd></div></dl>
    <h3 class="modal-subheading">المقاسات والألوان</h3>${modelSizeColorCardsMarkup(item)}`;
}

function sewingDetailsProjection(item) {
  return {
    model: item.model || item.name || "",
    modelNumber: item.modelNumber || "",
    factoryModelCode: item.factoryModelCode || "",
    clientModelCode: item.clientModelCode || "",
    modelImageUrl: item.modelImageUrl || "",
    modelImageUrls: item.modelImageUrls || (item.modelImageUrl ? [item.modelImageUrl] : []),
    status: item.status || item.orderStatus || "",
    target: Number(item.target ?? item.quantity ?? item.total ?? 0),
    originalQuantity: Number(item.originalQuantity ?? item.originalTotal ?? item.quantity ?? item.total ?? 0),
    produced: Number(item.produced ?? item.completedPieces ?? item.cut ?? 0),
    sizes: item.sizes || "",
    colors: item.colors || "",
    colorNames: item.colorNames || {},
    colorPlyData: item.colorPlyData || null,
    colorSizeDistribution: item.colorSizeDistribution || { colors: [] }
  };
}

function sewingHistoryDetailsMarkup(item) {
  return `<header class="production-details-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<div><small>سجل قصة سابقة</small><h2>${escapeHtml(item.model || "موديل بدون اسم")}</h2><p>كود الموديل بالنظام: ${escapeHtml(item.factoryModelCode || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(item.clientModelCode || "—")}</p></div>${statusTag(item.status || item.orderStatus || "—")}</header>
    <dl class="sewing-order-facts"><div><dt>إجمالي القطع في القصة</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.target || item.total || item.cut || 0)} قطعة</dd></div></dl>
    <h3 class="modal-subheading">المقاسات والألوان</h3>${modelSizeColorCardsMarkup(item)}`;
}

function cuttingStoryDetailsMarkup(story) {
  const colors = parseColorPlyData(story.color_ply_data);
  const sizeData = parseSizeData(story.size_data);
  const sizes = orderedSizeEntries(sizeData);
  const occurrences = new Map();
  const breakdown = colors.flatMap((color) => sizes.map((size) => {
    const occurrence = (occurrences.get(size) || 0) + 1;
    occurrences.set(size, occurrence);
    return `<tr><td>${escapeHtml(color.name || "اسم اللون غير مسجل")}</td><td>${escapeHtml(size)}${(sizeData.multiplicities[size] || 0) > 1 ? ` · التكرار ${occurrence}` : ""}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(color.plys)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(color.plys)} قطعة</td></tr>`;
  }));
  const fabricLines = Array.isArray(story.fabric_lines) ? story.fabric_lines : [];
  const fabricRows = fabricLines.map((line) =>
    `<tr><td>${escapeHtml(line.name || line.fabric_type || "قماش")}</td><td>${escapeHtml(line.color_name || "—")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(Number(line.quantity || 0))} ${escapeHtml(line.unit || "")}</td></tr>`
  );
  return `<header class="production-details-heading">${modelImageMarkup(story.model_image_url)}<div><small>تفاصيل قصة القص</small><h2>${escapeHtml(story.model_name || story.model_number || "قصة بدون اسم")}</h2><p>كود الموديل بالنظام: ${escapeHtml(story.factory_model_code || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(story.model_number || "—")} · العميل: ${escapeHtml(story.customer_name || "—")}</p></div></header>
    <dl class="sewing-order-facts"><div><dt>إجمالي القطع</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(story.total_pieces)} قطعة</dd></div><div><dt>عدد الرقات</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(story.ply_count || 0)}</dd></div><div><dt>عدد الأتواب</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(story.bolt_count || 0)} توب</dd></div><div><dt>كمية القماش</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(story.fabric_quantity || 0)} ${escapeHtml(story.fabric_unit || "")}</dd></div><div><dt>القماش</dt><dd>${escapeHtml(story.fabric || "—")}</dd></div><div><dt>المورد / تفاصيل المصدر</dt><dd>${escapeHtml(story.fabric_details || "—")}</dd></div><div><dt>مسؤول القص</dt><dd>${escapeHtml(story.submitted_by_name || "مشرف القص")}</dd></div></dl>
    ${breakdown.length ? `<section class="cutting-details-section"><h3 class="modal-subheading">المقاسات والأعداد بالترتيب، مع إظهار التكرار</h3>${table(["اللون","المقاس","عدد الراقات","قطع المقاس واللون"], breakdown)}</section>` : '<p class="empty-state">لا توجد تفاصيل مقاسات مسجلة.</p>'}
    ${fabricRows.length ? `<section class="cutting-details-section"><h3 class="modal-subheading">الخامات والألوان المسحوبة</h3>${table(["نوع القماش","اللون","الكمية"], fabricRows)}</section>` : ""}
    ${story.technical_notes ? `<p class="cutting-details-notes"><strong>ملاحظات فنية:</strong> ${escapeHtml(story.technical_notes)}</p>` : ""}`;
}

function productionDetailsButton(kind, item) {
  const serialized = encodeURIComponent(JSON.stringify(item));
  return `<button class="button button-secondary" type="button" data-open-production-details data-production-details-kind="${kind}" data-production-details="${escapeHtml(serialized)}">التفاصيل</button>`;
}

function parseSizeData(value) {
  if (!value) return { type: "", counts: {}, multiplicities: {}, sizes: [], legacy: "" };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && parsed.counts && typeof parsed.counts === "object") {
      const counts = { ...parsed.counts };
      if (Object.hasOwn(counts, "SX")) {
        counts.XS = Number(counts.XS || 0) + Number(counts.SX || 0);
        delete counts.SX;
      }
      const multiplicities = parsed.multiplicities && typeof parsed.multiplicities === "object"
        ? { ...parsed.multiplicities }
        : {};
      if (Object.hasOwn(multiplicities, "SX")) {
        multiplicities.XS = Number(multiplicities.XS || 0) + Number(multiplicities.SX || 0);
        delete multiplicities.SX;
      }
      return {
        type: parsed.type || "",
        counts,
        multiplicities,
        sizes: Array.isArray(parsed.sizes)
          ? parsed.sizes.map((size) => size === "SX" ? "XS" : String(size))
          : [],
        legacy: ""
      };
    }
  } catch {
    return { type: "", counts: {}, multiplicities: {}, sizes: [], legacy: String(value) };
  }
  return { type: "", counts: {}, multiplicities: {}, sizes: [], legacy: String(value) };
}

function orderedSizeEntries(sizeData) {
  return sizeData.sizes.length
    ? [...sizeData.sizes]
    : Object.entries(sizeData.multiplicities)
      .flatMap(([size, occurrences]) => Array(Math.max(Number(occurrences) || 0, 0)).fill(size));
}

function readSizePickerOrder(root) {
  try {
    const sizes = JSON.parse(root.dataset.sizeOrder || "[]");
    return Array.isArray(sizes) ? sizes.map((size) => size === "SX" ? "XS" : String(size)) : [];
  } catch {
    return [];
  }
}

function sizePickerMarkup(value, prefix, showCounts = true, allowDuplicates = false) {
  const sizeData = parseSizeData(value);
  const initialSizeOrder = orderedSizeEntries(sizeData);
  const pickerOptions = Object.entries(SIZE_OPTIONS).map(([type, sizes]) => `
    <div class="size-option-group" data-size-group="${type}" ${sizeData.type === type ? "" : "hidden"}>
      ${sizes.map((size) => {
        const occurrences = Number(sizeData.multiplicities[size] ?? (Object.hasOwn(sizeData.counts, size) ? 1 : 0));
        const active = occurrences > 0 || Object.hasOwn(sizeData.counts, size);
        const count = Number(sizeData.counts[size] || 0);
        const occurrenceControls = allowDuplicates
          ? `<span class="size-occurrence-count" data-size-occurrence-count="${size}">${occurrences}</span><button type="button" class="size-occurrence-remove" data-size-occurrence-remove="${size}" aria-label="تقليل تكرار مقاس ${size}" ${occurrences ? "" : "disabled"}>−</button>`
          : "";
        return `<div class="size-choice${active ? " active" : ""}"${allowDuplicates ? ` data-size-occurrences="${size}" data-occurrences="${occurrences}"` : ""}><button type="button" class="size-toggle" data-size-toggle="${size}" aria-pressed="${active}">${size}</button>${occurrenceControls}${showCounts ? `<label class="size-count-label" ${active ? "" : "hidden"}><span class="visually-hidden">عدد مقاس ${size}</span><input data-size-count="${size}" type="number" min="0" step="1" value="${active && count ? count : ""}" placeholder="العدد" ${active ? "" : "disabled"}></label>` : ""}</div>`;
      }).join("")}
    </div>`).join("");
  return `<div class="field size-picker" data-size-picker="${prefix}" data-size-legacy="${escapeHtml(sizeData.legacy)}" data-size-order="${escapeHtml(JSON.stringify(initialSizeOrder))}" data-auto-quantity="${showCounts ? "false" : "true"}" data-size-duplicates="${allowDuplicates}">
    <label for="${prefix}-type">نوع المقاسات</label>
    <select id="${prefix}-type" data-size-type><option value="">اختر النوع</option>${Object.entries(SIZE_TYPE_LABELS).map(([type, label]) => `<option value="${type}" ${sizeData.type === type ? "selected" : ""}>${label}</option>`).join("")}</select>
    ${allowDuplicates ? '<small>اضغط على المقاس لإضافته مرة أخرى، واستخدم (−) لتقليل التكرار.</small>' : ""}
    ${pickerOptions}
    ${sizeData.legacy ? `<small>مقاسات محفوظة سابقًا: ${escapeHtml(sizeData.legacy)}</small>` : ""}
    <input type="hidden" name="sizes" data-size-value value="${escapeHtml(value || "")}">
  </div>`;
}

function parseColorPlyData(value, legacyColors = "", fallbackPlys = 0) {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  if (parsed && Array.isArray(parsed.colors)) {
    return parsed.colors.map((entry) => ({
      color: String(entry.color || "").toUpperCase(),
      name: String(entry.name || ""),
      plys: Number(entry.plys || 0)
    })).filter((entry) => /^#[0-9A-F]{6}$/.test(entry.color));
  }
  return String(legacyColors).split(",").map((color) => color.trim().toUpperCase())
    .filter((color) => /^#[0-9A-F]{6}$/.test(color))
    .map((color) => ({ color, name: "", plys: Number(fallbackPlys) || 0 }));
}

function cuttingSizePickerValue(orderSizes, colorPlyData) {
  let cuttingData = colorPlyData;
  if (typeof cuttingData === "string") {
    try { cuttingData = JSON.parse(cuttingData); } catch { cuttingData = null; }
  }
  if (!cuttingData || !Array.isArray(cuttingData.sizes)) return orderSizes || "";
  const sizeData = parseSizeData(orderSizes);
  sizeData.type = cuttingData.type || sizeData.type;
  sizeData.multiplicities = cuttingData.sizes.reduce((result, size) => {
    const normalizedSize = size === "SX" ? "XS" : size;
    result[normalizedSize] = Number(result[normalizedSize] || 0) + 1;
    return result;
  }, {});
  sizeData.sizes = cuttingData.sizes.map((size) => size === "SX" ? "XS" : size);
  return JSON.stringify(sizeData);
}

function cuttingColorPlyMarkup(colorPlyData, legacyColors, fallbackPlys, prefix) {
  const colors = parseColorPlyData(colorPlyData, legacyColors, fallbackPlys);
  const rows = colors.length ? colors.map((entry) => cuttingColorPlyRow(entry.color, entry.plys, entry.name)).join("") : cuttingColorPlyRow("#000000", "", "");
  return `<div class="field color-picker cutting-color-ply-picker" data-color-ply-picker="${prefix}">
    <label>ألوان الفرشة وعدد الراقات لكل لون</label>
    <div class="color-ply-rows" data-color-ply-rows>${rows}</div>
    <button class="row-action" type="button" data-add-ply-color>＋ إضافة لون جديد</button>
    <input type="hidden" name="colors" data-color-value value="${escapeHtml(colors.map((entry) => entry.color).join(", "))}">
    <input type="hidden" name="colorPlyData" data-color-ply-value>
  </div>`;
}

function cuttingColorPlyRow(color, plys, name = "") {
  return `<div class="color-ply-row" data-color-ply-row>
    <label class="field"><span>اسم اللون</span><input type="text" data-ply-name maxlength="64" value="${escapeHtml(name)}"></label>
    <label class="field"><span>درجة اللون</span>${customColorControlMarkup(color, "data-ply-color")}</label>
    <label class="field"><span>عدد الراقات لهذا اللون</span><input type="number" data-ply-count min="1" step="1" value="${escapeHtml(plys)}"></label>
    <button class="row-action color-ply-remove" type="button" data-remove-ply-color aria-label="حذف اللون">حذف اللون</button>
  </div>`;
}

function updateCuttingCalculation(form) {
  const sizePicker = form.querySelector("[data-size-picker]");
  const sizeType = sizePicker.querySelector("[data-size-type]").value;
  const selectedSizeNames = new Set([...sizePicker.querySelectorAll(".size-option-group:not([hidden]) [data-size-toggle]")]
    .map((button) => button.dataset.sizeToggle));
  const selectedSizes = sizePicker.dataset.sizeDuplicates === "true"
    ? readSizePickerOrder(sizePicker).filter((size) => selectedSizeNames.has(size))
    : [...sizePicker.querySelectorAll(".size-option-group:not([hidden]) .size-toggle[aria-pressed='true']")]
      .map((button) => button.dataset.sizeToggle);
  if (sizePicker.dataset.sizeDuplicates === "true" && !selectedSizes.length) {
    [...sizePicker.querySelectorAll(".size-option-group:not([hidden]) .size-choice[data-size-occurrences]")]
      .forEach((choice) => {
        selectedSizes.push(...Array(Number(choice.dataset.occurrences || 0)).fill(choice.dataset.sizeOccurrences));
      });
  }
  const colorRows = [...form.querySelectorAll("[data-color-ply-row]")].map((row) => ({
    color: row.querySelector("[data-ply-color]").value.toUpperCase(),
    name: String(row.querySelector("[data-ply-name]").value).trim(),
    plys: Number(row.querySelector("[data-ply-count]").value)
  }));
  const validRows = colorRows.filter((entry) => entry.name && Number.isSafeInteger(entry.plys) && entry.plys > 0);
  const plysPerSize = validRows.reduce((sum, entry) => sum + entry.plys, 0);
  const counts = selectedSizes.reduce((result, size) => {
    result[size] = String(Number(result[size] || 0) + plysPerSize);
    return result;
  }, {});
  const sizeData = { type: sizeType, counts };
  if (sizePicker.dataset.sizeDuplicates === "true") {
    sizeData.sizes = selectedSizes;
    sizeData.multiplicities = selectedSizes.reduce((result, size) => {
      result[size] = Number(result[size] || 0) + 1;
      return result;
    }, {});
  }
  sizePicker.querySelector("[data-size-value]").value = sizeType ? JSON.stringify(sizeData) : "";
  const total = plysPerSize * selectedSizes.length;

  const picker = form.querySelector("[data-color-ply-picker]");
  const selectedColors = validRows.map((entry) => entry.color);
  picker.querySelector("[data-color-value]").value = [...new Set(selectedColors)].join(", ");
  picker.querySelector("[data-color-ply-value]").value = JSON.stringify({
    colors: validRows,
    sizes: selectedSizes,
    type: sizeType
  });
  const result = form.querySelector("[data-cutting-total]");
  if (result) result.textContent = new Intl.NumberFormat("ar-EG-u-nu-latn").format(total);
  const plysResult = form.querySelector("[data-cutting-plys]");
  if (plysResult) plysResult.textContent = new Intl.NumberFormat("ar-EG-u-nu-latn").format(plysPerSize);
  const breakdown = validRows
    .flatMap((entry) => selectedSizes.map((size) =>
      `<tr><td><span class="color-breakdown-swatch" style="--swatch-color:${escapeHtml(entry.color)}"></span>${escapeHtml(entry.name || "اسم اللون غير مسجل")}</td><td>${escapeHtml(size)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(entry.plys)}</td></tr>`
    ));
  const breakdownElement = form.querySelector("[data-cutting-breakdown]");
  if (breakdownElement) {
    breakdownElement.innerHTML = breakdown.length
      ? table(["اللون", "المقاس", "عدد القطع"], breakdown)
      : '<p class="muted">حدد المقاسات وأدخل عدد الراقات لكل لون لعرض التوزيع المحسوب.</p>';
  }
  return { sizeData, colorPlyData: { colors: colorRows, sizes: selectedSizes, type: sizeType }, colors: [...new Set(selectedColors)], total };
}

function parseColorNames(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed)
    .filter(([color, name]) => /^#[0-9A-F]{6}$/i.test(color) && typeof name === "string")
    .map(([color, name]) => [color.toUpperCase(), name.trim().slice(0, 64)]));
}

function colorPickerMarkup(value, prefix, colorNames = {}, includeColorNames = true) {
  const selected = String(value || "").split(",").map((color) => color.trim()).filter(Boolean);
  const normalizedNames = Object.fromEntries(Object.entries(colorNames)
    .filter(([color, name]) => /^#[0-9A-F]{6}$/i.test(color) && typeof name === "string")
    .map(([color, name]) => [color.toUpperCase(), name.trim().slice(0, 64)]));
  const choices = [...new Set(selected)].map((color) =>
    colorPickerChoice(color, normalizedNames[color.toUpperCase()] || "", includeColorNames)
  ).join("");
  return `<div class="field color-picker" data-color-picker="${prefix}" data-color-names-enabled="${includeColorNames}">
    <label>اختيار درجات الألوان</label>
    <div class="color-picker-controls">${customColorControlMarkup("#000000", "data-color-input")}<button class="row-action" type="button" data-add-color>إضافة لون آخر</button></div>
    <div class="color-swatch-list" data-color-list>${choices || '<span class="muted">لم يتم اختيار ألوان بعد.</span>'}</div>
    <input type="hidden" name="colors" data-color-value value="${escapeHtml(value || "")}">
    <input type="hidden" name="colorNames" data-color-names-value value="${escapeHtml(JSON.stringify(normalizedNames))}">
  </div>`;
}

function colorPickerChoice(color, name = "", includeColorName = true) {
  const isHex = /^#[0-9a-f]{6}$/i.test(color);
  const nameField = includeColorName
    ? `<label class="color-choice-name"><span>اسم اللون</span><input type="text" data-color-name maxlength="64" value="${escapeHtml(name)}" aria-label="اسم اللون"></label>`
    : "";
  return `<span class="color-choice" data-color-choice="${escapeHtml(color)}"><span class="color-choice-swatch"${isHex ? ` style="--swatch-color:${escapeHtml(color)}"` : ""}></span><span class="color-choice-value">${escapeHtml(name || "لون")}</span>${nameField}<button type="button" data-remove-color="${escapeHtml(color)}" aria-label="إزالة اللون">×</button></span>`;
}

function colorSummaryMarkup(colors, colorNames = {}, colorPlyData = null) {
  const names = {
    ...Object.fromEntries(parseColorPlyData(colorPlyData).map((entry) => [entry.color, entry.name]).filter(([, name]) => name)),
    ...parseColorNames(colorNames)
  };
  const entries = String(colors || "").split(",").map((color) => color.trim().toUpperCase())
    .filter((color) => color.length > 0);
  if (!entries.length) return "—";
  return `<span class="model-color-list">${entries.map((color) => {
    const isHex = /^#[0-9A-F]{6}$/.test(color);
    const label = names[color] || "اسم اللون غير مسجل";
    return `<span class="model-color-chip">${isHex ? `<span class="color-breakdown-swatch" style="--swatch-color:${escapeHtml(color)}"></span>` : ""}<strong>${escapeHtml(label)}</strong></span>`;
  }).join("")}</span>`;
}

function sizeSummary(value) {
  const sizeData = parseSizeData(value);
  const orderedSizes = sizeData.sizes.length
    ? sizeData.sizes
    : Object.entries(sizeData.multiplicities)
      .flatMap(([size, occurrences]) => Array(Math.max(Number(occurrences) || 0, 0)).fill(size));
  const occurrenceTotals = orderedSizes.reduce((totals, size) => {
    totals[size] = Number(totals[size] || 0) + 1;
    return totals;
  }, {});
  const countedSizes = orderedSizes
    .map((size) => {
      const total = Number(sizeData.counts[size] || 0);
      const count = total / occurrenceTotals[size];
      return count > 0 ? `${size}: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(count)}` : "";
    })
    .filter(Boolean);
  const totalPieces = Object.values(sizeData.counts).reduce((sum, count) => sum + Number(count || 0), 0);
  return countedSizes.length
    ? `${SIZE_TYPE_LABELS[sizeData.type] || ""} ${countedSizes.join(" · ")} · الإجمالي: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(totalPieces)} قطعة`.trim()
    : sizeData.legacy || "—";
}

function sizeBadgesMarkup(value) {
  const sizeData = parseSizeData(value);
  const sizes = orderedSizeEntries(sizeData);
  if (!sizes.length) {
    const legacySizes = sizeData.legacy.split(/[،,]/).map((size) => size.trim()).filter(Boolean);
    return legacySizes.length
      ? `<span class="size-summary-list">${legacySizes.map((size) => `<span class="size-summary-chip"><strong>${escapeHtml(size)}</strong></span>`).join("")}</span>`
      : "—";
  }
  const totals = sizes.reduce((result, size) => {
    result[size] = Number(result[size] || 0) + 1;
    return result;
  }, {});
  const occurrences = {};
  return `<span class="size-summary-list">${sizes.map((size) => {
    occurrences[size] = Number(occurrences[size] || 0) + 1;
    const sizeCount = Number(sizeData.counts[size] || 0);
    const count = Math.floor(sizeCount / totals[size])
      + (occurrences[size] <= sizeCount % totals[size] ? 1 : 0);
    const repeated = totals[size] > 1 ? ` · ${occurrences[size]}/${totals[size]}` : "";
    return `<span class="size-summary-chip"><strong>${escapeHtml(size)}${repeated}</strong><span>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(count)} قطعة</span></span>`;
  }).join("")}</span>`;
}

function updateSizePicker(root) {
  const typeSelect = root.querySelector("[data-size-type]");
  const selectedType = typeSelect.value;
  const previous = parseSizeData(root.querySelector("[data-size-value]").value);
  const previousOrder = orderedSizeEntries(previous);
  root.querySelectorAll("[data-size-group]").forEach((group) => {
    group.hidden = group.dataset.sizeGroup !== selectedType;
  });
  const selectedSizes = [...root.querySelectorAll(".size-option-group:not([hidden]) .size-toggle[aria-pressed='true']")]
    .map((button) => button.dataset.sizeToggle);
  const sizeData = { type: selectedType, counts: {} };
  if (root.dataset.sizeDuplicates === "true") {
    sizeData.multiplicities = {};
    sizeData.sizes = readSizePickerOrder(root).filter((size) => selectedSizes.includes(size));
    root.querySelectorAll(".size-option-group:not([hidden]) .size-choice[data-size-occurrences]").forEach((choice) => {
      const size = choice.dataset.sizeOccurrences;
      const occurrences = Number(choice.dataset.occurrences || 0);
      if (occurrences > 0) sizeData.multiplicities[size] = occurrences;
      const countInput = choice.querySelector("[data-size-count]");
      const count = root.dataset.autoQuantity === "true" ? 0 : Number(countInput?.value || previous.counts[size] || 0);
      if (occurrences > 0 && count > 0) sizeData.counts[size] = String(count);
    });
    root.querySelector("[data-size-value]").value = selectedType
      ? JSON.stringify(sizeData)
      : root.dataset.sizeLegacy;
    return;
  }
  const orderedSizes = previousOrder.filter((size) => selectedSizes.includes(size));
  selectedSizes.forEach((size) => {
    if (!orderedSizes.includes(size)) orderedSizes.push(size);
  });
  sizeData.sizes = orderedSizes;
  root.dataset.sizeOrder = JSON.stringify(orderedSizes);
  root.querySelectorAll(".size-option-group:not([hidden]) .size-toggle[aria-pressed='true']").forEach((button) => {
    if (root.dataset.autoQuantity === "true") {
      sizeData.counts[button.dataset.sizeToggle] = "0";
    } else {
      const input = root.querySelector(`[data-size-count="${CSS.escape(button.dataset.sizeToggle)}"]`);
      const value = input.value.trim();
      if (value) sizeData.counts[button.dataset.sizeToggle] = value;
    }
  });
  root.querySelector("[data-size-value]").value = selectedType
    ? JSON.stringify(sizeData)
    : root.dataset.sizeLegacy;
}

function sizePickerTotal(form) {
  const sizeField = form.querySelector("[data-size-value]");
  if (!sizeField?.value) return 0;
  const { counts } = parseSizeData(sizeField.value);
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

function updateColorPicker(root) {
  const choices = [...root.querySelectorAll("[data-color-choice]")];
  const selected = choices.map((choice) => choice.dataset.colorChoice);
  root.querySelector("[data-color-value]").value = [...new Set(selected)].join(", ");
  root.querySelector("[data-color-names-value]").value = JSON.stringify(Object.fromEntries(choices
    .map((choice) => [choice.dataset.colorChoice.toUpperCase(), String(choice.querySelector("[data-color-name]")?.value || "").trim()])
    .filter(([, name]) => name)));
}

function bindPickers(form) {
  form.querySelectorAll("[data-size-picker]").forEach((root) => {
    const update = () => {
      updateSizePicker(root);
      if (root.dataset.autoQuantity === "true") updateCuttingCalculation(root.closest("form"));
    };
    root.querySelector("[data-size-type]").addEventListener("change", update);
    root.querySelectorAll("[data-size-toggle]").forEach((button) => button.addEventListener("click", () => {
      if (root.dataset.sizeDuplicates === "true") {
        const choice = button.closest("[data-size-occurrences]");
        const occurrences = Math.min(Number(choice.dataset.occurrences || 0) + 1, 99);
        choice.dataset.occurrences = String(occurrences);
        root.dataset.sizeOrder = JSON.stringify([...readSizePickerOrder(root), button.dataset.sizeToggle]);
        choice.querySelector("[data-size-occurrence-count]").textContent = String(occurrences);
        choice.querySelector("[data-size-occurrence-remove]").disabled = false;
        button.setAttribute("aria-pressed", "true");
        choice.classList.add("active");
        update();
        return;
      }
      const pressed = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(pressed));
      button.closest(".size-choice").classList.toggle("active", pressed);
      const countLabel = button.nextElementSibling;
      if (countLabel?.matches(".size-count-label")) {
        const countInput = countLabel.querySelector("input");
        countLabel.hidden = !pressed;
        countInput.disabled = !pressed;
        if (!pressed) countInput.value = "";
      }
      update();
    }));
    root.querySelectorAll("[data-size-occurrence-remove]").forEach((button) => button.addEventListener("click", () => {
      const choice = button.closest("[data-size-occurrences]");
      const occurrences = Math.max(Number(choice.dataset.occurrences || 0) - 1, 0);
      choice.dataset.occurrences = String(occurrences);
      const sizeOrder = readSizePickerOrder(root);
      const lastOccurrence = sizeOrder.lastIndexOf(button.dataset.sizeOccurrenceRemove);
      if (lastOccurrence >= 0) sizeOrder.splice(lastOccurrence, 1);
      root.dataset.sizeOrder = JSON.stringify(sizeOrder);
      choice.querySelector("[data-size-occurrence-count]").textContent = String(occurrences);
      button.disabled = occurrences === 0;
      choice.querySelector("[data-size-toggle]").setAttribute("aria-pressed", String(occurrences > 0));
      choice.classList.toggle("active", occurrences > 0);
      update();
    }));
    root.querySelectorAll("[data-size-count]").forEach((input) => input.addEventListener("input", () => updateSizePicker(root)));
    updateSizePicker(root);
  });
  form.querySelectorAll("[data-color-picker]").forEach((root) => {
    const renderColors = () => {
      const list = root.querySelector("[data-color-list]");
      const names = Object.fromEntries([...root.querySelectorAll("[data-color-choice]")].map((choice) =>
        [choice.dataset.colorChoice, String(choice.querySelector("[data-color-name]")?.value || "").trim()]
      ));
      const colors = [...new Set([...root.querySelectorAll("[data-color-choice]")].map((choice) => choice.dataset.colorChoice))];
      const includeNames = root.dataset.colorNamesEnabled !== "false";
      list.innerHTML = colors.length
        ? colors.map((color) => colorPickerChoice(color, names[color], includeNames)).join("")
        : '<span class="muted">لم يتم اختيار ألوان بعد.</span>';
      colors.forEach((color, index) => {
        const input = list.querySelectorAll("[data-color-name]")[index];
        if (input) input.value = names[color] || "";
      });
      updateColorPicker(root);
    };
    root.querySelector("[data-add-color]").addEventListener("click", () => {
      const color = root.querySelector("[data-color-input]").value.toUpperCase();
      const selectedColors = [...root.querySelectorAll("[data-color-choice]")].map((choice) => choice.dataset.colorChoice);
      if (!selectedColors.includes(color)) {
        const list = root.querySelector("[data-color-list]");
        list.querySelector(".muted")?.remove();
        list.insertAdjacentHTML("beforeend", colorPickerChoice(color, ""));
      }
      renderColors();
    });
    root.addEventListener("input", (event) => {
      if (event.target.matches("[data-color-name]")) updateColorPicker(root);
    });
    root.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-color]");
      if (!removeButton) return;
      removeButton.closest("[data-color-choice]").remove();
      renderColors();
    });
    updateColorPicker(root);
  });
  form.querySelectorAll("[data-color-ply-picker]").forEach((picker) => {
    const update = () => updateCuttingCalculation(picker.closest("form"));
    picker.addEventListener("input", (event) => {
      if (event.target.matches("[data-ply-color], [data-ply-count], [data-ply-name]")) update();
    });
    picker.addEventListener("click", (event) => {
      if (event.target.closest("[data-add-ply-color]")) {
        picker.querySelector("[data-color-ply-rows]").insertAdjacentHTML("beforeend", cuttingColorPlyRow("#000000", "", ""));
        update();
      }
      if (event.target.closest("[data-remove-ply-color]")) {
        const rows = picker.querySelectorAll("[data-color-ply-row]");
        if (rows.length === 1) {
          const row = rows[0];
          row.querySelector("[data-ply-name]").value = "";
          row.querySelector("[data-ply-color]").value = "#000000";
          row.querySelector("[data-ply-count]").value = "";
        } else {
          event.target.closest("[data-color-ply-row]").remove();
        }
        update();
      }
    });
    update();
  });
  form.addEventListener("reset", () => window.setTimeout(() => {
    if (form.elements.editIndex.value) return;
    form.querySelectorAll("[data-size-picker]").forEach((root) => {
      root.dataset.sizeLegacy = "";
      root.querySelectorAll("[data-size-toggle]").forEach((button) => {
        button.setAttribute("aria-pressed", "false");
        button.closest(".size-choice").classList.remove("active");
        const choice = button.closest("[data-size-occurrences]");
        if (choice) {
          choice.dataset.occurrences = "0";
          choice.querySelector("[data-size-occurrence-count]").textContent = "0";
          choice.querySelector("[data-size-occurrence-remove]").disabled = true;
        }
        const countLabel = button.nextElementSibling;
        if (countLabel?.matches(".size-count-label")) {
          countLabel.hidden = true;
          const input = countLabel.querySelector("input");
          input.disabled = true;
          input.value = "";
        }
      });
      updateSizePicker(root);
    });
    form.querySelectorAll("[data-color-picker]").forEach((root) => {
      root.querySelector("[data-color-list]").innerHTML = '<span class="muted">لم يتم اختيار ألوان بعد.</span>';
      updateColorPicker(root);
    });
    form.querySelectorAll("[data-color-ply-picker]").forEach((picker) => {
      picker.querySelector("[data-color-ply-rows]").innerHTML = cuttingColorPlyRow("#000000", "", "");
      updateCuttingCalculation(picker.closest("form"));
    });
    if (form.querySelector("[data-model-allocation-grid]")) {
      renderModelAllocation(form, { colors: [] });
    }
  }));
}

function setSizePicker(root, value) {
  const data = parseSizeData(value);
  root.dataset.sizeLegacy = data.legacy;
  root.querySelector("[data-size-type]").value = data.type;
  const sizeOrder = orderedSizeEntries(data);
  root.dataset.sizeOrder = JSON.stringify(sizeOrder);
  root.querySelectorAll("[data-size-toggle]").forEach((button) => {
    const size = button.dataset.sizeToggle;
    const choice = button.closest(".size-choice");
    const selected = root.dataset.sizeDuplicates === "true"
      ? Number(data.multiplicities[size] || sizeOrder.filter((entry) => entry === size).length) > 0
      : Object.hasOwn(data.counts, size);
    button.setAttribute("aria-pressed", String(selected));
    choice.classList.toggle("active", selected);
    if (root.dataset.sizeDuplicates === "true") {
      const occurrences = Number(data.multiplicities[size] || sizeOrder.filter((entry) => entry === size).length);
      choice.dataset.occurrences = String(occurrences);
      choice.querySelector("[data-size-occurrence-count]").textContent = String(occurrences);
      choice.querySelector("[data-size-occurrence-remove]").disabled = occurrences === 0;
    }
    const label = button.nextElementSibling;
    if (label?.matches(".size-count-label")) {
      const input = label.querySelector("input");
      label.hidden = !selected;
      input.disabled = !selected;
      input.value = selected ? data.counts[size] || "" : "";
    }
  });
  updateSizePicker(root);
}

function setColorPicker(root, value, colorNames = {}) {
  const colors = String(value || "").split(",").map((color) => color.trim()).filter(Boolean);
  const names = parseColorNames(colorNames);
  const includeNames = root.dataset.colorNamesEnabled !== "false";
  root.querySelector("[data-color-list]").innerHTML = colors.length
    ? [...new Set(colors)].map((color) => colorPickerChoice(color, names[color.toUpperCase()] || "", includeNames)).join("")
    : '<span class="muted">لم يتم اختيار ألوان بعد.</span>';
  updateColorPicker(root);
}

function renderModelAllocation(form, distribution) {
  const grid = form.querySelector("[data-model-allocation-grid]");
  const input = form.elements.colorSizeDistribution;
  if (!grid || !input) return;
  const colors = Array.isArray(distribution?.colors) ? distribution.colors : [];
  input.value = JSON.stringify({ colors });
  if (!colors.length) {
    grid.innerHTML = '<p class="muted">أدخل العدد الكلي واختر الألوان والمقاسات لعرض التوزيع.</p>';
    return;
  }
  const sizes = [...new Set(colors.flatMap((entry) => Object.keys(entry.sizes || {})))];
  grid.innerHTML = table(
    ["اللون", ...sizes, "الإجمالي"],
    colors.map((entry) => {
      const counts = sizes.map((size) => Number(entry.sizes?.[size] || 0));
      const total = counts.reduce((sum, count) => sum + count, 0);
      return `<tr><td><span class="model-color-chip"><span class="color-breakdown-swatch" style="--swatch-color:${escapeHtml(entry.color)}"></span><strong>${escapeHtml(entry.name)}</strong></span></td>${counts.map((count) => `<td>${new Intl.NumberFormat("en-US").format(count)}</td>`).join("")}<td><strong>${new Intl.NumberFormat("en-US").format(total)}</strong></td></tr>`;
    })
  );
}

function distributeModelQuantity(form, useEnteredTotal = true) {
  const sizePicker = form.querySelector("[data-size-picker]");
  const selectedSizes = [...sizePicker.querySelectorAll(".size-option-group:not([hidden]) .size-toggle[aria-pressed='true']")]
    .map((button) => button.dataset.sizeToggle);
  const colorPicker = form.querySelector("[data-color-picker]");
  const selectedColors = [...colorPicker.querySelectorAll("[data-color-choice]")].map((choice) => ({
    color: choice.dataset.colorChoice.toUpperCase(),
    name: String(choice.querySelector("[data-color-name]").value).trim()
  }));
  const countInputs = new Map([...sizePicker.querySelectorAll(".size-option-group:not([hidden]) [data-size-count]")]
    .map((input) => [input.dataset.sizeCount, input]));
  const enteredTotal = Number(form.elements.quantity.value || 0);
  const sizeCounts = new Map();
  if (useEnteredTotal && Number.isSafeInteger(enteredTotal) && enteredTotal > 0 && selectedSizes.length) {
    const cellCount = selectedSizes.length * Math.max(selectedColors.length, 1);
    let cellIndex = 0;
    for (const size of selectedSizes) {
      let count = 0;
      for (let colorIndex = 0; colorIndex < Math.max(selectedColors.length, 1); colorIndex += 1) {
        count += Math.floor(enteredTotal / cellCount) + (cellIndex < enteredTotal % cellCount ? 1 : 0);
        cellIndex += 1;
      }
      sizeCounts.set(size, count);
    }
    for (const size of selectedSizes) {
      const input = countInputs.get(size);
      if (input) input.value = String(sizeCounts.get(size));
    }
    updateSizePicker(sizePicker);
  } else if (useEnteredTotal && enteredTotal === 0) {
    for (const size of selectedSizes) {
      const input = countInputs.get(size);
      if (input) input.value = "";
      sizeCounts.set(size, 0);
    }
    updateSizePicker(sizePicker);
  } else {
    for (const size of selectedSizes) {
      sizeCounts.set(size, Number(countInputs.get(size)?.value || 0));
    }
  }
  const quantityTotal = [...sizeCounts.values()].reduce((sum, count) => sum + count, 0);
  if (!useEnteredTotal && quantityTotal > 0) form.elements.quantity.value = String(quantityTotal);
  if (!selectedSizes.length || !selectedColors.length || quantityTotal <= 0) {
    renderModelAllocation(form, { colors: [] });
    return;
  }
  const colors = selectedColors.map((entry) => ({ ...entry, sizes: {} }));
  for (const size of selectedSizes) {
    const sizeTotal = sizeCounts.get(size) || 0;
    colors.forEach((entry, index) => {
      entry.sizes[size] = Math.floor(sizeTotal / colors.length) + (index < sizeTotal % colors.length ? 1 : 0);
    });
  }
  renderModelAllocation(form, { colors });
}

async function uploadModelImage(orderId, file) {
  if (!file) return null;
  const path = await uploadFactoryModelImage(`${orderId}`, file);
  const imageUrl = supabaseClient.storage.from("factory-model-images").getPublicUrl(path).data.publicUrl;
  if (!imageUrl) throw new Error("تم رفع الصورة لكن تعذر إنشاء رابط عرضها من التخزين.");
  return imageUrl;
}

async function deleteOrderModelImage(imageUrl, orderId) {
  if (!imageUrl) return;
  const publicPath = "/storage/v1/object/public/factory-model-images/";
  const imagePath = new URL(imageUrl).pathname;
  const bucketPathIndex = imagePath.indexOf(publicPath);
  if (bucketPathIndex === -1) return;
  const objectPath = decodeURIComponent(imagePath.slice(bucketPathIndex + publicPath.length));
  if (!objectPath.startsWith(`${orderId}/`)) return;
  const { error } = await supabaseClient.storage.from("factory-model-images").remove([objectPath]);
  if (error) throw error;
}

async function uploadWorkerProductionImage(workerId, file) {
  if (!file) return null;
  return uploadFactoryModelImage(`worker-submissions/${workerId}`, file);
}

async function uploadFactoryModelImage(directory, file) {
  const maxSize = 25 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error("حجم الصورة يتجاوز الحد الأقصى المسموح به وهو 25 ميجابايت.");
  }
  const extension = file.name.match(/\.([a-z0-9]{1,12})$/i)?.[1].toLowerCase();
  const inferredContentType = extension === "jpg" || extension === "jpeg"
    ? "image/jpeg"
    : extension === "svg"
      ? "image/svg+xml"
      : extension
        ? `image/${extension}`
        : "application/octet-stream";
  const path = `${directory}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const { error } = await supabaseClient.storage.from("factory-model-images").upload(path, file, {
    contentType: file.type || inferredContentType,
    upsert: false
  });
  if (error) throw error;
  return path;
}

async function deleteFactoryModelImages() {
  const bucket = supabaseClient.storage.from("factory-model-images");
  const paths = [];
  const listDirectory = async (directory) => {
    const entries = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(directory, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" }
      });
      if (error) throw new Error(`تعذر استعراض مجلد الصور ${directory || "الرئيسي"}: ${error.message}`);
      entries.push(...data);
      if (data.length < 1000) break;
    }

    for (const entry of entries) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (!entry.id) await listDirectory(path);
      else paths.push(path);
    }
  };

  await listDirectory("");
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await bucket.remove(paths.slice(offset, offset + 100));
    if (error) throw new Error(`تعذر حذف صور الموديلات من التخزين: ${error.message}`);
  }
}

function modelImageMarkup(url, label = "صورة القطعة", imageClass = "") {
  const imageUrls = Array.isArray(url) ? url.filter(Boolean) : url ? [url] : [DEFAULT_MODEL_IMAGE_URL];
  if (!imageUrls.length) return "";
  const images = imageUrls.map((imageUrl, index) => {
    const imageLabel = imageUrls.length > 1 ? `${label} ${index + 1}` : label;
    return `<button class="model-image-trigger${imageClass ? ` ${escapeHtml(imageClass)}-trigger` : ""}" type="button" data-model-image-lightbox="${escapeHtml(imageUrl)}" data-image-alt="${escapeHtml(imageLabel)}" aria-label="تكبير ${escapeHtml(imageLabel)}"><img class="model-thumbnail${imageClass ? ` ${escapeHtml(imageClass)}` : ""}" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageLabel)}" loading="lazy"></button>`;
  }).join("");
  return imageUrls.length > 1 ? `<span class="model-image-gallery">${images}</span>` : images;
}

function imagePickerMarkup(name, buttonLabel = "إضافة صورة", options = {}) {
  const { required = false, capture = "", helpText = "" } = options;
  return `<div class="image-picker-control"><input class="image-picker-input" type="file" name="${escapeHtml(name)}" accept="image/*"${capture ? ` capture="${escapeHtml(capture)}"` : ""}${required ? " required" : ""} data-image-picker><button class="button image-picker-button" type="button" data-image-picker-trigger aria-label="${escapeHtml(buttonLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17 5-5 3 3 2-2 4 4"/></svg><span>${escapeHtml(buttonLabel)}</span></button><span class="image-picker-filename" data-image-picker-filename>لم يتم اختيار صورة</span>${helpText ? `<small>${escapeHtml(helpText)}</small>` : ""}</div>`;
}

function bindImagePickerControls() {
  if (document.documentElement.dataset.imagePickerBound === "true") return;
  document.documentElement.dataset.imagePickerBound = "true";
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-image-picker-trigger]");
    if (!trigger) return;
    trigger.closest(".image-picker-control")?.querySelector("[data-image-picker]")?.click();
  });
  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-image-picker]");
    if (!input) return;
    const filename = input.closest(".image-picker-control")?.querySelector("[data-image-picker-filename]");
    if (filename) filename.textContent = input.files?.[0]?.name || "لم يتم اختيار صورة";
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDateOnly(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return escapeHtml(value);
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(year, month - 1, day, 12));
}

function formatRecordDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    ? formatDateOnly(value)
    : formatDateTime(value);
}

function customColorControlMarkup(color, attributes) {
  const selectedColor = /^#[0-9A-F]{6}$/i.test(color) ? color.toUpperCase() : "#000000";
  return `<button class="custom-color-trigger" type="button" data-custom-color-trigger aria-label="اختيار درجة اللون"><i data-color-preview style="--swatch-color:${selectedColor}"></i></button><input type="hidden" ${attributes} value="${selectedColor}">`;
}

function syncCustomColorTrigger(field) {
  const color = /^#[0-9A-F]{6}$/i.test(field.value) ? field.value.toUpperCase() : "#000000";
  field.value = color;
  const trigger = field.parentElement.querySelector("[data-custom-color-trigger]");
  if (!trigger) return;
  trigger.querySelector("[data-color-preview]").style.setProperty("--swatch-color", color);
}

function hexToHsv(hex) {
  const normalized = /^#[0-9A-F]{6}$/i.test(hex) ? hex.slice(1) : "000000";
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return {
    h: (hue + 360) % 360,
    s: maximum === 0 ? 0 : delta / maximum,
    v: maximum
  };
}

function hsvToHex({ h, s, v }) {
  const chroma = v * s;
  const segment = h / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const offset = v - chroma;
  return `#${[red, green, blue].map((value) =>
    Math.round((value + offset) * 255).toString(16).padStart(2, "0")
  ).join("")}`.toUpperCase();
}

function bindCustomColorPickers() {
  if (document.querySelector("[data-custom-color-modal]")) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop custom-color-modal" data-custom-color-modal hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="custom-color-title"><button class="modal-close" type="button" data-close-custom-color aria-label="إغلاق">×</button><h2 id="custom-color-title">اختيار درجة اللون</h2><p>حرّك المؤشر على عجلة الألوان، ثم اختر درجة التشبع والسطوع.</p><div class="custom-color-controls"><div class="custom-color-wheel-wrap"><div class="custom-color-wheel" data-color-wheel role="slider" aria-label="عجلة الألوان" aria-valuemin="0" aria-valuemax="359" tabindex="0"><i data-color-wheel-marker></i></div></div><div class="custom-color-shade" data-color-shade role="slider" aria-label="تشبع اللون وسطوعه" aria-valuemin="0" aria-valuemax="100" tabindex="0"><i data-color-shade-marker></i></div></div><div class="custom-color-value-row"><i data-color-result-swatch></i><span>اللون المحدد</span></div><div class="form-actions"><button class="button button-primary" type="button" data-confirm-custom-color>اختيار اللون</button><button class="row-action" type="button" data-close-custom-color>إلغاء</button></div></section></div>`);
  const modal = document.querySelector("[data-custom-color-modal]");
  let activeTrigger = null;
  let hsv = { h: 0, s: 0, v: 0 };
  const wheel = modal.querySelector("[data-color-wheel]");
  const shade = modal.querySelector("[data-color-shade]");
  const close = () => {
    modal.hidden = true;
    activeTrigger = null;
  };
  const renderColor = () => {
    const color = hsvToHex(hsv);
    shade.style.setProperty("--hue-color", `hsl(${hsv.h} 100% 50%)`);
    modal.querySelector("[data-color-wheel-marker]").style.setProperty("--hue-angle", `${hsv.h}deg`);
    modal.querySelector("[data-color-shade-marker]").style.setProperty("--shade-x", `${hsv.s * 100}%`);
    modal.querySelector("[data-color-shade-marker]").style.setProperty("--shade-y", `${(1 - hsv.v) * 100}%`);
    modal.querySelector("[data-color-result-swatch]").style.setProperty("--swatch-color", color);
    wheel.setAttribute("aria-valuenow", String(Math.round(hsv.h)));
    shade.setAttribute("aria-valuenow", String(Math.round(hsv.s * 100)));
  };
  const setHueFromPointer = (event) => {
    const bounds = wheel.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    hsv.h = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    renderColor();
  };
  const setShadeFromPointer = (event) => {
    const bounds = shade.getBoundingClientRect();
    hsv.s = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    hsv.v = 1 - Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    renderColor();
  };
  const bindDragPicker = (element, update) => {
    let dragging = false;
    element.addEventListener("pointerdown", (event) => {
      dragging = true;
      element.setPointerCapture(event.pointerId);
      update(event);
      event.preventDefault();
    });
    element.addEventListener("pointermove", (event) => {
      if (dragging) update(event);
    });
    element.addEventListener("pointerup", () => { dragging = false; });
    element.addEventListener("pointercancel", () => { dragging = false; });
    element.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      if (element === wheel) {
        hsv.h = (hsv.h + (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1) + 360) % 360;
      } else {
        const step = event.shiftKey ? 0.1 : 0.01;
        if (event.key === "ArrowLeft") hsv.s = Math.max(0, hsv.s - step);
        if (event.key === "ArrowRight") hsv.s = Math.min(1, hsv.s + step);
        if (event.key === "ArrowUp") hsv.v = Math.min(1, hsv.v + step);
        if (event.key === "ArrowDown") hsv.v = Math.max(0, hsv.v - step);
      }
      renderColor();
    });
  };
  bindDragPicker(wheel, setHueFromPointer);
  bindDragPicker(shade, setShadeFromPointer);
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-custom-color-trigger]");
    if (trigger) {
      activeTrigger = trigger;
      const field = trigger.parentElement.querySelector('input[type="hidden"]');
      hsv = hexToHsv(field?.value || "#000000");
      renderColor();
      modal.hidden = false;
      wheel.focus();
      return;
    }
    if (event.target.closest("[data-close-custom-color]") || event.target === modal) {
      close();
      return;
    }
    if (event.target.closest("[data-confirm-custom-color]")) {
      const color = hsvToHex(hsv);
      if (!activeTrigger) return;
      const field = activeTrigger.parentElement.querySelector('input[type="hidden"]');
      if (!field) return;
      field.value = color;
      activeTrigger.querySelector("[data-color-preview]").style.setProperty("--swatch-color", color);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    }
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("reset", (event) => {
    window.setTimeout(() => event.target.querySelectorAll('input[type="hidden"][name="colorHex"]').forEach(syncCustomColorTrigger));
  }, true);
}

function statusClass(value) {
  if (String(value).startsWith("قيد الفرش")
    || ["قيد المراجعة", "قيد التنفيذ", "قيد الخياطة", "قيد الإنتاج", "قيد الانتظار", "معلق", "تحت الإنشاء", "تم الفرش", "جاهز للقص", "في انتظار الخياطة", "جاري الخياطة", "جاري التشطيب", "جاري المكواة", "جاري الطباعة", "جاري التكييس", "جاري الفرز", "معلق - في انتظار الخياطة", "جار العمل"].includes(value)) return "warning";
  if (["جديدة", "جاهز للتسليم", "تم القص", "تم التشطيب", "تم الكي", "تمت الطباعة", "تم التكييس", "تم الفرز", "في الخياطة", "متاح للخياطة", "متاح للإمبلاج / التعبئة"].includes(value)) return "info";
  if (value === "جاهز للتسليم" || value === "تمت الخياطة" || value === "تم التسليم" || value === "تم التسليم بالكامل" || value === "تم التسليم والإغلاق") return "";
  return "muted";
}

function statusTag(value) {
  return `<span class="status ${statusClass(value)}">${escapeHtml(value)}</span>`;
}

function workStageLabels(stages) {
  const selected = new Set(Array.isArray(stages) ? stages : []);
  return WORK_STAGES.filter(([key]) => selected.has(key)).map(([, label]) => label);
}

function readStagePrices(form) {
  try {
    const value = JSON.parse(String(form.elements.stagePrices.value || "{}"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function updateStagePricing(form, initialPrices = readStagePrices(form)) {
  const selectedStages = [...form.querySelectorAll('[name="workStage"]:checked')].map((input) => input.value);
  const mode = form.elements.pricingMode.value;
  const field = form.querySelector("[data-stage-prices-field]");
  const list = form.querySelector("[data-stage-prices-list]");
  const priceInput = form.elements.pricePerPiece;
  field.hidden = mode !== "stages";
  priceInput.readOnly = mode === "stages";
  if (mode !== "stages") {
    list.querySelectorAll("input").forEach((input) => { input.disabled = true; });
    form.elements.stagePrices.value = "{}";
    return;
  }
  list.innerHTML = selectedStages.length
    ? selectedStages.map((stage) => {
      const label = WORK_STAGES.find(([key]) => key === stage)?.[1] || stage;
      const rawValue = initialPrices[stage];
      const hasValue = Object.hasOwn(initialPrices, stage) && rawValue !== "" && rawValue !== null;
      const value = Number(rawValue);
      return `<label class="stage-price-row"><span>${escapeHtml(label)}</span><input type="number" min="0" max="9999999999.99" step="0.01" data-stage-price="${escapeHtml(stage)}" value="${hasValue && Number.isFinite(value) ? value : ""}" required aria-label="سعر القطعة لقسم ${escapeHtml(label)}"></label>`;
    }).join("")
    : '<p class="muted">اختر قسماً واحداً على الأقل أولاً.</p>';
  const prices = Object.fromEntries([...list.querySelectorAll("[data-stage-price]")]
    .map((input) => [input.dataset.stagePrice, input.value.trim() ? Number(input.value) : ""]));
  form.elements.stagePrices.value = JSON.stringify(prices);
  priceInput.value = String(roundMoney(Object.values(prices).reduce((sum, price) => sum + Number(price || 0), 0)));
}

function syncStagePriceInputs(form) {
  const inputs = [...form.querySelectorAll("[data-stage-price]")];
  const prices = Object.fromEntries(inputs.map((input) => [
    input.dataset.stagePrice,
    input.value.trim() ? Number(input.value) : ""
  ]));
  form.elements.stagePrices.value = JSON.stringify(prices);
  form.elements.pricePerPiece.value = String(roundMoney(Object.values(prices).reduce((sum, price) => sum + Number(price || 0), 0)));
}

function syncOrderCustomerSelection(form, customerId = form.elements.customerId.value, source = "customerSelection") {
  form.elements.customerId.value = customerId || "";
  form.elements.customerSelection.value = source === "customerSelection" ? customerId || "" : "";
  form.elements.brandSelection.value = source === "brandSelection" ? customerId || "" : "";
}

function table(headers, rows, className = "") {
  if (typeof rows === "string") {
    rows = rows.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  }
  if (!Array.isArray(rows)) {
    const rowType = rows === null ? "null" : typeof rows;
    const rowKeys = rows && typeof rows === "object" ? Object.keys(rows).slice(0, 8).join(", ") : "";
    const message = `تعذر عرض جدول (${headers.map((heading) => String(heading).replace(/<[^>]*>/g, "")).join("، ")}): البيانات ليست قائمة (${rowType}${rowKeys ? `؛ المفاتيح: ${rowKeys}` : ""}).`;
    console.error(message, rows);
    return `<div class="notice" role="alert">${escapeHtml(message)}</div>`;
  }
  if (!rows.length) return '<div class="empty-state">لا توجد بيانات لعرضها حاليًا.</div>';
  const labeledRows = rows.map((row) => {
    let cellIndex = 0;
    return row.replace(/<td\b([^>]*)>/g, (cell, attributes) => {
      const heading = headers[cellIndex++];
      if (/\bdata-label\s*=/.test(attributes)) return cell;
      const label = String(heading || "").replace(/<[^>]*>/g, "");
      return `<td${attributes} data-label="${escapeHtml(label)}">`;
    });
  });
  return `<div class="table-wrap${className ? ` ${escapeHtml(className)}-wrap` : ""}"><table${className ? ` class="${escapeHtml(className)}"` : ""}><thead><tr>${headers.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead><tbody>${labeledRows.join("")}</tbody></table></div>`;
}

function panel(title, content, subtitle = "", id = "") {
  return `<section class="panel"${id ? ` id="${id}"` : ""}><div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div>${content}</section>`;
}

function stat(label, value, note = "", details = "") {
  if (!details) {
    return `<article class="stat-card"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}</article>`;
  }
  return `<article class="stat-card stat-card-popover"><div class="stat-card-summary"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}<small class="stat-card-hint">مرر لعرض التفاصيل</small></div><div class="stat-popover">${details}</div></article>`;
}

function statDetailList(items, emptyMessage = "لا توجد تفاصيل مسجلة.") {
  return items.length
    ? `<ul class="stat-detail-list">${items.map((item) => `<li><span><strong>${escapeHtml(item.label)}</strong>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</span><b>${escapeHtml(item.value)}</b></li>`).join("")}</ul>`
    : `<p class="stat-detail-empty">${escapeHtml(emptyMessage)}</p>`;
}

function orderCanBeDeleted(item) {
  const unstartedStageStatuses = new Set(["", "معلق", "قيد الانتظار", "بانتظار"]);
  return Boolean(item)
    && !item.archivedAt
    && !item.workflowArchivedAt
    && item.status === "قيد الانتظار"
    && Number(item.paidAmount || 0) === 0
    && Number(item.operationalExpenses || 0) === 0
    && Number(item.deliveredPieces || 0) === 0
    && !(item.deliveryHistory || []).length
    && !(item.expenseEntries || []).length
    && Number(item.completedPieces || 0) === 0
    && Number(item.cut || 0) === 0
    && Number(item.cuttingPlys || item.layerCount || 0) === 0
    && !item.fabricId
    && !item.fabric
    && !item.cutterName
    && unstartedStageStatuses.has(item.cuttingStageStatus || "");
}

function orderCards(models, withActions = false) {
  if (!models.length) return '<div class="empty-state">لا توجد طلبيات لعرضها حاليًا.</div>';
  return `<div class="order-cards">${models.map((item) => {
    const index = dashboardData.models.findIndex((order) => order.id === item.id);
    const canMakeSewingAvailable = withActions
      && !item.archivedAt
      && ["مكتمل", "تم القص"].includes(item.cuttingStageStatus)
      && !["متاح للخياطة", "قيد الخياطة", "مكتمل"].includes(item.sewingStageStatus);
    return `<article class="order-card order-compact-row">
      <header class="production-compact-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<h3>${escapeHtml(item.name || "موديل بدون اسم")}</h3></header>
      <strong class="production-compact-total">${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity)} قطعة</strong>
      <div class="production-compact-facts"><div><span>الألوان</span>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</div><div><span>المقاسات</span>${sizeBadgesMarkup(item.sizes)}</div></div>
      ${withActions ? `<button class="row-action order-expense-trigger" type="button" data-add-model-expense="${escapeHtml(item.id)}">＋ إضافة مصروف خارجي</button>` : ""}
      <button class="row-action" type="button" data-open-model-id="${escapeHtml(item.id)}">التفاصيل</button>
      ${withActions ? `<div class="order-card-actions">${canMakeSewingAvailable ? `<button class="button button-secondary" type="button" data-make-sewing-available="${escapeHtml(item.id)}">إدخال للخياطة</button>` : ""}${item.archivedAt || item.workflowArchivedAt ? "" : `<button class="row-action" type="button" data-edit-kind="models" data-index="${index}">تعديل</button>`}${item.customerId ? `${item.archivedAt || item.workflowArchivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(item.status) ? "" : `<button class="row-action" type="button" data-action="record-delivery" data-index="${index}"${item.remainingPieces > 0 ? "" : " disabled"}>تسجيل تسليم</button><button class="row-action order-close-action" type="button" data-action="complete-handover" data-index="${index}"${item.quantity ? "" : " disabled"}>تسوية التسليم وإغلاق الطلب</button>`}` : '<span class="order-delete-protected">عيّن العميل قبل تسجيل أي تسليم</span>'}${item.workflowArchivedAt ? '<span class="status">مؤرشف تشغيلياً</span>' : ""}${item.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(item.status) ? '<span class="status">مغلق / تم التسليم</span>' : ""}${orderCanBeDeleted(item) ? `<button class="row-action order-delete-action" type="button" data-action="delete-order" data-order-id="${escapeHtml(item.id)}">حذف الموديل</button>` : !item.archivedAt && !item.workflowArchivedAt ? `<button class="row-action" type="button" data-archive-factory-order="${escapeHtml(item.id)}">إيقاف / أرشفة</button>` : ""}</div>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function orderProgress(status, workStages = []) {
  const stages = factoryOrderStatusSequence({ workStages });
  const activeStatus = canonicalFactoryOrderStatus(status);
  const activeIndex = Math.max(0, stages.indexOf(activeStatus));
  const steps = stages.map((stage, index) => `<span class="order-progress-step${index <= activeIndex ? " complete" : ""}${index === activeIndex ? " current" : ""}">${stage}</span>`).join("");
  return `<div class="order-progress" aria-label="تقدم الطلب: ${escapeHtml(activeStatus)}">${steps}</div>`;
}

function clientOrderRows(orders) {
  return orders.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</td><td>${escapeHtml(item.sizes || "—")}</td><td>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity) : "بانتظار الحصر"}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.deliveredPieces)}</td><td>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.remainingPieces) : "بانتظار الحصر"}</td><td>${statusTag(item.displayStatus || item.status)}</td><td>${orderProgress(item.status, item.workStages)}</td></tr>`);
}

function clientOrderCards(orders) {
  if (!orders.length) return '<div class="empty-state">لا توجد طلبيات لعرضها حاليًا.</div>';
  return `<div class="order-cards">${orders.map((item) => `<article class="order-card client-order-card">
    <header class="order-card-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<div><p class="order-card-label">كود الموديل بالنظام: ${escapeHtml(item.factoryModelCode || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(item.clientModelCode || "—")}</p><h3>${escapeHtml(item.name || "موديل بدون اسم")}</h3></div>${statusTag(item.displayStatus || item.status)}</header>
    <dl class="order-card-details">
      ${item.cutterName ? `<div><dt>مين اللي قص القصة؟</dt><dd>${escapeHtml(item.cutterName)}</dd></div>` : ""}
      <div><dt>الخامة المستخدمة</dt><dd>${escapeHtml(item.fabric || item.externalFabricSource || "—")}</dd></div>
      <div><dt>كمية القماش والأتواب</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(item.fabricQuantity || 0)} ${escapeHtml(item.fabricUnit || "متر")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.boltCount || 0)} توب</dd></div>
      <div><dt>الراقات</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.layerCount || item.cuttingPlys || 0)}</dd></div>
      <div><dt>العدد المطلوب الأصلي</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.originalQuantity)}</dd></div><div><dt>العدد الفعلي بعد القص</dt><dd>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity) : "بانتظار الحصر"}</dd></div><div><dt>الكمية المنجزة</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.completedPieces)}</dd></div>
      <div><dt>الكمية المسلّمة</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.deliveredPieces)}</dd></div><div><dt>المتبقي</dt><dd>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.remainingPieces) : "بانتظار الحصر بعد القص"}</dd></div>
      ${["تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"].includes(item.status) ? `<div><dt>فرق التسليم عن العدد المطلوب الأصلي</dt><dd>${item.quantityDifference > 0 ? `زيادة ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantityDifference)} قطعة` : item.quantityDifference < 0 ? `نقص ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Math.abs(item.quantityDifference))} قطعة` : "مطابق للعدد المطلوب"}</dd></div>` : ""}
      ${item.senderName ? `<div><dt>تم الإرسال بواسطة</dt><dd>${escapeHtml(item.senderName)}</dd></div>` : ""}
      <div><dt>سعر القطعة</dt><dd>${money(item.pricePerPiece)}</dd></div><div><dt>المتوقع للكمية غير المسلّمة</dt><dd>${money(item.expectedAmount)}</dd></div><div><dt>إجمالي قيمة المسلّم</dt><dd>${money(item.totalAmount)}</dd></div>
      <div><dt>التسليم المتوقع</dt><dd>${formatDateOnly(item.expectedDeliveryDate)}</dd></div>
      <div><dt>المدفوع على الطلب</dt><dd>${money(item.paidAmount)}</dd></div><div><dt>المتبقي</dt><dd>${money(item.remainingAmount)}</dd></div>
    </dl>
    <h4 class="modal-subheading">توزيع المقاسات والألوان</h4>${modelSizeColorCardsMarkup(item)}
    ${cuttingDetailsMarkup(item)}
    ${orderProgress(item.status, item.workStages)}
  </article>`).join("")}</div>`;
}

function paymentRows(payments, withActions = false, clients = []) {
  return payments.map((item) => {
    const client = clients.find((entry) => entry.id === item.customerId);
    const settled = client?.account_period_started_at
      && new Date(item._createdAt || item.created_at).getTime() < new Date(client.account_period_started_at).getTime();
    const action = withActions
      ? `<td>${settled ? '<span class="status">فترة مصفّاة</span>' : `<button class="row-action" type="button" data-edit-kind="payments" data-record-id="${escapeHtml(item._recordId)}">تعديل</button> <button class="row-action order-delete-action" type="button" data-delete-payment="${escapeHtml(item._recordId)}">حذف الدفعة</button>`}</td>`
      : "";
    return `<tr data-payment-client="${escapeHtml(item.customerId || "")}"><td>${escapeHtml(item.clientName || item.client || "—")}</td><td>${money(item.amount)}</td><td>${formatDateTime(item._createdAt || item.created_at || item.date)}</td><td>${escapeHtml(item.method || "—")}</td><td>${escapeHtml(item.reference || item.orderReference || "—")}</td><td>${escapeHtml(item.notes || "—")}</td>${action}</tr>`;
  });
}

function userRows(users, withActions = false) {
  return users.map((item) => {
    const suspended = item.status === "suspended";
    const actions = item.roleKey === "admin"
      ? "حساب إدارة محمي"
      : !item.roleKey
        ? "تم نقل الملف إلى حساب دخول آخر"
        : `${withActions && item.roleKey === "client" ? `<button class="row-action" type="button" data-edit-client="${escapeHtml(item.id)}">تعديل البيانات</button> ` : ""}<button class="row-action" type="button" data-action="toggle-user-status" data-account-id="${escapeHtml(item.id)}" data-next-status="${suspended ? "active" : "suspended"}">${suspended ? "إعادة تفعيل" : "توقيف / تعطيل"}</button> <button class="row-action" type="button" data-action="delete-user" data-account-id="${escapeHtml(item.id)}">حذف الحساب</button>`;
    return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.role || "ملف منقول")}</td><td>${suspended ? "متوقف" : "نشط"}</td><td>${actions}</td></tr>`;
  });
}

function clientSettlementLedgerBalances(settlement) {
  const totalBalance = roundMoney(settlement?.balance || 0);
  if (Number.isFinite(Number(settlement?.deliveredBalance))
      && Number.isFinite(Number(settlement?.pendingBalance))) {
    return {
      deliveredBalance: roundMoney(settlement.deliveredBalance),
      pendingBalance: Math.max(0, roundMoney(settlement.pendingBalance))
    };
  }

  const pendingTotal = Math.max(0, roundMoney(settlement?.pendingTotal || 0));
  const orderPaymentsAppliedToPending = Math.min(
    pendingTotal,
    Math.max(0, roundMoney(settlement?.orderPaidTotal || 0))
  );
  const pendingBalance = Math.max(0, subtractMoney(pendingTotal, orderPaymentsAppliedToPending));
  return {
    deliveredBalance: subtractMoney(totalBalance, pendingBalance),
    pendingBalance
  };
}

function paymentOrderReferenceMatch(payment, orders) {
  const explicitOrderId = String(payment.orderId || payment.order_id || "").trim();
  if (explicitOrderId) {
    const matchedOrder = orders.find((order) => String(order.id) === explicitOrderId);
    if (matchedOrder) return matchedOrder;
  }

  const reference = String(payment.reference || payment.orderReference || "").trim().toLocaleLowerCase();
  if (!reference) return null;
  const matchingOrders = orders.filter((order) => [
    order.id,
    order.modelSerial,
    order.factoryModelCode,
    order.clientModelCode,
    order.modelNumber,
    order.name
  ].some((value) => String(value ?? "").trim().toLocaleLowerCase() === reference));
  return matchingOrders.length === 1 ? matchingOrders[0] : null;
}

function calculateClientAccountLedger({
  clientName,
  orders,
  archivedOrders,
  settlements,
  latestSettlement,
  payments,
  cashTransactions,
  accountAdjustments
}) {
  const openingBalance = roundMoney(latestSettlement?.balance || 0);
  const openingSettlement = clientSettlementLedgerBalances(latestSettlement);
  let openingPendingBalance = openingSettlement.pendingBalance;
  const orderLedgers = orders.map((order) => {
    const amounts = factoryOrderLedgerAmounts(order);
    const orderPaid = Math.max(0, Number(order.paidAmount || 0));
    const paidToPending = Math.min(orderPaid, amounts.pendingAmount);
    const paidToDelivered = Math.min(
      Math.max(0, subtractMoney(orderPaid, paidToPending)),
      amounts.deliveredAmount
    );
    const excessPayment = Math.max(
      0,
      subtractMoney(subtractMoney(orderPaid, paidToPending), paidToDelivered)
    );
    return {
      ...order,
      ledgerDeliveredAmount: amounts.deliveredAmount,
      ledgerPendingAmount: amounts.pendingAmount,
      deliveredBalance: subtractMoney(amounts.deliveredAmount, paidToDelivered),
      pendingBalance: subtractMoney(amounts.pendingAmount, paidToPending),
      ledgerPaidAmount: orderPaid,
      ledgerPendingPaid: paidToPending,
      ledgerDeliveredPaid: paidToDelivered,
      ledgerExcessPayment: excessPayment
    };
  });
  const ledgersByOrderId = new Map(orderLedgers.map((order) => [String(order.id), order]));
  const deliveredTotal = sumMoney(orderLedgers.map((order) => order.ledgerDeliveredAmount));
  const expectedTotal = sumMoney(orderLedgers.map((order) => order.ledgerPendingAmount));
  const orderPaid = sumMoney(orderLedgers.map((order) => order.ledgerPaidAmount));
  const paymentsTotal = sumMoney(payments.map((payment) => payment.amount));
  const clientExpenses = cashTransactions.filter((entry) => entry.direction === "expense");
  const clientExpensesTotal = sumMoney(clientExpenses.map((entry) => entry.amount));
  const accountAdjustmentsTotal = sumMoney(accountAdjustments.map((adjustment) => adjustment.amount));
  const accountBalanceBeforePayments = subtractMoney(
    addMoney(openingSettlement.deliveredBalance, clientExpensesTotal),
    accountAdjustmentsTotal
  );
  let pendingPaid = sumMoney(orderLedgers.map((order) => order.ledgerPendingPaid));
  let paidAfterPending = sumMoney(orderLedgers.map((order) => order.ledgerDeliveredPaid));
  const orderedLedgers = [...orderLedgers].sort((left, right) =>
    String(left.createdAt || left.id).localeCompare(String(right.createdAt || right.id))
  );
  let availableClientPayment = sumMoney(orderLedgers.map((order) => order.ledgerExcessPayment));
  const chronologicalPayments = [...payments].sort((left, right) =>
    String(left._createdAt || left.created_at || left.date || "").localeCompare(
      String(right._createdAt || right.created_at || right.date || "")
    )
  );
  for (const payment of chronologicalPayments) {
    let unallocatedAmount = Math.max(0, roundMoney(payment.amount || 0));
    const matchedOrder = paymentOrderReferenceMatch(payment, orders);
    const order = matchedOrder ? ledgersByOrderId.get(String(matchedOrder.id)) : null;
    if (order) {
      const balanceKey = order.ledgerPendingAmount > 0 ? "pendingBalance" : "deliveredBalance";
      const paidKey = order.ledgerPendingAmount > 0 ? "ledgerPendingPaid" : "ledgerDeliveredPaid";
      const allocated = Math.min(unallocatedAmount, order[balanceKey]);
      order[balanceKey] = subtractMoney(order[balanceKey], allocated);
      order[paidKey] = addMoney(order[paidKey], allocated);
      order.ledgerPaidAmount = addMoney(order.ledgerPaidAmount, allocated);
      unallocatedAmount = subtractMoney(unallocatedAmount, allocated);
      if (balanceKey === "pendingBalance") pendingPaid = addMoney(pendingPaid, allocated);
      else paidAfterPending = addMoney(paidAfterPending, allocated);
    }
    availableClientPayment = addMoney(availableClientPayment, unallocatedAmount);
  }
  for (const order of orderedLedgers) {
    const allocated = Math.min(availableClientPayment, order.deliveredBalance);
    order.deliveredBalance = subtractMoney(order.deliveredBalance, allocated);
    order.ledgerDeliveredPaid = addMoney(order.ledgerDeliveredPaid, allocated);
    order.ledgerPaidAmount = addMoney(order.ledgerPaidAmount, allocated);
    availableClientPayment = subtractMoney(availableClientPayment, allocated);
    paidAfterPending = addMoney(paidAfterPending, allocated);
  }
  const accountPayment = Math.min(availableClientPayment, Math.max(0, accountBalanceBeforePayments));
  const accountBalance = subtractMoney(accountBalanceBeforePayments, accountPayment);
  availableClientPayment = subtractMoney(availableClientPayment, accountPayment);
  let accountCredit = Math.max(0, -accountBalance);
  for (const order of orderedLedgers) {
    const allocated = Math.min(accountCredit, order.deliveredBalance);
    order.deliveredBalance = subtractMoney(order.deliveredBalance, allocated);
    accountCredit = subtractMoney(accountCredit, allocated);
  }
  const deliveredOrderBalance = sumMoney(orderLedgers.map((order) => order.deliveredBalance));
  const pendingGoodsBalance = addMoney(
    openingPendingBalance,
    sumMoney(orderLedgers.map((order) => order.pendingBalance))
  );
  const deliveredNetBalance = addMoney(deliveredOrderBalance, Math.max(0, accountBalance));
  const creditBalance = addMoney(accountCredit, availableClientPayment);
  const pendingGoodsCreditOffset = Math.min(pendingGoodsBalance, creditBalance);
  const netPendingGoodsBalance = subtractMoney(pendingGoodsBalance, pendingGoodsCreditOffset);
  const paid = addMoney(orderPaid, paymentsTotal);
  const grossDue = addMoney(deliveredTotal, accountBalanceBeforePayments);
  const balance = subtractMoney(addMoney(deliveredNetBalance, pendingGoodsBalance), creditBalance);
  const hasUndeliveredGoods = openingPendingBalance > 0
    || orders.some((order) => !factoryOrderHasCompleteDelivery(order));
  const deliveredDue = Math.max(0, deliveredNetBalance);
  const due = balance;
  const receivableBalance = deliveredDue;
  return {
    clientName,
    settlements,
    latestSettlement,
    openingBalance,
    openingDeliveredBalance: openingSettlement.deliveredBalance,
    openingPendingBalance,
    orders: orderLedgers,
    archivedOrders,
    deliveredTotal,
    expectedTotal,
    requiredAfterDelivery: deliveredTotal,
    grossDue,
    accountBalance: Math.max(0, accountBalance),
    accountBalanceBeforePayments,
    deliveredOrderBalance,
    deliveredNetBalance,
    deliveredDue,
    orderPaid,
    payments,
    paymentsTotal,
    pendingPaid,
    pendingGoodsBalance,
    pendingGoodsCreditOffset,
    netPendingGoodsBalance,
    paidAfterPending,
    hasUndeliveredGoods,
    clientExpenses,
    clientExpensesTotal,
    accountAdjustments,
    accountAdjustmentsTotal,
    due,
    paid,
    balance,
    receivableBalance,
    creditBalance
  };
}

function clientAccountSummary(client, data) {
  const settlements = data.settlements
    .filter((entry) => entry.customerId === client.id)
    .sort((left, right) => new Date(right.date || right._createdAt).getTime() - new Date(left.date || left._createdAt).getTime());
  const latestSettlement = settlements[0] || null;
  const orders = data.models.filter((order) => order.customerId === client.id && !order.archivedAt);
  const archivedOrders = data.models.filter((order) => order.customerId === client.id && order.archivedAt);
  const periodStart = client.account_period_started_at || latestSettlement?.date || latestSettlement?._createdAt || null;
  const inCurrentPeriod = (date) =>
    !periodStart || new Date(date).getTime() >= new Date(periodStart).getTime();
  const payments = data.payments.filter((payment) =>
    payment.customerId === client.id
    && inCurrentPeriod(payment._createdAt || payment.created_at)
  );
  const cashTransactions = data.cashTransactions.filter((entry) =>
    entry.customer_id === client.id
    && entry.direction === "expense"
    && inCurrentPeriod(entry.occurred_at)
  );
  const accountAdjustments = data.accountAdjustments.filter((adjustment) =>
    adjustment.customerId === client.id
    && inCurrentPeriod(adjustment._createdAt || adjustment.created_at)
  );
  return calculateClientAccountLedger({
    clientName: client.name,
    orders,
    archivedOrders,
    settlements,
    latestSettlement,
    payments,
    cashTransactions,
    accountAdjustments
  });
}

function pendingGoodsBreakdown(summary) {
  return summary.netPendingGoodsBalance > 0
    ? [{
      label: summary.clientName || "عميل",
      value: money(summary.netPendingGoodsBalance)
    }]
    : [];
}

function deliveredDebtBreakdown(summary) {
  return summary.receivableBalance > 0
    ? [{
      label: summary.clientName || "عميل",
      value: money(summary.receivableBalance)
    }]
    : [];
}

function clientOrderLedgerPanel(summary) {
  const rows = summary.orders.map((order) => {
    const delivered = factoryOrderIsReceivable(order);
    const outstanding = addMoney(order.deliveredBalance, order.pendingBalance);
    return `<tr><td>${escapeHtml(order.name || order.modelNumber || "طلب بدون اسم")}</td><td>${escapeHtml(order.factoryModelCode || "—")}</td><td>${escapeHtml(order.displayStatus || order.status || "—")}</td><td>${delivered ? "مستحق حسب حالة الطلب" : "بضاعة تحت التسليم"}</td><td>${money(addMoney(order.ledgerDeliveredAmount, order.ledgerPendingAmount))}</td><td>${money(order.ledgerPaidAmount)}</td><td>${money(outstanding)}</td></tr>`;
  }).join("");
  return panel("ملخص رصيد كل طلب حسب حالته", rows
    ? table(["الموديل","كود النظام","حالة الطلب","تصنيف الرصيد","قيمة الطلب","المدفوع المخصص","المتبقي"], rows)
    : '<div class="empty-state">لا توجد طلبات في الفترة المالية الحالية.</div>',
  "تُصنّف الطلبات بحالة «جاهز للتسليم» أو «تم التسليم» كمستحقات؛ وتظهر جميع الحالات الأخرى حصرياً ضمن بضاعة تحت التسليم.");
}

function moneyCents(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error("قيمة مالية غير صالحة.");
  return Math.round(amount * 100);
}

function roundMoney(value) {
  return moneyCents(value) / 100;
}

function sumMoney(values) {
  return values.reduce((totalCents, value) => totalCents + moneyCents(value), 0) / 100;
}

function addMoney(left, right) {
  return (moneyCents(left) + moneyCents(right)) / 100;
}

function subtractMoney(left, right) {
  return (moneyCents(left) - moneyCents(right)) / 100;
}

function clientAccountCards(data) {
  const clients = data.clients;
  if (!clients.length) return '<div class="empty-state">لا توجد حسابات عملاء مسجلة.</div>';
  const previewList = (orders, id) => orders.length
    ? `<div class="model-preview-list" id="${id}" role="group" aria-label="معاينة الموديلات">${orders.map((order) => `<button class="model-preview-item model-preview-link" type="button" data-open-model-id="${escapeHtml(order.id)}" aria-label="فتح ${escapeHtml(order.name)} للتعديل"><strong>${escapeHtml(order.name)}</strong><span>كود الموديل بالنظام: ${escapeHtml(order.factoryModelCode || "—")}</span><span>كود/رقم الموديل للعميل: ${escapeHtml(order.clientModelCode || "—")}</span><span>الكمية: ${order.quantity > 0 ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة` : "بانتظار الحصر"}</span><span>المقاسات: ${escapeHtml(sizeSummary(order.sizes))}</span><span>الألوان: ${colorSummaryMarkup(order.colors, order.colorNames, order.colorPlyData)}</span>${statusTag(order.displayStatus || order.status)}</button>`).join("")}</div>`
    : `<div class="model-preview-list" id="${id}" role="tooltip"><span>لا توجد موديلات ضمن هذه الفئة.</span></div>`;
  return `<div class="client-account-grid">${clients.map((client) => {
    const summary = clientAccountSummary(client, data);
    const linkedUser = data.users.find((user) => user.id === client.user_id);
    const pipelineGroups = factoryOrderPipelineGroups(summary.orders)
      .filter((group) => group.key !== "unclassified" || group.orders.length);
    const unpricedOrders = summary.orders.filter((order) => order.pricePerPiece <= 0);
    const uncountedOrders = summary.orders.filter((order) => order.quantity <= 0);
    const modelMetric = (label, orders, id) => `<div class="model-preview"><span>${label}</span><button class="model-preview-trigger" type="button" aria-label="${orders.length} ${label}" aria-describedby="${id}"${orders.length === 1 ? ` data-open-model-id="${escapeHtml(orders[0].id)}"` : ""}>${orders.length}</button>${previewList(orders, id)}</div>`;
    return `<article class="client-account-card">
      <header><div><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.phone || "بدون هاتف")}${linkedUser ? ` · ${escapeHtml(linkedUser.username)}` : " · ملف عميل بلا حساب دخول"}</p></div>${statusTag(linkedUser?.status === "suspended" ? "متوقف" : "نشط")}</header>
      <div class="client-balance-grid"><div><span>المتبقي من البضاعة بحالات التشغيل قبل جاهز للتسليم</span><strong>${money(summary.pendingGoodsBalance)}</strong></div><div><span>المستحق للطلبات الجاهزة للتسليم أو المسلّمة</span><strong>${money(summary.deliveredDue)}</strong></div><div><span>المدفوع</span><strong>${money(summary.paid)}</strong></div><div><span>إجمالي رصيد الحساب المتوقع</span><strong>${money(summary.balance)}</strong><small>${summary.balance === 0 ? "تم السداد بالكامل" : summary.balance < 0 ? "رصيد دائن بعد احتساب البضاعة غير المستحقة" : summary.deliveredDue > 0 ? "المستحق حسب حالة الطلب؛ وبضاعة التشغيل معروضة منفصلة" : summary.hasUndeliveredGoods ? "لا يوجد مستحق حسب الحالة؛ الرصيد يخص بضاعة تحت التسليم" : "مستحق حسب حالة الطلب"}</small></div></div>
      ${unpricedOrders.length ? '<p class="client-unpriced-alert" role="status">يوجد موديلات لم تحدد أسعارها بعد</p>' : ""}
      <div class="client-activity-grid">
        ${pipelineGroups.map((group) => modelMetric(group.label, group.orders, `pipeline-${group.key}-${escapeHtml(client.id)}`)).join("")}
        ${modelMetric("لم يُحدد سعرها", unpricedOrders, `unpriced-${escapeHtml(client.id)}`)}
        ${modelMetric("لم يُحدد عددها", uncountedOrders, `uncounted-${escapeHtml(client.id)}`)}
      </div>
      <p class="client-notes-preview">${escapeHtml(client.notes || "لا توجد ملاحظات مسجلة.")}</p>
      <div class="client-card-actions"><button class="button button-primary" type="button" data-open-client-details="${escapeHtml(client.id)}">التفاصيل</button><button class="button button-secondary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">＋ إضافة دفعة مالية</button><button class="row-action" type="button" data-open-client-adjustment="${escapeHtml(client.id)}">خصم تسوية / كسور</button><button class="row-action" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل بيانات العميل</button><button class="row-action order-delete-action" type="button" data-delete-customer="${escapeHtml(client.id)}">حذف العميل</button></div>
    </article>`;
  }).join("")}</div>`;
}

function clientAccountsOverview(data) {
  const summaries = data.clients.map((client) => clientAccountSummary(client, data));
  const totalGoods = sumMoney(summaries.map((summary) => summary.deliveredTotal));
  const totalExpected = sumMoney(summaries.map((summary) => summary.netPendingGoodsBalance));
  const totalPaid = sumMoney(summaries.map((summary) => summary.paid));
  const totalBalance = sumMoney(summaries.map((summary) => summary.receivableBalance - summary.creditBalance));
  const unpricedCount = summaries.reduce((count, summary) =>
    count + summary.orders.filter((order) => order.pricePerPiece <= 0).length, 0);
  const accountBalances = summaries
    .filter((summary) => summary.receivableBalance > 0 || summary.creditBalance > 0)
    .map((summary) => `<tr><td>${escapeHtml(summary.clientName || "عميل")}</td><td>${summary.receivableBalance > 0 ? "مستحق حسب حالة الطلب" : "دائن / فائض للعميل"}</td><td>${money(summary.receivableBalance > 0 ? summary.receivableBalance : summary.creditBalance)}</td><td>${money(summary.netPendingGoodsBalance)}</td></tr>`);
  return `<div class="clients-toolbar"><div><h2>حسابات العملاء</h2><p>متابعة الأرصدة والدفعات وقيمة البضاعة وحالات الموديلات لكل عميل.</p></div></div>
    <div class="stats-grid">${stat("قيمة الطلبات بحالة التسليم أو الجاهزية", money(totalGoods), "تشمل الطلبات الجاهزة للتسليم وتم التسليم")}${stat("المتبقي من البضاعة تحت التسليم", money(totalExpected), "طلبات جميع الحالات الأخرى بعد تخصيص الدفعات")}${stat("إجمالي المدفوع", money(totalPaid), "دفعات العملاء والمدفوع على الطلب")}${stat("صافي المستحق حسب حالة الطلب", money(totalBalance), totalBalance < 0 ? "أرصدة دائنة للعملاء" : "لا يشمل قيمة الطلبات بحالات التشغيل")}${stat("موديلات بلا سعر", unpricedCount, "تحتاج إلى استكمال التسعير")}</div>
    ${panel("ديون العملاء / الأرصدة الدائنة", accountBalances.length
      ? table(["العميل","تصنيف الرصيد","الرصيد الصافي","قيمة البضاعة غير المسلّمة"], accountBalances)
        : '<div class="empty-state">لا توجد أرصدة مستحقة حسب حالة الطلب أو أرصدة دائنة حالياً.</div>', "تُصنّف الطلبات الجاهزة للتسليم أو المسلّمة كمستحقات، وتبقى بقية الحالات في بضاعة تحت التسليم بعد الدفعات.")}
    ${clientAccountCards(data)}`;
}

function workerCashOutflows(data) {
  return [
    ...data.workerAdvances.map((record) => ({
      category: "سلفة عامل",
      description: `${record.workerName || record.name || record.username || "عامل"} · ${record.description || record.reason || record.reference || ""}`,
      amount: Number(record.amount ?? record.value ?? record.netAmount ?? 0),
      date: record._createdAt || record.created_at || record.date
    })),
    ...data.workerPayroll.filter((record) => Number(record.paidAmount ?? record.paid ?? 0) > 0).map((record) => ({
      category: "صرف راتب عامل",
      description: `${record.workerName || record.name || record.username || "عامل"} · ${record.period || record.month || ""}`,
      amount: Number(record.paidAmount ?? record.paid ?? 0),
      date: record.paidAt || record.paid_at || record._createdAt || record.created_at || record.date
    }))
  ].filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0);
}

function cashLedgerView(data) {
  const workerWithdrawals = workerCashOutflows(data);
  const voidedPayments = data.voidedPayments || [];
  const customerIncome = [...data.payments, ...voidedPayments]
    .reduce((sum, payment) => addMoney(sum, payment.amount), 0);
  const otherIncome = data.cashTransactions
    .filter((entry) => entry.direction === "income")
    .reduce((sum, entry) => addMoney(sum, entry.amount), 0);
  const orderPayments = data.models
    .reduce((sum, order) => addMoney(sum, order.paidAmount || 0), 0);
  const expenses = sumMoney([
    ...data.cashTransactions.filter((entry) => entry.direction === "expense").map((entry) => entry.amount),
    ...workerWithdrawals.map((entry) => entry.amount)
  ]);
  const entries = [
    ...data.payments.map((payment) => ({
      direction: "income",
      category: "دفعة عميل",
      description: `${payment.clientName || payment.client || ""}${payment.reference ? ` · ${payment.reference}` : ""}`,
      amount: Number(payment.amount),
      method: payment.method || "غير محدد",
      date: payment._createdAt || payment.created_at || payment.date
    })),
    ...voidedPayments.map((payment) => ({
      direction: "income",
      category: "دفعة مستبعدة من حساب العميل",
      description: `${payment.clientName || payment.client || ""}${payment.reference ? ` · ${payment.reference}` : ""} · قيد محفوظ دون احتسابه على العميل`,
      amount: Number(payment.amount),
      method: payment.method || "غير محدد",
      date: payment._createdAt || payment.created_at || payment.date
    })),
    ...data.models.filter((order) => Number(order.paidAmount) > 0).map((order) => ({
      direction: "income",
      category: "دفعة مثبتة على الموديل",
      description: `${order.client || ""} · ${order.name || order.modelNumber || ""}`,
      amount: Number(order.paidAmount),
      method: "مسجل على الطلب",
      date: order.created_at
    })),
    ...data.cashTransactions.map((entry) => ({
      id: entry.id,
      orderId: entry.order_id,
      direction: entry.direction,
      category: entry.category,
      description: `${entry.customer_id ? `${data.clients.find((client) => client.id === entry.customer_id)?.name || "عميل"} · ` : ""}${entry.description}`,
      amount: Number(entry.amount),
      method: entry.payment_method,
      date: entry.occurred_at
    })),
    ...workerWithdrawals.map((entry) => ({
      direction: "expense",
      category: entry.category,
      description: entry.description,
      amount: entry.amount,
      method: "صرف عامل",
      date: entry.date
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const localDateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const totalIncome = sumMoney([customerIncome, orderPayments, otherIncome]);
  return `<div class="stats-grid">${stat("المقبوضات", money(totalIncome), "دفعات العملاء والمدفوعات المسجلة على الطلبات وإيرادات أخرى")}${stat("المصروفات", money(expenses), "المسجل في سجل النقدية")}${stat("صافي الحركة النقدية", money(subtractMoney(totalIncome, expenses)), "المقبوضات − المصروفات")}</div>
    ${panel("المصاريف والداخل والخارج", `<form id="cash-transaction-form" class="form-grid payment-form"><input type="hidden" name="transactionId"><div class="field"><label for="cash-direction">نوع الحركة</label><select id="cash-direction" name="direction" required><option value="expense">مصروف / خروج نقدي</option><option value="income">إيراد آخر / دخول نقدي</option></select><small>دفعات العملاء تُسجل من نموذج الدفعات وتظهر تلقائياً ضمن المقبوضات.</small></div><div class="field"><label for="cash-category">البند</label><input id="cash-category" name="category" maxlength="120" placeholder="مثل: أجور، كهرباء، نقل، مبيعات أخرى" required></div><div class="field"><label for="cash-amount">المبلغ</label><input id="cash-amount" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="cash-method">طريقة الدفع</label><input id="cash-method" name="method" value="نقدي" maxlength="80"></div><div class="field wide"><label for="cash-description">التفاصيل / المرجع</label><input id="cash-description" name="description" maxlength="500"></div><div class="field"><label for="cash-date">تاريخ ووقت الحركة</label><input id="cash-date" name="occurredAt" type="datetime-local" value="${localDateTime}" required></div><div class="form-actions"><button class="button button-primary" type="submit">حفظ الحركة النقدية</button><button class="row-action" type="button" data-cancel-cash-edit hidden>إلغاء التعديل</button></div></form>`, "دفعات العملاء تُدار من قسم الدفعات؛ لا تُسجل مرة أخرى كإيراد يدوي")}
    ${panel("سجل المقبوضات والمصروفات", entries.length
      ? table(["النوع","البند","التفاصيل","المبلغ","طريقة الدفع","التاريخ والوقت","إجراء"], entries.map((entry) => `<tr><td>${entry.direction === "income" ? "مقبوض" : "مصروف"}</td><td>${escapeHtml(entry.category)}</td><td>${escapeHtml(entry.description || "—")}</td><td class="${entry.direction === "income" ? "financial-credit" : "financial-debit"}">${entry.direction === "income" ? "+" : "−"}${money(entry.amount)}</td><td>${escapeHtml(entry.method)}</td><td>${formatDateTime(entry.date)}</td><td>${entry.id ? entry.orderId ? '<span class="order-delete-protected">مرتبطة بمصاريف موديل</span>' : `<button type="button" class="row-action" data-edit-cash-transaction="${escapeHtml(entry.id)}">تعديل</button> <button type="button" class="row-action order-delete-action" data-delete-cash-transaction="${escapeHtml(entry.id)}">حذف الحركة</button>` : "—"}</td></tr>`))
      : '<div class="empty-state">لا توجد حركات نقدية مسجلة.</div>')}`;
}

function adminDashboardView(data) {
  const activeOrders = data.models.filter((order) => !order.archivedAt && !order.workflowArchivedAt);
  const drawerIncome = sumMoney([
    ...data.payments.map((payment) => payment.amount),
    ...(data.voidedPayments || []).map((payment) => payment.amount),
    ...data.models.map((order) => order.paidAmount),
    ...data.cashTransactions.filter((entry) => entry.direction === "income").map((entry) => entry.amount)
  ]);
  const drawerExpenses = sumMoney([
    ...data.cashTransactions.filter((entry) => entry.direction === "expense").map((entry) => entry.amount),
    ...workerCashOutflows(data).map((entry) => entry.amount)
  ]);
  const drawerBalance = subtractMoney(drawerIncome, drawerExpenses);
  const clientSummaries = data.clients.map((client) => ({
    client,
    ...clientAccountSummary(client, data)
  }));
  const clientDebts = clientSummaries.map((summary) => ({
    client: summary.client,
    account: summary,
    amount: summary.receivableBalance
  })).filter((entry) => entry.amount > 0).sort((left, right) => right.amount - left.amount);
  const customerReceivables = sumMoney(clientDebts.map((entry) => entry.amount));
  const upcomingReceivables = sumMoney(clientSummaries.map((summary) => summary.netPendingGoodsBalance));
  const deliveredDebtDetails = clientSummaries.flatMap((summary) => deliveredDebtBreakdown(summary));
  const pendingGoodsDetails = clientSummaries.flatMap((summary) => pendingGoodsBreakdown(summary));
  const orderDetail = (order, quantity, amount) => ({
    label: `${order.name}${order.client ? ` · ${order.client}` : ""}`,
    note: `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(quantity)} قطعة · ${order.displayStatus || order.status || "الحالة غير محددة"} · الأقسام: ${workStageLabels(order.workStages).join("، ") || "غير محددة"}`,
    value: money(amount)
  });
  const cashDetails = [
    { label: "دفعات العملاء", note: `${data.payments.length} دفعة`, value: money(sumMoney(data.payments.map((payment) => payment.amount))) },
    { label: "دفعات مستبعدة من حساب العميل", note: `${(data.voidedPayments || []).length} قيد محفوظ للخزنة`, value: money(sumMoney((data.voidedPayments || []).map((payment) => payment.amount))) },
    { label: "مدفوعات على الطلبات", note: `${activeOrders.length} موديل`, value: money(sumMoney(data.models.map((order) => order.paidAmount))) },
    { label: "إيرادات أخرى", note: `${data.cashTransactions.filter((entry) => entry.direction === "income").length} حركة`, value: money(sumMoney(data.cashTransactions.filter((entry) => entry.direction === "income").map((entry) => entry.amount))) },
    { label: "مصروفات ومسحوبات", note: `${data.cashTransactions.filter((entry) => entry.direction === "expense").length + workerCashOutflows(data).length} حركة`, value: money(drawerExpenses) }
  ];
  const pipelineGroups = factoryOrderPipelineGroups(activeOrders)
    .filter((group) => group.key !== "unclassified" || group.orders.length);
  const pipelineStats = pipelineGroups.map((group) => {
    const details = group.orders.map((order) => {
      const receivable = factoryOrderIsReceivable(order);
      const quantity = LOCKED_FACTORY_ORDER_STATUSES.includes(order.status)
        ? order.deliveredPieces
        : order.remainingPieces ?? order.quantity;
      const amount = receivable
        ? addMoney(order.totalAmount, order.expectedAmount)
        : factoryOrderHasReachedDelivery(order)
          ? order.expectedAmount
          : addMoney(order.totalAmount, order.expectedAmount);
      return orderDetail(order, quantity, amount);
    });
    return stat(group.label, group.orders.length, "حسب مرحلة التشغيل الحالية",
      statDetailList(details, `لا توجد موديلات في مرحلة ${group.label}.`));
  }).join("");
  return `<div class="stats-grid">${stat("النقدية في الدرج", money(drawerBalance), "", statDetailList(cashDetails))}${stat("مستحقات العملاء", money(customerReceivables), "الطلبات الجاهزة للتسليم أو المسلّمة بعد الدفعات", statDetailList(deliveredDebtDetails, "لا توجد مستحقات حسب حالة الطلب."))}${stat("بضاعة تحت التسليم", money(upcomingReceivables), "صافي قيمة الحالات غير الجاهزة بعد خصم الدفعات والرصيد الدائن", statDetailList(pendingGoodsDetails, "لا توجد بضاعة متبقية بعد خصم الدفعات والرصيد الدائن."))}${pipelineStats}</div>
    ${panel("آخر الموديلات وحالتها", activeOrders.length
      ? table(["الموديل","العميل","العدد","سعر القطعة","الحالة"], activeOrders.slice(0, 12).map((order) => `<tr><td>${escapeHtml(order.name)}${order.modelNumber ? ` · ${escapeHtml(order.modelNumber)}` : ""}</td><td>${escapeHtml(order.client || "—")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)}</td><td>${money(order.pricePerPiece)}</td><td>${statusTag(order.displayStatus || order.status)}</td></tr>`))
      : '<div class="empty-state">لا توجد موديلات حالية.</div>')}`;
}

function modelStatusReviewView(data) {
  const orders = data.models;
  const statusOptions = (statuses, selected) => statuses
    .map((status) => `<option value="${escapeHtml(status)}"${selected === status ? " selected" : ""}>${escapeHtml(status)}</option>`)
    .join("");
  const allStatuses = [...new Set(orders.flatMap((order) => factoryOrderStatusSequence(order)))];
  return `<div class="clients-toolbar"><div><h2>الموديلات</h2><p>حالات الموديل موحدة حسب دورة الإنتاج، وتُضاف المراحل الإضافية وفق الأقسام المختارة.</p></div><label class="field model-status-filter"><span>تصفية حسب الحالة</span><select data-filter-model-status><option value="">كل الحالات</option>${statusOptions(allStatuses, "")}</select></label></div>
    ${orders.length ? `<div class="model-status-list">${orders.map((order) => {
      const isLocked = Boolean(order.archivedAt) || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status);
      const selectedStatus = canonicalFactoryOrderStatus(order.status);
      const allOrderStatuses = factoryOrderStatusSequence(order);
      const additionalStatuses = allOrderStatuses.slice(8, -2);
      const canManageStageStatus = selectedStatus === "تمت الخياطة" || additionalStatuses.includes(selectedStatus);
      const statuses = canManageStageStatus
        ? [...new Set([selectedStatus, ...additionalStatuses, "جاهز للتسليم"])]
        : selectedStatus === "قيد الانتظار"
          ? ["قيد الانتظار", "قيد الفرش"]
          : allOrderStatuses.filter((status) => status !== "تم التسليم");
      if (selectedStatus === "تم التسليم") statuses.push(selectedStatus);
      const workflowManaged = !canManageStageStatus && selectedStatus !== "قيد الانتظار";
      return `<article class="model-status-row" data-model-status-row data-current-status="${escapeHtml(order.status)}">
      <div class="model-status-info"><strong>${escapeHtml(order.name)}</strong><span>العميل: ${escapeHtml(order.client || "—")}</span><span>العدد: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة</span><span>السعر: ${money(order.pricePerPiece)}</span></div>
      ${statusTag(order.displayStatus || selectedStatus)}
      <label class="model-status-control"><span>الحالة${isLocked ? " · مقفلة" : workflowManaged ? " · تُدار من سير الإنتاج" : " · إدارة المرحلة الإضافية"}</span><select data-model-status="${escapeHtml(order.id)}"${isLocked || workflowManaged ? " disabled" : ""}>${statusOptions(statuses, selectedStatus)}</select></label>
      <button class="button button-secondary" type="button" data-save-model-status="${escapeHtml(order.id)}"${isLocked || workflowManaged ? " disabled" : ""}>حفظ الحالة</button>
      ${isLocked ? '<span class="order-delete-protected">لا يمكن تغيير حالة موديل تم تسليمه أو إغلاقه.</span>' : ""}
      ${workflowManaged ? '<span class="order-delete-protected">تُحدّث الحالة من إجراءات القص والخياطة.</span>' : ""}
    </article>`;
    }).join("")}</div>` : '<div class="empty-state">لا توجد موديلات لمراجعتها.</div>'}`;
}

function clientAccountLinkOptions(client, data) {
  const candidates = new Map();
  [...data.users, ...(data.pendingAccounts || [])].forEach((account) => {
    if (account.id) candidates.set(account.id, account);
  });
  const linkedUserIds = new Map(data.clients
    .filter((entry) => entry.user_id)
    .map((entry) => [entry.user_id, entry.id]));
  const options = [...candidates.values()].filter((account) => {
    const pendingRegistration = account.status === "pending" && !account.role && !account.roleKey;
    const activeClient = account.status === "active"
      && (account.roleKey === "client" || account.role === "client");
    const linkedClientId = linkedUserIds.get(account.id);
    return (pendingRegistration || activeClient)
      && (!linkedClientId || linkedClientId === client.id);
  }).sort((left, right) => String(left.name || left.username).localeCompare(String(right.name || right.username), "ar"));
  return options.map((account) => {
    const state = account.status === "pending" ? "بانتظار الموافقة" : "حساب عميل نشط";
    return `<option value="${escapeHtml(account.id)}" ${account.id === client.user_id ? "selected" : ""}>${escapeHtml(account.name || account.username)} · ${escapeHtml(account.username)} · ${state}</option>`;
  }).join("");
}

function clientFinancialStatementMarkup(entries) {
  const rows = entries.map((entry) => {
    const timestamp = new Date(entry.date);
    const dateValue = Number.isNaN(timestamp.getTime()) ? "" : timestamp.toISOString().slice(0, 10);
    const settled = entry.payment
      && entry.paymentPeriodStart
      && timestamp.getTime() < new Date(entry.paymentPeriodStart).getTime();
    const settledCash = entry.cashTransaction
      && entry.cashPeriodStart
      && timestamp.getTime() < new Date(entry.cashPeriodStart).getTime();
    const actions = entry.payment
      ? settled
        ? '<span class="status">فترة مصفّاة</span>'
        : `<button class="row-action" type="button" data-edit-client-payment="${escapeHtml(entry.payment._recordId)}">تعديل</button> <button class="row-action order-delete-action" type="button" data-delete-payment="${escapeHtml(entry.payment._recordId)}">حذف الدفعة</button>`
      : settledCash
        ? '<span class="status">فترة مصفّاة</span>'
        : entry.cashTransaction && !entry.cashTransaction.order_id
        ? `<button class="row-action" type="button" data-edit-cash-transaction="${escapeHtml(entry.cashTransaction.id)}">تعديل</button> <button class="row-action order-delete-action" type="button" data-delete-cash-transaction="${escapeHtml(entry.cashTransaction.id)}">حذف الحركة</button>`
        : "—";
    return `<tr data-client-statement-row="${escapeHtml(dateValue)}"><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.reference)}</td><td>${escapeHtml(entry.detail)}</td><td class="${entry.amount < 0 ? "financial-credit" : "financial-debit"}">${money(entry.amount)}</td><td class="client-statement-date">${formatDateTime(entry.date)}</td><td>${actions}</td></tr>`;
  }).join("");
  return `<div class="client-statement-filters"><label class="field"><span>من تاريخ</span><input type="date" data-client-statement-from></label><label class="field"><span>إلى تاريخ</span><input type="date" data-client-statement-to></label><button class="row-action" type="button" data-clear-client-statement-filter>عرض كل الفترات</button><span data-client-statement-count>${entries.length} حركة</span></div>
    ${entries.length
      ? table(["الحركة","المرجع","التفاصيل","الأثر على الحساب","التاريخ والوقت","إجراء"], rows, "client-statement-table")
      : '<div class="empty-state">لا توجد حركات مالية مسجلة لهذا العميل حتى الآن.</div>'}`;
}

function clientDetailsView(client, data) {
  const summary = clientAccountSummary(client, data);
  const pricedOrders = summary.orders.filter((order) => order.pricePerPiece > 0);
  const unpricedOrders = summary.orders.filter((order) => order.pricePerPiece <= 0);
  const archivedOrders = summary.archivedOrders;
  const clientModelRequests = (data.clientModelRequests || []).filter((request) => request.client_id === client.id);
  const pendingClientModelRequests = clientModelRequests.filter((request) => request.status === "pending");
  const reviewedClientModelRequests = clientModelRequests.filter((request) => request.status !== "pending");
  const clientRequestRows = (requests) => requests.map((request) =>
    `<tr><td>${escapeHtml(request.model_name || "—")}</td><td>${escapeHtml(request.model_number || "—")}</td><td>${request.quantity ?? "—"}</td><td>${modelImageMarkup(request.imageUrl, `صورة الموديل ${request.model_name || ""}`) || "—"}</td><td>${statusTag(request.status === "pending" ? "بانتظار المراجعة" : request.status)}</td><td>${formatDateTime(request.created_at)}</td></tr>`
  );
  const deliveries = data.deliveries.filter((delivery) => delivery.customer_id === client.id);
  const clientFabrics = data.fabrics.filter((fabric) => fabric.customer_id === client.id);
  const clientFabricIds = new Set(clientFabrics.map((fabric) => fabric.id));
  const clientFabricTransactions = data.fabricTransactions.filter((transaction) => clientFabricIds.has(transaction.fabric_id));
  const fabricBalances = new Map();
  clientFabrics.forEach((fabric) => {
    const key = JSON.stringify([fabric.name, fabric.color_name || ""]);
    const balance = fabricBalances.get(key) || {
      name: fabric.name,
      colorName: fabric.color_name || "دون اسم",
      tobs: 0,
      meters: 0
    };
    if (fabric.unit === "توب") balance.tobs += Number(fabric.quantity_available);
    if (fabric.unit === "متر") balance.meters += Number(fabric.quantity_available);
    fabricBalances.set(key, balance);
  });
  const quantity = (value) => new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(value);
  const fabricBalanceRows = [...fabricBalances.values()]
    .sort((left, right) => left.name.localeCompare(right.name, "ar"))
    .map((fabric) => `<tr><td>${escapeHtml(fabric.name)}</td><td>${escapeHtml(fabric.colorName)}</td><td>${quantity(fabric.tobs)}</td><td>${quantity(fabric.meters)}</td></tr>`);
  const clientFabricBalanceSection = `<section class="client-detail-section">${panel("رصيد القماش الحالي للعميل في المخزن", fabricBalanceRows.length
    ? table(["نوع القماش","اللون","عدد الأثواب","المتاح بالمتر"], fabricBalanceRows)
    : '<div class="empty-state">لا يوجد قماش متاح مسجل لهذا العميل حالياً.</div>')}</section>`;
  const payments = data.payments.filter((payment) => payment.customerId === client.id);
  const clientCashTransactions = data.cashTransactions.filter((entry) => entry.customer_id === client.id);
  const clientAdjustments = data.accountAdjustments.filter((entry) => entry.customerId === client.id);
  const financialEntries = [
    ...deliveries.map((delivery) => {
      const order = data.models.find((item) => item.id === delivery.order_id);
      return {
        type: "تسليم بضاعة",
        reference: order?.name || "طلب مؤرشف",
        detail: `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(delivery.quantity)} قطعة × ${money(delivery.price_per_piece)} · المستلم: ${delivery.recipient_name || "—"}`,
        amount: Number(delivery.amount),
        date: delivery.delivered_at
      };
    }),
    ...payments.map((payment) => ({
      type: "دفعة مالية",
      reference: payment.reference || "—",
      detail: `${payment.method || "—"}${payment.notes ? ` · ${payment.notes}` : ""}`,
      amount: -Number(payment.amount || 0),
      date: payment._createdAt || payment.created_at || payment.date,
      payment,
      paymentPeriodStart: client.account_period_started_at
    })),
    ...data.models.filter((order) => order.customerId === client.id && Number(order.paidAmount) > 0).map((order) => ({
      type: "دفعة مثبتة على الموديل",
      reference: order.name || order.modelNumber || "—",
      detail: `الموديل ${order.modelNumber || ""}`,
      amount: -Number(order.paidAmount),
      date: order.created_at
    })),
    ...clientCashTransactions.map((entry) => ({
      type: entry.direction === "income" ? "مبلغ وارد" : "مصروف / مبلغ منصرف على حساب العميل",
      reference: entry.category || "حركة حساب",
      detail: entry.description || "—",
      amount: entry.direction === "income" ? -Number(entry.amount) : Number(entry.amount),
      date: entry.occurred_at,
      cashTransaction: entry,
      cashPeriodStart: client.account_period_started_at
    })),
    ...clientAdjustments.map((entry) => ({
      type: "خصم تسوية غير نقدي",
      reference: entry.reason || "خصم تسوية",
      detail: entry.notes || "خصم من رصيد العميل دون حركة خزينة",
      amount: -Number(entry.amount),
      date: entry._createdAt || entry.created_at
    })),
    ...summary.settlements.map((entry) => ({
      type: "تصفية وترحيل رصيد",
      reference: "رصيد سابق مرحّل",
      detail: `افتتاحي ${money(entry.openingBalance)} · ختامي ${money(entry.balance)}`,
      amount: Number(entry.balance),
      date: entry.date || entry._createdAt
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const orderLedgerSection = clientOrderLedgerPanel(summary);
  const orderCard = (order, archived = false) => {
    const index = dashboardData.models.findIndex((item) => item.id === order.id);
    const locked = Boolean(order.archivedAt) || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status);
    return `<article class="order-card client-history-card">
    <label class="print-model-select"><input type="checkbox" data-print-model-select="${escapeHtml(order.id)}"><span>اختيار للطباعة</span></label>
    <header class="order-card-heading">${modelImageMarkup(order.modelImageUrls || order.modelImageUrl)}<div><p class="order-card-label">${archived ? "طلب مؤرشف" : "طلب حالي"} · كود الموديل بالنظام: ${escapeHtml(order.factoryModelCode || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(order.clientModelCode || "—")}</p><h3>${escapeHtml(order.name || "موديل بدون اسم")}</h3></div>${statusTag(order.displayStatus || order.status)}</header>
    <dl class="order-card-details">
      <div><dt>العدد الإجمالي بعد القص</dt><dd>${order.quantity ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة` : "بانتظار الحصر"}</dd></div>
      <div><dt>المستلم</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.deliveredPieces)} قطعة</dd></div>
      <div><dt>المتبقي</dt><dd>${order.quantity ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.remainingPieces)} قطعة` : "بانتظار الحصر"}</dd></div>
      <div><dt>مسؤول القص</dt><dd>${escapeHtml(order.cutterName || "—")}</dd></div>
      <div><dt>الخامة المستخدمة</dt><dd>${escapeHtml(order.fabric || order.externalFabricSource || "—")}</dd></div>
      <div><dt>كمية القماش والأتواب</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(order.fabricQuantity || 0)} ${escapeHtml(order.fabricUnit || "متر")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.boltCount || 0)} توب</dd></div>
      <div><dt>الراقات</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.layerCount || order.cuttingPlys || 0)}</dd></div>
      <div><dt>كود الموديل لدى العميل</dt><dd>${escapeHtml(order.clientModelCode || "—")}</dd></div>
      ${order.pricePerPiece > 0 ? `<div><dt>سعر القطعة</dt><dd>${money(order.pricePerPiece)}</dd></div>` : '<div><dt>التسعير</dt><dd>لم يُسعّر بعد</dd></div>'}
      <div><dt>مصاريف التشغيل الإضافية</dt><dd>${money(order.operationalExpenses)}</dd></div>
      ${order.expectedAmount > 0 ? `<div><dt>المتوقع للكمية غير المسلّمة</dt><dd>${money(order.expectedAmount)}</dd></div>` : ""}
      ${order.totalAmount > 0 ? `<div><dt>إجمالي المستحق بعد التسليم</dt><dd>${money(order.totalAmount)}</dd></div>` : ""}
      <div><dt>التسليم المتوقع</dt><dd>${formatDateOnly(order.expectedDeliveryDate)}</dd></div>
      <div><dt>تاريخ الإنشاء</dt><dd>${formatDateTime(order.created_at)}</dd></div>
      ${order.senderName ? `<div><dt>تم الإرسال بواسطة</dt><dd>${escapeHtml(order.senderName)}</dd></div>` : ""}
      ${archived ? `<div><dt>تاريخ الأرشفة</dt><dd>${formatDateTime(order.archivedAt)}</dd></div>` : ""}
    </dl>
    <h4 class="modal-subheading">توزيع المقاسات والألوان</h4>${modelSizeColorCardsMarkup(order)}
    ${cuttingDetailsMarkup(order)}
    ${!archived ? `<footer class="order-card-actions"><button class="row-action" type="button" data-edit-client-order="${escapeHtml(order.id)}">تعديل السعر أو بيانات الموديل</button>${locked ? '<span class="status">تم التسليم / مغلق</span>' : order.customerId ? `<button class="row-action" type="button" data-action="record-delivery" data-index="${index}"${order.quantity ? "" : " disabled"}>تسجيل تسليم</button><button class="row-action order-close-action" type="button" data-action="complete-handover" data-index="${index}"${order.quantity ? "" : " disabled"}>تسوية التسليم وإغلاق الطلب</button>` : ""}${orderCanBeDeleted(order) ? `<button class="row-action order-delete-action" type="button" data-action="delete-order" data-order-id="${escapeHtml(order.id)}">حذف الموديل</button>` : '<span class="order-delete-protected" title="لا يمكن حذف طلب له تسليمات أو مصروفات تشغيل أو مبالغ مسجلة">محمي بسجل مالي / مصروفات / تسليم</span>'}</footer>` : ""}
  </article>`;
  };
  const clientNotes = data.clientNotes.filter((note) => note.customerId === client.id);
  const linkedAccount = data.users.find((account) => account.id === client.user_id)
    || (data.pendingAccounts || []).find((account) => account.id === client.user_id);
  const linkOptions = clientAccountLinkOptions(client, data);
  const accountLinkSection = `<section class="client-detail-section">${panel("ربط حساب تسجيل الدخول", `<p>${linkedAccount
    ? `الحساب المرتبط: ${escapeHtml(linkedAccount.name || linkedAccount.username)} · ${escapeHtml(linkedAccount.username)} · ${linkedAccount.status === "pending" ? "بانتظار الموافقة" : linkedAccount.status === "suspended" ? "متوقف" : "نشط"}`
    : "لا يوجد حساب دخول مرتبط بملف العميل."}</p>${linkOptions
      ? `<div class="client-account-link-controls"><label class="field"><span>اختر حساباً معلقاً أو حساب عميل موجوداً</span><select data-client-link-account="${escapeHtml(client.id)}"><option value="">اختر الحساب</option>${linkOptions}</select></label><button class="button button-secondary" type="button" data-action="link-client-account" data-customer-id="${escapeHtml(client.id)}">ربط بحساب تسجيل الدخول</button></div>`
      : '<div class="empty-state">لا توجد حسابات معلقة أو حسابات عملاء متاحة للربط.</div>'}`, "يؤدي ربط حساب معلق إلى اعتماده كعميل وربطه بهذا الملف.")}</section>`;
  return `<div class="clients-toolbar client-detail-toolbar"><div><h2>${escapeHtml(client.name)} · تفاصيل الحساب والعمولة</h2><p>كود العميل: ${escapeHtml(client.code_letter || "—")} · ${escapeHtml(client.brand_name || "لا يوجد اسم محل/براند")} · رقم العميل: ${escapeHtml(client.client_number || "—")} · واتساب: ${escapeHtml(client.whatsapp || "—")}</p></div><div class="client-detail-actions"><button class="button button-primary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">＋ إضافة دفعة</button><button class="button button-secondary" type="button" data-open-account-adjustment>خصم التسوية / الكسور</button><button class="button button-secondary" type="button" data-print-account>طباعة كشف الحساب</button><button class="button button-secondary" type="button" data-print-selected-models>طباعة الموديلات المحددة</button><button class="row-action" type="button" data-return-clients>العودة للعملاء</button></div></div>
    <div class="modal-backdrop" data-account-adjustment-modal hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="account-adjustment-title"><button class="modal-close" type="button" data-close-account-adjustment aria-label="إغلاق">×</button><h2 id="account-adjustment-title">إضافة خصم / تسوية حساب</h2><p>يُخصم القيد من رصيد العميل فقط، ولا يُسجّل كحركة نقدية بالخزنة.</p><form class="form-grid" data-account-adjustment-form="${escapeHtml(client.id)}"><label class="field"><span>مبلغ الخصم (ج.م)</span><input name="amount" type="number" min="0.01" step="0.01" required></label><label class="field"><span>سبب الخصم / البيان</span><select name="reason" required><option value="">اختر سبب التسوية</option><option>تنزيل كسور/فكة</option><option>خصم خطأ تشغيلي</option><option>إشعار خصم تسوية</option></select></label><label class="field wide"><span>تفاصيل إضافية (اختياري)</span><textarea name="notes" rows="2" maxlength="500"></textarea></label><div class="form-actions wide"><button class="button button-primary" type="submit">حفظ الخصم على الحساب</button><button class="row-action" type="button" data-close-account-adjustment>إلغاء</button></div></form></section></div>
    <div class="client-profile-compact"><span>الهاتف: ${escapeHtml(client.phone || "—")}</span><span>كاش: ${escapeHtml(client.cash_phone || "—")}</span><span>إنستا: ${escapeHtml(client.instagram || "—")}</span><span>تاريخ الملف: ${formatDateTime(client.created_at)}</span></div>
    <div class="client-management-tabs" role="tablist" aria-label="تبويبات ملف العميل">
      <button type="button" role="tab" aria-selected="${activeClientProfileTab === "overview"}" class="client-management-tab${activeClientProfileTab === "overview" ? " active" : ""}" data-client-profile-tab="overview">الملف والحساب</button>
      <button type="button" role="tab" aria-selected="${activeClientProfileTab === "statement"}" class="client-management-tab${activeClientProfileTab === "statement" ? " active" : ""}" data-client-profile-tab="statement">كشف الحساب والسجل المالي</button>
    </div>
    <div data-client-profile-panel="overview"${activeClientProfileTab === "overview" ? "" : " hidden"}>
    ${accountLinkSection}
    ${clientFabricBalanceSection}
    ${panel("موديلات مطلوبة للقص / قيد الانتظار", pendingClientModelRequests.length
      ? table(["اسم الموديل","كود/رقم العميل","العدد","الصورة","الحالة","تاريخ الطلب"], clientRequestRows(pendingClientModelRequests))
      : '<div class="empty-state">لا توجد طلبات قص بانتظار المراجعة.</div>', "هذه الطلبات منفصلة عن سجل الموديلات ولا تدخل التشغيل أو الحساب حتى إتمام القص فعلياً.")}
    ${reviewedClientModelRequests.length ? panel("طلبات القص السابقة", table(["اسم الموديل","كود/رقم العميل","العدد","الصورة","الحالة","تاريخ الطلب"], clientRequestRows(reviewedClientModelRequests))) : ""}
    <div class="stats-grid client-finance-summary">${summary.latestSettlement ? stat("الرصيد المرحّل من آخر تصفية", money(summary.openingBalance), "قبل حركات الفترة الحالية") : ""}${stat("المتبقي من البضاعة بحالات التشغيل الأخرى", money(summary.pendingGoodsBalance), "بعد تخصيص الدفعات؛ لا يدخل في المستحقات")}${stat("المستحق للطلبات الجاهزة أو المسلّمة", money(summary.deliveredDue), "حسب حالة الطلب وبعد تخصيص الدفعات")}${stat("مصروفات وعهد العميل", money(summary.clientExpensesTotal))}${stat("خصومات التسوية", money(summary.accountAdjustmentsTotal), "خصومات غير نقدية")}${stat("إجمالي المدفوع", money(summary.paid))}${stat("الرصيد الإجمالي", money(summary.balance), summary.balance === 0 ? "تم السداد بالكامل" : summary.balance < 0 ? "رصيد دائن للعميل" : summary.deliveredDue > 0 ? "يوجد مستحق حسب حالة الطلب" : summary.hasUndeliveredGoods ? "يشمل بضاعة بحالات تشغيل أخرى" : "لا يوجد مستحق حالياً")}</div>
    </div>
    <div data-client-profile-panel="statement"${activeClientProfileTab === "statement" ? "" : " hidden"}>
    <section class="client-detail-section">${panel("كشف الحساب والسجل المالي", `<p>يعرض ملخص رصيد كل طلب حسب حالته، ثم التسليمات والدفعات والمصروفات والخصومات والتسويات بترتيب زمني. تعديل أو حذف الدفعة الخاطئة يعيد احتساب حساب العميل دون إنشاء حركة صرف نقدية عكسية.</p>${orderLedgerSection}<form class="form-grid client-cash-form" data-client-cash-form="${escapeHtml(client.id)}"><div class="field"><label for="client-cash-category-${escapeHtml(client.id)}">بند المصروف / العهدة</label><input id="client-cash-category-${escapeHtml(client.id)}" name="category" maxlength="120" placeholder="مثل: سلفة، خيط، نقل" required></div><div class="field"><label for="client-cash-amount-${escapeHtml(client.id)}">المبلغ على حساب العميل (ج.م)</label><input id="client-cash-amount-${escapeHtml(client.id)}" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="client-cash-method-${escapeHtml(client.id)}">طريقة الصرف</label><input id="client-cash-method-${escapeHtml(client.id)}" name="method" value="نقدي" maxlength="80"></div><div class="field"><label for="client-cash-date-${escapeHtml(client.id)}">تاريخ الحركة</label><input id="client-cash-date-${escapeHtml(client.id)}" name="occurredAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field wide"><label for="client-cash-description-${escapeHtml(client.id)}">البيان / التفاصيل</label><input id="client-cash-description-${escapeHtml(client.id)}" name="description" maxlength="500" required></div><div class="form-actions"><button class="button button-primary" type="submit">تسجيل المصروف على الحساب</button></div></form>${clientFinancialStatementMarkup(financialEntries)}`)}</section>
    <div class="modal-backdrop" data-client-payment-modal hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="client-payment-edit-title"><button class="modal-close" type="button" data-close-client-payment aria-label="إغلاق">×</button><h2 id="client-payment-edit-title">تعديل دفعة العميل</h2><form class="form-grid" data-client-payment-edit-form><input type="hidden" name="recordId"><label class="field"><span>المبلغ (ج.م)</span><input name="amount" type="number" min="0.01" step="0.01" required></label><label class="field"><span>التاريخ</span><input name="date" type="date" required></label><label class="field"><span>طريقة الدفع</span><select name="method"><option>تحويل بنكي</option><option>نقدي</option><option>محفظة إلكترونية</option></select></label><label class="field"><span>رقم الطلبية / المرجع</span><input name="reference" maxlength="160"></label><label class="field wide"><span>ملاحظات</span><input name="notes" maxlength="500"></label><div class="form-actions wide"><button class="button button-primary" type="submit">حفظ التعديل</button><button class="row-action" type="button" data-close-client-payment>إلغاء</button></div></form></section></div>
    </div>
    <div data-client-profile-panel="overview"${activeClientProfileTab === "overview" ? "" : " hidden"}>
    <section class="client-detail-section"><header class="section-heading"><div><h2>الموديلات التي تم تسعيرها</h2><p>يُحتسب المطلوب المالي على الكمية التي تم تسليمها.</p></div><button class="button button-secondary" type="button" data-open-order-for-client="${escapeHtml(client.id)}">＋ إضافة موديل للعميل</button></header>${pricedOrders.length ? `<div class="order-cards">${pricedOrders.map((order) => orderCard(order)).join("")}</div>` : '<div class="empty-state">لا توجد موديلات مسعّرة في الفترة الحالية.</div>'}</section>
    <section class="client-detail-section"><header class="section-heading"><div><h2>موديلات لم تُسعّر بعد</h2><p>طلبات في القص أو الانتظار أو مراحل التشغيل الأخرى.</p></div></header>${unpricedOrders.length ? `<div class="order-cards">${unpricedOrders.map((order) => orderCard(order)).join("")}</div>` : '<div class="empty-state">لا توجد موديلات بانتظار التسعير.</div>'}</section>
    <section class="client-detail-section">${panel("الموديلات المسلّمة", deliveries.length ? table(["الموديل","الكمية","سعر القطعة","القيمة المستحقة","المستلم","التاريخ"], deliveries.map((delivery) => { const order = data.models.find((item) => item.id === delivery.order_id); return `<tr><td>${escapeHtml(order?.name || "طلب مؤرشف")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(delivery.quantity)} قطعة</td><td>${money(delivery.price_per_piece)}</td><td>${money(delivery.amount)}</td><td>${escapeHtml(delivery.recipient_name || "—")}</td><td>${formatDateTime(delivery.delivered_at)}</td></tr>`; })) : '<div class="empty-state">لا توجد تسليمات مسجلة لهذا العميل.</div>')}</section>
    <section class="client-detail-section">${panel("سجل القماش الداخل للعميل", clientFabrics.length ? table(["القماش / اللون","المتاح","الحركة","الكمية","التاريخ"], clientFabricTransactions.map((transaction) => { const fabric = clientFabrics.find((item) => item.id === transaction.fabric_id); return `<tr><td>${escapeHtml(fabric?.name || "—")} · ${escapeHtml(fabric?.color_name || "لون غير مسمى")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric?.quantity_available || 0)} ${escapeHtml(fabric?.unit || "")}</td><td>${escapeHtml(transaction.transaction_type)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(transaction.quantity)} ${escapeHtml(fabric?.unit || "")}</td><td>${formatDateTime(transaction.created_at)}</td></tr>`; })) : '<div class="empty-state">لا يوجد قماش مرتبط بهذا العميل.</div>')}</section>
    <section class="client-detail-section">${panel("ملاحظات وتنبيهات خاصة بالعميل", `${clientNotes.length ? `<div class="client-note-list">${clientNotes.map((note) => `<article><p>${escapeHtml(note.note || "")}</p><time>${formatDateTime(note._createdAt || note.created_at)}</time></article>`).join("")}</div>` : '<div class="empty-state">لا توجد ملاحظات مسجلة.</div>'}<form class="client-note-form" data-client-note="${escapeHtml(client.id)}"><label for="client-note-${escapeHtml(client.id)}">إضافة ملاحظة أو تنبيه</label><textarea id="client-note-${escapeHtml(client.id)}" name="note" rows="3" required></textarea><button class="button button-secondary" type="submit">حفظ الملاحظة</button></form>`)}</section>
    <section class="client-detail-section"><header class="section-heading"><div><h2>الفترات المالية السابقة</h2><p>الأوامر والتسليمات محفوظة في الأرشيف ولا تُحذف عند التصفية.</p></div><button class="button button-primary" type="button" data-settle-client="${escapeHtml(client.id)}">تصفية الحساب وترحيل الرصيد</button></header>
      ${summary.settlements.length ? `<div class="settlement-history">${summary.settlements.map((entry) => `<article class="settlement-card"><div><strong>رصيد سابق مرحّل</strong><small>${formatDateTime(entry.date || entry._createdAt)}</small></div><div><span>رصيد افتتاحي</span><strong>${money(entry.openingBalance)}</strong></div><div><span>قيمة التسليمات</span><strong>${money(entry.deliveredTotal)}</strong></div><div><span>مصروفات وعهد</span><strong>${money(entry.clientExpensesTotal || 0)}</strong></div><div><span>خصومات التسوية</span><strong>${money(entry.accountAdjustmentsTotal || 0)}</strong></div><div><span>المدفوع</span><strong>${money(Number(entry.orderPaidTotal || 0) + Number(entry.paymentsTotal || 0))}</strong></div><div><span>رصيد الفترة الختامي</span><strong>${money(entry.balance)}</strong></div></article>`).join("")}</div>` : '<div class="empty-state">لم تتم تصفية حساب العميل سابقًا.</div>'}
      ${archivedOrders.length ? `<h3 class="history-subheading">الموديلات والطلبات المؤرشفة</h3><div class="order-cards">${archivedOrders.map((order) => orderCard(order, true)).join("")}</div>` : ""}
    </section>
    </div>`;
}

function pendingAccountRows(accounts, clients) {
  const pending = accounts.filter((account) => account.status === "pending");
  const availableClients = clients.filter((client) => !client.user_id);
  const clientOptions = availableClients.map((client) =>
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}${client.brand_name ? ` · ${escapeHtml(client.brand_name)}` : ""}</option>`
  ).join("");
  if (!pending.length) return '<div class="empty-state">لا توجد طلبات تسجيل بانتظار الموافقة.</div>';
  return `<div class="pending-approval-list">${pending.map((account) => `<article class="pending-approval-card" data-pending-account="${escapeHtml(account.id)}">
    <header class="pending-approval-heading"><div><h3>${escapeHtml(account.name || "حساب جديد")}</h3><p>${escapeHtml(account.username)}${account.phone ? ` · ${escapeHtml(account.phone)}` : ""}</p></div><div class="pending-approval-date">${formatDateTime(account.created_at)}</div></header>
    <label class="field pending-role-field"><span>الخطوة 1 · نوع الحساب</span><select data-pending-account-type="${escapeHtml(account.id)}"><option value="">اختر نوع الحساب</option><option value="client">عميل</option><option value="worker">عامل</option><option value="supervisor">مشرف / موظف</option></select></label>
    <section class="pending-approval-options" data-pending-options="client" hidden><h4>الخطوة 2 · اعتماد العميل</h4>
      ${availableClients.length ? `<label class="field"><span>ملف عميل مسجل مسبقاً</span><select data-pending-client-map="${escapeHtml(account.id)}"><option value="">اختر ملف العميل</option>${clientOptions}</select></label><button class="button button-primary" type="button" data-action="approve-client-existing" data-account-id="${escapeHtml(account.id)}">ربط الحساب بالعميل</button>` : '<p class="pending-approval-note">لا توجد ملفات عملاء غير مرتبطة حالياً؛ يمكنك اعتماد ملف جديد.</p>'}
      <button class="button button-secondary" type="button" data-action="approve-client-new" data-account-id="${escapeHtml(account.id)}">اعتماد كعميل جديد</button>
    </section>
    <section class="pending-approval-options" data-pending-options="worker" hidden><h4>الخطوة 2 · اعتماد العامل</h4>
      <p class="pending-approval-note">لا يُنشأ ملف عامل من طلب التسجيل. أنشئ ملف العامل أولاً من تبويب «العاملين»، ثم اربط هذا الحساب من نموذج الملف.</p>
    </section>
    <section class="pending-approval-options" data-pending-options="supervisor" hidden><h4>الخطوة 2 · اعتماد المشرف / الموظف</h4>
      <p class="pending-approval-note">لا يُنشأ ملف موظف من طلب التسجيل. أنشئ ملفه الوظيفي من تبويب «العاملين»، ثم اربط الحساب المعلّق من نموذج الملف لتفعيل دوره.</p>
    </section>
  </article>`).join("")}</div>`;
}

function modelSizeColorCardsMarkup(order) {
  const sizeData = parseSizeData(order.sizes);
  const sizeOrder = orderedSizeEntries(sizeData);
  const multiplicities = sizeOrder.reduce((counts, size) => {
    counts[size] = Number(counts[size] || 0) + 1;
    return counts;
  }, {});
  const distributionColors = Array.isArray(order.colorSizeDistribution?.colors)
    ? order.colorSizeDistribution.colors
    : [];
  const cuttingColors = parseColorPlyData(order.colorPlyData, order.colors);
  const colors = distributionColors.length
    ? distributionColors.map((entry) => ({
      color: String(entry.color || "").toUpperCase(),
      name: String(entry.name || order.colorNames?.[String(entry.color || "").toUpperCase()] || ""),
      sizes: entry.sizes || {}
    }))
    : cuttingColors.map((entry) => ({
      color: entry.color,
      name: entry.name || order.colorNames?.[entry.color] || "",
      plys: entry.plys,
      sizes: {}
    }));
  const sizes = sizeOrder.length
    ? sizeOrder
    : [...new Set(colors.flatMap((entry) => Object.keys(entry.sizes)))];
  if (!sizes.length) return '<div class="empty-state">لا توجد مقاسات مسجلة لهذا الموديل.</div>';
  return `<div class="model-size-color-grid">${sizes.map((size, index) => {
    const occurrence = sizeOrder.length
      ? sizeOrder.slice(0, index + 1).filter((entry) => entry === size).length
      : index + 1;
    const colorCards = colors.map((entry) => {
      const aggregateCount = Number(entry.sizes?.[size] || 0);
      const count = Number.isFinite(entry.plys)
        ? entry.plys
        : aggregateCount > 0
          ? Math.floor(aggregateCount / Math.max(multiplicities[size] || 1, 1))
            + (occurrence <= aggregateCount % Math.max(multiplicities[size] || 1, 1) ? 1 : 0)
          : 0;
      const color = /^#[0-9A-F]{6}$/.test(entry.color) ? entry.color : "";
      return `<div class="model-size-color-item"><span class="model-size-color-name">${color ? `<i class="color-breakdown-swatch" style="--swatch-color:${color}"></i>` : ""}${escapeHtml(entry.name || "اسم اللون غير مسجل")}</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(count)} قطعة</strong></div>`;
    }).join("");
    const fallbackCount = Number(sizeData.counts[size] || 0);
    return `<article class="model-size-card"><header><span>${escapeHtml(SIZE_TYPE_LABELS[sizeData.type] || "المقاس")} · ${escapeHtml(size)}</span>${multiplicities[size] > 1 ? `<small>التكرار ${occurrence} من ${multiplicities[size]}</small>` : ""}</header><div class="model-size-color-list">${colorCards || `<div class="model-size-color-item"><span>إجمالي المقاس</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Math.floor(fallbackCount / Math.max(multiplicities[size] || 1, 1)))} قطعة</strong></div>`}</div></article>`;
  }).join("")}</div>`;
}

function modelExpenseEntriesMarkup(order) {
  const entries = Array.isArray(order.expenseEntries) ? order.expenseEntries : [];
  return entries.length
    ? table(["بيان المصروف الخارجي","نوع المصروف والأثر المالي","قيمة المصروف","حركة الخزنة المترتبة","التاريخ"], entries.map((entry) => `<tr><td>${escapeHtml(entry.description)}</td><td>${escapeHtml(modelExpenseTypeLabel(entry.expense_type))}</td><td>${money(entry.amount)}</td><td>خروج نقدي من الخزنة</td><td>${formatDateTime(entry.created_at)}</td></tr>`))
    : '<div class="empty-state">لا توجد بنود مصروفات منفصلة لهذا الموديل.</div>';
}

function modelExpenseTypeLabel(expenseType) {
  return ({
    customer_cash: "على العميل ومسحوب من الخزنة",
    treasury_only: "من الخزنة فقط (تكلفة تشغيلية)",
    included_in_price: "مدمج ضمن سعر القطعة"
  })[expenseType] || "مصروف خارجي";
}

function adminCuttingEditFormMarkup(order, expanded = false, pickerPrefix = `admin-cutting-${order.id}`) {
  return `<details class="admin-cutting-edit"${expanded ? " open" : ""}>
    <summary class="button button-secondary">تعديل البيانات</summary>
    <form class="admin-cutting-editor-form" data-admin-cutting-edit="${escapeHtml(order.id)}" data-customer-id="${escapeHtml(order.customerId || "")}" data-saved-fabric="false">
      <div class="form-section-grid cutting-bed-inputs">
        <label class="field"><span>الخامة المستخدمة</span><select name="fabricId" data-fabric-select required>${fabricSelectOptions(dashboardData.fabrics, order.fabricId || "", dashboardData.clients, true)}</select><small data-fabric-stock-hint></small></label>
        <label class="field"><span>وحدة السحب</span><select name="fabricUnit" data-fabric-unit-select><option value="توب" ${order.fabricUnit === "توب" ? "selected" : ""}>عدد التوب</option><option value="متر" ${order.fabricUnit !== "توب" ? "selected" : ""}>الكمية بالمتر</option></select></label>
        <label class="field"><span>الكمية المستخدمة</span><input name="fabricQuantity" type="number" min="0.001" step="0.001" value="${order.fabricQuantity || ""}" required></label>
        <input type="hidden" name="boltCount" value="${order.boltCount || 0}">
        <label class="field" data-external-fabric-source-field hidden><span>اسم المورد / مصدر الخامة الخارجية</span><input name="externalFabricSource" maxlength="120" value="${escapeHtml(order.externalFabricSource || "")}"></label>
        <input type="hidden" name="externalFabricUnit" value="${order.externalFabricUnit || "متر"}">
      </div>
      <label class="field"><span>المورد / تفاصيل مصدر القماش</span><input name="fabricDetails" maxlength="240" value="${escapeHtml(order.fabricDetails || "")}"></label>
      ${sizePickerMarkup(order.sizes, pickerPrefix, false, true)}
      ${cuttingColorPlyMarkup(order.colorPlyData, order.colors, order.layerCount, pickerPrefix)}
      <p class="cutting-calculated-total">إجمالي الراقات: <strong data-cutting-plys>0</strong> · إجمالي قطع القصة: <strong data-cutting-total>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity || 0)}</strong> قطعة</p>
      <div class="cutting-breakdown" data-cutting-breakdown></div>
      <label class="field"><span>مسؤول القص</span><input name="cutterName" maxlength="120" value="${escapeHtml(order.cutterName || "")}"></label>
      <label class="field"><span>ملاحظات فنية للفرشة والقص</span><textarea name="technicalNotes" rows="3">${escapeHtml(order.cuttingNotes || "")}</textarea></label>
      <div class="form-actions"><button type="submit" class="button button-primary">حفظ بيانات القص</button></div>
    </form>
  </details>`;
}

function modelDetailsModalView(order, showPricingBreakdown = false) {
  const canEditDeliveryQuantities = showPricingBreakdown && !order.archivedAt;
  const pricingDetails = showPricingBreakdown && order.pricingMode === "stages"
    ? Object.entries(order.stagePrices || {}).map(([stage, price]) => {
      const label = WORK_STAGES.find(([key]) => key === stage)?.[1] || stage;
      return `<div><span>سعر قسم ${escapeHtml(label)}</span><strong>${money(price)}</strong></div>`;
    }).join("")
    : "";
  const deliveryHistory = order.deliveryHistory?.length
    ? table(["#", "الكمية", "المستلم", "تاريخ التسليم", ...(canEditDeliveryQuantities ? ["تعديل التسليم"] : [])], order.deliveryHistory.map((delivery, index) => `<tr><td>${index + 1}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(delivery.quantity)} قطعة</td><td>${escapeHtml(delivery.recipient_name || "—")}</td><td>${formatDateTime(delivery.delivered_at)}</td>${canEditDeliveryQuantities ? `<td><label class="field"><span>كمية الدفعة ${index + 1} (صفر لحذفها)</span><input type="number" min="0" step="1" value="${delivery.quantity}" data-edit-delivery-quantity="${escapeHtml(delivery.id)}"></label><button class="row-action" type="button" data-save-delivery-quantity="${escapeHtml(delivery.id)}">حفظ التسليم</button></td>` : ""}</tr>`))
    : '<div class="empty-state">لا توجد دفعات تسليم مسجلة.</div>';
  return `<header class="modal-view-heading">${modelImageMarkup(order.modelImageUrls || order.modelImageUrl)}<div><small>تفاصيل الطلبية / الفرشة</small><h2 id="model-details-title">${escapeHtml(order.name || "موديل بدون اسم")}</h2><p>كود الموديل بالنظام: ${escapeHtml(order.factoryModelCode || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(order.clientModelCode || "—")}</p><p>العميل: ${escapeHtml(order.client || "—")}</p></div>${statusTag(order.displayStatus || order.status)}</header>
    <div class="compact-detail-grid">
      <div><span>العدد المطلوب الأصلي</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.originalQuantity)} قطعة</strong></div>
      <div><span>العدد</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة</strong></div>
      <div><span>إجمالي العدد المسلّم</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.deliveredPieces)} قطعة</strong></div>
      ${LOCKED_FACTORY_ORDER_STATUSES.includes(order.status) ? `<div><span>فرق التسليم عن المطلوب</span><strong>${order.quantityDifference > 0 ? `زيادة ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantityDifference)} قطعة` : order.quantityDifference < 0 ? `نقص ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Math.abs(order.quantityDifference))} قطعة` : "مطابق للعدد المطلوب"}</strong></div>` : ""}
      <div><span>سعر القطعة</span><strong>${money(order.pricePerPiece)}</strong></div>
      <div><span>مصاريف تشغيل إضافية</span><strong>${money(order.operationalExpenses)}</strong></div>
      <div><span>المتوقع / غير المسلم</span><strong>${money(order.expectedAmount)} <small>لم يتم التسليم بعد</small></strong></div>
      <div><span>المبلغ المستحق فعلياً</span><strong>${money(order.totalAmount)}</strong></div>
      <div><span>المدفوع</span><strong>${money(order.paidAmount)}</strong></div>
      <div><span>المتبقي الحالي</span><strong>${money(order.remainingAmount)}</strong></div>
      <div><span>القماش / الفرشة</span><strong>${escapeHtml(order.fabric || "—")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(order.fabricQuantity)} ${escapeHtml(order.fabricUnit || "متر")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.layerCount)} راقات</strong></div>
      <div><span>مسؤول القص</span><strong>${escapeHtml(order.cutterName || "—")}</strong></div>
      <div><span>عدد الأتواب</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.boltCount || 0)}</strong></div>
      <div><span>أقسام الشغل</span><strong>${escapeHtml(workStageLabels(order.workStages).join(" · ") || "—")}</strong></div>
      <div><span>طريقة التسعير</span><strong>${order.pricingMode === "stages" ? "سعر مستقل لكل قسم" : "سعر إجمالي للقطعة"}</strong></div>
      ${pricingDetails}
      <div><span>تم الإرسال بواسطة</span><strong>${escapeHtml(order.senderName || "—")}</strong></div>
      <div><span>التسليم المتوقع</span><strong>${formatDateOnly(order.expectedDeliveryDate)}</strong></div>
    </div>
    <h3 class="modal-subheading">توزيع المقاسات والألوان</h3>
    ${modelSizeColorCardsMarkup(order)}
    ${cuttingDetailsMarkup(order)}
    ${showPricingBreakdown && !order.archivedAt && !LOCKED_FACTORY_ORDER_STATUSES.includes(order.status) ? adminCuttingEditFormMarkup(order) : ""}
    ${showPricingBreakdown ? `<h3 class="modal-subheading">سجل المصروفات الخارجية والإضافية</h3>${modelExpenseEntriesMarkup(order)}` : ""}
    <h3 class="modal-subheading">سجل دفعات التسليم</h3>${deliveryHistory}
    ${showPricingBreakdown && order.quantity > 0 && !order.archivedAt && !LOCKED_FACTORY_ORDER_STATUSES.includes(order.status)
      ? '<div class="form-actions"><button class="button button-primary" type="button" data-open-final-handover>تسليم / تسوية وإغلاق الطلب</button></div>'
      : ""}`;
}

function clientQuickDetailsModalView(client, data) {
  const summary = clientAccountSummary(client, data);
  const orders = summary.orders.slice(0, 8);
  const pipelineGroups = factoryOrderPipelineGroups(summary.orders)
    .filter((group) => group.key !== "unclassified" || group.orders.length);
  return `<header class="modal-view-heading"><div><small>ملف العميل</small><h2 id="client-account-modal-title">${escapeHtml(client.name)}</h2><p>${escapeHtml(client.brand_name || "—")} · رقم العميل ${escapeHtml(client.client_number || "—")}</p></div></header>
    <div class="client-balance-primary"><span>${summary.deliveredDue > 0 ? "المستحق حسب حالة الطلب" : summary.creditBalance > 0 ? "الرصيد الدائن" : "المستحق حسب حالة الطلب"}</span><strong>${money(summary.deliveredDue > 0 ? summary.deliveredDue : summary.creditBalance)}</strong><small>${summary.deliveredDue > 0 ? "يشمل الطلبات الجاهزة للتسليم أو المسلّمة فقط" : summary.creditBalance > 0 ? "بعد تخصيص الدفعات للبضاعة تحت التسليم أولاً" : summary.hasUndeliveredGoods ? "لا يوجد مستحق حسب الحالة؛ المتبقي معروض في بضاعة تحت التسليم" : "لا يوجد مستحق حسب حالة الطلب حالياً"}</small></div>
    <div class="compact-detail-grid">
      <div><span>المتبقي الفعلي من البضاعة تحت التسليم بعد الدفعات</span><strong>${money(summary.pendingGoodsBalance)}</strong></div>
      <div><span>المستحق للطلبات الجاهزة للتسليم أو المسلّمة</span><strong>${money(summary.deliveredDue)}</strong></div>
      <div><span>إجمالي رصيد الحساب المتوقع</span><strong>${money(summary.balance)}</strong></div>
      <div><span>خصومات التسوية</span><strong>${money(summary.accountAdjustmentsTotal)}</strong></div>
      <div><span>المدفوع</span><strong>${money(summary.paid)}</strong></div>
    </div>
    <h3 class="modal-subheading">حالات الموديلات الحالية</h3>
    <div class="compact-detail-grid">${pipelineGroups.map((group) =>
      `<div><span>${escapeHtml(group.label)}</span><strong>${group.orders.length}</strong></div>`
    ).join("")}</div>
    <h3 class="modal-subheading">آخر الموديلات</h3>
    ${orders.length ? `<div class="compact-model-list">${orders.map((order) => `<button type="button" class="compact-model-item" data-open-model-id="${escapeHtml(order.id)}"><strong>${escapeHtml(order.name || order.modelNumber || "موديل بدون اسم")}</strong><span>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة · ${money(order.pricePerPiece)}</span>${statusTag(order.displayStatus || order.status)}</button>`).join("")}</div>` : '<p class="empty-state">لا توجد موديلات حالية.</p>'}
    <div class="form-actions"><button class="button button-primary" type="button" data-open-client-profile="${escapeHtml(client.id)}">فتح الملف الكامل</button><button class="button button-secondary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">إضافة دفعة</button><button class="button button-secondary" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل ملف العميل</button></div>`;
}

function printDocument(title, bodyMarkup) {
  let printRoot = document.querySelector("#factory-print-document");
  if (!printRoot) {
    printRoot = document.createElement("main");
    printRoot.id = "factory-print-document";
    printRoot.hidden = true;
    document.body.append(printRoot);
  }
  printRoot.innerHTML = `<header class="print-heading"><strong>AL-MOTAMAYEZ</strong><h1>${escapeHtml(title)}</h1><p>تاريخ الطباعة: ${formatDateTime(new Date())}</p></header>${bodyMarkup}`;
  printRoot.hidden = false;
  document.body.classList.add("printing-document");
  window.addEventListener("afterprint", () => {
    printRoot.hidden = true;
    document.body.classList.remove("printing-document");
  }, { once: true });
  window.print();
}

function modelPrintMarkup(order, clientName) {
  const orderTotal = addMoney(order.totalAmount, order.expectedAmount);
  return `<section class="print-section"><h2>بيانات الموديل</h2><table><thead><tr><th>اسم الموديل</th><th>كود الموديل بالنظام</th><th>كود/رقم الموديل للعميل</th><th>العميل</th><th>العدد</th><th>سعر القطعة</th><th>مصاريف التشغيل</th><th>الإجمالي</th></tr></thead><tbody><tr><td>${escapeHtml(order.name || "—")}</td><td>${escapeHtml(order.factoryModelCode || "—")}</td><td>${escapeHtml(order.clientModelCode || "—")}</td><td>${escapeHtml(clientName || order.client || "—")}</td><td>${new Intl.NumberFormat("en-US").format(order.quantity || 0)}</td><td>${money(order.pricePerPiece)}</td><td>${money(order.operationalExpenses)}</td><td>${money(orderTotal)}</td></tr></tbody></table></section>`;
}

function printClientAccount(client, data) {
  const summary = clientAccountSummary(client, data);
  const orders = data.models.filter((order) => order.customerId === client.id);
  const activeOrderLedgers = new Map(summary.orders.map((order) => [order.id, order]));
  const movements = [
    ...data.deliveries.filter((entry) => entry.customer_id === client.id).map((entry) => ({
      type: "تسليم بضاعة",
      description: `${entry.quantity} قطعة · ${entry.recipient_name || ""}`,
      amount: Number(entry.amount),
      date: entry.delivered_at
    })),
    ...data.payments.filter((entry) => entry.customerId === client.id).map((entry) => ({
      type: "دفعة عميل",
      description: `${entry.method || ""} · ${entry.reference || entry.notes || ""}`,
      amount: -Number(entry.amount),
      date: entry._createdAt || entry.created_at || entry.date
    })),
    ...summary.accountAdjustments.map((entry) => ({
      type: "خصم تسوية حساب",
      description: `${entry.reason || "خصم مسموح به"}${entry.notes ? ` · ${entry.notes}` : ""}`,
      amount: -Number(entry.amount || 0),
      date: entry._createdAt || entry.created_at || entry.date
    })),
    ...data.cashTransactions.filter((entry) => entry.customer_id === client.id).map((entry) => ({
      type: entry.direction === "expense" ? "مصروف / عهدة على حساب العميل" : "إيراد",
      description: `${entry.category} · ${entry.description || ""}`,
      amount: entry.direction === "expense" ? Number(entry.amount) : -Number(entry.amount),
      date: entry.occurred_at
    })),
    ...summary.settlements.map((entry) => ({
      type: "تصفية وترحيل رصيد",
      description: `الرصيد الختامي للفترة: ${money(entry.balance)}`,
      amount: Number(entry.balance),
      date: entry.date || entry._createdAt
    }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const modelRows = orders.map((order) => {
    const total = addMoney(order.totalAmount, order.expectedAmount);
    const ledgerOrder = activeOrderLedgers.get(order.id);
    const classification = ledgerOrder
      ? factoryOrderIsReceivable(ledgerOrder) ? "مستحق حسب حالة الطلب" : "بضاعة تحت التسليم"
      : "مؤرشف / فترة سابقة";
    const allocatedPayments = ledgerOrder
      ? addMoney(ledgerOrder.ledgerPendingPaid, ledgerOrder.ledgerDeliveredPaid)
      : 0;
    const outstanding = ledgerOrder
      ? addMoney(ledgerOrder.pendingBalance, ledgerOrder.deliveredBalance)
      : 0;
    const thumbnail = order.modelImageUrl
      ? `<img class="print-model-thumbnail" src="${escapeHtml(order.modelImageUrl)}" alt="صورة ${escapeHtml(order.name || "الموديل")}">`
      : "—";
    return `<tr><td>${thumbnail}</td><td><strong>${escapeHtml(order.name || "—")}</strong><small class="print-model-code">كود النظام: ${escapeHtml(order.factoryModelCode || "—")}</small></td><td>${escapeHtml(order.modelNumber || "—")}</td><td>${new Intl.NumberFormat("en-US").format(order.quantity || 0)}</td><td>${money(order.pricePerPiece)}</td><td>${money(order.operationalExpenses)}</td><td>${money(total)}</td><td>${escapeHtml(order.status || "—")}</td><td>${classification}</td><td>${money(allocatedPayments)}</td><td>${money(outstanding)}</td></tr>`;
  }).join("");
  const movementRows = movements.map((entry) =>
    `<tr><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.description || "—")}</td><td>${money(entry.amount)}</td><td>${formatDateTime(entry.date)}</td></tr>`
  ).join("");
  const body = `<section class="print-section"><h2>كشف الحساب · ${escapeHtml(client.name)}</h2><p>البراند: ${escapeHtml(client.brand_name || "—")} · رقم العميل: ${escapeHtml(client.client_number || "—")}</p><div class="print-summary"><div><span>الرصيد السابق المرحّل</span><strong>${money(summary.openingBalance)}</strong></div><div><span>المستحق للطلبات الجاهزة للتسليم أو المسلّمة</span><strong>${money(summary.deliveredDue)}</strong></div><div><span>المتبقي من البضاعة بحالات التشغيل الأخرى بعد الدفعات</span><strong>${money(summary.pendingGoodsBalance)}</strong></div><div><span>المصروفات والعهد الحالية</span><strong>${money(summary.clientExpensesTotal)}</strong></div><div><span>خصومات التسوية الحالية</span><strong>${money(summary.accountAdjustmentsTotal)}</strong></div><div><span>إجمالي المدفوع</span><strong>${money(summary.paid)}</strong></div><div><span>إجمالي المستحق حسب حالة الطلب</span><strong>${money(summary.receivableBalance)}</strong></div><div><span>الرصيد الإجمالي للحساب</span><strong>${money(summary.balance)}</strong></div></div></section>
    <section class="print-section"><h2>الموديلات والطلبيات</h2><table class="print-models-table"><thead><tr><th>الصورة</th><th>اسم الموديل وكود النظام</th><th>كود العميل</th><th>العدد</th><th>سعر القطعة</th><th>مصاريف التشغيل</th><th>الإجمالي</th><th>الحالة</th><th>تصنيف الرصيد</th><th>المدفوع المخصص</th><th>المتبقي</th></tr></thead><tbody>${modelRows || '<tr><td colspan="11">لا توجد موديلات مسجلة.</td></tr>'}</tbody></table></section>
    <section class="print-section"><h2>حركة الحساب</h2><table><thead><tr><th>نوع الحركة</th><th>البيان</th><th>الأثر المالي</th><th>التاريخ</th></tr></thead><tbody>${movementRows || '<tr><td colspan="4">لا توجد حركات مسجلة.</td></tr>'}</tbody></table></section>`;
  printDocument("كشف حساب العميل", body);
}

function fabricSelectOptions(fabrics, selectedId = "", clients = [], allowExternal = false) {
  const selectableFabrics = allowExternal
    ? fabrics.filter((fabric) => fabric.stock_scope === "incoming")
    : fabrics;
  return `<option value="">اختر خامة من المخزون</option>${allowExternal ? `<option value="external" ${selectedId === "external" ? "selected" : ""}>خامة أخرى / خارجية غير مسجلة بالمخزن</option>` : ""}${selectableFabrics.map((fabric) =>
    `<option value="${escapeHtml(fabric.id)}" data-name="${escapeHtml(fabric.name)}" data-unit="${escapeHtml(fabric.unit)}" data-customer="${escapeHtml(fabric.customer_id || "")}" data-color="${escapeHtml(fabric.color_name || "")}" data-available="${escapeHtml(fabric.quantity_available)}" ${fabric.stock_scope === "incoming" && !fabric.customer_id ? "disabled" : ""} ${fabric.id === selectedId ? "selected" : ""}>${escapeHtml(fabric.name)}${fabric.customer_id ? ` · ${escapeHtml(clients.find((client) => client.id === fabric.customer_id)?.name || "عميل مرتبط")}` : fabric.stock_scope === "incoming" ? " · بانتظار تعيين العميل" : ""} · ${escapeHtml(fabric.color_name || "لون غير مسمى")} · متاح ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric.quantity_available)} ${escapeHtml(fabric.unit)}</option>`
  ).join("")}`;
}

function cuttingFabricTypeKey(fabric) {
  return encodeURIComponent(JSON.stringify([fabric.name || "", fabric.fabric_type || ""]));
}

function cuttingFabricTypeOptions(fabrics, customerId) {
  const types = [...new Map(fabrics
    .filter((fabric) => fabric.stock_scope === "incoming"
      && fabric.customer_id
      && (!customerId || fabric.customer_id === customerId))
    .map((fabric) => [cuttingFabricTypeKey(fabric), fabric]))
    .values()];
  return `<option value="">اختر نوع القماش</option>${types.map((fabric) =>
    `<option value="${escapeHtml(cuttingFabricTypeKey(fabric))}">${escapeHtml(fabric.name)}${fabric.fabric_type ? ` · ${escapeHtml(fabric.fabric_type)}` : ""}</option>`
  ).join("")}<option value="__external__">خامة خارجية / غير مسجلة بالمخزون</option>`;
}

function cuttingFabricLineMarkup(fabrics, typeKey, customerId) {
  const isExternal = typeKey === "__external__";
  const matchingFabrics = fabrics.filter((fabric) =>
    fabric.stock_scope === "incoming"
    && fabric.customer_id === customerId
    && cuttingFabricTypeKey(fabric) === typeKey
  );
  const colorChoices = matchingFabrics.map((fabric) =>
    `<option value="${escapeHtml(fabric.id)}" data-name="${escapeHtml(fabric.name)}" data-fabric-type="${escapeHtml(fabric.fabric_type || "")}" data-unit="${escapeHtml(fabric.unit)}" data-available="${escapeHtml(fabric.quantity_available)}" data-color="${escapeHtml(fabric.color_name || "")}">${escapeHtml(fabric.color_name || "لون غير مسمى")} · متاح ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric.quantity_available)} ${escapeHtml(fabric.unit)}</option>`
  ).join("");
  return `<div class="cutting-fabric-line${isExternal ? " cutting-fabric-line-external" : ""}" data-cutting-fabric-line>
    ${isExternal
      ? `<label class="field"><span>اللون</span><input data-external-fabric-color maxlength="64" placeholder="اسم اللون"></label>
        <label class="field"><span>الكمية</span><input data-fabric-line-quantity type="number" min="1" step="1" required></label>
        <label class="field"><span>الوحدة</span><select data-fabric-line-unit><option value="توب">توب</option><option value="متر">متر</option></select></label>`
      : `<label class="field"><span>اللون من مخزون العميل</span><select data-fabric-line-id required><option value="">اختر اللون</option>${colorChoices}</select><small data-fabric-line-stock></small></label>
        <label class="field"><span>الكمية لهذا اللون</span><input data-fabric-line-quantity type="number" min="0.001" step="0.001" required></label>`}
    <button type="button" class="row-action" data-remove-cutting-fabric-line>حذف اللون</button>
  </div>`;
}

function incomingFabricColorRowMarkup() {
  return `<div class="incoming-fabric-color-row" data-incoming-fabric-color-row>
    <label class="field"><span>اسم اللون</span><input name="colorName" maxlength="64"></label>
    <label class="field"><span>درجة اللون</span>${customColorControlMarkup("#FFFFFF", 'name="colorHex"')}</label>
    <label class="field"><span>الكمية</span><input name="quantity" type="number" min="0.001" step="0.001" required></label>
    <label class="field"><span>الوحدة</span><select name="unit" required><option value="متر">متر</option><option value="توب">توب</option></select></label>
    <button type="button" class="row-action" data-remove-incoming-color>حذف اللون</button>
  </div>`;
}

function syncIncomingFabricQuantity(row) {
  const unit = row.querySelector('[name="unit"]')?.value;
  const quantity = row.querySelector('[name="quantity"]');
  if (!quantity) return;
  const wholeTobs = unit === "توب";
  quantity.step = wholeTobs ? "1" : "0.001";
  quantity.min = wholeTobs ? "1" : "0.001";
  quantity.placeholder = wholeTobs ? "عدد التوب" : "الكمية بالمتر";
}

function incomingFabricGroupMarkup(fabrics = [], addNew = false) {
  const types = [...new Set(fabrics.map((fabric) => fabric.name).filter(Boolean))];
  return `<fieldset class="incoming-fabric-group" data-incoming-fabric-group>
    <legend>نوع القماش</legend>
    <label class="field"><span>اسم القماش</span><select name="fabricType" data-incoming-fabric-type required><option value="">اختر نوع القماش</option>${types.map((name) => `<option value="${escapeHtml(name)}"${addNew ? "" : ""}>${escapeHtml(name)}</option>`).join("")}<option value="__new__"${addNew ? " selected" : ""}>＋ إضافة نوع جديد</option></select></label>
    <label class="field incoming-new-type-field"${addNew ? "" : " hidden"}><span>اسم النوع الجديد</span><input name="name" maxlength="120"${addNew ? " required" : " disabled"}></label>
    <div class="incoming-fabric-color-list" data-incoming-fabric-color-list>${incomingFabricColorRowMarkup()}</div>
    <button type="button" class="row-action" data-add-incoming-color>＋ إضافة لون آخر</button>
    <button type="button" class="row-action order-delete-action" data-remove-incoming-type hidden>حذف نوع القماش</button>
  </fieldset>`;
}

function ownerFabricReceiptLineMarkup(fabrics) {
  return `<div class="fabric-entry-row owner-fabric-entry-row" data-fabric-entry-row>
    <label class="field"><span>صنف قماش الإدارة</span><select name="fabricId" required>${fabricSelectOptions(fabrics)}</select></label>
    <label class="field"><span>الكمية الداخلة</span><input name="quantity" type="number" min="0.001" step="0.001" required></label>
    <button type="button" class="row-action" data-remove-fabric-row>حذف الصنف</button>
  </div>`;
}

function fabricStockView(data, isAdmin) {
  const ownerFabrics = data.fabrics.filter((fabric) => fabric.stock_scope === "owner");
  const incomingFabrics = data.fabrics.filter((fabric) => fabric.stock_scope === "incoming");
  const totalTransactions = data.fabricTransactions.length;
  const customerName = (customerId) => data.clients.find((client) => client.id === customerId)?.name || "";
  const quantityForUnit = (fabric, unit) => fabric.unit === unit
    ? new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric.quantity_available)
    : "—";
  const totalForUnit = (fabrics, unit) => new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 })
    .format(fabrics.filter((fabric) => fabric.unit === unit)
      .reduce((sum, fabric) => sum + Number(fabric.quantity_available), 0));
  const fabricRows = (fabrics, showActions) => fabrics.map((fabric) => {
    const color = `<span class="fabric-color"><i style="--fabric-color:${escapeHtml(fabric.color_hex)}"></i>${escapeHtml(fabric.color_name || "لون غير مسمى")}</span>`;
    const actions = showActions
      ? `<button class="row-action" type="button" data-edit-fabric="${escapeHtml(fabric.id)}">تعديل البيانات</button> <button class="row-action" type="button" data-delete-fabric="${escapeHtml(fabric.id)}">حذف</button>`
      : "متاح للقص";
    return `<tr><td>${escapeHtml(fabric.name)}</td><td>${color}</td><td>${escapeHtml(customerName(fabric.customer_id) || "مخزون الإدارة")}</td><td>${quantityForUnit(fabric, "توب")}</td><td>${quantityForUnit(fabric, "متر")}</td><td>${formatDateTime(fabric.received_at || fabric.updated_at)}</td><td>${actions}</td></tr>`;
  });
  const incomingRows = incomingFabrics.map((fabric) => {
    const color = `<span class="fabric-color"><i style="--fabric-color:${escapeHtml(fabric.color_hex)}"></i>${escapeHtml(fabric.color_name || "لون غير مسمى")}</span>`;
    const assignment = isAdmin
      ? `<div class="incoming-assignment"><select aria-label="تعيين العميل للقماش" data-incoming-customer="${escapeHtml(fabric.id)}"><option value="">عميل غير معروف / غير محدد حالياً</option>${data.clients.map((client) => `<option value="${escapeHtml(client.id)}" ${client.id === fabric.customer_id ? "selected" : ""}>${escapeHtml(client.name)}</option>`).join("")}</select><button class="row-action" type="button" data-assign-incoming-fabric="${escapeHtml(fabric.id)}">حفظ العميل</button><button class="row-action" type="button" data-edit-fabric="${escapeHtml(fabric.id)}">تعديل</button><button class="row-action order-delete-action" type="button" data-delete-fabric="${escapeHtml(fabric.id)}">حذف</button></div>`
      : "";
    return `<tr><td>${escapeHtml(fabric.name)}</td><td>${color}</td><td>${escapeHtml(customerName(fabric.customer_id) || "عميل غير معروف / غير محدد حالياً")}</td><td>${quantityForUnit(fabric, "توب")}</td><td>${quantityForUnit(fabric, "متر")}</td><td>${formatDateTime(fabric.received_at || fabric.created_at)}</td><td>${assignment || "متاح للقص"}</td></tr>`;
  });
  const transactionRows = data.fabricTransactions.map((transaction) => {
    const fabric = data.fabrics.find((item) => item.id === transaction.fabric_id);
    const order = data.models.find((item) => item.id === transaction.order_id);
    const labels = {
      receipt: "وارد",
      withdrawal: "سحب للقص",
      return: "إرجاع / تسوية",
      adjustment_in: "تسوية بالزيادة",
      adjustment_out: "تسوية بالنقص"
    };
    const isOutflow = ["withdrawal", "adjustment_out"].includes(transaction.transaction_type);
    const amount = `${isOutflow ? "−" : "+"}${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(transaction.quantity)} ${escapeHtml(fabric?.unit || "")}`;
    const movementAction = transaction.order_id || !isAdmin
      ? `<span class="order-delete-protected">${transaction.order_id ? "مرتبطة بأمر قص" : "حركة مسجلة"}</span>`
      : `<button class="row-action order-delete-action" type="button" data-delete-fabric-transaction="${escapeHtml(transaction.id)}">حذف الحركة</button>`;
    return `<tr><td>${escapeHtml(fabric?.name || "خامة محذوفة")}</td><td>${escapeHtml(labels[transaction.transaction_type] || transaction.transaction_type)}</td><td>${amount}</td><td>${escapeHtml(order?.name || (transaction.order_id ? transaction.order_id.slice(0, 8) : "—"))}</td><td>${escapeHtml(transaction.notes || "—")}</td><td>${formatDateTime(transaction.created_at)}</td><td>${movementAction}</td></tr>`;
  });
  const incomingForm = `<form class="form-grid fabric-form incoming-fabric-form" id="incoming-fabric-form"><div class="field"><label for="incoming-fabric-client">اسم العميل</label><select id="incoming-fabric-client" name="customerId"><option value="">عميل غير معروف / غير محدد حالياً</option>${data.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join("")}</select></div><div class="field"><label for="incoming-fabric-date">تاريخ ووقت الاستلام</label><input id="incoming-fabric-date" name="receivedAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field wide"><label for="incoming-fabric-notes">ملاحظات الحركة</label><input id="incoming-fabric-notes" name="notes" maxlength="500"></div><div class="wide incoming-fabric-groups" data-incoming-fabric-groups>${incomingFabricGroupMarkup(data.fabrics)}</div><div class="form-actions"><button class="button button-secondary" type="button" data-add-incoming-type>＋ إضافة نوع قماش جديد</button><button class="button button-primary" type="submit">＋ تسجيل القماش الداخل</button></div></form>`;
  const incomingSection = `<section id="incoming-fabric" class="dashboard-section">
    <div class="stats-grid">${stat("سجلات القماش الداخل", incomingFabrics.length, "مرتبطة بعميل أو بانتظار التحديد")}${stat("الأثواب المتاحة للقص", totalForUnit(incomingFabrics, "توب"), "عدد أثواب منفصل")}${stat("الأمتار المتاحة للقص", totalForUnit(incomingFabrics, "متر"), "بعد خصم القماش المستخدم")}${isAdmin ? stat("حركات القماش", totalTransactions, "استلام وسحب") : ""}</div>
    ${panel("القماش الداخل", incomingForm, "اكتب نوع القماش مرة واحدة، ثم أضف لوناً وكمية ووحدة لكل لون. يمكن تسجيل عدة أنواع في الشحنة نفسها.")}
    ${panel("مخزون القماش الحالي للقص", table(["اسم القماش","اللون","العميل / المالك","عدد الأثواب","المتاح بالمتر","تاريخ الاستلام","إجراء"], incomingRows))}
    ${isAdmin ? panel("حركات المخزون", table(["القماش","الحركة","الكمية","رقم الطلب","البيان","التاريخ والوقت","إجراء"], transactionRows)) : ""}
  </section>`;
  if (!isAdmin) return incomingSection;
  const ownerSection = `<section id="owner-fabric" class="dashboard-section">
    <div class="stats-grid">${stat("أصناف قماش الإدارة", ownerFabrics.length, "إدارة خاصة بالأدمن")}${stat("أثواب الإدارة", totalForUnit(ownerFabrics, "توب"))}${stat("أمتار الإدارة", totalForUnit(ownerFabrics, "متر"))}${stat("حركات المخزون", totalTransactions, "وارد وسحب")}</div>
    <div class="fabric-admin-tools">
      ${panel("أنواع القماش", `<form class="form-grid fabric-form" id="fabric-form"><input type="hidden" name="fabricId"><div class="field"><label for="fabric-name">اسم القماش</label><input id="fabric-name" name="name" maxlength="120" required></div><div class="field fabric-color-name-field"><label for="fabric-color-name">اسم اللون</label><input id="fabric-color-name" name="colorName" maxlength="64"></div><label class="field fabric-color-picker-field"><span>درجة اللون</span>${customColorControlMarkup("#FFFFFF", 'name="colorHex"')}</label><div class="field"><label for="fabric-unit">وحدة القياس</label><select id="fabric-unit" name="unit" required><option value="متر">متر</option><option value="توب">توب</option></select></div><div class="form-actions"><button class="button button-primary" type="submit">حفظ بيانات القماش</button><button class="row-action" type="button" data-cancel-fabric-edit hidden>إلغاء التعديل</button></div></form>`, "تغيير الوحدة غير متاح بعد تسجيل حركات على الصنف")}
      ${panel("القماش الداخل", `<form class="form-grid fabric-form" id="fabric-receipt-form"><div class="field"><label for="fabric-receipt-date">تاريخ الإدخال</label><input id="fabric-receipt-date" name="receivedAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field"><label for="fabric-receipt-notes">ملاحظات / مرجع</label><input id="fabric-receipt-notes" name="notes" maxlength="500"></div><div class="wide fabric-entry-list" data-fabric-entry-list>${ownerFabricReceiptLineMarkup(ownerFabrics)}</div><div class="form-actions"><button class="button button-secondary" type="button" data-add-fabric-row>＋ إضافة صنف</button><button class="button button-primary" type="submit">＋ تسجيل الكميات الداخلة</button></div></form>`, "هذا رصيد الإدارة فقط، ولا يظهر في سجل القماش الداخل الخاص بمشرف القص")}
      ${panel("تعديل المخزون", `<form class="form-grid fabric-form" id="fabric-adjustment-form"><div class="field"><label for="fabric-adjustment-item">صنف قماش الإدارة</label><select id="fabric-adjustment-item" name="fabricId" required>${fabricSelectOptions(ownerFabrics)}</select></div><div class="field"><label for="fabric-adjustment-quantity">فرق الكمية (+ زيادة / − نقص)</label><input id="fabric-adjustment-quantity" name="adjustment" type="number" step="0.001" required></div><div class="field"><label for="fabric-adjustment-date">تاريخ التعديل</label><input id="fabric-adjustment-date" name="adjustedAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field"><label for="fabric-adjustment-notes">سبب التعديل</label><input id="fabric-adjustment-notes" name="notes" maxlength="500" required></div><div class="form-actions"><button class="button button-secondary" type="submit">حفظ التعديل</button></div></form>`, "يُسجل الفرق كحركة تدقيقية ولا يمكن أن يخفض الرصيد إلى أقل من صفر")}
    </div>
    ${panel("مخزون القماش الحالي للإدارة", table(["اسم القماش","اللون","العميل / المالك","عدد الأثواب","المتاح بالمتر","آخر تحديث","إجراء"], fabricRows(ownerFabrics, true)))}
    ${panel("سجل حركات مخزون الإدارة", table(["القماش","نوع الحركة","الكمية","رقم الطلب","ملاحظات","التاريخ والوقت"], transactionRows.filter((transaction) => ownerFabrics.some((fabric) => fabric.id === transaction.fabric_id))))}
  </section>`;
  return `${ownerSection}${incomingSection}`;
}

function workerPermissionsView(users) {
  const workers = users.filter((user) => user.roleKey === "worker");
  const rows = workers.map((worker) => `<tr data-worker-permissions="${escapeHtml(worker.id)}">
    <td>${escapeHtml(worker.name)}</td><td>${escapeHtml(worker.username)}</td>
    <td><select name="jobTitle" aria-label="الدور أو المسمى الوظيفي للعامل">${WORKER_JOB_TITLES.map((title) => `<option value="${escapeHtml(title)}" ${title === (worker.jobTitle || "غير محدد") ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}</select></td>
    <td><label class="permission-toggle"><input name="canSubmitProduction" type="checkbox" ${worker.canSubmitProduction ? "checked" : ""}><span>إتاحة تسليم طلبية / إنتاج</span></label></td>
    <td><button class="row-action" type="button" data-save-worker-permissions="${escapeHtml(worker.id)}">حفظ الصلاحيات</button></td>
  </tr>`);
  return panel("أدوار العمال وصلاحياتهم", workers.length
    ? table(["العامل","اسم المستخدم","المسمى الوظيفي","الصلاحية","إجراء"], rows)
    : '<div class="empty-state">لا توجد حسابات عمال مفعّلة لإدارة صلاحياتها.</div>',
  "تعديل المسمى يحدد تخصص العامل داخل دور العامل. تفعيل الإذن يتيح إرسال التسليمات للمراجعة فقط، ولا يسمح باعتمادها أو ربطها بعميل.");
}

function workerProductionReviewView(data) {
  const pending = data.productionSubmissions.filter((item) => item.status === "pending");
  const rejected = data.productionSubmissions.filter((item) => item.status === "rejected");
  const confirmedRows = data.finishedGoods.map((item) =>
    `<tr><td>${escapeHtml(item.model_name)}${item.model_number ? `<small class="worker-model-number">${escapeHtml(item.model_number)}</small>` : ""}${data.productionSubmissions.find((submission) => submission.id === item.submission_id)?.parent_submission_id ? '<small class="submission-parent-note">تسليم تابع للتسليم السابق</small>' : ""}</td><td>${escapeHtml(data.clients.find((client) => client.id === item.customer_id)?.name || "—")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity)} قطعة</td><td>${workerProductionColorMarkup(item.colors)}</td><td>${modelImageMarkup(item.imageUrl, `صورة القطعة ${item.model_name}`, "submission-image-preview") || "—"}</td><td>${escapeHtml(item.worker_name)}</td><td>${formatDateTime(item.confirmed_at)}</td></tr>`
  );
  const orderOptions = data.models.map((order) =>
    `<option value="${escapeHtml(order.id)}" data-customer="${escapeHtml(order.clientId || "")}">${escapeHtml(order.name)} · ${escapeHtml(order.client || "بدون عميل")}</option>`
  ).join("");
  const cards = pending.map((item) => {
    const colors = Array.isArray(item.colors) ? item.colors : [];
    const initialColors = colors.map((entry) => typeof entry === "string" ? entry : entry.hex || entry.color || "")
      .filter((color) => /^#[0-9A-F]{6}$/i.test(color)).join(", ");
    const initialColorNames = Object.fromEntries(colors
      .filter((entry) => entry && typeof entry === "object" && /^#[0-9A-F]{6}$/i.test(entry.hex || entry.color || ""))
      .map((entry) => [(entry.hex || entry.color).toUpperCase(), String(entry.name || "")]));
    const initialSizeNames = [...new Set(colors.flatMap((entry) =>
      entry && typeof entry === "object" && entry.sizes && typeof entry.sizes === "object"
        ? Object.keys(entry.sizes)
        : []
    ))];
    const initialSizeType = Object.entries(SIZE_OPTIONS).find(([, sizes]) =>
      initialSizeNames.length && initialSizeNames.every((size) => sizes.includes(size))
    )?.[0] || "";
    const initialSizeData = JSON.stringify({
      type: initialSizeType,
      counts: Object.fromEntries(initialSizeNames.map((size) => [size, "0"]))
    });
    const clientOptions = data.clients.map((client) =>
      `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}${client.brand_name ? ` · ${escapeHtml(client.brand_name)}` : ""}</option>`
    ).join("");
    return `<form class="worker-submission-review" data-worker-submission="${escapeHtml(item.id)}">
      <header>${modelImageMarkup(item.imageUrl, `صورة القطعة ${item.model_name}`, "submission-image-preview")}<div><h3>${escapeHtml(item.model_name)}</h3><p>${escapeHtml(item.worker_name)} · ${escapeHtml(item.job_title || "عامل")} · ${formatDateTime(item.created_at)}</p>${item.parentSubmission ? `<span class="submission-parent-note">تسليم تابع للتسليم السابق · ${escapeHtml(item.parentSubmission.model_name)} · ${formatDateTime(item.parentSubmission.created_at)}</span>` : ""}</div></header>
      <div class="form-grid">
        <label class="field"><span>الموديل / الوصف</span><input name="modelName" maxlength="160" value="${escapeHtml(item.model_name)}" required></label>
        <label class="field"><span>كود/رقم الموديل للعميل (اختياري)</span><input name="modelNumber" maxlength="120" value="${escapeHtml(item.model_number || "")}"></label>
        <label class="field"><span>العدد المسلّم</span><input name="quantity" type="number" min="1" step="1" value="${Number(item.quantity)}" required></label>
        ${colorPickerMarkup(initialColors, `worker-review-${item.id}`, initialColorNames)}
        ${sizePickerMarkup(initialSizeData, `worker-review-sizes-${item.id}`, false)}
        <div class="field worker-production-allocation"><label>توزيع الألوان على المقاسات</label><div data-worker-production-allocation>${workerProductionAllocationGridMarkup(colors.map((entry) => ({
          color: String(typeof entry === "string" ? entry : entry.hex || entry.color || "").toUpperCase(),
          name: typeof entry === "string" ? "" : String(entry.name || "")
        })).filter((entry) => /^#[0-9A-F]{6}$/.test(entry.color)), JSON.parse(initialSizeData), colors)}</div></div>
        <label class="field"><span>العميل</span><select name="customerId" required><option value="">اختر العميل</option>${clientOptions}</select></label>
        <label class="field"><span>ربط بطلبية مسجلة (اختياري)</span><select name="orderId"><option value="">بدون ربط بطلبية</option>${orderOptions}</select></label>
        <label class="field wide"><span>ملاحظات العامل</span><textarea name="notes" rows="2" maxlength="1000">${escapeHtml(item.notes || "")}</textarea></label>
      </div>
      <div class="form-actions"><button class="row-action" type="button" data-save-production-submission="${escapeHtml(item.id)}">حفظ التعديلات</button><button class="button button-primary" type="button" data-confirm-production-submission="${escapeHtml(item.id)}">تأكيد واستلام النهائي</button><button class="button button-danger" type="button" data-reject-production-submission="${escapeHtml(item.id)}">رفض الطلب</button><button class="button button-secondary" type="button" data-delete-production-submission="${escapeHtml(item.id)}">حذف الطلب</button></div>
    </form>`;
  });
  const rejectedCards = rejected.map((item) =>
    `<article class="worker-submission-card"><header>${modelImageMarkup(item.imageUrl, `صورة القطعة ${item.model_name}`, "submission-image-preview")}<div><h3>${escapeHtml(item.model_name)}</h3><p>${escapeHtml(item.worker_name)} · ${formatDateTime(item.created_at)}</p>${item.parentSubmission ? '<span class="submission-parent-note">تسليم تابع للتسليم السابق</span>' : ""}${statusTag("مرفوض")}</div></header><div class="worker-submission-actions"><button class="button button-secondary" type="button" data-delete-production-submission="${escapeHtml(item.id)}">حذف الطلب</button></div></article>`
  );
  return `${panel("تسليمات العامل الواردة للمراجعة", cards.length
    ? `<div class="worker-submission-list">${cards.join("")}</div>`
    : '<div class="empty-state">لا توجد تسليمات إنتاج بانتظار مراجعة الإدارة.</div>',
  "تظهر هنا تسليمات العمال الجديدة والتابعة. راجع الصورة والأعداد، ثم اعتمد التسليم أو ارفضه.")}${panel("التسليمات المرفوضة", rejectedCards.length ? `<div class="worker-submission-list">${rejectedCards.join("")}</div>` : '<div class="empty-state">لا توجد تسليمات مرفوضة.</div>')}${panel("سجل الإنتاج المستلم نهائياً", table(["الموديل","العميل","الكمية","الألوان","الصورة","العامل","تاريخ الاستلام"], confirmedRows))}`;
}

function adminView(data, accounts) {
  const activeOrders = data.models.filter((order) => !order.archivedAt && !order.workflowArchivedAt);
  const totalUnits = activeOrders.reduce((sum, item) => sum + Number(item.quantity), 0);
  const paid = data.payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const clientOptions = data.clients.map((client) =>
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`
  ).join("");
  const brandOptions = data.clients.filter((client) => client.brand_name)
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.brand_name)}</option>`)
    .join("");
  const paymentClientOptions = data.clients
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`)
    .join("");
  const paymentFilterOptions = data.clients
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`)
    .join("");
  return `
    <section id="dashboard" class="dashboard-section">
      ${adminDashboardView(data)}<div class="stats-grid">${stat("إجمالي القطع", new Intl.NumberFormat("ar-EG-u-nu-latn").format(totalUnits), "قطعة")}${stat("المدفوعات المسجلة", money(paid), "إجمالي الدفعات")}${stat("طلبات الانصراف", data.leaves.filter((item) => item.status === "قيد المراجعة").length, "بانتظار المراجعة")}</div>
    </section>
    <section id="orders" class="dashboard-section">
      <div class="client-management-tabs order-management-tabs" role="tablist" aria-label="إدارة الموديلات والطلبيات">
        <button type="button" role="tab" aria-selected="${activeOrdersTab === "models"}" class="client-management-tab${activeOrdersTab === "models" ? " active" : ""}" data-orders-tab="models">الموديلات والطلبيات</button>
        <button type="button" role="tab" aria-selected="${activeOrdersTab === "status"}" class="client-management-tab${activeOrdersTab === "status" ? " active" : ""}" data-orders-tab="status">إدارة حالات الموديلات</button>
      </div>
      <div data-orders-tab-panel="models"${activeOrdersTab === "models" ? "" : " hidden"}>
        <div class="clients-toolbar"><div><h2>الموديلات والطلبيات</h2><p>سجّل الموديل أولاً، ثم حدّث العدد الفعلي بعد الفرش والقص.</p></div><button class="button button-primary" type="button" data-open-order-modal>＋ إضافة موديل وطلبية</button></div>
        ${panel("إدارة الموديلات والطلبيات", orderCards(activeOrders, true))}
      </div>
      <div data-orders-tab-panel="status"${activeOrdersTab === "status" ? "" : " hidden"}>${modelStatusReviewView(data)}</div>
      <div class="modal-backdrop" id="model-expense-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="model-expense-title"><button class="modal-close" type="button" data-close-model-expense aria-label="إغلاق">×</button><h2 id="model-expense-title">إضافة مصروف خارجي للموديل</h2><p data-model-expense-name></p><form class="modal-form" data-model-expense-form><input type="hidden" name="orderId"><label for="model-expense-description">بيان المصروف الخارجي</label><input id="model-expense-description" name="description" maxlength="240" required><label for="model-expense-type">نوع المصروف والأثر المالي</label><select id="model-expense-type" name="expenseType" required><option value="customer_cash">مصروف على العميل ومسحوب من الخزنة</option><option value="treasury_only">مصروف مسحوب من الخزنة فقط (تكلفة تشغيلية)</option><option value="included_in_price">مصروف مدمج ضمن سعر القطعة</option></select><small class="model-expense-impact-hint">تُسجّل جميع الأنواع كحركة خروج نقدي؛ ويُضاف النوع الأول فقط إلى حساب العميل.</small><label for="model-expense-amount">قيمة المصروف (ج.م)</label><input id="model-expense-amount" name="amount" type="number" min="0.01" max="999999999999.99" step="0.01" required><div class="form-actions"><button class="button button-primary" type="submit">حفظ المصروف</button><button class="row-action" type="button" data-close-model-expense>إلغاء</button></div></form></section></div>
      <div class="modal-backdrop" id="order-modal" hidden><section class="modal-card order-modal-card" role="dialog" aria-modal="true" aria-labelledby="order-modal-title"><button class="modal-close" type="button" data-close-order aria-label="إغلاق">×</button><h2 id="order-modal-title">إضافة موديل / طلبية</h2><p>يمكن ترك العدد فارغًا حتى انتهاء الفرش والقص، ثم إدخال العدد الفعلي عند تعديل الطلب.</p>            <form id="model-form" class="order-form modal-form" novalidate><input type="hidden" name="editIndex" value=""><input type="hidden" name="savedOrderId" value="">
        <section class="form-section"><h3>المعلومات الأساسية <span>إجباري</span></h3><div class="form-section-grid">
          <input type="hidden" name="customerId">
          <div class="field model-customer-field"><label for="model-client">اختيار اسم العميل</label><select id="model-client" name="customerSelection"><option value="">اختر اسم العميل</option>${clientOptions}</select><small>اختر العميل أو البراند؛ اختيار أحدهما يلغي الآخر.</small></div>
          <div class="field model-brand-field"><label for="model-brand">اختيار اسم البراند</label><select id="model-brand" name="brandSelection"><option value="">اختر اسم البراند</option>${brandOptions}</select></div>
          <div class="field model-name-field"><label for="model-name">اسم الموديل</label><input id="model-name" name="name"></div>
          <div class="field"><label for="model-system-code">كود الموديل بالنظام</label><input id="model-system-code" name="factoryModelCode" readonly placeholder="يُنشأ تلقائياً بعد الحفظ"></div>
          <div class="field"><label for="model-client-code">كود/رقم الموديل للعميل</label><input id="model-client-code" name="clientModelCode" maxlength="120" autocomplete="off"></div>
          <div class="field model-quantity-field"><label for="model-quantity">العدد الكلي</label><input id="model-quantity" name="quantity" type="number" min="0" step="1" placeholder="أدخل العدد أو اتركه حتى انتهاء القص"><small>يمكن إدخال العدد الآن أو تأجيله؛ عند اختيار الألوان والمقاسات يوزع النظام العدد تلقائياً.</small></div>
          <div class="field" data-original-quantity-field hidden><label for="model-original-quantity">العدد المطلوب الأصلي</label><input id="model-original-quantity" name="originalQuantity" type="number" min="0" step="1"></div>
        </div></section>
        <section class="form-section"><h3>التفاصيل التشغيلية <span>اختياري</span></h3><div class="form-section-grid">
          <div class="field wide"><label for="model-production-type">مسار التشغيل</label><select id="model-production-type" name="productionType"><option value="full_cutting">قص وفرش داخل المصنع</option><option value="ready_sewing">موديل جاهز ومقصوص مسبقاً</option></select><small>الموديل الجاهز يتجاوز القص، ويبدأ من الحالة والمرحلة التي تحددها أدناه.</small></div>
          <fieldset class="field work-stage-picker"><legend>الأقسام المطلوبة</legend><div class="work-stage-options">${WORK_STAGES.map(([key, label]) => `<label><input type="checkbox" name="workStage" value="${key}" ${["cutting", "sewing", "finishing"].includes(key) ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset>
          ${colorPickerMarkup("", "model-colors")}
          ${sizePickerMarkup("", "model-sizes", true, true)}
          <div class="model-allocation field"><label>توزيع العدد على الألوان والمقاسات</label><div data-model-allocation-grid><p class="muted">أدخل العدد الكلي واختر الألوان والمقاسات لعرض التوزيع.</p></div><input type="hidden" name="colorSizeDistribution" value='{"colors":[]}'></div>
          <div class="field model-image-field"><span>صور الموديل (اختياري - صورتان كحد أقصى)</span><small>يمكن رفع أو تبديل كل صورة أو حذفها. الحد الأقصى لكل صورة 25 ميجابايت.</small><div class="model-image-slots" data-model-image-slots>${[1, 2].map((slot) => `<section class="model-image-slot" data-model-image-slot="${slot}"><strong>الصورة ${slot}</strong><input type="file" name="modelImage${slot}" accept="image/*" hidden><div data-model-image-preview="${slot}"></div><div class="form-actions"><button class="row-action" type="button" data-model-image-replace="${slot}"><span aria-hidden="true">📷</span> ${slot === 1 ? "إضافة / تبديل الصورة" : "إضافة الصورة الثانية"}</button><button class="row-action order-delete-action" type="button" data-model-image-delete="${slot}" hidden>حذف الصورة</button></div></section>`).join("")}</div></div>
          <div class="field" data-expected-delivery-field><label for="model-expected-delivery">تاريخ التسليم المتوقع (اختياري)</label><input id="model-expected-delivery" name="expectedDeliveryDate" type="date"></div>
          <div class="field"><label for="model-status">حالة الطلب</label><select id="model-status" name="status">${FACTORY_ORDER_STATUSES.map((status) => `<option>${status}</option>`).join("")}</select><small data-workflow-status-hint hidden>حالة الإنتاج الحالية تُدار من خطوات التشغيل، وستبقى كما هي عند حفظ بيانات الموديل.</small></div>
          <div class="field" data-initial-delivery-field hidden><label for="model-delivered-pieces">العدد المسلّم</label><input id="model-delivered-pieces" name="deliveredPieces" type="text" inputmode="numeric" autocomplete="off"><small>يُسجل كدفعة تسليم تاريخية ويُحتسب ضمن حساب العميل.</small></div>
          <div class="field" data-model-priority-field><label for="model-priority">أولوية التنفيذ</label><select id="model-priority" name="priority"><option>عادي</option><option>مرتفع</option><option>عاجل</option></select></div>
        </div></section>
        <section class="form-section cutting-pricing-preview-section"><h3>بيانات القص الفعلية</h3><div data-cutting-pricing-details class="cutting-pricing-details"><p class="muted">تظهر تفاصيل القص والخامة هنا عند تسعير موديل مسجل.</p></div></section>
        <section class="form-section"><h3>التفاصيل المالية <span>اختياري</span></h3><div class="form-section-grid">
          <div class="field"><label for="model-pricing-mode">طريقة التسعير</label><select id="model-pricing-mode" name="pricingMode"><option value="total">سعر إجمالي للقطعة</option><option value="stages">تسعير كل قسم للقطعة</option></select></div>
          <div class="field stage-prices-field" data-stage-prices-field hidden><label>سعر القطعة لكل قسم (ج.م)</label><div class="stage-prices-list" data-stage-prices-list></div><small>سعر القطعة الإجمالي يساوي مجموع أسعار الأقسام المختارة.</small></div>
          <input type="hidden" name="stagePrices" value="{}">
          <div class="field"><label for="model-price">سعر القطعة الإجمالي (ج.م)</label><input id="model-price" name="pricePerPiece" type="number" min="0" max="9999999999.99" step="0.01" value="0"><small id="model-price-history-note" hidden>تعديل السعر يعيد احتساب قيمة التسليمات المسجلة لهذا الموديل ورصيد العميل.</small></div>
          <div class="field"><label for="model-paid">العربون (اختياري)</label><input id="model-paid" name="paidAmount" type="number" min="0" step="0.01" value="0"></div>
          <div class="field"><label for="model-operational-expenses">مصاريف تشغيل إضافية على العميل (ج.م)</label><input id="model-operational-expenses" name="operationalExpenses" type="number" min="0" max="999999999999.99" step="0.01" value="0"></div>
          <div class="field"><label for="model-expected-total">الإجمالي المتوقع (العدد × السعر + المصروفات)</label><output id="model-expected-total" class="calculated-value">0 ج.م</output></div>
          <div class="field"><label for="model-remaining">المتبقي المتوقع بعد العربون</label><output id="model-remaining" class="calculated-value">0 ج.م</output></div>
          <div class="field"><label for="client-balance-preview">الرصيد المتوقع للعميل بعد الحفظ</label><output id="client-balance-preview" class="calculated-value">اختر العميل</output></div>
        </div></section>
        <div class="form-actions"><button class="button button-primary" type="submit">حفظ الطلبية</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button><button class="row-action" type="button" data-close-order>إغلاق</button></div>
      </form><div data-order-cutting-editor hidden></div></section></div>
      <div class="modal-backdrop" id="delivery-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="delivery-modal-title"><button class="modal-close" type="button" data-close-delivery aria-label="إغلاق">×</button><h2 id="delivery-modal-title">تسجيل تسليم جديد</h2><p id="delivery-modal-description">أدخل كمية هذه الدفعة واسم مستلمها؛ ستُضاف إلى إجمالي ما تم تسليمه حتى الآن.</p><form id="delivery-form" class="modal-form"><input type="hidden" name="orderId"><input type="hidden" name="finalize" value=""><label for="delivery-settlement-choice" data-settlement-choice-field hidden>طريقة التسوية</label><select id="delivery-settlement-choice" name="settlementChoice" data-settlement-choice-field hidden></select><label for="delivery-quantity" id="delivery-quantity-label">كمية التسليم</label><input id="delivery-quantity" name="quantity" type="number" min="1" step="1" required><label for="delivery-recipient">اسم المستلم</label><input id="delivery-recipient" name="recipientName" required><div class="form-actions"><button class="button button-primary" type="submit">تسجيل التسليم</button><button class="row-action" type="button" data-close-delivery>إلغاء</button></div></form></section></div>
    </section>
    ${factoryRegistersView(data, true, "cutting", false, true, true)}
    ${clientModelRequestsAdminView(data)}
    <section id="cutting" class="dashboard-section">${adminCuttingTransferView(data)}</section>
    <section id="sewing" class="dashboard-section">${adminSewingView(data)}</section>
    <section id="finance" class="dashboard-section">
      <div class="client-management-tabs finance-management-tabs" role="tablist" aria-label="حسابات العملاء والمصاريف">
        <button type="button" role="tab" aria-selected="${activeFinanceTab === "payments"}" class="client-management-tab${activeFinanceTab === "payments" ? " active" : ""}" data-finance-tab="payments">الدفعات المالية</button>
        <button type="button" role="tab" aria-selected="${activeFinanceTab === "ledger"}" class="client-management-tab${activeFinanceTab === "ledger" ? " active" : ""}" data-finance-tab="ledger">الداخل والخارج</button>
      </div>
      <div data-finance-panel="payments"${activeFinanceTab === "payments" ? "" : " hidden"}>
        ${panel("تسجيل دفعة مالية", `<div class="panel-body"><form id="payment-form" class="form-grid payment-form"><input type="hidden" name="editIndex" value=""><div class="field"><label for="payment-client">العميل</label><select id="payment-client" name="customerId" required><option value="">اختر العميل</option>${paymentClientOptions}</select></div><div class="field"><label for="payment-amount">المبلغ المدفوع (ج.م)</label><input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="payment-date">تاريخ الدفعة</label><input id="payment-date" name="date" type="date" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}" required></div><div class="field"><label for="payment-method">طريقة الدفع</label><select id="payment-method" name="method"><option>تحويل بنكي</option><option>نقدي</option><option>محفظة إلكترونية</option></select></div><div class="field"><label for="payment-reference">رقم الطلبية / مرجع</label><input id="payment-reference" name="reference" autocomplete="off"><small>تُخصم الدفعة من بضاعة تحت التسليم فقط إذا طابق المرجع كود أو رقم طلب واحد. الدفعات العامة لا تُوزع تلقائياً على الطلبات غير المسلّمة.</small></div><div class="field"><label for="payment-notes">ملاحظات</label><input id="payment-notes" name="notes"></div><div class="form-actions"><button class="button button-primary" type="submit">تسجيل الدفعة</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></div></form></div>`, "تُربط الدفعة بملف العميل المحدد، ويحدد المرجع الطلب عند تخصيصها له")}
        ${panel("سجل الدفعات المالية", `<div class="panel-body"><div class="payment-filter field"><label for="payment-filter-client">تصفية حسب العميل</label><select id="payment-filter-client"><option value="">كل العملاء</option>${paymentFilterOptions}</select></div>${table(["العميل","المبلغ","التاريخ والوقت","طريقة الدفع","رقم الطلبية / المرجع","ملاحظات","إجراء"], paymentRows(data.payments, true, data.clients))}</div>`)}
      </div>
      <div data-finance-panel="ledger"${activeFinanceTab === "ledger" ? "" : " hidden"}>${cashLedgerView(data)}</div>
    </section>
    <section id="workers-production" class="dashboard-section">${workerPermissionsView(data.users)}${workerProductionReviewView(data)}${panel("طلبات وأذونات الانصراف", table(["الموظف","التاريخ","السبب","الحالة","إجراء"], data.leaves.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${formatRecordDate(item.date)}</td><td>${escapeHtml(item.reason)}</td><td>${statusTag(item.status)}</td><td>${item.status === "قيد المراجعة" ? `<button class="row-action" data-action="approve-leave" data-index="${index}" type="button">اعتماد</button> <button class="row-action" data-action="deny-leave" data-index="${index}" type="button">رفض</button>` : "—"}</td></tr>`)))}</section>
    ${workforceView(data)}
    ${fabricStockView(data, true)}
    <section id="clients" class="dashboard-section">
      <div class="client-management-tabs" role="tablist" aria-label="إدارة العملاء">
        <button type="button" role="tab" aria-selected="${clientManagementTab === "summary"}" class="client-management-tab${clientManagementTab === "summary" ? " active" : ""}" data-client-tab="summary">حسابات العملاء</button>
        <button type="button" role="tab" aria-selected="${clientManagementTab === "profiles"}" class="client-management-tab${clientManagementTab === "profiles" ? " active" : ""}" data-client-tab="profiles">ملفات العملاء</button>
      </div>
      <div data-client-panel="summary"${clientManagementTab === "summary" ? "" : " hidden"}>${clientAccountsOverview(data)}</div>
      <div data-client-panel="profiles"${clientManagementTab === "profiles" ? "" : " hidden"}>
      <div class="clients-toolbar"><div><h2>ملفات العملاء</h2><p>بيانات العميل والمحل ووسائل التواصل والحساب.</p></div><button class="button button-primary" type="button" data-open-client-modal>＋ إضافة عميل جديد</button></div>
      ${panel("سجل ملفات العملاء", table(["العميل / المحل","كود العميل","رقم العميل","الهاتف / واتساب","حساب الدخول","إجراء"], data.clients.map((client) => {
        const linkedUser = data.users.find((user) => user.id === client.user_id);
        return `<tr><td>${escapeHtml(client.name)}${client.brand_name ? `<br><small>${escapeHtml(client.brand_name)}</small>` : ""}</td><td><strong>${escapeHtml(client.code_letter || "—")}</strong></td><td>${escapeHtml(client.client_number || "—")}</td><td>${escapeHtml(client.whatsapp || client.phone || "—")}</td><td>${linkedUser ? `${escapeHtml(linkedUser.username)} · ${escapeHtml(linkedUser.status === "suspended" ? "متوقف" : "نشط")}` : "لا يوجد حساب دخول"}</td><td><button class="row-action" type="button" data-open-client-details="${escapeHtml(client.id)}">تفاصيل الحساب والعمولة</button> <button class="row-action" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل البيانات</button> <button class="row-action order-delete-action" type="button" data-delete-customer="${escapeHtml(client.id)}">حذف العميل</button></td></tr>`;
      })))}
      <div class="modal-backdrop" id="client-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="client-modal-title"><button class="modal-close" type="button" data-close-client aria-label="إغلاق">×</button><h2 id="client-modal-title">إضافة عميل جديد</h2><p>بيانات ملف العميل ووسائل التواصل.</p><form id="client-form" class="modal-form client-profile-form"><input type="hidden" name="clientId"><label for="client-name">اسم العميل الشخصي</label><input id="client-name" name="name" required><label for="client-brand">اسم المحل أو البراند</label><input id="client-brand" name="brandName"><label for="client-code-letter">حرف كود العميل</label><input id="client-code-letter" name="codeLetter" maxlength="6" pattern="[A-Za-z]+" placeholder="يُنشأ تلقائياً إذا تُرك فارغاً"><small>يُستخدم الحرف في كود الموديل بالنظام، مثل A-1.</small><label for="client-number">رقم العميل</label><input id="client-number" name="clientNumber"><label for="client-phone">رقم الهاتف</label><input id="client-phone" name="phone" type="tel"><label for="client-cash-phone">رقم كاش</label><input id="client-cash-phone" name="cashPhone" type="tel"><label for="client-instagram">حساب إنستا</label><input id="client-instagram" name="instagram"><label for="client-whatsapp">رقم واتساب</label><input id="client-whatsapp" name="whatsapp" type="tel"><label for="client-notes">ملاحظات</label><textarea id="client-notes" name="notes" rows="3"></textarea><div class="form-actions"><button class="button button-primary" type="submit">حفظ العميل</button><button class="row-action" type="button" data-close-client>إلغاء</button></div></form></section></div>
      </div>
    </section>
    <section id="client-details" class="dashboard-section">${data.clients.some((client) => client.id === selectedClientId) ? clientDetailsView(data.clients.find((client) => client.id === selectedClientId), data) : '<div class="empty-state">اختر عميلاً لعرض تفاصيل حسابه.</div>'}</section>
    <section id="accounts" class="dashboard-section">
        ${panel("طلبات إنشاء الحسابات والموافقة", pendingAccountRows(accounts, data.clients), "اعتماد العميل يتم من هنا؛ أما حسابات العاملين والمشرفين فتبقى معلقة حتى إنشاء ملفها وربطها من تبويب العاملين.")}
        ${panel("حسابات المستخدمين", table(["الاسم","اسم المستخدم","الدور الوظيفي","الحالة","إجراء"], userRows(data.users)))}
        ${panel("سجل تسجيل الدخول وطلبات التسجيل", table(["الحساب","نوع الحدث","وقت الحدث"], data.authEvents.map((entry) => {
          const account = data.users.find((user) => user.id === entry.user_id)
            || accounts.find((user) => user.id === entry.user_id);
          return `<tr><td>${escapeHtml(account?.name || entry.user_id)}</td><td>${entry.event_type === "signup" ? "إنشاء حساب" : "تسجيل دخول"}</td><td>${formatDateTime(entry.occurred_at)}</td></tr>`;
        })))}
        ${panel("إعادة ضبط النظام", `<div class="panel-body"><p>مسح جميع بيانات المصنع وحسابات المستخدمين الأخرى نهائياً، مع الإبقاء على حساب الأدمن الحالي فقط.</p><button class="button button-danger" type="button" data-reset-factory>مسح البيانات وإعادة النظام للبداية</button></div>`)}
    </section>
    <div class="modal-backdrop" id="client-account-modal" hidden><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="client-account-modal-title"><button class="modal-close" type="button" data-close-client-view aria-label="إغلاق">×</button><div id="client-account-modal-content"></div></section></div>
    <div class="modal-backdrop" id="model-details-modal" hidden><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="model-details-title"><button class="modal-close" type="button" data-close-model-view aria-label="إغلاق">×</button><div id="model-details-modal-content"></div><div class="form-actions"><button class="button button-secondary" type="button" data-print-model-details>طباعة الموديل</button><button class="button button-secondary" type="button" data-edit-model-from-details>تعديل الطلبية</button><button class="row-action order-delete-action" type="button" data-action="delete-order">حذف الطلبية</button><button class="row-action" type="button" data-close-model-view>إغلاق</button></div></section></div>
    `;
}

function cuttingView(data) {
  const priorityOrder = { عاجل: 0, مرتفع: 1, عادي: 2 };
  const readyStatus = "جاهز للقص";
  const activeCutting = data.cutting
    .filter((item) => ["قيد الانتظار", "قيد الفرش", "تم الفرش", readyStatus].includes(canonicalFactoryOrderStatus(item.orderStatus)))
    .sort((left, right) => (priorityOrder[left.priority] ?? 3) - (priorityOrder[right.priority] ?? 3));
  const cards = activeCutting.length ? `<div class="cutting-order-grid">${activeCutting.map((item) => {
    const orderStatus = canonicalFactoryOrderStatus(item.orderStatus);
    const bedReady = orderStatus === readyStatus;
    const hasSavedFabric = item.fabricQuantity > 0 && Boolean(item.fabricId);
    const displayStatus = orderStatus === "قيد الفرش" && item.layerCount > 0
      ? `قيد الفرش - تم فرش ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.layerCount)} راقات`
      : orderStatus;
    return `<article class="order-card cutting-order-card production-compact-card">
    <header class="production-compact-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<h3>${escapeHtml(item.model)}</h3>${statusTag(displayStatus)}</header>
    <strong class="production-compact-total">${item.total > 0 ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.total)} قطعة` : "بانتظار الحصر"}</strong>
    <div class="production-compact-facts"><div><span>الألوان</span>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</div><div><span>المقاسات</span>${sizeBadgesMarkup(item.sizes)}</div></div>
    <div class="form-actions">${productionDetailsButton("cutting", item)}<button class="button button-secondary" type="button" data-open-cutting-editor="${escapeHtml(item.order)}">تعديل / استكمال القص</button></div>
    </article>
    <div class="modal-backdrop cutting-editor-modal" data-cutting-editor-modal="${escapeHtml(item.order)}" hidden>
      <section class="modal-card production-editor-modal-card" role="dialog" aria-modal="true" aria-label="تعديل بيانات القص">
      <button class="modal-close" type="button" data-close-cutting-editor aria-label="إغلاق">×</button>
      <h2>تعديل بيانات القص · ${escapeHtml(item.model)}</h2>
    <form class="cutting-finish-form" data-finish-cutting="${escapeHtml(item.order)}" data-customer-id="${escapeHtml(item.customerId || "")}" data-saved-fabric="${hasSavedFabric ? "true" : "false"}" data-saved-fabric-id="${escapeHtml(item.fabricId || "")}" data-saved-fabric-name="${escapeHtml(item.fabric || "")}" data-saved-fabric-quantity="${escapeHtml(item.fabricQuantity || "")}" data-saved-fabric-unit="${escapeHtml(item.fabricUnit || "")}" data-saved-fabric-bolt-count="${escapeHtml(item.boltCount || 0)}" data-saved-external-fabric-source="${escapeHtml(item.externalFabricSource || "")}" data-saved-external-fabric-unit="${escapeHtml(item.externalFabricUnit || "")}">
      ${bedReady && hasSavedFabric
        ? `<div class="cutting-saved-fabric"><strong>الخامة المعتمدة لهذه القصة</strong><span>${escapeHtml(item.fabric || "—")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(item.fabricQuantity || 0)} ${escapeHtml(item.fabricUnit || "")}${item.fabricId === "external" ? " · خامة خارجية" : " · مسجلة بالمخزن"}</span><small>سيتم إنهاء القص باستخدام السحب المسجل مسبقًا دون إعادة خصم القماش.</small></div>`
        : `<div class="form-section-grid cutting-bed-inputs">
          <label class="field"><span>اختيار قماش الفرشة</span><select name="fabricId" data-fabric-select required>${fabricSelectOptions(data.fabrics, item.fabricId, data.clients, true)}</select><small data-fabric-stock-hint></small></label>
          <label class="field"><span>وحدة السحب</span><select name="fabricUnit" data-fabric-unit-select><option value="توب" ${item.fabricUnit === "توب" ? "selected" : ""}>عدد التوب</option><option value="متر" ${item.fabricUnit === "متر" ? "selected" : ""}>الكمية بالمتر</option></select></label>
          <label class="field"><span>الكمية المستخدمة</span><input name="fabricQuantity" type="number" min="0.001" step="0.001" value="${item.fabricQuantity || ""}" required></label>
          <input type="hidden" name="boltCount" value="${item.boltCount || 0}">
          <label class="field" data-external-fabric-source-field hidden><span>اسم المورد / مصدر الخامة الخارجية</span><input name="externalFabricSource" maxlength="120" value="${escapeHtml(item.externalFabricSource || "")}" placeholder="اسم المورد أو مصدر القماش"></label>
          <input type="hidden" name="externalFabricUnit" value="متر">
        </div>`}
      ${sizePickerMarkup(item.sizes, `cutting-${item.order}`, false, true)}
      ${cuttingColorPlyMarkup(item.colorPlyData, item.colors, item.layerCount, `cutting-${item.order}`)}
      <p class="cutting-calculated-total">إجمالي الراقات: <strong data-cutting-plys>0</strong> · إجمالي قطع القصة الناتجة: <strong data-cutting-total>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.total)}</strong> قطعة</p>
      <div class="cutting-breakdown" data-cutting-breakdown></div>
      <label class="field"><span>صورة الموديل (اختياري)</span>${imagePickerMarkup("modelImage", "إضافة صورة") }<small>يمكن رفع صيغ الصور الشائعة حتى 25 ميجابايت.</small><div data-repeat-model-image></div></label>
      <label class="field"><span>ملاحظات فنية للفرشة والقص</span><textarea name="technicalNotes" rows="3">${escapeHtml(item.technicalNotes || "")}</textarea></label>
      ${bedReady ? `<label class="field"><span>مين اللي قص القصة؟ (اختياري)</span><input name="cutterName" maxlength="120" value="${escapeHtml(item.cutterName || "")}" placeholder="اسم منفذ القص"></label>` : ""}
      <div class="form-actions">${bedReady ? "" : `<button type="button" class="button button-primary" data-ready-cutting="${escapeHtml(item.order)}">حفظ التفاصيل واعتمادها جاهزة للقص</button>`}<button type="submit" class="button button-primary" ${bedReady ? "" : "hidden"}>تأكيد انتهاء القص</button></div>
    </form>
      </section>
    </div>`;
  }).join("")}</div>` : '<div class="empty-state">لا توجد أوامر قص نشطة حاليًا.</div>';
  return panel("طلبات الإدارة", cards, "أوامر العمل المحولة من الإدارة");
}

function cuttingDashboardView(data) {
  const active = data.cutting.filter((item) => !item.workflowArchivedAt
    && ["قيد الانتظار", "قيد الفرش", "تم الفرش", "جاهز للقص"].includes(canonicalFactoryOrderStatus(item.orderStatus)));
  const activeTotal = active.reduce((sum, item) => sum + Number(item.total), 0);
  const waitingForSewing = factoryOrderPipelineGroups(data.models.filter((order) => !order.archivedAt && !order.workflowArchivedAt))
    .find((group) => group.key === "waiting_sewing");
  return `<div class="stats-grid">${stat("طلبات الإدارة", active.length, "بانتظار استكمال القص")}${stat("العدد المطلوب لطلبات الإدارة", new Intl.NumberFormat("ar-EG-u-nu-latn").format(activeTotal), "قطعة")}${stat("في انتظار الخياطة", waitingForSewing?.orders.length || 0, "قصات مكتملة لم تبدأ خياطتها بعد")}${stat("أصناف القماش المتاحة", data.fabrics.length, "متابعة مباشرة للمخزون")}</div>${panel("ملخص العمل الحالي", `<div class="empty-state">استخدم «طلبات الإدارة» لمراجعة الأوامر وتسجيل بيانات الفرشة والقص، أو «قصة جديدة» لإنشاء قصة مباشرة.</div>`)}`;
}

function modelRegistryEntries(data) {
  const groups = new Map();
  const archivedCodes = new Set((data.modelCatalog || [])
    .filter((catalogModel) => catalogModel.archived_at)
    .map((catalogModel) => catalogModel.factory_model_code));
  for (const model of data.models.filter((entry) =>
    !entry.workflowArchivedAt && !archivedCodes.has(entry.factoryModelCode)
  )) {
    const code = model.factoryModelCode || model.id;
    if (!groups.has(code)) groups.set(code, { code, orders: [], catalogModel: null });
    groups.get(code).orders.push(model);
  }
  for (const catalogModel of (data.modelCatalog || []).filter((entry) => !entry.archived_at)) {
    const code = catalogModel.factory_model_code;
    if (!groups.has(code)) groups.set(code, { code, orders: [], catalogModel: null });
    groups.get(code).catalogModel = catalogModel;
  }
  return [...groups.values()].map((entry) => {
    const orders = entry.orders.sort((left, right) => String(left.createdAt || left.id).localeCompare(String(right.createdAt || right.id)));
    const latestOrder = orders[orders.length - 1];
    const model = entry.catalogModel
      ? {
        id: entry.catalogModel.id,
        name: entry.catalogModel.model_name,
        modelNumber: entry.catalogModel.client_model_code,
        clientModelCode: entry.catalogModel.client_model_code,
        factoryModelCode: entry.catalogModel.factory_model_code,
        modelImageUrl: entry.catalogModel.model_image_url || DEFAULT_MODEL_IMAGE_URL,
        modelImageUrls: [entry.catalogModel.model_image_url || DEFAULT_MODEL_IMAGE_URL, ""],
        customerId: entry.catalogModel.customer_id,
        colors: orders[0]?.colors || "",
        sizes: orders[0]?.sizes || ""
      }
      : orders[0];
    return {
      code: entry.code,
      orders,
      model,
      catalogModel: entry.catalogModel,
      latestActivityAt: Math.max(
        Date.parse(entry.catalogModel?.created_at) || 0,
        Date.parse(latestOrder?.createdAt) || 0
      )
    };
  }).sort((left, right) => {
    return right.latestActivityAt - left.latestActivityAt || right.code.localeCompare(left.code);
  });
}

function modelRegistryView(data, allowRepeat = false, detailsKind = "cutting", canRequestCut = false) {
  const entries = modelRegistryEntries(data);
  const customerOptions = data.clients.map((client) =>
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}${client.brand_name ? ` · ${escapeHtml(client.brand_name)}` : ""}</option>`
  ).join("");
  const registrationForm = canRequestCut
    ? `<form class="form-grid cutting-model-register-form" data-register-factory-model><label class="field"><span>العميل / البراند</span><select name="customerId" required><option value="">اختر العميل</option>${customerOptions}</select></label><label class="field"><span>اسم الموديل</span><input name="modelName" maxlength="160" required></label><label class="field"><span>كود/رقم الموديل للعميل (اختياري)</span><input name="clientModelCode" maxlength="100"></label><label class="field"><span>صورة الموديل (اختياري)</span>${imagePickerMarkup("modelImage", "إضافة صورة")}<small>عند عدم رفع صورة، سيُستخدم شكل افتراضي للموديل.</small></label><div class="form-actions"><button class="button button-primary" type="submit">إضافة إلى سجل الموديلات</button></div></form>`
    : "";
  const cards = entries.map(({ code, model, orders, catalogModel }) => `<article class="cutting-story-card production-compact-card">
    <header class="production-compact-heading">${canRequestCut
      ? catalogModelImageControl(catalogModel || orders[0])
      : modelImageMarkup(model.modelImageUrls || model.modelImageUrl)}<h3>${escapeHtml(model.name || "موديل بدون اسم")}</h3></header>
    <strong class="production-compact-total">${orders.length ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0))} قطعة` : "بانتظار طلب القصة الأولى"}</strong>
    <p class="model-registry-code">كود الموديل بالنظام: ${escapeHtml(code)}${model.clientModelCode ? ` · كود العميل: ${escapeHtml(model.clientModelCode)}` : ""}</p>
    <div class="production-compact-facts"><div><span>الألوان</span>${colorSummaryMarkup(model.colors, model.colorNames, model.colorPlyData)}</div><div><span>المقاسات</span>${sizeBadgesMarkup(model.sizes)}</div></div>
    <div class="form-actions">${productionDetailsButton(detailsKind, detailsKind === "sewing" ? sewingDetailsProjection(model) : model)}
      ${allowRepeat
        && orders.length
        ? `<button class="button button-primary" type="button" data-repeat-cut="${escapeHtml(orders[0].id)}" data-model-code="${escapeHtml(code)}">تكرار القصة / قص جديد</button>`
        : ""}
      ${canRequestCut
        ? `<button class="button button-secondary" type="button" data-request-cut="${escapeHtml(catalogModel?.id || orders[0]?.id || "")}" data-request-cut-kind="${catalogModel ? "catalog" : "order"}" ${catalogModel || orders.length ? "" : "disabled"}>طلب قصة جديدة</button>`
        : ""}
      ${canRequestCut && catalogModel ? `<button class="row-action order-delete-action" type="button" data-delete-factory-model="${escapeHtml(catalogModel.id)}">حذف / أرشفة الموديل</button>` : ""}
      <a class="row-action" href="#cutting-history">سجل القصات</a>
    </div>
  </article>`).join("");
  return panel("سجل الموديلات", `${registrationForm}${cards
    ? `<div class="cutting-story-list">${cards}</div>`
    : '<div class="empty-state">لا توجد موديلات مسجلة حتى الآن.</div>'}`);
}

function catalogModelImageControl(model) {
  if (!model) return modelImageMarkup("");
  const modelId = model.id;
  const modelName = model.model_name || model.name || "الموديل";
  const imageUrl = model.model_image_url || model.modelImageUrl || "";
  const hasImage = Boolean(imageUrl);
  const image = hasImage
    ? modelImageMarkup(imageUrl, `صورة الموديل ${modelName}`)
    : `<button class="model-image-trigger catalog-image-placeholder" type="button" data-catalog-image-trigger="${escapeHtml(modelId)}" aria-label="إضافة صورة للموديل ${escapeHtml(modelName)}"><img class="model-thumbnail" src="${DEFAULT_MODEL_IMAGE_URL}" alt="صورة افتراضية للموديل ${escapeHtml(modelName)}"></button>`;
  return `<span class="catalog-image-control">${image}<input type="file" accept="image/*" hidden data-catalog-image-input="${escapeHtml(modelId)}">${hasImage ? `<button class="row-action catalog-image-change" type="button" data-catalog-image-trigger="${escapeHtml(modelId)}"><span aria-hidden="true">📷</span> تبديل الصورة</button>` : ""}</span>`;
}

function cuttingRequestRollDetails(request) {
  return Array.isArray(request?.roll_details) ? request.roll_details : [];
}

async function cuttingRequestDetailsDialog(customerId, request = null, currentImageUrl = "") {
  const fabrics = dashboardData.fabrics.filter((fabric) =>
    fabric.stock_scope === "incoming" && fabric.customer_id === customerId
  );
  const reservedByFabric = new Map();
  for (const reservation of dashboardData.fabricReservations || []) {
    if (request && reservation.request_id === request.id) continue;
    reservedByFabric.set(
      reservation.fabric_id,
      (reservedByFabric.get(reservation.fabric_id) || 0) + Number(reservation.quantity || 0)
    );
  }
  const options = fabrics.map((fabric) => {
    const available = Math.max(
      0,
      Number(fabric.quantity_available || 0) - (reservedByFabric.get(fabric.id) || 0)
    );
    return {
      value: fabric.id,
      unit: fabric.unit,
      available,
      label: `${fabric.name}${fabric.fabric_type ? ` · ${fabric.fabric_type}` : ""}`
        + `${fabric.color_name ? ` · ${fabric.color_name}` : ""}`
        + ` · المتاح ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(available)} ${fabric.unit || ""}`
    };
  });
  const existingLines = cuttingRequestRollDetails(request).filter((line) => line.fabric_id && line.quantity);
  const legacyRolls = cuttingRequestRollDetails(request).filter((line) => !line.fabric_id);
  const result = await window.factoryUI.formDialog({
    title: request ? "تعديل طلب القص المرسل" : "بيانات طلب القصة الجديدة",
    submitLabel: request ? "حفظ التعديلات" : "إرسال طلب القص",
    fields: [
      {
        name: "fabricLines",
        label: "أقمشة العميل والكميات المطلوب حجزها (اختياري)",
        type: "fabric-rows",
        value: existingLines,
        options,
        helpText: [
          "تُحجز الكميات للطلب فقط ولا يتغير رصيد المخزن المتاح فعلياً إلا بعد إتمام واعتماد القص.",
          legacyRolls.length
            ? `تفاصيل أتواب سابقة: ${legacyRolls.map((roll) => `توب ${roll.roll_number || "—"}${roll.color_name ? ` (${roll.color_name})` : ""}`).join("، ")}`
            : ""
        ].filter(Boolean).join(" ")
      },
      {
        name: "operationalNotes",
        label: "ملاحظات تشغيلية (اختياري)",
        type: "textarea",
        rows: 3,
        maxLength: 2000,
        value: request?.operational_notes || ""
      },
      ...(request ? [{
        name: "modelImage",
        label: `صورة الموديل${currentImageUrl ? " · اتركها دون اختيار للاحتفاظ بالصورة الحالية" : ""}`,
        type: "file",
        accept: "image/*",
        helpText: "اختيار صورة جديدة يبدّل الصورة الحالية للموديل."
      }] : [])
    ]
  });
  if (!result) return null;
  const selectedLines = result.fabricLines || [];
  if (selectedLines.length > 100) {
    window.factoryUI.toast("يمكن إضافة 100 صنف مخزون كحد أقصى للطلب.", "error");
    return null;
  }
  const quantitiesByFabric = new Map();
  for (const line of selectedLines) {
    quantitiesByFabric.set(line.fabric_id, (quantitiesByFabric.get(line.fabric_id) || 0) + line.quantity);
  }
  const rollDetails = [
    ...legacyRolls,
    ...[...quantitiesByFabric].map(([fabric_id, quantity]) => ({ fabric_id, quantity }))
  ];
  return {
    fabricId: quantitiesByFabric.keys().next().value || null,
    rollDetails,
    operationalNotes: result.operationalNotes.trim(),
    modelImage: result.modelImage instanceof File ? result.modelImage : null
  };
}

function cuttingHistoryView(data, allowRepeat = false, sewingView = false, canManageRecords = false) {
  const rows = [...data.cutting]
    .sort((left, right) => String(right.createdAt || right.order).localeCompare(String(left.createdAt || left.order)))
    .map((cut) => {
      const order = data.models.find((entry) => entry.id === cut.order);
      const managementAction = canManageRecords && order
        ? order.workflowArchivedAt
          ? '<span class="status">مؤرشف تشغيلياً</span>'
          : orderCanBeDeleted(order)
            ? `<button type="button" class="row-action order-delete-action" data-action="delete-order" data-order-id="${escapeHtml(order.id)}">حذف</button>`
            : `<button type="button" class="row-action" data-archive-factory-order="${escapeHtml(order.id)}">إيقاف / أرشفة</button>`
        : "";
      return `<tr>
      <td><span class="register-model-cell">${modelImageMarkup(cut.modelImageUrl || cut.modelImageUrls, `صورة الموديل ${cut.model}` , "register-thumbnail") || '<span class="register-thumbnail-placeholder" aria-hidden="true">▣</span>'}<span>${escapeHtml(cut.model)}</span></span></td><td>${escapeHtml(cut.factoryModelCode || "—")}</td>
      <td>${escapeHtml(cut.clientModelCode || "—")}</td><td>${escapeHtml(cut.client || "—")}</td>
      ${sewingView ? "" : `<td>${escapeHtml(cut.fabric || "—")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(cut.fabricQuantity || 0)} ${escapeHtml(cut.fabricUnit || "")}</td><td>${cut.layerCount || 0}</td>`}
      <td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(cut.cut || cut.total || 0)}</td>
      <td>${escapeHtml(cut.status || cut.orderStatus || "—")}</td>
      <td><div class="form-actions">${productionDetailsButton(sewingView ? "sewing-history" : "cutting", sewingView ? sewingDetailsProjection(cut) : cut)}${managementAction}${allowRepeat
        ? `<button type="button" class="row-action" data-repeat-cut="${escapeHtml(cut.order)}" data-model-code="${escapeHtml(cut.factoryModelCode || "")}">تكرار القصة</button>`
        : ""}</div></td>
    </tr>`;
    });
  return panel("سجل القصات المنفذة", rows.length
    ? table(sewingView
      ? ["الموديل","كود النظام","كود العميل","العميل","القطع","الحالة","الإجراء"]
      : ["الموديل","كود النظام","كود العميل","العميل","الخامة والكمية","الراقات","القطع","الحالة","الإجراء"], rows)
    : '<div class="empty-state">لا توجد قصات مسجلة بعد.</div>');
}

function dispatchedCuttingRequestsView(data, canManageRecords = false) {
  const requests = [...(data.cuttingRequests || [])]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const rows = requests.map((request) => {
    const catalogModel = data.modelCatalog.find((entry) => entry.id === request.catalog_model_id);
    const sourceOrder = data.models.find((entry) => entry.id === request.source_order_id);
    const modelName = catalogModel?.model_name || sourceOrder?.name || "موديل غير متاح";
    const modelCode = catalogModel?.factory_model_code || sourceOrder?.factoryModelCode || "—";
    const modelImage = catalogModel?.model_image_url || sourceOrder?.modelImageUrl || "";
    const client = data.clients.find((entry) => entry.id === request.customer_id)?.name
      || sourceOrder?.client
      || "—";
    const rollDetails = Array.isArray(request.roll_details) ? request.roll_details : [];
    const rollSummary = rollDetails.length
      ? rollDetails.map((roll) => {
        const fabric = data.fabrics.find((entry) => entry.id === roll.fabric_id);
        return fabric
          ? `${fabric.name}${fabric.fabric_type ? ` · ${fabric.fabric_type}` : ""}${fabric.color_name ? ` · ${fabric.color_name}` : ""} · ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(roll.quantity || 0)} ${fabric.unit || ""}`
          : `توب ${roll.roll_number || "—"}${roll.color_name ? ` · ${roll.color_name}` : ""}`;
      }).join("، ")
      : "—";
    const fabricNames = [...new Set(rollDetails.map((roll) =>
      data.fabrics.find((entry) => entry.id === roll.fabric_id)?.name
    ).filter(Boolean))];
    const fabricName = fabricNames.join("، ")
      || data.fabrics.find((entry) => entry.id === request.fabric_id)?.name
      || "—";
    const statusLabel = request.archived_at
      ? "مؤرشف"
      : ({
      pending: "بانتظار استلام مخزن القص",
      submitted: "تم إرسال القصة للمراجعة",
      cancelled: "ملغي"
    }[request.status] || request.status || "غير معروف");
    return `<tr>
      <td><span class="register-model-cell">${modelImage
        ? modelImageMarkup(modelImage, `صورة الموديل ${modelName}`, "register-thumbnail")
        : canManageRecords && !request.archived_at && request.status !== "cancelled"
          ? `<button class="model-image-trigger register-thumbnail-trigger catalog-image-placeholder" type="button" data-edit-cutting-request="${escapeHtml(request.id)}" aria-label="إضافة صورة للموديل ${escapeHtml(modelName)}"><img class="model-thumbnail register-thumbnail" src="${DEFAULT_MODEL_IMAGE_URL}" alt="صورة افتراضية للموديل ${escapeHtml(modelName)}"></button>`
          : modelImageMarkup(DEFAULT_MODEL_IMAGE_URL, `صورة الموديل ${modelName}`, "register-thumbnail")}<span>${escapeHtml(modelName)}</span></span></td>
      <td>${escapeHtml(modelCode)}</td>
      <td>${escapeHtml(client)}</td>
      <td>${escapeHtml(fabricName)}</td>
      <td>${escapeHtml(rollSummary)}</td>
      <td>${escapeHtml(request.operational_notes || "—")}</td>
      <td>${formatDateTime(request.created_at)}</td>
      <td>${statusTag(statusLabel)}</td>
      <td>${request.submitted_at ? formatDateTime(request.submitted_at) : "—"}</td>
      ${canManageRecords ? `<td><div class="form-actions"><button class="row-action" type="button" data-edit-cutting-request="${escapeHtml(request.id)}"${request.archived_at || request.status !== "pending" ? " disabled" : ""}>تعديل</button><button class="row-action order-delete-action" type="button" data-delete-cutting-request="${escapeHtml(request.id)}"${request.archived_at ? " disabled" : ""}>${request.archived_at ? "محفوظ بالأرشيف" : "حذف / أرشفة"}</button></div></td>` : ""}
    </tr>`;
  });
  return panel("الموديلات المرسلة للقص", rows.length
    ? table(["الموديل","كود النظام","العميل","الأقمشة","الألوان والكميات","ملاحظات تشغيلية","تاريخ الطلب","حالة الطلب","تاريخ إرسال القصة", ...(canManageRecords ? ["الإجراء"] : [])], rows)
    : '<div class="empty-state">لا توجد موديلات مرسلة إلى مخزن القص حتى الآن.</div>');
}

function factoryRegistersView(data, allowRepeat = false, detailsKind = "cutting", sewingView = false, canRequestCut = false, showDispatchedRequests = false) {
  if (activeRegisterTab === "requests" && !showDispatchedRequests) activeRegisterTab = "models";
  const historySelected = activeRegisterTab === "history";
  const requestsSelected = activeRegisterTab === "requests";
  return `<section id="records" class="dashboard-section">
    <div class="client-management-tabs" role="tablist" aria-label="سجلات الموديلات والقصات">
      <button type="button" role="tab" aria-selected="${activeRegisterTab === "models"}" class="client-management-tab${activeRegisterTab === "models" ? " active" : ""}" data-register-tab="models">سجل الموديلات</button>
      <button type="button" role="tab" aria-selected="${historySelected}" class="client-management-tab${historySelected ? " active" : ""}" data-register-tab="history">سجل القصات</button>
      ${showDispatchedRequests ? `<button type="button" role="tab" aria-selected="${requestsSelected}" class="client-management-tab${requestsSelected ? " active" : ""}" data-register-tab="requests">الموديلات المرسلة للقص</button>` : ""}
    </div>
    <div data-register-panel="models"${activeRegisterTab === "models" ? "" : " hidden"}>${modelRegistryView(data, allowRepeat, detailsKind, canRequestCut)}</div>
    <div data-register-panel="history"${historySelected ? "" : " hidden"}>${cuttingHistoryView(data, allowRepeat, sewingView, canRequestCut)}</div>
    ${showDispatchedRequests ? `<div data-register-panel="requests"${requestsSelected ? "" : " hidden"}>${dispatchedCuttingRequestsView(data, canRequestCut)}</div>` : ""}
  </section>`;
}

function cuttingSubmissionFormMarkup(data) {
  const clientOptions = data.clients.map((client) =>
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`
  ).join("");
  const brandOptions = data.clients.filter((client) => client.brand_name)
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.brand_name)}</option>`)
    .join("");
  const repeatModelOptions = modelRegistryEntries(data).map(({ code, model, catalogModel, orders }) =>
    `<option value="${catalogModel ? `catalog:${catalogModel.id}` : `order:${orders[0]?.id || ""}`}">${escapeHtml(model.name || "موديل بدون اسم")} · ${escapeHtml(code)}</option>`
  ).join("");
  return `<form class="cutting-submit-form modal-form" id="cutting-submit-form" data-multi-fabric="true">
    <section class="form-section"><h3>بيانات القصة <span>تُحفظ كسجل مستقل قبل إنشاء الموديل</span></h3><div class="form-section-grid">
        <input type="hidden" name="customerId">
        <input type="hidden" name="sourceOrderId">
        <input type="hidden" name="catalogModelId">
        <input type="hidden" name="cuttingRequestId">
        <label class="field wide"><span>تكرار قصّة موديل مسجل (اختياري)</span><select name="repeatModelId"><option value="">قصة لموديل جديد</option>${repeatModelOptions}</select></label>
        <p class="workforce-rate-preview wide" data-repeat-model-code hidden></p>
        <label class="field"><span>اسم العميل</span><select name="customerSelection"><option value="">اختر العميل</option>${clientOptions}</select></label>
        <label class="field"><span>اسم البراند</span><select name="brandSelection"><option value="">اختر البراند</option>${brandOptions}</select></label>
        <label class="field model-name-field"><span>اسم الموديل</span><input name="modelName" autocomplete="off"></label>
        <p class="workforce-rate-preview wide" data-cutting-model-code>كود الموديل بالنظام: يُنشأ عند اعتماد الموديل.</p>
        <label class="field model-number-field"><span>كود/رقم الموديل للعميل</span><input name="modelNumber" autocomplete="off"></label>
        <label class="field"><span>نوع القماش</span><select name="fabricType" data-cutting-fabric-type required>${cuttingFabricTypeOptions(data.fabrics, "")}</select><small>اختر النوع أولاً، ثم أضف صفاً لكل لون وكمية مستخدمة.</small></label>
        <div class="field wide" data-cutting-fabric-lines></div>
        <button class="row-action wide" type="button" data-add-cutting-fabric-line>＋ إضافة لون / توب</button>
        <label class="field wide" data-cutting-external-source hidden><span>اسم المورد / مصدر الخامة الخارجية</span><input name="externalFabricSource" maxlength="120" placeholder="اسم المورد أو مصدر القماش"></label>
        <label class="field wide"><span>المورد / تفاصيل مصدر القماش</span><input name="fabricDetails" maxlength="240" placeholder="اسم المورد أو أي تفاصيل إضافية عن الخامة"></label>
      </div></section>
      ${sizePickerMarkup("", "new-cutting", false, true)}
      ${cuttingColorPlyMarkup(null, "", 0, "new-cutting")}
      <p class="cutting-calculated-total">إجمالي الراقات: <strong data-cutting-plys>0</strong> · إجمالي قطع القصة: <strong data-cutting-total>0</strong> قطعة</p>
      <div class="cutting-breakdown" data-cutting-breakdown></div>
      <label class="field"><span>صورة الموديل (اختياري)</span>${imagePickerMarkup("modelImage", "إضافة صورة")}<small>يمكن رفع صيغ الصور الشائعة حتى 25 ميجابايت.</small></label>
      <label class="field"><span>ملاحظات فنية للفرشة والقص</span><textarea name="technicalNotes" rows="3"></textarea></label>
      <div class="form-actions"><button type="submit" class="button button-primary">${data.isAdmin ? "حفظ القصة" : "إرسال القصة للإدارة"}</button></div>
    </form>`;
}

function cuttingRequestsView(data) {
  const requests = data.cuttingRequests
    .filter((request) => request.status === "pending" && !request.archived_at)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const requestCards = requests.map((request) => {
    const catalogModel = data.modelCatalog.find((entry) => entry.id === request.catalog_model_id);
    const sourceOrder = data.models.find((entry) => entry.id === request.source_order_id);
    const model = catalogModel
      ? {
        id: catalogModel.id,
        name: catalogModel.model_name,
        factoryModelCode: catalogModel.factory_model_code,
        modelImageUrls: [catalogModel.model_image_url || DEFAULT_MODEL_IMAGE_URL, ""],
        client: data.clients.find((client) => client.id === catalogModel.customer_id)?.name || ""
      }
      : sourceOrder;
    const fabricName = data.fabrics.find((fabric) => fabric.id === request.fabric_id)?.name || "";
    const rolls = cuttingRequestRollDetails(request);
    return `<article class="cutting-story-card production-compact-card">
      <header class="production-compact-heading">${modelImageMarkup(model?.modelImageUrls || model?.modelImageUrl)}<h3>${escapeHtml(model?.name || "موديل غير متاح")}</h3>${statusTag("بانتظار استلام القص")}</header>
      <div class="production-compact-facts"><div><span>كود الموديل بالنظام</span><strong>${escapeHtml(model?.factoryModelCode || "—")}</strong></div><div><span>العميل</span><strong>${escapeHtml(model?.client || "—")}</strong></div></div>
      ${fabricName || rolls.length || request.operational_notes ? `<div class="cutting-request-details">${fabricName ? `<p><strong>الخامة:</strong> ${escapeHtml(fabricName)}</p>` : ""}${rolls.length ? `<p><strong>الأتواب والألوان:</strong> ${escapeHtml(rolls.map((roll) => `توب ${roll.roll_number || "—"}${roll.color_name ? ` · ${roll.color_name}` : ""}`).join("، "))}</p>` : ""}${request.operational_notes ? `<p><strong>ملاحظات تشغيلية:</strong> ${escapeHtml(request.operational_notes)}</p>` : ""}</div>` : ""}
      <div class="form-actions"><button class="button button-primary" type="button" data-open-cutting-request="${escapeHtml(request.id)}"${model ? "" : " disabled"}>استلام وبدء بيانات القصة</button></div>
    </article>`;
  }).join("");
  return `${factoryRegistersView(data, true, "cutting", false, false, true)}
  <section id="cutting-requests" class="dashboard-section">${panel("طلبات القص الجديدة", requestCards || '<div class="empty-state">لا توجد طلبات قص جديدة حالياً.</div>', "تتضمن الطلبات صورة الموديل واسمه وكود النظام؛ أكمل بيانات الخامة والفرش والمقاسات ثم أرسل القصة.")}</section>
  <section id="admin-requests" class="dashboard-section">${cuttingView(data)}</section>
  <section id="new-cutting" class="dashboard-section">${panel("قصة جديدة", cuttingSubmissionFormMarkup(data), "تُحفظ القصة في سجل القص المعلق، ولا تُضاف للموديلات أو الخياطة إلا بعد قرار الإدارة.")}</section>`;
}

function cuttingPersonalAccountView(data, session) {
  const amountOf = (record) => Number(record.amount ?? record.salary ?? record.netAmount ?? record.value ?? 0);
  const datedRows = (records, columns) => records.map((record) =>
    `<tr>${columns(record).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}<td>${formatDateTime(record._createdAt || record.created_at || record.date)}</td></tr>`
  );
  const advances = data.personalAdvances;
  const payroll = data.personalPayroll;
  const attendance = data.personalAttendance;
  const totalAdvances = advances.reduce((sum, record) => sum + amountOf(record), 0);
  const lastPayroll = payroll[0] || null;
  const profile = data.workforceProfiles.find((entry) =>
    entry.linkedUserId === session.accountId || entry._ownerId === session.accountId
  ) || {};
  const employeeId = profile.workerId || session.accountRowId || session.accountId;
  const identity = { id: employeeId, accountId: session.accountId, name: profile.employeeName || session.fullName };
  const financialData = { ...data, workerAdvances: advances, workerPayroll: payroll };
  const settings = workforceSettings(financialData);
  const today = workforceDateKey(new Date());
  const month = today.slice(0, 7);
  const accrual = profile.wageAmount
    ? workforceMonthAccrual(identity, financialData, settings, month, today)
    : null;
  const wageRates = accrual?.rate || workforceWageRates(profile, settings, month, financialData, employeeId);
  const deductions = data.workforceViolations.filter((record) =>
    record.workerId === employeeId && record.date?.startsWith(month)
  );
  const settlements = data.workforceSettlements
    .filter((record) => record.workerId === employeeId)
    .sort((left, right) => String(right.throughDate).localeCompare(String(left.throughDate)));
  return `<div class="stats-grid">${stat("الأجر المحدد", profile.wageAmount ? money(profile.wageAmount) : "غير مسجل", profile.wageBasis === "weekly" ? "أجر أسبوعي" : "أجر شهري")}${stat("أجر اليوم", money(wageRates.daily))}${stat("أجر الساعة", money(wageRates.hourly))}${stat("المستحق حتى اليوم", accrual ? money(accrual.earned) : "غير محسوب", "حسب الحضور المسجل")}${stat("السُلف الحالية", money(accrual?.advances ?? totalAdvances))}${stat("خصومات الشهر", money(accrual?.deductions ?? 0))}${stat(accrual?.netDue < 0 ? "الرصيد المستحق عليك" : "صافي المستحق", accrual ? money(Math.abs(accrual.netDue)) : "يُحدد بعد تسجيل الأجر", accrual?.netDue < 0 ? "يشمل سلفاً أو رصيداً سابقاً" : "بعد السلف والخصومات والمدفوعات")}${stat("آخر مرتب مسجل", lastPayroll ? money(amountOf(lastPayroll)) : "—", lastPayroll?.period || lastPayroll?.month || "")}</div>
    ${panel("سجل الحضور والغياب", attendance.length
      ? table(["التاريخ","الحالة","ملاحظات","تاريخ التسجيل"], datedRows(attendance, (record) => [formatRecordDate(record.date || record.day || record._createdAt), record.status || record.type || "—", record.notes || record.note || "—"]))
      : '<div class="empty-state">لا توجد سجلات حضور أو غياب مرتبطة بحسابك حاليًا.</div>')}
    ${panel("الخصومات والجزاءات لهذا الشهر", deductions.length
      ? table(["التاريخ","السبب","الإجراء","المبلغ"], deductions.map((record) => `<tr><td>${formatRecordDate(record.date)}</td><td>${escapeHtml(record.ruleKey === "absence" && record.permission === "unexcused" ? "خصم يوم جزاء غياب بدون إذن" : record.ruleLabel || workforceRuleTitle(settings, record.ruleKey))}</td><td>${escapeHtml(record.decisionDescription || record.decision || "—")}</td><td>${money(record.deductionAmount || 0)}${record.ruleKey === "absence" && record.permission === "unexcused" ? `<small class="workforce-deduction-detail">أجر يوم واحد: ${money(wageRates.daily)}</small>` : ""}</td></tr>`))
      : '<div class="empty-state">لا توجد خصومات أو جزاءات مسجلة لهذا الشهر.</div>')}
    ${panel("سجل السُلف", advances.length
      ? table(["المبلغ","البيان","ملاحظات","تاريخ التسجيل"], datedRows(advances, (record) => [money(amountOf(record)), record.description || record.reason || record.reference || "—", record.notes || record.note || "—"]))
      : '<div class="empty-state">لا توجد سُلف مسجلة لحسابك حاليًا.</div>')}
    ${panel("سجل المرتب", payroll.length
      ? table(["الفترة","المرتب","المدفوع","المتبقي","تاريخ التسجيل"], payroll.map((record) => `<tr><td>${escapeHtml(record.period || record.month || record.date || "—")}</td><td>${money(Number(record.salary ?? record.amount ?? 0))}</td><td>${money(Number(record.paidAmount ?? record.paid ?? 0))}</td><td>${money(Number(record.remainingAmount ?? record.remaining ?? 0))}</td><td>${formatDateTime(record._createdAt || record.created_at || record.date)}</td></tr>`))
      : '<div class="empty-state">لا توجد سجلات مرتب مسجلة لحسابك حاليًا.</div>')}
    ${panel("سجل التصفية والرصيد المرحّل", settlements.length
      ? table(["الفترة","حتى تاريخ","المستحق","السلف","الخصومات","المدفوع","الرصيد المرحّل"], settlements.map((record) => `<tr><td>${escapeHtml(record.period || "—")}</td><td>${formatRecordDate(record.throughDate)}</td><td>${money(record.earnedAmount)}</td><td>${money(record.advanceAmount)}</td><td>${money(record.deductionAmount)}</td><td>${money(record.paidAmount)}</td><td>${money(record.balanceAfter)}</td></tr>`))
      : '<div class="empty-state">لا توجد تصفيات محفوظة لحسابك.</div>')}`;
}

function sewingOrderRows(orders, actionLabel = "", action = "", allowEdit = true) {
  return orders.length
    ? `<div class="sewing-order-grid">${orders.map((item) => {
      const canEdit = allowEdit && item.stageStatus !== "مكتمل";
      return `<article class="sewing-order-card production-compact-card">
      <header class="production-compact-heading">${modelImageMarkup(item.modelImageUrls || item.modelImageUrl)}<h3>${escapeHtml(item.model)}</h3>${statusTag(item.stageStatus === "مكتمل" && item.orderStatus ? item.orderStatus : item.status)}</header>
      <strong class="production-compact-total">${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.target)} قطعة</strong>
      <div class="production-compact-facts"><div><span>الألوان</span>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</div><div><span>المقاسات</span>${sizeBadgesMarkup(item.sizes)}</div></div>
      <div class="form-actions">${productionDetailsButton("sewing", sewingDetailsProjection(item))}${canEdit ? `<button class="button button-secondary" type="button" data-open-sewing-editor="${escapeHtml(item.order)}">تعديل</button>` : ""}${action ? `<button class="button button-primary" type="button" data-sewing-action="${action}" data-sewing-order="${escapeHtml(item.order)}">${actionLabel}</button>` : ""}</div>
    </article>
    ${canEdit ? `<div class="modal-backdrop sewing-editor-modal" data-sewing-editor-modal="${escapeHtml(item.order)}" hidden>
      <section class="modal-card production-editor-modal-card" role="dialog" aria-modal="true" aria-label="تعديل بيانات الخياطة">
        <button class="modal-close" type="button" data-close-sewing-editor aria-label="إغلاق">×</button>
        <h2>تعديل بيانات الخياطة · ${escapeHtml(item.model)}</h2>
        <form class="modal-form sewing-editor-form" data-sewing-edit-order="${escapeHtml(item.order)}">
          <label for="sewing-target-${escapeHtml(item.order)}">الكمية المستهدفة للخياطة</label>
          <input id="sewing-target-${escapeHtml(item.order)}" name="targetQuantity" type="number" min="0" max="2147483647" step="1" value="${item.target}" required>
          <label for="sewing-notes-${escapeHtml(item.order)}">تعليمات الخياطة</label>
          <textarea id="sewing-notes-${escapeHtml(item.order)}" name="technicalNotes" rows="4" maxlength="2000">${escapeHtml(item.technicalNotes || "")}</textarea>
          <div class="form-actions"><button class="button button-primary" type="submit">حفظ التعديلات</button><button class="row-action" type="button" data-close-sewing-editor>إلغاء</button></div>
        </form>
      </section>
    </div>` : ""}`;
    }).join("")}</div>`
    : '<div class="empty-state">لا توجد قصّات في هذه القائمة.</div>';
}

function sewingView(data) {
  const available = data.sewing.filter((item) => !item.workflowArchivedAt && item.stageStatus === "متاح للخياطة");
  const inProgress = data.sewing.filter((item) => !item.workflowArchivedAt && item.stageStatus === "قيد الخياطة");
  const completed = data.sewing.filter((item) => !item.workflowArchivedAt && item.stageStatus === "مكتمل");
  const activeOrders = data.models.filter((order) => !order.archivedAt && !order.workflowArchivedAt);
  const pipelineGroups = factoryOrderPipelineGroups(activeOrders)
    .filter((group) => group.key !== "before_cutting" && (group.key !== "unclassified" || group.orders.length));
  const notStartedOrders = activeOrders.filter((order) =>
    ["before_cutting", "waiting_sewing", "unclassified"].includes(factoryOrderPipelineCategory(order))
    && !["قيد الخياطة", "قيد التنفيذ", "مكتمل"].includes(order.sewingStageStatus)
  );
  const sewingWorkflow = `<div class="stats-grid">${pipelineGroups.map((group) => stat(group.label, group.orders.length)).join("")}</div>
    ${panel("قصّات متاحة للبدء", sewingOrderRows(available, "بدء الخياطة", "start", false), "لا يبدأ العمل إلا بعد استلام المشرف للقصّة")}
    ${panel("قصّات قيد الخياطة الفعلية", sewingOrderRows(inProgress, "إنهاء الخياطة", "finish", false))}
    ${panel("قصّات مكتملة الخياطة", sewingOrderRows(completed, "", "", false), "تم تسليمها للمرحلة التالية")}`;
  const modelMonitoring = notStartedOrders.length
    ? `<div class="sewing-model-monitor-grid">${notStartedOrders.map((order) => `<article class="sewing-model-monitor-card">
        ${modelImageMarkup(order.modelImageUrls || order.modelImageUrl)}
        <div class="sewing-model-monitor-info"><h3>${escapeHtml(order.name || "موديل بدون اسم")}</h3><p>كود الموديل: <strong>${escapeHtml(order.factoryModelCode || "—")}</strong></p><span class="status">${escapeHtml(order.displayStatus || order.status || "قيد الإنشاء")}</span></div>
      </article>`).join("")}</div>`
    : '<div class="empty-state">لا توجد موديلات بانتظار بدء الخياطة.</div>';
  return `<div class="client-management-tabs sewing-dashboard-tabs" role="tablist" aria-label="شاشة الخياطة">
      <button type="button" role="tab" aria-selected="${activeSewingDashboardTab === "workflow"}" class="client-management-tab${activeSewingDashboardTab === "workflow" ? " active" : ""}" data-sewing-dashboard-tab="workflow">الخياطة</button>
      <button type="button" role="tab" aria-selected="${activeSewingDashboardTab === "models"}" class="client-management-tab${activeSewingDashboardTab === "models" ? " active" : ""}" data-sewing-dashboard-tab="models">متابعة الموديلات</button>
    </div>
    <div data-sewing-dashboard-panel="workflow"${activeSewingDashboardTab === "workflow" ? "" : " hidden"}>${sewingWorkflow}</div>
    <div data-sewing-dashboard-panel="models"${activeSewingDashboardTab === "models" ? "" : " hidden"}>${modelMonitoring}</div>`;
}

function adminSewingView(data) {
  const available = data.sewing.filter((item) => !item.workflowArchivedAt && item.stageStatus === "متاح للخياطة");
  const inProgress = data.sewing.filter((item) => !item.workflowArchivedAt && item.stageStatus === "قيد الخياطة");
  const completed = data.sewing.filter((item) => !item.workflowArchivedAt && item.stageStatus === "مكتمل");
  const pipelineGroups = factoryOrderPipelineGroups(data.models.filter((order) => !order.archivedAt && !order.workflowArchivedAt))
    .filter((group) => group.key !== "before_cutting" && (group.key !== "unclassified" || group.orders.length));
  return `<div class="stats-grid">${pipelineGroups.map((group) => stat(group.label, group.orders.length)).join("")}</div>
    ${panel("قصّات متاحة للخياطة", sewingOrderRows(available, "بدء الخياطة", "start"))}
    ${panel("قصّات بدأ المشرف خياطتها", sewingOrderRows(inProgress, "إنهاء الخياطة", "finish"))}
    ${panel("قصّات مكتملة ومحوّلة للإمبلاج / التعبئة", sewingOrderRows(completed))}`;
}

function adminCuttingTransferView(data) {
  const cuttingStories = data.cuttingStories || [];
  const transferredStatuses = new Set([
    "في انتظار الخياطة", "جاري الخياطة", "تمت الخياطة", "جاري التشطيب", "تم التشطيب",
    "جاري المكواة", "تم الكي", "جاري الطباعة", "تمت الطباعة", "جاري التكييس",
    "تم التكييس", "مكتمل", "جاهز للتسليم", "تم التسليم"
  ]);
  const hasEnteredSewing = (order) =>
    ["متاح للخياطة", "قيد الخياطة", "مكتمل"].includes(order.sewingStageStatus)
    || transferredStatuses.has(canonicalFactoryOrderStatus(order.status));
  const activeOrders = data.models.filter((order) =>
    !order.archivedAt
    && !order.workflowArchivedAt
    && Boolean(order.cuttingStageStatus)
    && !hasEnteredSewing(order)
  );
  const transferredOrders = data.models.filter((order) =>
    !order.workflowArchivedAt
    &&
    hasEnteredSewing(order)
  );
  const orderCard = (order, transferred = false) => `<article class="cutting-admin-order-card production-compact-card">
    <header class="production-compact-heading">${modelImageMarkup(order.modelImageUrls || order.modelImageUrl)}<h3>${escapeHtml(order.name || "موديل بدون اسم")}</h3>${statusTag(order.displayStatus || order.status)}</header>
    <strong class="production-compact-total">${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity || 0)} قطعة</strong>
    <div class="production-compact-facts"><div><span>الألوان</span>${colorSummaryMarkup(order.colors, order.colorNames, order.colorPlyData)}</div><div><span>المقاسات</span>${sizeBadgesMarkup(order.sizes)}</div></div>
    <div class="form-actions">${productionDetailsButton("cutting", order)}${!order.archivedAt ? `<button class="button button-secondary" type="button" data-edit-kind="models" data-index="${dashboardData.models.findIndex((entry) => entry.id === order.id)}">تعديل</button>` : ""}${!transferred && ["مكتمل", "تم القص"].includes(order.cuttingStageStatus) && !["متاح للخياطة", "قيد الخياطة", "مكتمل"].includes(order.sewingStageStatus) ? `<button class="button button-primary" type="button" data-make-sewing-available="${escapeHtml(order.id)}">إدخال للخياطة</button>` : ""}</div>
  </article>`;
  const activeOrderCards = activeOrders.length
    ? `<div class="cutting-admin-order-grid">${activeOrders.map((order) => orderCard(order)).join("")}</div>`
    : '<div class="empty-state">لا توجد قصات نشطة حالياً.</div>';
  const transferredOrderCards = transferredOrders.length
    ? `<div class="cutting-admin-order-grid">${transferredOrders.map((order) => orderCard(order, true)).join("")}</div>`
    : '<div class="empty-state">لا توجد قصات محوّلة للخياطة في السجل بعد.</div>';
  const storyCards = (stories) => stories.length
    ? `<div class="cutting-story-list">${stories.map((story) => {
      const statusLabel = story.archived_at
        ? "مؤرشفة"
        : story.status === "added_to_models"
        ? "تم اعتمادها وإضافتها للموديلات"
        : story.status === "sent_to_sewing"
          ? "في انتظار الخياطة"
          : story.status === "rejected"
            ? "مرفوضة من الإدارة"
            : "بانتظار قرار الإدارة";
      const actions = story.status === "pending" && !story.archived_at
        ? `<div class="form-actions"><button class="button button-primary" type="button" data-action="approve-cutting-story-model" data-story-id="${escapeHtml(story.id)}">تأكيد وإضافة للموديلات</button><button class="button button-secondary" type="button" data-action="approve-cutting-story-sewing" data-story-id="${escapeHtml(story.id)}">تأكيد وإرسال للخياطة</button><button class="button button-danger" type="button" data-action="reject-cutting-story" data-story-id="${escapeHtml(story.id)}">رفض القصة</button></div>`
        : story.approved_order_id ? '<a class="row-action" href="#orders">الانتقال إلى الموديلات</a>' : "";
      return `<article class="cutting-story-card"><header class="cutting-story-heading">${modelImageMarkup(story.model_image_url)}<div><h3>${escapeHtml(story.model_name || story.model_number || "قصة بدون اسم")}</h3><p>كود الموديل بالنظام: ${escapeHtml(story.factory_model_code || "—")} · كود/رقم الموديل للعميل: ${escapeHtml(story.model_number || "—")} · العميل: ${escapeHtml(story.customer_name || "—")}</p><small>المشرف المسؤول: ${escapeHtml(story.submitted_by_name || "مشرف القص")}</small></div><span>${statusTag(statusLabel)}</span></header><div class="cutting-story-facts"><div><span>إجمالي القطع</span><strong>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(story.total_pieces)} قطعة</strong></div><div><span>المقاسات</span><strong>${escapeHtml(sizeSummary(story.size_data) || "—")}</strong></div></div><div class="form-actions">${productionDetailsButton("story", story)}${actions}</div></article>`;
    }).join("")}</div>`
    : '<div class="empty-state">لا توجد قصص في هذا السجل.</div>';
  const activeTab = activeAdminCuttingTab === "active";
  const historyTab = activeAdminCuttingTab === "history";
  const newTab = activeAdminCuttingTab === "new";
  return `<div class="client-management-tabs cutting-admin-tabs" role="tablist" aria-label="إدارة القص">
      <button type="button" role="tab" aria-selected="${activeTab}" class="client-management-tab${activeTab ? " active" : ""}" data-admin-cutting-tab="active">القصات النشطة</button>
      <button type="button" role="tab" aria-selected="${historyTab}" class="client-management-tab${historyTab ? " active" : ""}" data-admin-cutting-tab="history">سجل القصات</button>
      <button type="button" role="tab" aria-selected="${newTab}" class="client-management-tab${newTab ? " active" : ""}" data-admin-cutting-tab="new">إضافة قصة جديدة</button>
    </div>
    <div data-admin-cutting-panel="active"${activeTab ? "" : " hidden"}>
      ${panel("القصات النشطة", activeOrderCards, "تظهر القصة هنا حتى اكتمال القص أو تحويلها للخياطة.")}
      ${panel("قصص القص المرسلة للمراجعة", storyCards(cuttingStories.filter((story) => story.status === "pending" && !story.archived_at)), "راجع التفاصيل ثم اعتمد القصة للموديلات أو أرسلها مباشرة للخياطة.")}
    </div>
    <div data-admin-cutting-panel="history"${historyTab ? "" : " hidden"}>
      ${panel("القصات المحوّلة للخياطة", transferredOrderCards, "تختفي القصة من القصات النشطة فور تحويلها، وتظهر هنا وفي شاشة الخياطة.")}
      ${panel("سجل القصص المعتمدة أو المرفوضة / المؤرشفة", storyCards(cuttingStories.filter((story) => story.status !== "pending" || story.archived_at)))}
    </div>
    <div data-admin-cutting-panel="new"${newTab ? "" : " hidden"}>
      ${panel("إضافة قصة جديدة", cuttingSubmissionFormMarkup({ ...data, isAdmin: true }), "ستُحفظ القصة في سجل القص للمراجعة، ثم تعتمدها الإدارة لإضافتها للموديلات أو إرسالها للخياطة.")}
    </div>`;
}

function workerProductionColorMarkup(colors) {
  const entries = Array.isArray(colors) ? colors : [];
  return entries.length
    ? `<span class="model-color-list">${entries.map((entry) => {
      const rawColor = typeof entry === "string" ? entry : entry.hex || entry.color || "";
      const color = /^#[0-9A-F]{6}$/i.test(rawColor) ? rawColor.toUpperCase() : "";
      const name = typeof entry === "string" ? "" : entry.name || "";
      const sizes = entry && typeof entry === "object" && entry.sizes && typeof entry.sizes === "object"
        ? Object.entries(entry.sizes).filter(([, count]) => Number(count) > 0)
        : [];
      const sizeSummary = sizes.length
        ? `<small>${sizes.map(([size, count]) => `${escapeHtml(size)}: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Number(count))}`).join(" · ")}</small>`
        : "";
      return `<span class="model-color-chip">${color ? `<span class="color-breakdown-swatch" style="--swatch-color:${color}"></span>` : ""}<strong>${escapeHtml(name || "اسم اللون غير مسجل")}</strong>${sizeSummary}</span>`;
    }).join("")}</span>`
    : "—";
}

function workerProductionAllocationGridMarkup(colors, sizeData, existingColors = []) {
  const selectedSizes = Object.keys(sizeData?.counts || {});
  if (!colors.length || !selectedSizes.length) {
    return '<p class="muted">اختر لوناً ومقاساً واحداً على الأقل لإدخال عدد كل لون ومقاس.</p>';
  }
  const existingByColor = new Map(existingColors
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => [String(entry.hex || entry.color || "").toUpperCase(), entry.sizes || {}]));
  const existingCount = (color, size) => {
    const count = Number(existingByColor.get(color.toUpperCase())?.[size] || 0);
    return Number.isSafeInteger(count) && count > 0 ? count : "";
  };
  return `<div class="worker-allocation-scroll"><table class="worker-allocation-table"><thead><tr><th>اللون</th>${selectedSizes.map((size) => `<th>${escapeHtml(size)}</th>`).join("")}<th>الإجمالي</th></tr></thead><tbody>${colors.map((entry) => {
    const hex = entry.color.toUpperCase();
    const sizeCells = selectedSizes.map((size) => {
      const count = existingCount(hex, size);
      return `<td data-label="${escapeHtml(size)}"><input type="number" min="1" max="2147483647" step="1" value="${count}" data-worker-production-count data-color="${escapeHtml(hex)}" data-size="${escapeHtml(size)}" aria-label="${escapeHtml(entry.name || hex)} مقاس ${escapeHtml(size)}" placeholder="العدد" required></td>`;
    }).join("");
    const rowTotal = selectedSizes.reduce((sum, size) => sum + Number(existingCount(hex, size) || 0), 0);
    return `<tr><th><span class="model-color-chip"><span class="color-breakdown-swatch" style="--swatch-color:${escapeHtml(hex)}"></span><strong>${escapeHtml(entry.name || hex)}</strong></span></th>${sizeCells}<td data-worker-color-total>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(rowTotal)}</td></tr>`;
  }).join("")}</tbody><tfoot><tr><th>الإجمالي</th>${selectedSizes.map((size) => `<td data-label="${escapeHtml(size)}" data-worker-size-total="${escapeHtml(size)}">${new Intl.NumberFormat("ar-EG-u-nu-latn").format(colors.reduce((sum, entry) => sum + Number(existingByColor.get(entry.color.toUpperCase())?.[size] || 0), 0))}</td>`).join("")}<td data-worker-grand-total>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(existingColors.reduce((sum, entry) => sum + Object.values(entry?.sizes || {}).reduce((subtotal, count) => subtotal + Number(count || 0), 0), 0))}</td></tr></tfoot></table></div>`;
}

function workerProductionSelectedColors(form) {
  return [...form.querySelectorAll("[data-color-picker] [data-color-choice]")].map((choice) => ({
    color: choice.dataset.colorChoice.toUpperCase(),
    name: String(choice.querySelector("[data-color-name]")?.value || "").trim()
  }));
}

function workerProductionSelectedSizeData(form) {
  const picker = form.querySelector("[data-size-picker]");
  const type = picker?.querySelector("[data-size-type]")?.value || "";
  const sizes = [...(picker?.querySelectorAll(".size-option-group:not([hidden]) .size-toggle[aria-pressed='true']") || [])]
    .map((button) => button.dataset.sizeToggle);
  return { type, counts: Object.fromEntries(sizes.map((size) => [size, "0"])) };
}

function workerProductionColorsFromForm(form) {
  const colors = workerProductionSelectedColors(form);
  const counts = [...form.querySelectorAll("[data-worker-production-count]")];
  return colors.map((entry) => ({
    hex: entry.color,
    name: entry.name,
    sizes: Object.fromEntries(counts
      .filter((input) => input.dataset.color === entry.color && Number(input.value) > 0)
      .map((input) => [input.dataset.size, Number(input.value)]))
  }));
}

function workerProductionTotalFromForm(form) {
  return [...form.querySelectorAll("[data-worker-production-count]")]
    .reduce((sum, input) => sum + (input.value === "" ? 0 : Number(input.value)), 0);
}

function workerProductionCountsAreValid(form) {
  const inputs = [...form.querySelectorAll("[data-worker-production-count]")];
  return inputs.length > 0 && inputs.every((input) =>
    input.value === "" || (Number.isSafeInteger(Number(input.value))
      && Number(input.value) >= 0 && Number(input.value) <= 2147483647)
  );
}

function updateWorkerProductionAllocationTotals(form) {
  const cells = [...form.querySelectorAll("[data-worker-production-count]")];
  const colors = workerProductionSelectedColors(form);
  const sizes = workerProductionSelectedSizeData(form).counts;
  const grandTotal = cells.reduce((sum, input) => {
    const count = input.value === "" ? 0 : Number(input.value);
    return sum + (Number.isSafeInteger(count) && count >= 0 ? count : 0);
  }, 0);
  colors.forEach((color) => {
    const total = cells.filter((input) => input.dataset.color === color.color)
      .reduce((sum, input) => sum + Number(input.value || 0), 0);
    const row = cells.find((input) => input.dataset.color === color.color)?.closest("tr");
    const totalCell = row?.querySelector("[data-worker-color-total]");
    if (totalCell) totalCell.textContent = new Intl.NumberFormat("ar-EG-u-nu-latn").format(total);
  });
  Object.keys(sizes).forEach((size) => {
    const total = cells.filter((input) => input.dataset.size === size)
      .reduce((sum, input) => sum + Number(input.value || 0), 0);
    const totalCell = form.querySelector(`[data-worker-size-total="${CSS.escape(size)}"]`);
    if (totalCell) totalCell.textContent = new Intl.NumberFormat("ar-EG-u-nu-latn").format(total);
  });
  const grandTotalCell = form.querySelector("[data-worker-grand-total]");
  if (grandTotalCell) grandTotalCell.textContent = new Intl.NumberFormat("ar-EG-u-nu-latn").format(grandTotal);
  const quantityInput = form.elements.quantity;
  if (quantityInput && (cells.length || quantityInput.readOnly)) quantityInput.value = String(grandTotal);
}

function renderWorkerProductionAllocation(form) {
  const container = form.querySelector("[data-worker-production-allocation]");
  if (!container) return;
  const currentColors = workerProductionColorsFromForm(form);
  const hasAllocationInputs = form.querySelector("[data-worker-production-count]");
  const colorPicker = form.querySelector("[data-color-picker]");
  const names = Object.fromEntries(currentColors.map((entry) => [entry.hex, entry.name]));
  const colors = workerProductionSelectedColors(form).map((entry) => ({ ...entry, name: names[entry.color] || entry.name }));
  const sizeData = workerProductionSelectedSizeData(form);
  container.innerHTML = workerProductionAllocationGridMarkup(
    colors,
    sizeData,
    hasAllocationInputs ? currentColors : currentColors.filter((entry) => Object.keys(entry.sizes).length)
  );
  if (colorPicker) updateWorkerProductionAllocationTotals(form);
}

function bindWorkerProductionAllocation(form) {
  renderWorkerProductionAllocation(form);
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-worker-production-count]")) {
      if (!workerProductionCountsAreValid(form)) {
        event.target.setCustomValidity("أدخل عدداً صحيحاً من صفر إلى 2,147,483,647.");
      } else {
        event.target.setCustomValidity("");
      }
      updateWorkerProductionAllocationTotals(form);
    } else if (event.target.matches("[data-color-name]")) {
      renderWorkerProductionAllocation(form);
    }
  });
  form.addEventListener("click", (event) => {
    if (event.target.closest("[data-size-toggle], [data-add-color], [data-remove-color]")) {
      renderWorkerProductionAllocation(form);
    }
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-size-type]")) renderWorkerProductionAllocation(form);
  });
}

function workerProductionSubmissionForm(parentSubmission = null) {
  const formId = parentSubmission ? "" : 'id="worker-production-form"';
  const parentId = parentSubmission ? `data-parent-submission="${escapeHtml(parentSubmission.id)}"` : "";
  const prefix = parentSubmission ? `worker-followup-${parentSubmission.id}` : "worker-production";
  const initialColors = Array.isArray(parentSubmission?.colors) ? parentSubmission.colors : [];
  const initialHexes = initialColors.map((entry) => typeof entry === "string" ? entry : entry.hex || entry.color || "")
    .filter((color) => /^#[0-9A-F]{6}$/i.test(color)).join(", ");
  const initialColorNames = Object.fromEntries(initialColors
    .filter((entry) => entry && typeof entry === "object" && /^#[0-9A-F]{6}$/i.test(entry.hex || entry.color || ""))
    .map((entry) => [(entry.hex || entry.color).toUpperCase(), String(entry.name || "")]));
  const initialSizeNames = [...new Set(initialColors.flatMap((entry) =>
    entry && typeof entry === "object" && entry.sizes && typeof entry.sizes === "object"
      ? Object.keys(entry.sizes)
      : []
  ))];
  const initialSizeType = Object.entries(SIZE_OPTIONS).find(([, sizes]) =>
    initialSizeNames.length && initialSizeNames.every((size) => sizes.includes(size))
  )?.[0] || "";
  const initialSizeData = parentSubmission
    ? JSON.stringify({ type: initialSizeType, counts: Object.fromEntries(initialSizeNames.map((size) => [size, "0"])) })
    : "";
  return `<form ${formId} ${parentId} data-worker-production-form class="form-grid worker-production-form${parentSubmission ? " worker-followup-form" : ""}">
    <label class="field"><span>اسم الموديل (اختياري إذا أُدخل كود العميل)</span><input name="modelName" maxlength="160" value="${escapeHtml(parentSubmission?.model_name || "")}"></label>
    <label class="field"><span>كود/رقم الموديل للعميل (اختياري إذا أُدخل الاسم)</span><input name="modelNumber" maxlength="120" value="${escapeHtml(parentSubmission?.model_number || "")}"></label>
    ${colorPickerMarkup(initialHexes, prefix, initialColorNames, false)}
    ${sizePickerMarkup(initialSizeData, `${prefix}-sizes`, false)}
    <div class="field worker-production-allocation"><label>الأعداد المسلّمة لكل لون ومقاس</label><small>أدخل عدد القطع في كل خانة؛ يُجمع الإجمالي تلقائياً من تفاصيل التوزيع.</small><div data-worker-production-allocation><p class="muted">اختر لوناً ومقاساً واحداً على الأقل لإدخال عدد كل لون ومقاس.</p></div></div>
    <label class="field"><span>مجموع الأعداد المفصلة (محسوب تلقائياً)</span><input name="quantity" type="number" min="1" step="1" value="0" readonly></label>
    <label class="field wide"><span>صورة الموديل (رفع صورة أو التقاط بالكاميرا)</span>${imagePickerMarkup("modelImage", "رفع أو التقاط صورة", { capture: "environment", required: true, helpText: "إجباري · يمكن رفع صيغ الصور الشائعة حتى 25 ميجابايت." })}</label>
    <div class="form-actions"><button class="button button-primary" type="submit">${parentSubmission ? "إرسال التسليم التابع للإدارة" : "إرسال للإدارة للمراجعة"}</button></div>
  </form>`;
}

function workerView(data, session) {
  const tasks = data.tasks.filter((item) => item.worker === session.username);
  const formatAmount = (record) => Number(record.amount ?? record.value ?? record.netAmount ?? record.salary ?? 0);
  const workerProfile = data.workforceProfiles.find((profile) =>
    profile.linkedUserId === session.accountRowId || profile._ownerId === session.accountId
  ) || {};
  const employeeId = workerProfile.workerId || session.accountRowId;
  const workerIdentity = {
    id: employeeId,
    accountId: session.accountId,
    name: workerProfile.employeeName || session.fullName,
    username: session.username,
    roleKey: "worker"
  };
  const workerFinancialData = {
    ...data,
    workerAdvances: data.personalAdvances,
    workerPayroll: data.personalPayroll
  };
  const workerSettings = workforceSettings(workerFinancialData);
  const workerToday = workforceDateKey(new Date());
  const workerMonth = workerToday.slice(0, 7);
  const workerAccrual = workerProfile.wageAmount
    ? workforceMonthAccrual(workerIdentity, workerFinancialData, workerSettings, workerMonth, workerToday)
    : null;
  const monthAttendance = data.workforceAttendance
    .filter((record) => record.workerId === employeeId || record.workerId === session.accountRowId)
    .filter((record) => record.date?.startsWith(workerMonth))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const monthViolations = data.workforceViolations
    .filter((record) => record.workerId === employeeId || record.workerId === session.accountRowId)
    .filter((record) => record.date?.startsWith(workerMonth))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const overtimeRows = monthAttendance.map((record) => {
    const checkOutMinutes = workforceTimeMinutes(record.checkOut);
    const shiftEndMinutes = workforceTimeMinutes(workerSettings.shiftEnd);
    const checkInMinutes = workforceTimeMinutes(record.checkIn);
    const overtimeMinutes = checkOutMinutes === null || shiftEndMinutes === null
      ? 0
      : Math.max(0, checkOutMinutes - Math.max(shiftEndMinutes, checkInMinutes ?? 0));
    const amount = workerAccrual
      ? overtimeMinutes / 60 * workerAccrual.rate.hourly * Number(workerSettings.overtimeMultiplier || 1.5)
      : 0;
    return { ...record, overtimeMinutes, overtimeAmount: amount };
  }).filter((record) => record.overtimeMinutes > 0);
  const datedRows = (records, renderColumns) => records.map((record) =>
    `<tr>${renderColumns(record).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}<td>${formatDateTime(record._createdAt || record.created_at || record.date)}</td></tr>`
  );
  const productionCards = data.productionSubmissions.map((submission) =>
    `<article class="worker-submission-card">
      <header>${modelImageMarkup(submission.imageUrl, `صورة القطعة ${submission.model_name}`, "submission-image-preview")}<div><h3>${escapeHtml(submission.model_name)}${submission.model_number ? `<small class="worker-model-number">${escapeHtml(submission.model_number)}</small>` : ""}</h3><p>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(submission.quantity)} قطعة · ${formatDateTime(submission.created_at)}</p><p>${statusTag(submission.status === "pending" ? "قيد مراجعة الإدارة" : submission.status === "confirmed" ? "تم الاستلام النهائي" : "مرفوض")}</p>${submission.parent_submission_id ? '<span class="submission-parent-note">تسليم تابع للتسليم السابق</span>' : ""}</div></header>
      ${workerProductionColorMarkup(submission.colors)}
      ${submission.parentSubmission ? `<p class="muted">تابع للتسليم: ${escapeHtml(submission.parentSubmission.model_name)} · ${formatDateTime(submission.parentSubmission.created_at)}</p>` : ""}
      <details><summary>إضافة تسليم تابع لهذا العمل</summary>${workerProductionSubmissionForm(submission)}</details>
    </article>`
  );
  const personalAccount = `<section id="personal-account" class="dashboard-section">
    <header class="worker-account-heading"><div><p class="eyebrow">حساب العامل</p><h2>مرحباً، ${escapeHtml(workerProfile.employeeName || session.fullName)}</h2><p>${escapeHtml(workerProfile.jobTitle || session.jobTitle || "العامل")} · ملخص الرواتب والحضور للشهر الحالي</p></div><span class="worker-account-month">${escapeHtml(workerMonth)}</span></header>
    <div class="stats-grid worker-finance-stats">
      ${stat("المستحقات الحالية", workerAccrual ? money(workerAccrual.earned) : data.personalPayroll[0] ? money(formatAmount(data.personalPayroll[0])) : "—", "الأجر المحتسب حتى اليوم")}
      ${stat("إجمالي السلف", money(workerAccrual?.advances ?? data.personalAdvances.reduce((sum, item) => sum + formatAmount(item), 0)), "مبالغ مستحقة")}
      ${stat(workerAccrual?.netDue < 0 ? "الرصيد المستحق عليك" : "صافي المستحق", workerAccrual ? money(Math.abs(workerAccrual.netDue)) : "يُحدد بعد تسجيل الأجر", workerAccrual ? workerAccrual.netDue < 0 ? "عليك مبلغ متبقٍ من سلف أو حساب سابق" : "بعد السلف والخصومات والمدفوعات" : "تواصل مع الإدارة لتسجيل بيانات الأجر")}
      ${stat("السهر والمكافآت", money(workerAccrual?.overtimeAmount || 0), "أجر السهر المحتسب × 1.5")}
    </div>
    ${panel("حضور وانصراف الشهر الحالي", monthAttendance.length
      ? table(["التاريخ","الحالة","وقت الحضور","وقت الانصراف","التأخير","الانصراف المبكر","السهر المحتسب"], monthAttendance.map((record) => {
        const checkIn = workforceTimeMinutes(record.checkIn);
        const shiftStart = workforceTimeMinutes(workerSettings.shiftStart);
        const delayMinutes = checkIn === null || shiftStart === null ? 0 : Math.max(0, checkIn - shiftStart);
        const overtime = overtimeRows.find((entry) => entry._recordId === record._recordId);
        const earlyMinutes = workforceEarlyDepartureMinutes(record.checkOut, workerSettings);
        const earlyDecision = monthViolations.find((violation) =>
          violation.ruleKey === "early_departure" && violation.date === record.date
        );
        const earlyText = earlyMinutes
          ? `${earlyMinutes} دقيقة · ${earlyDecision?.decision === "waived" ? "عفو إداري دون خصم" : money(earlyDecision?.deductionAmount || 0)}`
          : "—";
        return `<tr><td>${formatRecordDate(record.date)}</td><td>${escapeHtml(WORKFORCE_ATTENDANCE_LABELS[record.status] || record.status || "—")}</td><td>${escapeHtml(record.checkIn || "—")}</td><td>${escapeHtml(record.checkOut || "—")}</td><td>${delayMinutes ? `${delayMinutes} دقيقة` : "—"}</td><td>${earlyText}</td><td>${overtime ? `${overtime.overtimeMinutes} دقيقة · ${money(overtime.overtimeAmount)}` : "—"}</td></tr>`;
      }))
      : '<div class="empty-state">لا توجد سجلات حضور للشهر الحالي.</div>')}
    ${panel("الخصومات والجزاءات لهذا الشهر", monthViolations.length
      ? table(["التاريخ","سبب الخصم","الإجراء","المبلغ"], monthViolations.map((record) => `<tr><td>${formatRecordDate(record.date)}</td><td>${escapeHtml(record.ruleLabel || workforceRuleTitle(workerSettings, record.ruleKey))}</td><td>${escapeHtml(record.decisionDescription || record.decision || "—")}</td><td>${money(record.deductionAmount || 0)}</td></tr>`))
      : '<div class="empty-state">لا توجد خصومات أو جزاءات مسجلة لهذا الشهر.</div>')}
    ${panel("السهر والمكافآت لهذا الشهر", overtimeRows.length
      ? table(["التاريخ","وقت الانصراف","مدة السهر","المبلغ المحتسب"], overtimeRows.map((record) => `<tr><td>${formatRecordDate(record.date)}</td><td>${escapeHtml(record.checkOut || "—")}</td><td>${record.overtimeMinutes} دقيقة</td><td>${money(record.overtimeAmount)}</td></tr>`))
      : '<div class="empty-state">لا يوجد سهر مسجل لهذا الشهر.</div>')}
    <div class="stats-grid worker-legacy-stats">${stat("سجلات حضور أخرى", data.personalAttendance.length)}${stat("إجمالي المصروفات", money(data.workerExpenses.reduce((sum, item) => sum + formatAmount(item), 0)))}${stat("آخر مرتب مسجل", data.personalPayroll[0] ? money(formatAmount(data.personalPayroll[0])) : "—")}</div>
    ${panel("سجل الحضور والغياب", data.personalAttendance.length
      ? table(["التاريخ","الحالة","ملاحظات","تاريخ التسجيل"], datedRows(data.personalAttendance, (item) => [formatRecordDate(item.date || item.day || item._createdAt), item.status || item.type || "—", item.notes || item.note || "—"]))
      : '<div class="empty-state">لا توجد سجلات حضور أو غياب مرتبطة بحسابك.</div>')}
    ${panel("طلبات الانصراف والغياب", data.leaves.length
      ? table(["التاريخ","السبب","الحالة","تاريخ التسجيل"], data.leaves.map((item) => `<tr><td>${formatRecordDate(item.date || item.day)}</td><td>${escapeHtml(item.reason || item.notes || "—")}</td><td>${statusTag(item.status || "قيد المراجعة")}</td><td>${formatDateTime(item._createdAt || item.created_at)}</td></tr>`))
      : '<div class="empty-state">لا توجد طلبات انصراف أو غياب مسجلة.</div>')}
    ${panel("السلفيات والمصروفات الخاصة بي", table(["النوع","البيان","المبلغ","تاريخ التسجيل"], [
      ...data.personalAdvances.map((item) => `<tr><td>سلفة</td><td>${escapeHtml(item.description || item.reason || item.reference || "—")}</td><td>${money(formatAmount(item))}</td><td>${formatDateTime(item._createdAt || item.created_at || item.date)}</td></tr>`),
      ...data.workerExpenses.map((item) => `<tr><td>مصروف</td><td>${escapeHtml(item.description || item.reason || item.category || "—")}</td><td>${money(formatAmount(item))}</td><td>${formatDateTime(item._createdAt || item.created_at || item.date)}</td></tr>`)
    ]))}
    ${panel("سجل المرتب", data.personalPayroll.length
      ? table(["الفترة","المرتب","المدفوع","المتبقي","التاريخ"], data.personalPayroll.map((item) => `<tr><td>${escapeHtml(item.period || item.month || item.date || "—")}</td><td>${money(Number(item.salary ?? item.amount ?? 0))}</td><td>${money(Number(item.paidAmount ?? item.paid ?? 0))}</td><td>${money(Number(item.remainingAmount ?? item.remaining ?? 0))}</td><td>${formatDateTime(item._createdAt || item.created_at || item.date)}</td></tr>`))
      : '<div class="empty-state">لا توجد سجلات مرتب مسجلة لحسابك.</div>')}
  </section>`;
  const production = session.canSubmitProduction
    ? `<section id="worker-production" class="dashboard-section worker-production-section">${panel("تسليم طلبية / تسليم أعداد", workerProductionSubmissionForm(), "أدخل اسم ورقم الموديل، وحدد المقاسات والأعداد لكل لون، وأرفق صورة الموديل.")}${panel("تسليماتي المرسلة", productionCards.length ? `<div class="worker-submission-list">${productionCards.join("")}</div>` : '<div class="empty-state">لا توجد تسليمات إنتاج مرسلة بعد.</div>')}</section>`
    : "";
  return `<section id="dashboard" class="dashboard-section"><div class="stats-grid">${stat("المهام المسندة إليّ", tasks.length, "حسب حساب العامل")}${stat("قيد التنفيذ", tasks.filter((item) => item.status === "قيد التنفيذ").length)}${stat("مهام جديدة", tasks.filter((item) => item.status === "جديدة").length)}${session.jobTitle ? stat("المسمى الوظيفي", escapeHtml(session.jobTitle)) : ""}</div>${panel("مهامي", table(["المهمة","الموديل","الكمية","موعد التسليم","الحالة"], tasks.map((item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.model)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity)}</td><td>${escapeHtml(item.due)}</td><td>${statusTag(item.status)}</td></tr>`)))}</section>${personalAccount}${production}`;
}

function clientView(data, session) {
  const settlements = data.settlements
    .filter((entry) => entry._ownerId === session.accountId)
    .sort((left, right) => new Date(right.date || right._createdAt).getTime() - new Date(left.date || left._createdAt).getTime());
  const latestSettlement = settlements[0] || null;
  const currentOrders = data.models.filter((item) => !item.archivedAt);
  const archivedOrders = data.models.filter((item) => item.archivedAt);
  const allClientPayments = data.payments.filter((item) =>
    item.clientId === session.accountId
    || item._ownerId === session.accountId
    || item.client === session.username
  );
  const payments = allClientPayments.filter((item) =>
    !latestSettlement
    || new Date(item._createdAt || item.created_at || item.date).getTime()
      >= new Date(latestSettlement.date || latestSettlement._createdAt).getTime()
  );
  const periodStart = latestSettlement?.date || latestSettlement?._createdAt || null;
  const inCurrentPeriod = (date) => !periodStart || new Date(date).getTime() >= new Date(periodStart).getTime();
  const allClientAccountAdjustments = data.accountAdjustments.filter((entry) => entry._ownerId === session.accountId);
  const accountAdjustments = allClientAccountAdjustments.filter((entry) =>
    inCurrentPeriod(entry._createdAt || entry.created_at)
  );
  const currentPeriodExpenses = data.cashTransactions.filter((entry) =>
    entry.direction === "expense" && inCurrentPeriod(entry.occurred_at)
  );
  const ledger = calculateClientAccountLedger({
    clientName: session.fullName,
    orders: currentOrders,
    archivedOrders,
    settlements,
    latestSettlement,
    payments,
    cashTransactions: currentPeriodExpenses,
    accountAdjustments
  });
  const {
    openingBalance,
    clientExpensesTotal,
    paid: totalPaid,
    pendingGoodsBalance,
    deliveredDue,
    balance: remaining,
    creditBalance: accountCreditBalance
  } = ledger;
  const balanceState = deliveredDue > 0 ? "is-debit" : accountCreditBalance > 0 ? "is-credit" : "is-settled";
  const balanceCaption = deliveredDue > 0
    ? "مديونية عن بضاعة تم تسليمها فقط؛ قيمة البضاعة غير المسلّمة تظهر منفصلة"
    : accountCreditBalance > 0
      ? "رصيد دائن بعد خصم الدفعات من قيمة البضاعة تحت التسليم أولاً"
      : pendingGoodsBalance > 0
        ? "لا توجد مديونية مستحقة؛ المتبقي خاص ببضاعة لم تُسلّم بعد"
        : "الحساب متوازن ولا يوجد مبلغ مستحق";
  const financialEntries = [
    ...data.deliveries.map((entry) => ({
      type: "تسليم بضاعة",
      reference: currentOrders.concat(archivedOrders).find((order) => order.id === entry.order_id)?.name || "طلبية",
      detail: `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(entry.quantity)} قطعة · ${escapeHtml(entry.recipient_name || "المستلم غير محدد")}`,
      amount: Number(entry.amount),
      date: entry.delivered_at
    })),
    ...allClientPayments.map((entry) => ({
      type: "دفعة مستلمة من العميل",
      reference: entry.reference || "دفعة مالية",
      detail: `${escapeHtml(entry.method || "طريقة الدفع غير محددة")}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}`,
      amount: -Number(entry.amount || 0),
      date: entry._createdAt || entry.created_at || entry.date
    })),
    ...allClientAccountAdjustments.map((entry) => ({
      type: "خصم تسوية حساب",
      reference: entry.reason || "خصم مسموح به",
      detail: entry.notes ? escapeHtml(entry.notes) : "خصم غير نقدي من رصيد الحساب",
      amount: -Number(entry.amount || 0),
      date: entry._createdAt || entry.created_at || entry.date
    })),
    ...currentOrders.filter((order) => Number(order.paidAmount) > 0).map((order) => ({
      type: "دفعة مثبتة على الموديل",
      reference: order.name || order.modelNumber || "موديل",
      detail: `الموديل ${escapeHtml(order.modelNumber || "—")}`,
      amount: -Number(order.paidAmount),
      date: order.created_at
    })),
    ...data.cashTransactions.map((entry) => ({
      type: entry.direction === "expense" ? "مبلغ مدفوع على الحساب (مصروف / عهدة)" : "مبلغ وارد للحساب",
      reference: entry.category || "حركة مالية",
      detail: `${escapeHtml(entry.description || "—")} · ${escapeHtml(entry.payment_method || "غير محدد")}`,
      amount: entry.direction === "expense" ? Number(entry.amount) : -Number(entry.amount),
      date: entry.occurred_at
    })),
    ...settlements.map((entry) => ({
      type: "رصيد مُرحّل",
      reference: "تصفية حساب",
      detail: `الرصيد الختامي للفترة ${money(entry.balance)}`,
      amount: Number(entry.balance),
      date: entry.date || entry._createdAt
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const financialLedger = panel("السجل المالي الزمني", financialEntries.length
    ? table(["الحركة","المرجع","التفاصيل","الأثر على الحساب","التاريخ والوقت"], financialEntries.map((entry) =>
      `<tr><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.reference)}</td><td>${entry.detail}</td><td class="${entry.amount < 0 ? "financial-credit" : "financial-debit"}">${entry.amount < 0 ? "−" : "+"}${money(Math.abs(entry.amount))}</td><td>${formatDateTime(entry.date)}</td></tr>`
    ))
    : '<div class="empty-state">لا توجد حركات مالية مسجلة حتى الآن.</div>');
  const orderLedgerFinancial = clientOrderLedgerPanel(ledger);
  const finishedGoodsRows = data.finishedGoods.map((item) =>
    `<tr><td>${escapeHtml(item.model_name)}${item.model_number ? `<small class="worker-model-number">${escapeHtml(item.model_number)}</small>` : ""}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity)} قطعة</td><td>${workerProductionColorMarkup(item.colors)}</td><td>${modelImageMarkup(item.imageUrl, `صورة القطعة ${item.model_name}`) || "—"}</td><td>${escapeHtml(item.worker_name)}</td><td>${formatDateTime(item.confirmed_at)}</td></tr>`
  );
  const fabricStockRows = [...new Map(data.clientFabricStock.map((item) => [item.fabric_id, item])).values()];
  const fabricMovementRows = data.clientFabricStock.filter((item) => item.movement_id);
  const fabricQuantity = (value) => new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(Number(value || 0));
  const fabricSection = `<section id="fabrics" class="dashboard-section">${panel("القماشي · رصيد القماش المسجل باسمك", fabricStockRows.length
    ? table(["نوع القماش","اللون","الرصيد المتاح","الوحدة","آخر تحديث"], fabricStockRows.map((item) =>
      `<tr><td>${escapeHtml(item.fabric_name)}</td><td>${escapeHtml(item.color_name || "—")}</td><td>${fabricQuantity(item.quantity_available)}</td><td>${escapeHtml(item.unit)}</td><td>${formatDateTime(item.updated_at || item.received_at)}</td></tr>`
    ))
    : '<div class="empty-state">لا يوجد رصيد قماش مسجل على ملفك حالياً.</div>')}
    ${panel("حركات القماش", fabricMovementRows.length
      ? table(["القماش / اللون","الحركة","الكمية","ملاحظات","التاريخ"], fabricMovementRows.map((item) =>
        `<tr><td>${escapeHtml(item.fabric_name)} · ${escapeHtml(item.color_name || "—")}</td><td>${escapeHtml(item.transaction_type)}</td><td>${fabricQuantity(item.movement_quantity)} ${escapeHtml(item.unit)}</td><td>${escapeHtml(item.movement_notes || "—")}</td><td>${formatDateTime(item.movement_created_at)}</td></tr>`
      ))
      : '<div class="empty-state">لا توجد حركات قماش مسجلة.</div>')}</section>`;
  const clientModelRequests = (data.clientModelRequests || []).filter((request) => request.user_id === session.accountId);
  const requestRows = (requests) => requests.map((request) =>
    `<tr><td>${escapeHtml(request.model_name || "—")}</td><td>${escapeHtml(request.model_number || "—")}</td><td>${request.quantity ?? "—"}</td><td>${modelImageMarkup(request.imageUrl, `صورة القطعة ${request.model_name || ""}`) || "—"}</td><td>${statusTag(request.status === "pending" ? "بانتظار مراجعة الإدارة" : request.status)}</td><td>${formatDateTime(request.created_at)}</td></tr>`
  );
  const pendingClientModelRequests = clientModelRequests.filter((request) => request.status === "pending");
  const reviewedClientModelRequests = clientModelRequests.filter((request) => request.status !== "pending");
  const clientModelRequestSection = `<section id="model-requests" class="dashboard-section">${panel("إرسال قصة / موديل جديد", `<form class="form-grid client-model-request-form" data-client-model-request novalidate>
    <label class="field"><span>اسم الموديل (اختياري)</span><input name="modelName" maxlength="160"></label>
    <label class="field"><span>كود/رقم الموديل للعميل (اختياري)</span><input name="modelNumber" maxlength="100"></label>
    <label class="field"><span>الأعداد (اختياري)</span><input name="quantity" type="number" step="1" inputmode="numeric"></label>
    <label class="field"><span>صورة الموديل (اختياري)</span>${imagePickerMarkup("modelImage", "إضافة صورة")}<small>يمكنك الإرسال دون صورة. الحد الأقصى للصورة 25 ميجابايت.</small><span data-client-model-image-preview></span></label>
    <label class="field"><span>ملاحظات (اختياري)</span><textarea name="notes" rows="3" maxlength="2000"></textarea></label>
    <div class="form-actions"><button class="button button-primary" type="submit">إرسال للإدارة</button></div>
  </form>`, "كل الحقول اختيارية؛ الطلب منفصل عن أوامر الإنتاج والمخزون والحسابات حتى مراجعته من الإدارة.")}
    ${panel("موديلات مطلوبة للقص / قيد الانتظار", pendingClientModelRequests.length
      ? table(["اسم الموديل","كود/رقم الموديل للعميل","العدد","الصورة","الحالة","تاريخ الإرسال"], requestRows(pendingClientModelRequests))
      : '<div class="empty-state">لا توجد موديلات مطلوبة للقص بانتظار المراجعة.</div>', "هذه الطلبات منفصلة عن الموديلات والطلبيات؛ لا تدخل سجل الإنتاج أو حساب البضاعة حتى اعتمادها وقصها فعلياً.")}
    ${reviewedClientModelRequests.length ? panel("طلبات القص السابقة", table(["اسم الموديل","كود/رقم الموديل للعميل","العدد","الصورة","الحالة","تاريخ الإرسال"], requestRows(reviewedClientModelRequests))) : ""}</section>`;
  return `<section id="dashboard" class="dashboard-section"><article class="client-balance-spotlight ${balanceState}" role="status" aria-live="polite"><span>${deliveredDue > 0 ? "المستحق حسب حالة الطلب" : accountCreditBalance > 0 ? "الرصيد الدائن" : "المستحق حسب حالة الطلب"}</span><strong>${money(deliveredDue > 0 ? deliveredDue : accountCreditBalance)}</strong><small>${balanceCaption}</small></article><div class="stats-grid">${stat("موديلاتي الحالية", currentOrders.length, "ضمن الفترة الحالية")}${latestSettlement ? stat("الرصيد المرحّل من آخر تصفية", money(openingBalance), "قبل حركات الفترة الحالية") : ""}${stat("المتبقي من البضاعة بحالات التشغيل الأخرى", money(pendingGoodsBalance), "بعد الدفعات؛ جميع الحالات ما عدا الجاهز للتسليم وتم التسليم")}${stat("المستحق للطلبات الجاهزة أو المسلّمة", money(deliveredDue), "حسب حالة الطلب")}${stat("مصروفات وعهد على الحساب", money(clientExpensesTotal))}${stat("إجمالي المدفوع", money(totalPaid))}${stat("إجمالي رصيد الحساب المتوقع", money(remaining), remaining === 0 ? "تم السداد بالكامل" : remaining < 0 ? "رصيد دائن بعد احتساب البضاعة بحالات التشغيل الأخرى" : deliveredDue > 0 ? `المستحق حسب الحالة ${money(deliveredDue)}، والبضاعة بحالات التشغيل الأخرى ${money(pendingGoodsBalance)}` : pendingGoodsBalance > 0 ? "لا يوجد مستحق حسب الحالة؛ الرصيد خاص ببضاعة بحالات تشغيل أخرى" : "لا يوجد مستحق حسب حالة الطلب")}</div></section><section id="orders" class="dashboard-section">${panel("موديلاتي والطلبيات الحالية", clientOrderCards(currentOrders))}${archivedOrders.length ? panel("الطلبات المؤرشفة", clientOrderCards(archivedOrders)) : ""}</section>${clientModelRequestSection}<section id="finished-goods" class="dashboard-section">${panel("المخزني · مخزون الإنتاج المستلم", table(["الموديل","الكمية","الألوان","الصورة","العامل","تاريخ الاستلام"], finishedGoodsRows))}</section>${fabricSection}<section id="finance" class="dashboard-section">${orderLedgerFinancial}${financialLedger}</section>`;
}

function clientModelRequestsAdminView(data) {
  const requests = data.clientModelRequests || [];
  const clientName = (clientId) => data.clients.find((client) => client.id === clientId)?.name || "عميل";
  return `<section id="client-model-requests" class="dashboard-section">${panel("طلبات القصص / الموديلات الجديدة من العملاء", requests.length
    ? table(["العميل","اسم الموديل","كود/رقم الموديل للعميل","العدد","الصورة","ملاحظات","الحالة","تاريخ الإرسال"], requests.map((request) =>
      `<tr><td>${escapeHtml(clientName(request.client_id))}</td><td>${escapeHtml(request.model_name || "—")}</td><td>${escapeHtml(request.model_number || "—")}</td><td>${request.quantity ?? "—"}</td><td>${modelImageMarkup(request.imageUrl, `صورة القطعة ${request.model_name || ""}`) || "—"}</td><td>${escapeHtml(request.notes || "—")}</td><td>${statusTag(request.status === "pending" ? "بانتظار المراجعة" : request.status)}</td><td>${formatDateTime(request.created_at)}</td></tr>`
    ))
    : '<div class="empty-state">لا توجد طلبات قصص أو موديلات جديدة من العملاء.</div>')}</section>`;
}

let sidebarCollapsed = false;
let activeDashboardView = "";
let activeOrdersTab = "models";
let activeRegisterTab = "models";

function navigationItems(role, info, session = null) {
  if (role === "admin") {
    return [
      { id: "dashboard", icon: "▦", label: "لوحة التحكم" },
      { id: "clients", icon: "◇", label: "إدارة العملاء" },
      { id: "orders", icon: "▤", label: "الموديلات والطلبيات" },
      { id: "records", icon: "▣", label: "سجلات الموديلات والقصات" },
      { id: "client-model-requests", icon: "✉", label: "طلبات قصص العملاء" },
      { id: "cutting", icon: "✂", label: "القص" },
      { id: "sewing", icon: "⌁", label: "الخياطة" },
      { id: "workers-production", icon: "⌁", label: "العمال والإنتاج" },
      { id: "workforce", icon: "◷", label: "شؤون العمال والحضور" },
      { id: "finance", icon: "ج.م", label: "حسابات العملاء / المصاريف" },
      { id: "owner-fabric", icon: "▧", label: "قماش الإدارة" },
      { id: "incoming-fabric", icon: "↘", label: "القماش الداخل" },
      { id: "accounts", icon: "♙", label: "طلبات ومستخدمي النظام", last: true }
    ];
  }
  if (role === "client") {
    return [
      { id: "dashboard", icon: "▦", label: "لوحة التحكم" },
      { id: "orders", icon: "▤", label: "موديلاتي والطلبيات" },
      { id: "finished-goods", icon: "▣", label: "المخزني" },
      { id: "fabrics", icon: "▧", label: "القماشي" },
      { id: "finance", icon: "ج.م", label: "السجل المالي" },
      { id: "model-requests", icon: "＋", label: "إرسال قصة / موديل جديد" }
    ];
  }
  if (role === "cutting") {
    return [
      { id: "dashboard", icon: info.icon, label: "لوحة التحكم" },
      { id: "records", icon: "▣", label: "سجلات الموديلات والقصات" },
      { id: "cutting-requests", icon: "✉", label: "طلبات القص الجديدة" },
      { id: "admin-requests", icon: "✂", label: "طلبات الإدارة" },
      { id: "new-cutting", icon: "＋", label: "قصة جديدة" },
      { id: "incoming-fabric", icon: "↘", label: "القماش الداخل" },
      { id: "personal-account", icon: "◷", label: "متابعة الحساب والراتب", last: true }
    ];
  }
  if (role === "sewing") {
    return [
      { id: "dashboard", icon: info.icon, label: "لوحة التحكم" },
      { id: "records", icon: "▣", label: "سجلات الموديلات والقصات" },
      { id: "personal-account", icon: "◷", label: "متابعة الحساب والراتب", last: true }
    ];
  }
  if (role === "worker") {
    return [
      { id: "dashboard", icon: info.icon, label: "مهامي" },
      { id: "personal-account", icon: "◷", label: "حسابي الشخصي" },
      ...(session?.canSubmitProduction ? [{ id: "worker-production", icon: "✓", label: "تسليم الإنتاج", last: true }] : [])
    ];
  }
  return [{ id: "dashboard", icon: info.icon, label: "لوحة التحكم" }];
}

const WORKFORCE_DEFAULTS = {
  shiftStart: "09:00",
  shiftEnd: "17:00",
  overtimeMultiplier: 1.5,
  penalties: [],
  lateRules: []
};

const WORKFORCE_RULES = [
  ["late", "lateRule", null, "تأخير"]
];

const WORKFORCE_ATTENDANCE_LABELS = {
  present: "حاضر",
  absent: "غائب",
  absent_permitted: "غياب بإذن",
  absent_unexcused: "غياب بدون إذن",
  leave: "إجازة",
  friday_paid: "جمعة مدفوعة",
  friday_unpaid: "جمعة غير مدفوعة",
  friday_deducted: "جمعة مخصومة",
  late: "متأخر"
};

function workforceSettings(data) {
  const saved = data.workforceSettings.find((record) => record.settingKey === "main") || {};
  return {
    ...WORKFORCE_DEFAULTS,
    ...saved,
    penalties: Array.isArray(saved.penalties) ? saved.penalties : [],
    lateRules: Array.isArray(saved.lateRules) ? saved.lateRules : WORKFORCE_DEFAULTS.lateRules
  };
}

function workforceEmployees(data) {
  return data.workforceProfiles
    .filter((profile) => profile.workerId && profile.employeeName)
    .map((profile) => {
      const linkedUserId = workforceLinkedAccountId({ id: profile.workerId }, data);
      const account = data.users.find((user) => user.id === linkedUserId && user.status === "active");
      const roleKey = profile.roleKey || account?.roleKey || "worker";
      return {
        ...profile,
        id: profile.workerId,
        name: profile.employeeName,
        username: account?.username || profile.username || "—",
        phone: account?.phone || profile.phone || "",
        roleKey,
        role: roleNames[roleKey] || roleKey,
        roleLabel: roleNames[roleKey] || roleKey,
        jobTitle: profile.jobTitle || account?.jobTitle || "",
        status: account?.status || "pending",
        accountId: account?.id || null,
        linkedUserId
      };
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), "ar"));
}

function workforceProfile(data, workerId) {
  return data.workforceProfiles.find((profile) => profile.workerId === workerId) || {};
}

function workforceEmployeeProfilePayload(worker, profile, data) {
  const linkedUserId = workforceLinkedAccountId(worker, data) || worker.accountId || worker.id;
  const account = data.users.find((entry) => entry.id === linkedUserId);
  return {
    ...profile,
    workerId: worker.id,
    employeeName: worker.name,
    username: worker.username,
    phone: worker.phone || "",
    roleKey: worker.roleKey,
    jobTitle: worker.jobTitle || account?.jobTitle || "",
    linkedUserId: workforceLinkedAccountId(worker, data)
  };
}

function workforceAccountCanBeLinked(account) {
  if (!account) return false;
  const role = account?.roleKey ?? account?.role ?? null;
  return ["worker", "cutting", "sewing", "pending", null].includes(role)
    && ["active", "suspended", "pending", undefined, null].includes(account.status);
}

function workforceRecordOwnerId(worker, data) {
  return workforceLinkedAccountId(worker, data);
}

function showWorkforceLateDecisionModal(root, worker, date, delay) {
  pendingWorkforceLateDecision = { workerId: worker.id, date, delay, decision: "" };
  const modalRoot = document.querySelector("#workforce") || root;
  const modal = modalRoot.querySelector("[data-workforce-late-modal]");
  if (!modal) return;
  modalRoot.querySelector("[data-workforce-late-summary]").textContent =
    `${worker.name} · تأخير ${delay} دقيقة · اختر قرار الخصم الآن.`;
  modal.querySelectorAll("[data-late-decision]").forEach((choice) => {
    choice.classList.remove("active");
    choice.setAttribute("aria-pressed", "false");
  });
  modalRoot.querySelector("[data-save-late-decision]").disabled = true;
  modal.hidden = false;
}

function showWorkforceAbsenceDecisionModal(root, worker, date, notes) {
  pendingWorkforceAbsenceDecision = { workerId: worker.id, date, notes, permission: "" };
  const modal = root.querySelector("[data-workforce-absence-modal]");
  modal.querySelector("[data-workforce-absence-summary]").textContent = `${worker.name} · ${date} · اختر نوع الغياب لتسجيل الخصم.`;
  modal.querySelectorAll("[data-absence-permission]").forEach((choice) => {
    choice.classList.remove("active");
    choice.setAttribute("aria-pressed", "false");
  });
  modal.querySelector("[data-save-workforce-absence]").disabled = true;
  modal.hidden = false;
}

function workforceLinkedAccountId(worker, data) {
  const profile = workforceProfile(data, worker.id);
  if (Object.hasOwn(profile, "linkedUserId")) return profile.linkedUserId || null;
  return data.users.some((account) => account.id === worker.id && account.status === "active")
    ? worker.id
    : null;
}

function workforceAccountLinkOptions(worker, data) {
  const linkedElsewhere = new Set(data.workforceProfiles
    .filter((profile) => profile.workerId !== worker.id)
    .flatMap((profile) => [profile.linkedUserId, profile.previousLinkedUserId, profile.workerId].filter(Boolean)));
  const linkedAccountId = workforceLinkedAccountId(worker, data);
  const accounts = [
    ...data.users.filter(workforceAccountCanBeLinked),
    ...(data.pendingAccounts || []).filter(workforceAccountCanBeLinked)
  ];
  return [...new Map(accounts
    .filter((account) => account.id !== linkedAccountId && !linkedElsewhere.has(account.id))
    .map((account) => [account.id, account])).values()]
    .map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(account.username)} · ${account.status === "pending" ? "بانتظار الموافقة" : account.status === "suspended" ? "موقوف" : "نشط غير مرتبط"}</option>`)
    .join("");
}

function workforceRecordBelongsToWorker(record, worker, data) {
  if (record.workerId === worker.id || record._ownerId === worker.id
    || record._ownerId === workforceRecordOwnerId(worker, data)) return true;
  const storedName = record.workerName || record.name || record.username;
  return storedName === worker.name
    && workforceEmployees(data).filter((employee) => employee.name === worker.name).length === 1;
}

function workforceDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function workforceMonthDates(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, index) => new Date(year, month - 1, index + 1));
}

function workforceSettlementOpenDate(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return workforceDateKey(new Date(year, month, 5));
}

function workforceCanSettlePeriod(monthKey, today = workforceDateKey(new Date())) {
  return today >= workforceSettlementOpenDate(monthKey);
}

function workforceAttendanceRecord(data, workerId, date) {
  return data.workforceAttendance.find((record) => record.workerId === workerId && record.date === date) || null;
}

async function workforceCreditPreviousFriday(worker, attendanceDate, data, saturdayAttendance) {
  const saturday = new Date(`${attendanceDate}T00:00:00`);
  if (saturday.getDay() !== 6) return false;
  if (!saturdayAttendance || !["present", "late"].includes(saturdayAttendance.status) || !saturdayAttendance.checkIn) return false;
  saturday.setDate(saturday.getDate() - 1);
  const fridayDate = workforceDateKey(saturday);
  if (workforceAttendanceRecord(data, worker.id, fridayDate)) return false;
  await saveFlexibleRecord("workforce_attendance", {
    workerId: worker.id,
    workerName: worker.name,
    date: fridayDate,
    status: "friday_paid",
    checkIn: "",
    checkOut: "",
    paidLeave: false,
    autoFridayPaid: true,
    notes: "احتساب تلقائي عند تسجيل حضور يوم السبت"
  }, null, workforceRecordOwnerId(worker, data));
  return true;
}

function workforceTimeMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function workforceShiftMinutes(settings) {
  const start = workforceTimeMinutes(settings.shiftStart);
  const end = workforceTimeMinutes(settings.shiftEnd);
  return start === null || end === null || end <= start ? 480 : end - start;
}

function workforceElapsedMinutes(start, end) {
  const startMinutes = workforceTimeMinutes(start);
  let endMinutes = workforceTimeMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return Math.max(0, endMinutes - startMinutes);
}

function workforceEarlyDepartureMinutes(checkOut, settings) {
  const shiftStart = workforceTimeMinutes(settings.shiftStart);
  const rawShiftEnd = workforceTimeMinutes(settings.shiftEnd);
  let actualEnd = workforceTimeMinutes(checkOut);
  if (shiftStart === null || rawShiftEnd === null || actualEnd === null) return 0;
  const shiftEnd = rawShiftEnd <= shiftStart ? rawShiftEnd + 24 * 60 : rawShiftEnd;
  if (actualEnd < shiftStart) actualEnd += 24 * 60;
  return Math.max(0, shiftEnd - actualEnd);
}

function workforceMoney(value) {
  return money(Math.round((Number(value) + Number.EPSILON) * 100) / 100);
}

function workforceRatePreview(basis, value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "أدخل قيمة المرتب لاحتساب أجر اليوم والساعة تلقائياً.";
  }
  const daily = basis === "weekly" ? amount / 7
    : basis === "hourly" ? amount * 9
      : basis === "daily" ? amount
        : amount / 30;
  const hourly = basis === "hourly" ? amount : daily / 9;
  return `أجر اليوم: ${workforceMoney(daily)} · أجر الساعة: ${workforceMoney(hourly)} · ${basis === "weekly" ? "المرتب الأسبوعي ÷ 7" : basis === "hourly" ? "قيمة الساعة المدخلة" : basis === "daily" ? "قيمة اليوم المدخلة" : "المرتب الشهري ÷ 30"} · اليوم القياسي 9 ساعات.`;
}

function workforceRuleTitle(settings, ruleKey) {
  if (String(ruleKey).startsWith("penalty_")) {
    return settings.penalties.find((penalty) => `penalty_${penalty.id}` === ruleKey)?.name || "خصم محذوف";
  }
  if (ruleKey === "late") return "التأخير";
  const rule = WORKFORCE_RULES.find(([key]) => key === ruleKey);
  if (!rule) return "مخالفة أخرى";
  const [, titleKey] = rule;
  return settings[titleKey] || titleKey;
}

function workforceWageRates(profile, settings, monthKey, data, workerId) {
  const rate = Number(profile.wageAmount || 0);
  const basis = profile.wageBasis || "monthly";
  const shiftHours = 9;
  const monthlyDays = 30;
  const daily = basis === "weekly"
    ? rate / 7
    : basis === "monthly"
      ? rate / monthlyDays
      : basis === "hourly"
        ? rate * shiftHours
        : rate;
  const hourly = basis === "hourly" ? rate : daily / shiftHours;
  return { rate, basis, daily, hourly, shiftHours, monthlyDays };
}

function workforceRuleAmount(ruleKey, settings) {
  if (String(ruleKey).startsWith("penalty_")) {
    return Number(settings.penalties.find((penalty) => `penalty_${penalty.id}` === ruleKey)?.amount || 0);
  }
  const rule = WORKFORCE_RULES.find(([key]) => key === ruleKey);
  const amountKey = rule?.[2];
  return amountKey ? Number(settings[amountKey] || 0) : 0;
}

function workforceActualMinutes(form, ruleKey, settings, data, workerId, date) {
  if (ruleKey === "absence") return workforceShiftMinutes(settings);
  if (ruleKey === "phone") {
    const extraCalls = Math.max(0, Number(form.elements.callsCount.value || 0) - Number(settings.phoneCallsAllowed));
    const extraDuration = Math.max(0, Number(form.elements.callDuration.value || 0) - Number(settings.phoneCallMaxMinutes));
    return extraCalls * Number(settings.phoneCallMaxMinutes) + extraDuration;
  }
  if (ruleKey === "late") {
    const attendance = workforceAttendanceRecord(data, workerId, date);
    const recordedDelay = workforceTimeMinutes(attendance?.checkIn) - workforceTimeMinutes(settings.shiftStart);
    if (Number.isFinite(recordedDelay) && recordedDelay > 0) return recordedDelay;
  }
  return Math.max(0, Number(form.elements.minutes.value || 0));
}

function workforceOfficialPenalty(ruleKey, settings, profile, monthKey, data, date, minutes, workerId) {
  const rates = workforceWageRates(profile, settings, monthKey, data, workerId);
  if (ruleKey === "late") {
    const delay = Math.max(0, Number(minutes) || 0);
    if (delay <= 0) return { amount: 0, description: "أدخل وقت التأخير أولاً" };
    if (!settings.lateRules.length) return { amount: 0, description: "لا توجد قاعدة تأخير محفوظة" };
    const rule = [...settings.lateRules]
      .sort((left, right) => Number(left.maxMinutes) - Number(right.maxMinutes))
      .find((entry) => delay <= Number(entry.maxMinutes))
      || settings.lateRules[settings.lateRules.length - 1];
    const hours = Number(rule?.deductionHours || 0);
    return { amount: rates.hourly * hours, description: `جزاء تأخير يعادل ${hours} ساعة عمل` };
  }
  if (ruleKey === "absence") {
    const deductionDays = 1;
    return { amount: rates.daily * deductionDays, deductionDays, description: `جزاء الغياب يعادل ${deductionDays} يوم عمل` };
  }
  return { amount: workforceRuleAmount(ruleKey, settings), description: "" };
}

function workforceMonthAccrual(worker, data, settings, monthKey, throughDate) {
  const profile = workforceProfile(data, worker.id);
  const rates = workforceWageRates(profile, settings, monthKey, data, worker.id);
  const monthDates = workforceMonthDates(monthKey);
  const lastSettlement = data.workforceSettlements
    .filter((record) => record.workerId === worker.id && record.throughDate <= throughDate)
    .sort((left, right) => String(right.throughDate).localeCompare(String(left.throughDate)))[0];
  const carryover = Number(lastSettlement?.balanceAfter || 0);
  const monthStart = `${monthKey}-01`;
  const firstDate = lastSettlement
    ? new Date(`${lastSettlement.throughDate}T00:00:00`)
    : new Date("1970-01-01T00:00:00");
  if (lastSettlement) firstDate.setDate(firstDate.getDate() + 1);
  let creditedDays = 0;
  let earned = 0;
  let overtimeAmount = 0;
  const attendanceForWorker = data.workforceAttendance.filter((record) => record.workerId === worker.id);
  for (const date of monthDates) {
    const dateKey = workforceDateKey(date);
    if (dateKey < workforceDateKey(firstDate) || dateKey > throughDate) continue;
    const record = attendanceForWorker.find((entry) => entry.date === dateKey);
    const isFriday = date.getDay() === 5;
    const status = record?.status || "";
    if (status === "present" || status === "late" || (status === "leave" && record?.paidLeave)) {
      creditedDays += 1;
      const workedMinutes = workforceElapsedMinutes(record?.checkIn, record?.checkOut);
      if (rates.basis === "hourly") earned += record?.status === "leave"
        ? rates.hourly * rates.shiftHours
        : rates.hourly * Math.min(workedMinutes, workforceShiftMinutes(settings)) / 60;
      else if (rates.basis === "daily") earned += rates.daily * (record?.status === "leave" ? 1 : Math.min(workedMinutes / workforceShiftMinutes(settings), 1));
      else earned += rates.daily;
    } else if (status === "friday_paid") {
      creditedDays += 1;
      earned += rates.basis === "hourly" ? rates.hourly * rates.shiftHours : rates.daily;
    } else if (status === "absent" && data.workforceViolations.some((violation) =>
      violation.workerId === worker.id && violation.ruleKey === "absence"
      && violation.date === dateKey && violation.decision === "official"
      && violation.permission !== "unexcused"
    )) {
      creditedDays += 1;
      earned += rates.basis === "hourly" ? rates.hourly * rates.shiftHours : rates.daily;
    }
    const checkInMinutes = workforceTimeMinutes(record?.checkIn);
    const checkOutMinutes = workforceTimeMinutes(record?.checkOut);
    const shiftEndMinutes = workforceTimeMinutes(settings.shiftEnd);
    if (checkInMinutes !== null && checkOutMinutes !== null && shiftEndMinutes !== null && checkOutMinutes > shiftEndMinutes
      && ["present", "late"].includes(status)) {
      const overtimeMinutes = checkOutMinutes - Math.max(shiftEndMinutes, checkInMinutes);
      overtimeAmount += rates.hourly * overtimeMinutes / 60 * Number(settings.overtimeMultiplier || 1.5);
    }
  }
  if (rates.basis === "monthly") {
    earned = rates.daily * creditedDays;
  }
  earned += overtimeAmount;
  const dateInRange = (date) => {
    const dateKey = String(date || "").slice(0, 10);
    return dateKey >= workforceDateKey(firstDate) && dateKey <= throughDate;
  };
  const advanceStartDate = lastSettlement
    ? workforceDateKey(firstDate)
    : "0000-01-01";
  const priorAdvances = data.workerAdvances
    .filter((record) => workforceRecordBelongsToWorker(record, worker, data))
    .filter((record) => {
      const date = String(record.date || record.created_at || record._createdAt || "").slice(0, 10);
      return date >= advanceStartDate && date < monthStart && date <= throughDate;
    })
    .reduce((total, record) => total + Number(record.amount ?? record.value ?? record.netAmount ?? 0), 0);
  const advances = data.workerAdvances
    .filter((record) => workforceRecordBelongsToWorker(record, worker, data)
      && dateInRange(record.date || record.created_at || record._createdAt)
      && String(record.date || record.created_at || record._createdAt || "").slice(0, 10) >= monthStart)
    .reduce((total, record) => total + Number(record.amount ?? record.value ?? record.netAmount ?? 0), 0);
  const previousPaid = data.workerPayroll
    .filter((record) => workforceRecordBelongsToWorker(record, worker, data)
      && (dateInRange(record.date || record.created_at || record._createdAt)
        && String(record.date || record.created_at || record._createdAt || "").slice(0, 10) >= monthStart
        || (!lastSettlement && (record.period === monthKey || record.month === monthKey))))
    .reduce((total, record) => total + Number(record.paidAmount ?? record.paid ?? 0), 0);
  const deductions = data.workforceViolations
    .filter((record) => record.workerId === worker.id
      && dateInRange(record.date)
      && ["official", "actual_time"].includes(record.decision))
    .reduce((total, record) => total + Number(record.deductionAmount
      || (record.ruleKey === "absence" ? rates.daily * Number(record.deductionDays || 0) : 0)), 0);
  return {
    earned,
    overtimeAmount,
    advances,
    previousPaid,
    deductions,
    carryover: carryover - priorAdvances,
    priorAdvances,
    netDue: carryover + earned - advances - previousPaid - deductions - priorAdvances,
    creditedDays,
    profile,
    rate: rates
  };
}

function workforceAttendanceGrid(data, employees, settings) {
  const dates = workforceMonthDates(selectedWorkforceMonth);
  if (!employees.length) return '<div class="empty-state">لا توجد ملفات عاملين لعرض حضورها.</div>';
  const headings = dates.map((date) =>
    `<th class="${date.getDay() === 5 ? "workforce-friday" : ""}"><span>${date.getDate()}</span><small>${new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(date)}</small></th>`
  ).join("");
  const rows = employees.map((worker) => {
    const cells = dates.map((date) => {
      const dateKey = workforceDateKey(date);
      const record = workforceAttendanceRecord(data, worker.id, dateKey);
      const status = record?.status || "";
      const shortStatus = WORKFORCE_ATTENDANCE_LABELS[status] || "غير مسجل";
      return `<td><div class="workforce-cell ${status ? `workforce-cell-${status}` : ""}">
        <button type="button" class="workforce-clock-button workforce-clock-in" data-workforce-clock="in" data-worker-id="${escapeHtml(worker.id)}" data-attendance-date="${dateKey}" aria-label="تسجيل أو تعديل حضور ${escapeHtml(worker.name)} بتاريخ ${dateKey}">حضور <b>${escapeHtml(record?.checkIn || "＋")}</b></button>
        <button type="button" class="workforce-clock-button workforce-clock-out" data-workforce-clock="out" data-worker-id="${escapeHtml(worker.id)}" data-attendance-date="${dateKey}" aria-label="تسجيل أو تعديل انصراف ${escapeHtml(worker.name)} بتاريخ ${dateKey}">انصراف <b>${escapeHtml(record?.checkOut || settings.shiftEnd)}</b></button>
        <button type="button" class="workforce-status-button" data-workforce-status data-worker-id="${escapeHtml(worker.id)}" data-attendance-date="${dateKey}" aria-label="تعديل حالة ${escapeHtml(worker.name)} بتاريخ ${dateKey}">${escapeHtml(shortStatus)}</button>
      </div></td>`;
    }).join("");
    return `<tr><th class="workforce-worker-name">${escapeHtml(worker.name)}<small>${escapeHtml(worker.jobTitle || roleNames[worker.roleKey] || "")}</small></th>${cells}</tr>`;
  }).join("");
  return `<div class="workforce-matrix-scroll"><table class="workforce-matrix"><thead><tr><th class="workforce-worker-name">العامل / اليوم</th>${headings}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function workforceView(data) {
  const employees = workforceEmployees(data);
  const settings = workforceSettings(data);
  const alreadyLinkedStaffAccounts = new Set(data.workforceProfiles
    .flatMap((profile) => [profile.linkedUserId, profile.workerId].filter(Boolean)));
  const pendingStaffAccounts = [
    ...(data.pendingAccounts || []).filter(workforceAccountCanBeLinked),
    ...data.users.filter((account) => workforceAccountCanBeLinked(account)
      && !alreadyLinkedStaffAccounts.has(account.id))
  ];
  const pendingStaffOptions = [...new Map(pendingStaffAccounts.map((account) => [account.id, account])).values()]
    .map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(account.username)}${account.phone ? ` · ${escapeHtml(account.phone)}` : ""}${account.status === "pending" ? " · معلق" : account.status === "suspended" ? " · موقوف" : " · نشط"}</option>`)
    .join("");
  const attendanceRows = workforceAttendanceGrid(data, employees, settings);
  const employeeRows = employees.map((worker) => `<tr>
    <td><strong>${escapeHtml(worker.name)}</strong></td>
    <td>${escapeHtml(worker.jobTitle || "غير محدد")}</td>
    <td>${escapeHtml(worker.roleLabel)}</td>
    <td>${escapeHtml(worker.username)}</td>
    <td>${escapeHtml(worker.phone || "—")}</td>
    <td><button type="button" class="row-action" data-workforce-employee="${escapeHtml(worker.id)}">فتح ملف العامل</button></td>
  </tr>`).join("");
  const selectedEmployee = employees.find((worker) => worker.id === selectedWorkforceEmployeeId);
  const selectedEmployeeProfile = selectedEmployee ? workforceProfile(data, selectedEmployee.id) : null;
  const selectedEmployeeLinkedAccountId = selectedEmployee ? workforceLinkedAccountId(selectedEmployee, data) : null;
  const employeeJobTitleOptions = selectedEmployee
    ? [...new Set([selectedEmployee.jobTitle, ...WORKER_JOB_TITLES].filter(Boolean))]
      .map((title) => `<option value="${escapeHtml(title)}" ${title === selectedEmployee.jobTitle ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")
    : "";
  const workforceToday = workforceDateKey(new Date());
  const workforceCurrentMonth = workforceToday.slice(0, 7);
  const employeeCutoffDate = selectedWorkforceMonth === workforceCurrentMonth
    ? workforceToday
    : workforceDateKey(workforceMonthDates(selectedWorkforceMonth).at(-1));
  const employeeAttendance = selectedEmployee
    ? [...data.workforceAttendance]
      .filter((record) => record.workerId === selectedEmployee.id)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    : [];
  const employeeViolations = selectedEmployee
    ? [...data.workforceViolations]
      .filter((record) => record.workerId === selectedEmployee.id)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    : [];
  const employeeCalculation = selectedEmployee
    ? workforceMonthAccrual(selectedEmployee, data, settings, selectedWorkforceMonth, employeeCutoffDate)
    : null;
  const employeeAttendanceRows = employeeAttendance.map((record) => `<tr>
    <td>${formatRecordDate(record.date)}</td>
    <td>${escapeHtml(WORKFORCE_ATTENDANCE_LABELS[record.status] || record.status || "—")}</td>
    <td>${escapeHtml(record.checkIn || "—")}</td><td>${escapeHtml(record.checkOut || "—")}</td>
    <td>${record.checkIn && workforceTimeMinutes(record.checkIn) > workforceTimeMinutes(settings.shiftStart)
      ? `${Math.max(0, workforceTimeMinutes(record.checkIn) - workforceTimeMinutes(settings.shiftStart))} دقيقة`
      : "—"}</td>
    <td>${record.checkIn && record.checkOut && workforceTimeMinutes(record.checkOut) > workforceTimeMinutes(settings.shiftEnd)
      ? `${Math.max(0, workforceTimeMinutes(record.checkOut) - workforceTimeMinutes(settings.shiftEnd))} دقيقة`
      : "—"}</td>
    <td>${workforceEarlyDepartureMinutes(record.checkOut, settings)
      ? `${workforceEarlyDepartureMinutes(record.checkOut, settings)} دقيقة · ${employeeViolations.find((violation) => violation.ruleKey === "early_departure" && violation.date === record.date)?.decision === "waived" ? "عفو إداري دون خصم" : workforceMoney(employeeViolations.find((violation) => violation.ruleKey === "early_departure" && violation.date === record.date)?.deductionAmount || 0)}`
      : "—"}</td>
    <td>${escapeHtml(record.notes || "—")}</td>
  </tr>`).join("");
  const employeeViolationRows = employeeViolations.map((record) => `<tr>
    <td>${formatRecordDate(record.date)}</td><td>${escapeHtml(record.ruleLabel || workforceRuleTitle(settings, record.ruleKey))}</td>
    <td>${escapeHtml(record.decisionDescription || record.decision || "—")}</td>
    <td>${record.ruleKey === "absence" && record.permission === "unexcused"
      ? `${workforceMoney(record.deductionAmount || employeeCalculation.rate.daily)}<small class="workforce-deduction-detail">أجر يوم واحد: ${workforceMoney(employeeCalculation.rate.daily)}</small>`
      : workforceMoney(record.deductionAmount || 0)}</td><td>${escapeHtml(record.notes || "—")}</td>
    <td>${["official", "actual_time"].includes(record.decision) && Number(record.deductionAmount) > 0
      ? `<button type="button" class="row-action order-delete-action" data-delete-workforce-deduction="${escapeHtml(record._recordId)}">إلغاء الخصم</button>`
      : "—"}</td>
  </tr>`).join("");
  const employeeAccountMovements = selectedEmployee ? [
    ...data.workerAdvances.filter((record) => workforceRecordBelongsToWorker(record, selectedEmployee, data)).map((record) => ({
      date: record.date || record.created_at || record._createdAt,
      kind: "سلفة",
      details: record.description || record.reason || record.reference || record.notes || record.note || "سلفة عامل",
      amount: -Math.abs(Number(record.amount ?? record.value ?? record.netAmount ?? 0))
    })),
    ...data.workerPayroll.filter((record) => workforceRecordBelongsToWorker(record, selectedEmployee, data)).map((record) => ({
      date: record.date || record.created_at || record._createdAt || record.period || record.month,
      kind: "دفعة راتب",
      details: record.notes || record.description || record.period || record.month || "صرف راتب",
      amount: -Math.abs(Number(record.paidAmount ?? record.paid ?? 0))
    })),
    ...employeeViolations.map((record) => ({
      date: record.date,
      kind: "جزاء / خصم",
      details: `${record.ruleLabel || workforceRuleTitle(settings, record.ruleKey)} · ${record.decisionDescription || record.decision || ""}`,
      amount: -Math.abs(Number(record.deductionAmount || 0))
    })),
    ...data.workforceSettlements.filter((record) => record.workerId === selectedEmployee.id).map((record) => ({
      date: record.throughDate,
      kind: "تصفية",
      details: `مدفوع ${workforceMoney(record.paidAmount)} · رصيد مرحّل ${workforceMoney(record.balanceAfter)}`,
      amount: -Math.abs(Number(record.paidAmount || 0))
    }))
  ].sort((left, right) => String(right.date).localeCompare(String(left.date))) : [];
  const employeeAccountRows = employeeAccountMovements.map((movement) => `<tr>
    <td>${formatRecordDate(movement.date)}</td><td>${escapeHtml(movement.kind)}</td><td>${escapeHtml(movement.details)}</td>
    <td>${workforceMoney(movement.amount)}</td>
  </tr>`).join("");
  const lateRuleRows = settings.lateRules.map((rule, index) => `<div class="workforce-late-rule-row">
    <label class="field"><span>أقصى تأخير بالدقائق</span><input name="lateRuleMax" type="number" min="1" step="1" value="${Number(rule.maxMinutes)}" required></label>
    <label class="field"><span>ساعات الخصم</span><input name="lateRuleHours" type="number" min="0" step="0.25" value="${Number(rule.deductionHours)}" required></label>
    <button type="button" class="row-action order-delete-action" data-remove-late-rule="${index}">حذف القاعدة</button>
  </div>`).join("");
  const penaltyRows = settings.penalties.map((penalty) => `<div class="workforce-penalty-row">
    <input type="hidden" name="penaltyId" value="${escapeHtml(penalty.id)}">
    <label class="field"><span>اسم الخصم / المخالفة</span><input name="penaltyName" value="${escapeHtml(penalty.name)}" maxlength="160" required></label>
    <label class="field"><span>قيمة الخصم (جنيه)</span><input name="penaltyAmount" type="number" min="0.01" step="0.01" value="${Number(penalty.amount)}" required></label>
    <button type="button" class="row-action order-delete-action" data-remove-workforce-penalty>حذف</button>
  </div>`).join("");
  const employeeProfileModal = selectedEmployee ? `<div class="modal-backdrop workforce-profile-backdrop" data-workforce-profile-modal>
    <section class="modal-card workforce-profile-modal" role="dialog" aria-modal="true" aria-labelledby="workforce-profile-title">
      <button class="modal-close" type="button" data-close-workforce-profile aria-label="إغلاق">×</button>
      <header class="workforce-profile-heading"><div><h2 id="workforce-profile-title">كشف العامل: ${escapeHtml(selectedEmployee.name)}</h2>
      <p>${escapeHtml(selectedEmployee.jobTitle || "مسمى وظيفي غير محدد")} · ${escapeHtml(selectedEmployee.roleLabel)}</p></div>
      <button type="button" class="button button-secondary" data-print-workforce-profile>طباعة كشف العامل</button></header>
      <div class="workforce-profile-tabs" role="tablist" aria-label="أقسام ملف العامل">
        <button type="button" role="tab" class="workforce-profile-tab${selectedWorkforceProfileTab === "finance" ? " active" : ""}" aria-selected="${selectedWorkforceProfileTab === "finance"}" data-workforce-profile-tab="finance">المستحقات والماليات</button>
        <button type="button" role="tab" class="workforce-profile-tab${selectedWorkforceProfileTab === "personal" ? " active" : ""}" aria-selected="${selectedWorkforceProfileTab === "personal"}" data-workforce-profile-tab="personal">البيانات الشخصية</button>
      </div>
      <div class="workforce-profile-tab-panel" data-workforce-profile-panel="finance"${selectedWorkforceProfileTab === "finance" ? "" : " hidden"}>
        <form class="workforce-wage-form workforce-profile-section" data-workforce-wage-form="${escapeHtml(selectedEmployee.id)}">
          <h3>كارت الأجر</h3>
          <div class="workforce-profile-fields">
            <label class="field"><span>الأجر المحدد (جنيه)</span><input name="wageAmount" type="number" min="0.01" step="0.01" value="${escapeHtml(selectedEmployeeProfile.wageAmount ?? "")}" placeholder="أدخل الأجر الأساسي"></label>
            <label class="field"><span>أساس الأجر</span><select name="wageBasis"><option value="monthly" ${!["weekly", "daily", "hourly"].includes(selectedEmployeeProfile.wageBasis) ? "selected" : ""}>شهري</option><option value="weekly" ${selectedEmployeeProfile.wageBasis === "weekly" ? "selected" : ""}>أسبوعي</option><option value="daily" ${selectedEmployeeProfile.wageBasis === "daily" ? "selected" : ""}>يومي</option><option value="hourly" ${selectedEmployeeProfile.wageBasis === "hourly" ? "selected" : ""}>بالساعة</option></select></label>
            <div class="workforce-rate-preview" data-workforce-rate-preview></div>
            <div class="form-actions wide"><button class="button button-primary" type="submit">حفظ الأجر</button></div>
          </div>
        </form>
        <div class="workforce-finance-cards">
          <section class="workforce-finance-card"><h3>الأجر</h3><div class="workforce-finance-card-grid">
            <div><span>أجر اليوم</span><strong>${workforceMoney(employeeCalculation.rate.daily)}</strong></div>
            <div><span>أجر الساعة</span><strong>${workforceMoney(employeeCalculation.rate.hourly)}</strong></div>
            <div><span>الأجر المحدد</span><strong>${workforceMoney(selectedEmployeeProfile.wageAmount || 0)}</strong><small>${selectedEmployeeProfile.wageBasis === "weekly" ? "أسبوعي" : selectedEmployeeProfile.wageBasis === "hourly" ? "بالساعة" : selectedEmployeeProfile.wageBasis === "daily" ? "يومي" : "شهري"}</small></div>
          </div></section>
          <section class="workforce-finance-card"><h3>حركة الشهر · ${escapeHtml(selectedWorkforceMonth)}</h3><div class="workforce-finance-card-grid">
            <div><span>مستحقات الشهر</span><strong>${workforceMoney(employeeCalculation.earned)}</strong><small>${employeeCalculation.creditedDays} يوم مستحق</small></div>
            <div><span>السلف الحالية</span><strong>${workforceMoney(employeeCalculation.advances)}</strong></div>
            <div><span>إجمالي الخصومات</span><strong>${workforceMoney(employeeCalculation.deductions)}</strong></div>
            <div class="is-net"><span>${employeeCalculation.netDue < 0 ? "الرصيد المستحق على العامل" : "الصافي المستحق"}</span><strong>${workforceMoney(Math.abs(employeeCalculation.netDue))}</strong><small>${employeeCalculation.netDue < 0 ? "عليه مبلغ متبقٍ من سلف أو حساب سابق" : "يشمل الرصيد المرحّل ويخصم المدفوعات السابقة"}</small></div>
          </div></section>
        </div>
        <div class="stats-grid workforce-profile-stats">
          ${stat("أجر السهر × 1.5", workforceMoney(employeeCalculation.overtimeAmount))}
          ${stat(employeeCalculation.carryover < 0 ? "عليه من رصيد وسلف سابقة" : "الرصيد المرحّل", employeeCalculation.carryover < 0 ? `عليه ${workforceMoney(Math.abs(employeeCalculation.carryover))}` : workforceMoney(employeeCalculation.carryover))}
          ${stat("مدفوعات سابقة", workforceMoney(employeeCalculation.previousPaid))}
        </div>
        ${panel("سجل الحضور والغياب والتأخير والسهر", employeeAttendanceRows.length
          ? table(["التاريخ","الحالة","الحضور","الانصراف","التأخير","السهر","الانصراف المبكر","ملاحظات"], employeeAttendanceRows)
          : '<div class="empty-state">لا توجد سجلات حضور محفوظة.</div>')}
        ${panel("كشف الحساب والخصومات والجزاءات", employeeViolationRows.length
          ? table(["التاريخ","البند","القرار","الخصم","ملاحظات","الإجراء"], employeeViolationRows)
          : '<div class="empty-state">لا توجد خصومات أو جزاءات مسجلة.</div>')}
        ${panel("حركة الحساب التفصيلية", employeeAccountRows.length
          ? table(["التاريخ","نوع الحركة","التفاصيل","المبلغ"], employeeAccountRows)
          : '<div class="empty-state">لا توجد سلف أو مدفوعات أو حركات حساب مسجلة.</div>')}
        ${panel("سجل التصفية", data.workforceSettlements.some((record) => record.workerId === selectedEmployee.id)
          ? table(["الفترة","حتى تاريخ","المستحق","السلف","الخصومات","المدفوع","الرصيد المرحّل"], data.workforceSettlements
            .filter((record) => record.workerId === selectedEmployee.id)
            .sort((left, right) => String(right.throughDate).localeCompare(String(left.throughDate)))
            .map((record) => `<tr><td>${escapeHtml(record.period || "—")}</td><td>${formatRecordDate(record.throughDate)}</td><td>${workforceMoney(record.earnedAmount)}</td><td>${workforceMoney(record.advanceAmount)}</td><td>${workforceMoney(record.deductionAmount)}</td><td>${workforceMoney(record.paidAmount)}</td><td>${workforceMoney(record.balanceAfter)}</td></tr>`))
          : '<div class="empty-state">لا توجد تصفيات محفوظة.</div>')}
      </div>
      <div class="workforce-profile-tab-panel" data-workforce-profile-panel="personal"${selectedWorkforceProfileTab === "personal" ? "" : " hidden"}>
        <form class="workforce-personal-form workforce-profile-section" data-workforce-personal-form="${escapeHtml(selectedEmployee.id)}">
          <h3>بيانات العامل والعمل</h3><div class="workforce-profile-fields">
            <label class="field"><span>الاسم</span><input name="employeeName" value="${escapeHtml(selectedEmployee.name)}" disabled></label>
            <label class="field"><span>اسم المستخدم</span><input name="username" value="${escapeHtml(selectedEmployee.username)}" disabled></label>
            <label class="field"><span>الدور الوظيفي المسجل</span><input name="role" value="${escapeHtml(selectedEmployee.roleLabel)}" disabled></label>
            <label class="field"><span>المسمى الوظيفي الفعلي</span><select name="jobTitle" required>${employeeJobTitleOptions}</select></label>
            <label class="field"><span>الهاتف</span><input name="phone" value="${escapeHtml(selectedEmployee.phone || "—")}" disabled></label>
            <label class="field"><span>تاريخ التعيين</span><input name="hireDate" type="date" value="${escapeHtml(selectedEmployeeProfile.hireDate || "")}"></label>
            <label class="field"><span>الرقم القومي</span><input name="nationalId" value="${escapeHtml(selectedEmployeeProfile.nationalId || "")}" maxlength="32"></label>
            <label class="field"><span>العنوان</span><input name="address" value="${escapeHtml(selectedEmployeeProfile.address || "")}" maxlength="240"></label>
            <label class="field"><span>جهة اتصال للطوارئ</span><input name="emergencyContact" value="${escapeHtml(selectedEmployeeProfile.emergencyContact || "")}" maxlength="120"></label>
            <label class="field"><span>بيانات / طبيعة العمل</span><input name="workDescription" value="${escapeHtml(selectedEmployeeProfile.workDescription || "")}" maxlength="240" placeholder="القسم، التخصص، أو طبيعة المهام"></label>
            <label class="field"><span>موقع / خط العمل</span><input name="workLocation" value="${escapeHtml(selectedEmployeeProfile.workLocation || "")}" maxlength="160"></label>
            <label class="field"><span>نوع التعاقد</span><input name="employmentType" value="${escapeHtml(selectedEmployeeProfile.employmentType || "")}" maxlength="100" placeholder="دوام كامل، مؤقت..."></label>
            <label class="field wide"><span>ملاحظات وظيفية</span><textarea name="employmentNotes" rows="2" maxlength="500">${escapeHtml(selectedEmployeeProfile.employmentNotes || "")}</textarea></label>
            <div class="form-actions wide"><button class="button button-primary" type="submit">حفظ البيانات الشخصية</button></div>
          </div>
        </form>
        ${panel("ربط حساب تسجيل الدخول", `<p>${selectedEmployeeLinkedAccountId
          ? `الحساب المرتبط: ${escapeHtml(data.users.find((account) => account.id === selectedEmployeeLinkedAccountId)?.username || selectedEmployee.username)}`
          : "ملف العامل غير مرتبط حالياً بحساب تسجيل دخول."}</p>
          <div class="workforce-account-link">
            <label class="field"><span>اختر حساب عامل / مشرف غير مرتبط (بما فيها الحسابات المعلقة)</span><select name="linkedUserId" data-workforce-link-account="${escapeHtml(selectedEmployee.id)}"><option value="">اختر الحساب</option>${workforceAccountLinkOptions(selectedEmployee, data)}</select></label>
            <div class="form-actions"><button type="button" class="button button-primary" data-link-workforce-account="${escapeHtml(selectedEmployee.id)}">ربط الحساب</button>${selectedEmployeeLinkedAccountId ? `<button type="button" class="row-action order-delete-action" data-unlink-workforce-account="${escapeHtml(selectedEmployee.id)}">فك الارتباط</button>` : ""}</div>
          </div>`, "فك الارتباط يوقف صلاحية دخول الحساب السابق مع الاحتفاظ بملف العامل وسجلاته.")}
      </div>
    </section>    </div>` : "";
    const newEmployeeModal = showNewWorkforceEmployeeModal ? `<div class="modal-backdrop workforce-profile-backdrop" data-new-workforce-employee-modal>
      <section class="modal-card workforce-profile-modal workforce-new-employee-modal" role="dialog" aria-modal="true" aria-labelledby="new-workforce-employee-title">
        <button class="modal-close" type="button" data-close-new-workforce-employee aria-label="إغلاق">×</button>
        <header class="workforce-profile-heading"><div><h2 id="new-workforce-employee-title">إضافة ملف عامل جديد</h2><p>يُنشأ الملف من الإدارة أولاً؛ ويمكن ربط طلب تسجيل خارجي به لتفعيل حساب الدخول.</p></div></header>
        <form class="workforce-new-employee-form form-grid">
          <div class="workforce-profile-section wide"><h3>البيانات الأساسية</h3><div class="form-grid">
            <label class="field"><span>اسم العامل</span><input name="employeeName" required maxlength="120" autocomplete="name"></label>
            <label class="field"><span>نوع الحساب الوظيفي</span><select name="roleKey" required><option value="worker">عامل</option><option value="cutting">مشرف قص</option><option value="sewing">مشرف خياطة</option></select></label>
            <label class="field"><span>المسمى الوظيفي الفعلي</span><select name="jobTitle" required>${WORKER_JOB_TITLES.map((title) => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`).join("")}</select></label>
            <label class="field wide"><span>حساب تسجيل خارجي معلق (اختياري)</span><select name="linkedUserId"><option value="">إنشاء الملف دون حساب مرتبط</option>${pendingStaffOptions}</select></label>
            <label class="field"><span>الهاتف</span><input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
            <label class="field"><span>تاريخ التعيين</span><input name="hireDate" type="date" value="${workforceDateKey(new Date())}"></label>
          </div></div>
          <div class="workforce-profile-section"><h3>الأجر وبيانات العمل</h3><div class="form-grid">
            <label class="field"><span>نوع المرتب</span><select name="wageBasis"><option value="monthly">شهري</option><option value="weekly">أسبوعي</option></select></label>
            <label class="field"><span>قيمة المرتب (جنيه)</span><input name="wageAmount" type="number" min="0" step="0.01" placeholder="اختياري"></label>
            <p class="workforce-rate-preview wide" data-new-workforce-rate-preview>أجر اليوم والساعة يُحسبان تلقائياً: الشهري ÷ 30 أو الأسبوعي ÷ 7، ثم أجر اليوم ÷ 9.</p>
            <label class="field"><span>القسم / طبيعة العمل</span><input name="workDescription" maxlength="240"></label>
            <label class="field"><span>موقع / خط العمل</span><input name="workLocation" maxlength="160"></label>
            <label class="field"><span>نوع التعاقد</span><input name="employmentType" maxlength="100" placeholder="دوام كامل، مؤقت..."></label>
          </div></div>
          <div class="workforce-profile-section"><h3>معلومات إضافية</h3><div class="form-grid">
            <label class="field"><span>الرقم القومي</span><input name="nationalId" maxlength="32"></label>
            <label class="field"><span>العنوان</span><input name="address" maxlength="240"></label>
            <label class="field"><span>جهة اتصال للطوارئ</span><input name="emergencyContact" maxlength="120"></label>
            <label class="field wide"><span>ملاحظات وظيفية</span><textarea name="employmentNotes" rows="2" maxlength="500"></textarea></label>
          </div></div>
          <div class="form-actions wide"><button class="button button-primary" type="submit">حفظ ملف العامل</button><button class="row-action" type="button" data-close-new-workforce-employee>إلغاء</button></div>
        </form>
      </section>
    </div>` : "";
  const workerOptions = employees.map((worker) => `<option value="${escapeHtml(worker.id)}">${escapeHtml(worker.name)}${worker.jobTitle ? ` · ${escapeHtml(worker.jobTitle)}` : ""}</option>`).join("");
  const monthDays = workforceMonthDates(selectedWorkforceMonth);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultCutoffDate = selectedWorkforceMonth === thisMonth
    ? workforceDateKey(now)
    : workforceDateKey(monthDays[monthDays.length - 1]);
  const cutoffDate = selectedWorkforceCutoffDate.startsWith(`${selectedWorkforceMonth}-`)
    ? selectedWorkforceCutoffDate
    : defaultCutoffDate;
  const settlementEligibleDate = workforceSettlementOpenDate(selectedWorkforceMonth);
  const canSettlePeriod = workforceCanSettlePeriod(selectedWorkforceMonth);
  const profileRows = employees.map((worker) => {
    const profile = workforceProfile(data, worker.id);
    return `<tr><td>${escapeHtml(worker.name)}</td><td>${escapeHtml(worker.jobTitle || roleNames[worker.roleKey])}</td><td><form class="workforce-profile-form" data-workforce-profile-form="${escapeHtml(worker.id)}"><select name="wageBasis" aria-label="نوع المرتب"><option value="monthly" ${profile.wageBasis === "monthly" || !profile.wageBasis ? "selected" : ""}>شهري</option><option value="weekly" ${profile.wageBasis === "weekly" ? "selected" : ""}>أسبوعي</option><option value="daily" ${profile.wageBasis === "daily" ? "selected" : ""}>يومي</option><option value="hourly" ${profile.wageBasis === "hourly" ? "selected" : ""}>بالساعة</option></select><input name="wageAmount" type="number" min="0.01" step="0.01" value="${escapeHtml(profile.wageAmount ?? "")}" placeholder="الأجر بالجنيه" aria-label="قيمة الأجر"><button class="row-action" type="submit">حفظ الأجر</button><small class="workforce-inline-rate" data-workforce-rate-preview></small></form></td></tr>`;
  }).join("");
  const settlementRows = employees.map((worker) => {
    const calculation = workforceMonthAccrual(worker, data, settings, selectedWorkforceMonth, cutoffDate);
    return `<tr><td>${escapeHtml(worker.name)}</td><td>${calculation.creditedDays}</td><td>${workforceMoney(calculation.earned - calculation.overtimeAmount)}</td><td>${workforceMoney(calculation.overtimeAmount)}</td><td>${workforceMoney(calculation.advances)}</td><td>${workforceMoney(calculation.previousPaid)}</td><td>${workforceMoney(calculation.deductions)}</td><td>${workforceMoney(calculation.carryover)}</td><td><strong>${calculation.netDue < 0 ? `عليه ${workforceMoney(Math.abs(calculation.netDue))}` : workforceMoney(calculation.netDue)}</strong></td><td><form class="workforce-settlement-form" data-workforce-settlement-form="${escapeHtml(worker.id)}"><input type="hidden" name="throughDate" value="${cutoffDate}"><input name="paidAmount" type="number" step="0.01" value="${Math.max(calculation.netDue, 0).toFixed(2)}" aria-label="المبلغ المدفوع"><button class="row-action" type="submit" ${canSettlePeriod ? "" : "disabled"}>حفظ التصفية</button></form></td></tr>`;
  }).join("");
  const violationRows = [...data.workforceViolations]
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .map((record) => {
      const worker = employees.find((entry) => entry.id === record.workerId);
      const decisionLabel = { official: "اللائحة الرسمية", actual_time: "الوقت الفعلي", waived: "إعفاء", excused: "عفو إداري" }[record.decision] || "—";
      const isUnexcusedAbsence = record.ruleKey === "absence" && record.permission === "unexcused";
      const ruleLabel = isUnexcusedAbsence ? "خصم يوم جزاء غياب بدون إذن"
        : record.ruleLabel || workforceRuleTitle(settings, record.ruleKey);
      const profile = worker ? workforceProfile(data, worker.id) : {};
      const rates = worker
        ? workforceWageRates(profile, settings, record.date?.slice(0, 7) || selectedWorkforceMonth, data, worker.id)
        : { daily: 0, hourly: 0 };
      const deleteAction = ["official", "actual_time"].includes(record.decision) && Number(record.deductionAmount) > 0
        ? `<button type="button" class="row-action order-delete-action" data-delete-workforce-deduction="${escapeHtml(record._recordId)}">إلغاء الخصم</button>`
        : "—";
      const deductionDetails = isUnexcusedAbsence
        ? `${workforceMoney(record.deductionAmount || rates.daily)}<small class="workforce-deduction-detail">أجر يوم واحد: ${workforceMoney(rates.daily)}</small>`
        : record.ruleKey === "early_departure" && Number(record.actualMinutes) > 0
          ? `${workforceMoney(record.deductionAmount || 0)}<small class="workforce-deduction-detail">${record.actualMinutes} دقيقة · ${workforceMoney(record.deductionAmount || (record.actualMinutes / 60) * rates.hourly)} أجر الوقت</small>`
          : workforceMoney(record.deductionAmount || 0);
      return `<tr><td>${formatRecordDate(record.date)}</td><td>${escapeHtml(worker?.name || record.workerName || "عامل")}</td><td>${escapeHtml(ruleLabel)}</td><td>${escapeHtml(record.decisionDescription || decisionLabel)}</td><td>${deductionDetails}</td><td>${escapeHtml(record.notes || "—")}</td><td>${deleteAction}</td></tr>`;
    });
  const disciplinarySettingsForm = `<form class="workforce-settings-form form-grid">
    <label class="field"><span>بداية الدوام الافتراضية</span><input name="shiftStart" type="time" value="${escapeHtml(settings.shiftStart)}" required></label>
    <label class="field"><span>نهاية الدوام الافتراضية</span><input name="shiftEnd" type="time" value="${escapeHtml(settings.shiftEnd)}" required></label>
    <label class="field"><span>مضاعف أجر السهر</span><input name="overtimeMultiplier" type="number" min="1" step="0.1" value="${settings.overtimeMultiplier}"></label>
    <fieldset class="field wide workforce-penalties"><legend>قائمة الخصومات والمخالفات</legend>
      <p class="muted">أضف البنود التي تعتمدها الإدارة يدويًا؛ لن تُضاف أي بنود افتراضية.</p>
      <div data-workforce-penalties>${penaltyRows}</div>
      <button type="button" class="row-action" data-add-workforce-penalty>＋ إضافة خصم جديد</button>
    </fieldset>
    <fieldset class="field wide workforce-late-rules"><legend>قواعد التأخير والخصم</legend>
      <p class="muted">تُطبّق أول قاعدة يصل حدها إلى مدة التأخير. اترك القاعدة الأخيرة بحد أعلى كبير لتغطية كل التأخيرات.</p>
      <div data-workforce-late-rules>${lateRuleRows}</div>
      <button type="button" class="row-action" data-add-late-rule>＋ إضافة قاعدة تأخير</button>
    </fieldset>
    <div class="form-actions wide"><button class="button button-primary" type="submit">حفظ إعدادات الدوام والخصومات</button></div>
  </form>`;
  const deductionActionOptions = '<option value="official">تطبيق اللائحة الرسمية</option><option value="actual_time">خصم الوقت الفعلي فقط</option><option value="waived">إعفاء والتغاضي عن الخصم</option>';
  const violationForm = `<form class="workforce-violation-form form-grid">
    <label class="field"><span>العامل</span><select name="workerId" required><option value="">اختر العامل</option>${workerOptions}</select></label>
    <label class="field"><span>المخالفة / الخصم</span><select name="ruleKey" required><option value="">اختر خصماً</option>${WORKFORCE_RULES.map(([key]) => `<option value="${key}">${escapeHtml(workforceRuleTitle(settings, key))}</option>`).join("")}${settings.penalties.map((penalty) => `<option value="penalty_${escapeHtml(penalty.id)}">${escapeHtml(penalty.name)} · ${workforceMoney(penalty.amount)}</option>`).join("")}</select></label>
    <label class="field"><span>تاريخ المخالفة</span><input name="date" type="date" value="${workforceDateKey(new Date())}" required></label>
    <label class="field"><span>مدة التأخير / الوقت الفعلي بالدقائق</span><input name="minutes" type="number" min="0" step="1" value="0"></label>
    <label class="field"><span>قرار الإدارة</span><select name="decision">${deductionActionOptions}</select></label>
    <label class="field wide"><span>ملاحظات</span><textarea name="notes" rows="2" maxlength="500"></textarea></label>
    <p class="workforce-penalty-preview wide" data-workforce-penalty-preview>اختر العامل والمخالفة لمعرفة الخصم المتوقع قبل التسجيل.</p>
    <div class="form-actions wide"><button class="button button-primary" type="submit">تسجيل المخالفة والقرار</button></div>
  </form>`;
  return `<section id="workforce" class="dashboard-section">
    <div class="client-management-tabs workforce-tabs" role="tablist" aria-label="شؤون العمال">
      <button type="button" role="tab" class="client-management-tab${activeWorkforceTab === "employees" ? " active" : ""}" aria-selected="${activeWorkforceTab === "employees"}" data-workforce-tab="employees">العاملين</button>
      <button type="button" role="tab" class="client-management-tab${activeWorkforceTab === "attendance" ? " active" : ""}" aria-selected="${activeWorkforceTab === "attendance"}" data-workforce-tab="attendance">الحضور الشهري</button>
      <button type="button" role="tab" class="client-management-tab${activeWorkforceTab === "discipline" ? " active" : ""}" aria-selected="${activeWorkforceTab === "discipline"}" data-workforce-tab="discipline">اللائحة والمخالفات</button>
      <button type="button" role="tab" class="client-management-tab${activeWorkforceTab === "settlements" ? " active" : ""}" aria-selected="${activeWorkforceTab === "settlements"}" data-workforce-tab="settlements">الأجور والتصفية</button>
    </div>
    <div class="workforce-panel" data-workforce-panel="employees"${activeWorkforceTab === "employees" ? "" : " hidden"}>
      <div class="workforce-employee-toolbar"><div><h2>سجل العاملين والموظفين</h2><p>إدارة الملفات الوظيفية والأجور وربط حسابات الدخول.</p></div><button type="button" class="button button-primary workforce-add-employee" data-add-workforce-employee>＋ إضافة عامل جديد</button></div>
      ${panel("سجل العاملين والموظفين", employees.length
        ? table(["الاسم","المسمى الوظيفي الفعلي","الدور المسجل","اسم المستخدم","الهاتف","السجل"], employeeRows)
        : '<div class="empty-state">لا توجد ملفات عاملين حتى الآن. ابدأ بإنشاء ملف عامل جديد.</div>',
      "المسمى الوظيفي والدور يعرضان كما هما مسجلان في بيانات الحساب؛ افتح الملف للاطلاع على الحضور والحساب والجزاءات.")}
    </div>
    <div class="workforce-panel" data-workforce-panel="attendance"${activeWorkforceTab === "attendance" ? "" : " hidden"}>
      <div class="clients-toolbar"><div><h2>جدول الحضور والغياب الشهري</h2><p>اضغط الحضور لتسجيل وقت بداية الدوام، واضغط مرة أخرى لتعديله. يبدأ الانصراف بموعد نهاية الوردية المجدول، ويمكن تعديله مع اختيار الخصم أو العفو عند الخروج مبكراً.</p></div><label class="field workforce-month-picker"><span>الشهر</span><input type="month" data-workforce-month value="${escapeHtml(selectedWorkforceMonth)}"></label></div>
      ${panel("مصفوفة الحضور", attendanceRows, `الدوام الافتراضي ${settings.shiftStart}–${settings.shiftEnd}. الجمعة لا تُحتسب إلا بعد تسجيل حضور السبت التالي، ويمكن تعديلها يدويًا.`)}
    </div>
    <div class="workforce-panel" data-workforce-panel="discipline"${activeWorkforceTab === "discipline" ? "" : " hidden"}>
      ${panel("تسجيل مخالفة وقرار الخصم", violationForm, "أضف بنود الخصم يدويًا من الإعدادات، ثم اختر العامل والبند وقرار الخصم.")}
      ${panel("سجل المخالفات والقرارات", violationRows.length ? table(["التاريخ","العامل","المخالفة","قرار الخصم","المبلغ","ملاحظات","الإجراء"], violationRows) : '<div class="empty-state">لا توجد مخالفات مسجلة.</div>')}
      ${panel("إعدادات الدوام والخصومات", disciplinarySettingsForm, "تُحفظ البنود التي تضيفها يدويًا وتظهر للاختيار عند تسجيل الخصم؛ السجلات السابقة تحتفظ بقرارها.")}
    </div>
    <div class="workforce-panel" data-workforce-panel="settlements"${activeWorkforceTab === "settlements" ? "" : " hidden"}>
      <div class="clients-toolbar"><div><h2>الأجور وترحيل الرصيد والتصفية</h2><p>حدد أجر كل عامل، ثم راجع الاستحقاق والخصومات والسلف قبل حفظ التصفية.</p></div><label class="field workforce-month-picker"><span>تاريخ التصفية حتى</span><input type="date" data-workforce-cutoff value="${cutoffDate}"></label></div>
      ${panel("إعداد أجور العمال", profileRows.length ? table(["العامل","الوظيفة","الأجر"], profileRows) : '<div class="empty-state">لا توجد ملفات عاملين لإعداد أجورها.</div>', "أجر اليوم = الشهري ÷ 30 أو الأسبوعي ÷ 7، وأجر الساعة = أجر اليوم ÷ 9. تُستخدم هذه القيم تلقائياً في الخصومات والسهر.")}
      ${panel("حساب المستحقات حتى التاريخ المحدد", employees.length ? table(["العامل","أيام مستحقة","الأجر دون السهر","أجر السهر × 1.5","السلف","مدفوعات راتب سابقة","الخصومات","رصيد مرحّل","صافي قبل الدفع","المبلغ المدفوع / إجراء"], settlementRows) : '<div class="empty-state">لا توجد حسابات عمال نشطة.</div>', canSettlePeriod ? "التصفية متاحة لهذا الشهر؛ لا يُرحّل أي رصيد تلقائيًا قبل حفظها يدويًا." : `تبقى الفترة مفتوحة بلا ترحيل تلقائي. تبدأ التصفية من ${formatRecordDate(settlementEligibleDate)}، أي اليوم الخامس من الشهر التالي.`)}
      ${panel("سجل التصفية", data.workforceSettlements.length ? table(["العامل","الفترة","حتى تاريخ","المستحق","السلف","مدفوعات سابقة","الخصومات","المدفوع","الرصيد المرحّل"], [...data.workforceSettlements].sort((a, b) => String(b.throughDate).localeCompare(String(a.throughDate))).map((record) => `<tr><td>${escapeHtml(employees.find((worker) => worker.id === record.workerId)?.name || record.workerName || "عامل")}</td><td>${escapeHtml(record.period || "—")}</td><td>${formatRecordDate(record.throughDate)}</td><td>${workforceMoney(record.earnedAmount)}</td><td>${workforceMoney(record.advanceAmount)}</td><td>${workforceMoney(record.previousPaidAmount)}</td><td>${workforceMoney(record.deductionAmount)}</td><td>${workforceMoney(record.paidAmount)}</td><td>${workforceMoney(record.balanceAfter)}</td></tr>`)) : '<div class="empty-state">لا توجد تصفيات محفوظة.</div>')}
    </div>
    ${employeeProfileModal}
    ${newEmployeeModal}
    <div class="modal-backdrop" data-workforce-attendance-modal hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="workforce-attendance-title"><button class="modal-close" type="button" data-close-workforce-attendance aria-label="إغلاق">×</button><h2 id="workforce-attendance-title">تعديل حالة اليوم</h2><form class="workforce-attendance-form modal-form"><input type="hidden" name="workerId"><input type="hidden" name="date"><label>حالة اليوم<select name="status"></select></label><label class="workforce-inline-check"><input name="paidLeave" type="checkbox" checked> الإجازة مدفوعة الأجر</label><label>ملاحظات<textarea name="notes" rows="2" maxlength="400"></textarea></label><div class="form-actions"><button class="button button-primary" type="submit">حفظ الحالة</button><button class="row-action" type="button" data-close-workforce-attendance>إلغاء</button></div></form></section></div>
    <div class="modal-backdrop workforce-absence-backdrop" data-workforce-absence-modal ${pendingWorkforceAbsenceDecision ? "" : "hidden"}><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="workforce-absence-title"><button class="modal-close" type="button" data-close-workforce-absence aria-label="إغلاق">×</button><h2 id="workforce-absence-title">تسجيل الغياب وتحديد الخصم</h2><p data-workforce-absence-summary>${pendingWorkforceAbsenceDecision ? `${escapeHtml(workforceEmployees(data).find((worker) => worker.id === pendingWorkforceAbsenceDecision.workerId)?.name || "")} · ${escapeHtml(pendingWorkforceAbsenceDecision.date)}` : ""}</p><div class="workforce-late-actions"><button type="button" class="button button-primary" data-absence-permission="permitted" aria-pressed="false">غياب بإذن · خصم يوم واحد</button><button type="button" class="button button-secondary" data-absence-permission="unexcused" aria-pressed="false">غياب بدون إذن · لا أجر لليوم + جزاء يوم</button></div><div class="form-actions"><button type="button" class="button button-primary" data-save-workforce-absence disabled>حفظ الغياب والخصم</button></div></section></div>
    <div class="modal-backdrop" data-workforce-clock-modal hidden><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="workforce-clock-title"><button class="modal-close" type="button" data-close-workforce-clock aria-label="إغلاق">×</button><h2 id="workforce-clock-title">تسجيل أو تعديل الوقت</h2><form class="workforce-clock-form modal-form"><input type="hidden" name="workerId"><input type="hidden" name="date"><input type="hidden" name="clockType"><label>الوقت الجديد<input name="time" type="time" required></label><label data-early-departure-option hidden>قرار الانصراف المبكر<select name="earlyDepartureDecision"><option value="official">خصم ساعات الانصراف المبكر</option><option value="waived">عفو إداري · دون خصم</option></select><small data-early-departure-preview></small></label><div class="form-actions"><button class="button button-primary" type="submit">حفظ الوقت</button><button class="row-action" type="button" data-close-workforce-clock>إلغاء</button></div></form></section></div>
    <div class="modal-backdrop workforce-late-backdrop" data-workforce-late-modal ${pendingWorkforceLateDecision ? "" : "hidden"}><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="workforce-late-title"><button class="modal-close" type="button" data-close-workforce-late aria-label="إغلاق">×</button><h2 id="workforce-late-title">تم تسجيل حضور متأخر</h2><p data-workforce-late-summary>${pendingWorkforceLateDecision ? `${escapeHtml(workforceEmployees(data).find((worker) => worker.id === pendingWorkforceLateDecision.workerId)?.name || "")} · تأخير ${pendingWorkforceLateDecision.delay} دقيقة · اختر قرار الخصم الآن.` : ""}</p><div class="workforce-late-actions"><button type="button" class="button button-primary${pendingWorkforceLateDecision?.decision === "official" ? " active" : ""}" data-late-decision="official" aria-pressed="${pendingWorkforceLateDecision?.decision === "official"}">تطبيق اللائحة</button><button type="button" class="button button-secondary${pendingWorkforceLateDecision?.decision === "actual_time" ? " active" : ""}" data-late-decision="actual_time" aria-pressed="${pendingWorkforceLateDecision?.decision === "actual_time"}">خصم الوقت الفعلي</button><button type="button" class="row-action${pendingWorkforceLateDecision?.decision === "waived" ? " active" : ""}" data-late-decision="waived" aria-pressed="${pendingWorkforceLateDecision?.decision === "waived"}">إعفاء من الخصم</button></div><div class="form-actions"><button type="button" class="button button-primary" data-save-late-decision ${pendingWorkforceLateDecision?.decision ? "" : "disabled"}>حفظ قرار الخصم</button></div></section></div>
  </section>`;
}

function bindWorkforceActions(session) {
  const root = document.querySelector("#workforce");
  if (!root) return;
  const refresh = () => refreshDashboard(session);
  root.querySelector("[data-add-workforce-employee]")?.addEventListener("click", () => {
    showNewWorkforceEmployeeModal = true;
    render(session, dashboardData, dashboardData.pendingAccounts || []);
  });
  root.querySelectorAll("[data-close-new-workforce-employee]").forEach((button) => button.addEventListener("click", () => {
    showNewWorkforceEmployeeModal = false;
    render(session, dashboardData, dashboardData.pendingAccounts || []);
  }));
  const newEmployeeForm = root.querySelector(".workforce-new-employee-form");
  if (newEmployeeForm) {
    const preview = () => {
      newEmployeeForm.querySelector("[data-new-workforce-rate-preview]").textContent =
        workforceRatePreview(newEmployeeForm.elements.wageBasis.value, newEmployeeForm.elements.wageAmount.value);
    };
    newEmployeeForm.addEventListener("input", preview);
    newEmployeeForm.addEventListener("change", preview);
    preview();
    newEmployeeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = form.elements.employeeName.value.trim();
      const wageAmount = form.elements.wageAmount.value.trim() ? Number(form.elements.wageAmount.value) : 0;
      const roleKey = form.elements.roleKey.value;
      const linkedUserId = form.elements.linkedUserId.value || null;
      const account = linkedUserId
        ? [...dashboardData.users, ...(dashboardData.pendingAccounts || [])].find((entry) => entry.id === linkedUserId)
        : null;
      if (!name || (form.elements.wageAmount.value.trim() && (!Number.isFinite(wageAmount) || wageAmount < 0))) {
        window.factoryUI.toast("أدخل اسم العامل ومرتباً صحيحاً أو اترك خانة المرتب فارغة.", "error");
        return;
      }
      if (!["worker", "cutting", "sewing"].includes(roleKey)
        || (linkedUserId && !workforceAccountCanBeLinked(account))) {
        window.factoryUI.toast("تحقق من نوع الملف وحساب الدخول المعلق المختار.", "error");
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (account) {
          const { error: accountError } = await supabaseClient.from("users")
            .update({
              name,
              role: roleKey,
              status: "active",
              job_title: form.elements.jobTitle.value,
              updated_at: new Date().toISOString()
            })
            .eq("id", account.id)
            .select("id")
            .single();
          if (accountError) throw accountError;
        }
        const linkedProfileResult = account
          ? await supabaseClient.from("factory_records")
            .select("id, payload")
            .eq("collection", "workforce_profiles")
            .eq("payload->>linkedUserId", account.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
          : { data: null, error: null };
        if (linkedProfileResult.error) throw linkedProfileResult.error;
        const workerId = linkedProfileResult.data?.payload?.workerId
          || account?.id
          || crypto.randomUUID();
        await saveFlexibleRecord("workforce_profiles", {
          workerId,
          employeeName: name,
          username: account?.username || "—",
          phone: account?.phone || form.elements.phone.value.trim(),
          roleKey,
          jobTitle: form.elements.jobTitle.value,
          linkedUserId: account?.id || null,
          wageBasis: form.elements.wageBasis.value,
          wageAmount,
          hireDate: form.elements.hireDate.value,
          workDescription: form.elements.workDescription.value.trim(),
          workLocation: form.elements.workLocation.value.trim(),
          employmentType: form.elements.employmentType.value.trim(),
          nationalId: form.elements.nationalId.value.trim(),
          address: form.elements.address.value.trim(),
          emergencyContact: form.elements.emergencyContact.value.trim(),
          employmentNotes: form.elements.employmentNotes.value.trim()
        }, linkedProfileResult.data?.id || null, account?.id || null);
        showNewWorkforceEmployeeModal = false;
        selectedWorkforceEmployeeId = workerId;
        selectedWorkforceProfileTab = "finance";
        try {
          await refresh();
          window.factoryUI.toast(account
            ? `تم إنشاء ملف ${name} وربط حساب الدخول وتفعيله.`
            : `تم إنشاء ملف ${name} بنجاح.`);
        } catch (refreshError) {
          reportDashboardFailure(session, "تم حفظ ملف العامل لكن تعذر تحديث القائمة", refreshError);
        }
      } catch (error) {
        reportDashboardFailure(session, "تعذر إنشاء ملف العامل", error);
      } finally {
        submit.disabled = false;
      }
    });
  }
  root.querySelectorAll("[data-workforce-tab]").forEach((button) => button.addEventListener("click", () => {
    activeWorkforceTab = button.dataset.workforceTab;
    render(session, dashboardData, dashboardData.pendingAccounts || []);
  }));
  root.querySelectorAll("[data-workforce-employee]").forEach((button) => button.addEventListener("click", () => {
    selectedWorkforceEmployeeId = button.dataset.workforceEmployee;
    selectedWorkforceProfileTab = "finance";
    render(session, dashboardData, dashboardData.pendingAccounts || []);
  }));
  root.querySelector("[data-close-workforce-profile]")?.addEventListener("click", () => {
    selectedWorkforceEmployeeId = "";
    render(session, dashboardData, dashboardData.pendingAccounts || []);
  });
  root.querySelectorAll("[data-workforce-profile-tab]").forEach((button) => button.addEventListener("click", () => {
    selectedWorkforceProfileTab = button.dataset.workforceProfileTab;
    root.querySelectorAll("[data-workforce-profile-tab]").forEach((tab) => {
      const isActive = tab.dataset.workforceProfileTab === selectedWorkforceProfileTab;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    root.querySelectorAll("[data-workforce-profile-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.workforceProfilePanel !== selectedWorkforceProfileTab;
    });
  }));
  root.querySelectorAll("[data-delete-workforce-deduction]").forEach((button) => button.addEventListener("click", async () => {
    const record = dashboardData.workforceViolations.find((entry) =>
      entry._recordId === button.dataset.deleteWorkforceDeduction
    );
    if (!record) {
      window.factoryUI.toast("تعذر العثور على بند الخصم لإلغائه.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "إلغاء الخصم",
      message: `سيتم حذف خصم ${record.ruleLabel || workforceRuleTitle(workforceSettings(dashboardData), record.ruleKey)} بقيمة ${workforceMoney(record.deductionAmount || 0)} وإعادة احتساب حساب العامل.`,
      confirmLabel: "إلغاء الخصم"
    })) return;
    button.disabled = true;
    try {
      await deleteFlexibleRecord("workforce_violations", record._recordId);
      await refresh();
      window.factoryUI.toast("تم إلغاء الخصم وإعادة احتساب حساب العامل.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر إلغاء الخصم", error);
    } finally {
      button.disabled = false;
    }
  }));
  const employeeProfileForm = root.querySelector(".workforce-personal-form");
  if (employeeProfileForm) {
    employeeProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const workerId = form.dataset.workforcePersonalForm;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    if (!worker) return;
    const existing = workforceProfile(dashboardData, workerId);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveFlexibleRecord("workforce_profiles", {
        ...workforceEmployeeProfilePayload(worker, existing, dashboardData),
        nationalId: form.elements.nationalId.value.trim(),
        address: form.elements.address.value.trim(),
        emergencyContact: form.elements.emergencyContact.value.trim(),
        hireDate: form.elements.hireDate.value,
        workDescription: form.elements.workDescription.value.trim(),
        workLocation: form.elements.workLocation.value.trim(),
        employmentType: form.elements.employmentType.value.trim(),
        jobTitle: form.elements.jobTitle.value,
        employmentNotes: form.elements.employmentNotes.value.trim()
      }, existing._recordId || null, workforceLinkedAccountId(worker, dashboardData));
      const linkedAccountId = workforceLinkedAccountId(worker, dashboardData);
      const linkedAccount = dashboardData.users.find((account) => account.id === linkedAccountId);
      if (linkedAccountId && form.elements.jobTitle.value !== linkedAccount?.jobTitle) {
        const { error: titleError } = await supabaseClient.from("users")
          .update({ job_title: form.elements.jobTitle.value, updated_at: new Date().toISOString() })
          .eq("id", linkedAccountId)
          .select("id")
          .single();
        if (titleError) throw titleError;
      }
      await refresh();
      window.factoryUI.toast("تم حفظ البيانات الشخصية والوظيفية.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ ملف العامل", error);
    } finally {
      submit.disabled = false;
    }
    });
  }
  const employeeWageForm = root.querySelector(".workforce-wage-form");
  if (employeeWageForm) {
    const preview = () => {
      employeeWageForm.querySelector("[data-workforce-rate-preview]").textContent =
        workforceRatePreview(employeeWageForm.elements.wageBasis.value, employeeWageForm.elements.wageAmount.value);
    };
    employeeWageForm.addEventListener("input", preview);
    employeeWageForm.addEventListener("change", preview);
    preview();
    employeeWageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const workerId = form.dataset.workforceWageForm;
      const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
      if (!worker) return;
      const wageAmount = Number(form.elements.wageAmount.value);
      if (!Number.isFinite(wageAmount) || wageAmount <= 0) {
        window.factoryUI.toast("أدخل قيمة أجر صحيحة أكبر من صفر قبل حفظ ملف العامل.", "error");
        return;
      }
      const existing = workforceProfile(dashboardData, workerId);
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await saveFlexibleRecord("workforce_profiles", {
          ...workforceEmployeeProfilePayload(worker, existing, dashboardData),
          wageBasis: form.elements.wageBasis.value,
          wageAmount
        }, existing._recordId || null, workforceLinkedAccountId(worker, dashboardData));
        await refresh();
        window.factoryUI.toast("تم حفظ أساس الأجر وقيمته للعامل.");
      } catch (error) {
        reportDashboardFailure(session, "تعذر حفظ أجر العامل", error);
      } finally {
        submit.disabled = false;
      }
    });
  }
  root.querySelectorAll("[data-link-workforce-account]").forEach((button) => button.addEventListener("click", async () => {
    const workerId = button.dataset.linkWorkforceAccount;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    const select = [...root.querySelectorAll("[data-workforce-link-account]")]
      .find((entry) => entry.dataset.workforceLinkAccount === workerId);
    const accountId = select?.value;
    const account = [...dashboardData.users, ...(dashboardData.pendingAccounts || [])]
      .find((entry) => entry.id === accountId);
    if (!worker || !workforceAccountCanBeLinked(account)) {
      window.factoryUI.toast("اختر حساباً معلقاً أو موقوفاً صالحاً للربط.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "ربط حساب العامل",
      message: `سيتم ربط ${account.username} بملف ${worker.name}، وتفعيل الحساب بالدور الوظيفي الحالي. سيتم إيقاف الحساب السابق إن وجد.`,
      confirmLabel: "ربط وتفعيل الحساب"
    })) return;
    const existing = workforceProfile(dashboardData, workerId);
    const previousAccountId = workforceLinkedAccountId(worker, dashboardData);
    const sourceOwnerId = previousAccountId || existing.previousLinkedUserId || worker.id;
    const submitButtons = [...root.querySelectorAll("[data-link-workforce-account]")]
      .filter((entry) => entry.dataset.linkWorkforceAccount === workerId);
    submitButtons.forEach((entry) => { entry.disabled = true; });
    try {
      if (sourceOwnerId && sourceOwnerId !== accountId) {
        const employeeCollections = [
          "attendance", "advances", "payroll", "worker_expenses", "workforce_attendance",
          "workforce_violations", "workforce_settlements", "tasks", "leaves"
        ];
        const { error: recordsError } = await supabaseClient.from("factory_records")
          .update({ owner_id: accountId, updated_at: new Date().toISOString() })
          .eq("owner_id", sourceOwnerId)
          .in("collection", employeeCollections);
        if (recordsError) throw recordsError;
      }
      if (!previousAccountId) {
        const employeeCollections = [
          "attendance", "advances", "payroll", "worker_expenses", "workforce_attendance",
          "workforce_violations", "workforce_settlements", "tasks", "leaves"
        ];
        const { error: unownedRecordsError } = await supabaseClient.from("factory_records")
          .update({ owner_id: accountId, updated_at: new Date().toISOString() })
          .is("owner_id", null)
          .eq("payload->>workerId", workerId)
          .in("collection", employeeCollections);
        if (unownedRecordsError) throw unownedRecordsError;
      }
      const profilePayload = {
        ...workforceEmployeeProfilePayload(worker, existing, dashboardData),
        linkedUserId: accountId,
        previousLinkedUserId: sourceOwnerId,
        jobTitle: worker.jobTitle || existing.jobTitle || "غير محدد"
      };
      const profileRecordId = existing._recordId || crypto.randomUUID();
      await saveFlexibleRecord("workforce_profiles", profilePayload, profileRecordId, accountId);
      const { data: updatedAccount, error: accountError } = await supabaseClient.from("users")
        .update({
          name: worker.name,
          role: worker.roleKey,
          status: "active",
          job_title: profilePayload.jobTitle,
          updated_at: new Date().toISOString()
        })
        .eq("id", accountId)
        .select("id")
        .single();
      if (accountError) throw accountError;
      if (!updatedAccount) throw new Error("لم يتم العثور على حساب تسجيل الدخول المحدد.");
      if (previousAccountId && previousAccountId !== accountId) {
        const { error: previousAccountError } = await supabaseClient.from("users")
          .update({ status: "suspended", updated_at: new Date().toISOString() })
          .eq("id", previousAccountId);
        if (previousAccountError) throw previousAccountError;
      }
      await refresh();
      window.factoryUI.toast(`تم ربط الحساب ${account.username} بملف العامل وتفعيل صلاحياته.`);
    } catch (error) {
      reportDashboardFailure(session, "تعذر ربط حساب العامل", error);
    } finally {
      submitButtons.forEach((entry) => { entry.disabled = false; });
    }
  }));
  root.querySelectorAll("[data-unlink-workforce-account]").forEach((button) => button.addEventListener("click", async () => {
    const workerId = button.dataset.unlinkWorkforceAccount;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    const linkedAccountId = worker ? workforceLinkedAccountId(worker, dashboardData) : null;
    const existing = workforceProfile(dashboardData, workerId);
    if (!worker || !linkedAccountId) {
      window.factoryUI.toast("لا يوجد حساب مرتبط بهذا الملف لفك ارتباطه.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "فك ارتباط حساب العامل",
      message: `سيتم إيقاف تسجيل الدخول للحساب المرتبط ${worker.username}، مع الإبقاء على ملف العامل وسجلاته.`,
      confirmLabel: "فك الارتباط وإيقاف الدخول",
      danger: true
    })) return;
    button.disabled = true;
    try {
      await saveFlexibleRecord("workforce_profiles", {
        ...workforceEmployeeProfilePayload(worker, existing, dashboardData),
        linkedUserId: null,
        previousLinkedUserId: linkedAccountId,
        jobTitle: worker.jobTitle || existing.jobTitle || ""
      }, existing._recordId || null, null);
      const { error } = await supabaseClient.from("users")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("id", linkedAccountId)
        .select("id")
        .single();
      if (error) throw error;
      await refresh();
      window.factoryUI.toast("تم فك الارتباط وإيقاف حساب الدخول مع الاحتفاظ بملف العامل.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر فك ارتباط حساب العامل", error);
    } finally {
      button.disabled = false;
    }
  }));
  root.querySelector("[data-print-workforce-profile]")?.addEventListener("click", () => {
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === selectedWorkforceEmployeeId);
    if (!worker) return;
    const profile = workforceProfile(dashboardData, worker.id);
    const settings = workforceSettings(dashboardData);
    const calculation = workforceMonthAccrual(worker, dashboardData, settings, selectedWorkforceMonth, workforceDateKey(new Date()));
    const attendance = dashboardData.workforceAttendance.filter((record) => record.workerId === worker.id)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
    const violations = dashboardData.workforceViolations.filter((record) => record.workerId === worker.id)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
    const accountRows = [
      ...dashboardData.workerAdvances.filter((record) => workforceRecordBelongsToWorker(record, worker, dashboardData)).map((record) => ({
        date: record.date || record.created_at || record._createdAt,
        kind: "سلفة",
        details: record.description || record.reason || record.reference || record.notes || record.note || "سلفة عامل",
        amount: -Math.abs(Number(record.amount ?? record.value ?? record.netAmount ?? 0))
      })),
      ...dashboardData.workerPayroll.filter((record) => workforceRecordBelongsToWorker(record, worker, dashboardData)).map((record) => ({
        date: record.date || record.created_at || record._createdAt || record.period || record.month,
        kind: "دفعة راتب",
        details: record.notes || record.description || record.period || record.month || "صرف راتب",
        amount: -Math.abs(Number(record.paidAmount ?? record.paid ?? 0))
      })),
      ...dashboardData.workforceSettlements.filter((record) => record.workerId === worker.id).map((record) => ({
        date: record.throughDate,
        kind: "تصفية",
        details: `مدفوع ${workforceMoney(record.paidAmount)} · رصيد مرحّل ${workforceMoney(record.balanceAfter)}`,
        amount: -Math.abs(Number(record.paidAmount || 0))
      }))
    ].sort((left, right) => String(right.date).localeCompare(String(left.date)));
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.factoryUI.toast("اسمح بفتح نافذة الطباعة ثم أعد المحاولة.", "error");
      return;
    }
    printWindow.opener = null;
    const attendanceMarkup = attendance.map((record) => {
      const checkIn = workforceTimeMinutes(record.checkIn);
      const checkOut = workforceTimeMinutes(record.checkOut);
      const delay = checkIn === null ? 0 : Math.max(0, checkIn - workforceTimeMinutes(settings.shiftStart));
      const overtime = checkIn === null || checkOut === null ? 0 : Math.max(0, checkOut - workforceTimeMinutes(settings.shiftEnd));
      const earlyMinutes = workforceEarlyDepartureMinutes(record.checkOut, settings);
      const earlyDecision = violations.find((entry) => entry.ruleKey === "early_departure" && entry.date === record.date);
      const early = earlyMinutes
        ? `${earlyMinutes} دقيقة · ${earlyDecision?.decision === "waived" ? "عفو إداري دون خصم" : workforceMoney(earlyDecision?.deductionAmount || 0)}`
        : "—";
      return `<tr><td>${escapeHtml(record.date)}</td><td>${escapeHtml(WORKFORCE_ATTENDANCE_LABELS[record.status] || record.status || "—")}</td><td>${escapeHtml(record.checkIn || "—")}</td><td>${escapeHtml(record.checkOut || "—")}</td><td>${delay ? `${delay} دقيقة` : "—"}</td><td>${early}</td><td>${overtime ? `${overtime} دقيقة` : "—"}</td><td>${escapeHtml(record.notes || "—")}</td></tr>`;
    }).join("");
    const violationMarkup = violations.map((record) => `<tr><td>${escapeHtml(record.date)}</td><td>${escapeHtml(record.ruleKey === "absence" && record.permission === "unexcused" ? "خصم يوم جزاء غياب بدون إذن" : record.ruleLabel || workforceRuleTitle(settings, record.ruleKey))}</td><td>${escapeHtml(record.decisionDescription || record.decision || "—")}</td><td>${workforceMoney(record.deductionAmount || 0)}${record.ruleKey === "absence" && record.permission === "unexcused" ? `<br><small>أجر يوم واحد: ${workforceMoney(calculation.rate.daily)}</small>` : ""}</td><td>${escapeHtml(record.notes || "—")}</td></tr>`).join("");
    const accountMarkup = accountRows.map((record) => `<tr><td>${escapeHtml(record.date || "—")}</td><td>${escapeHtml(record.kind)}</td><td>${escapeHtml(record.details)}</td><td>${workforceMoney(record.amount)}</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف العامل - ${escapeHtml(worker.name)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1d2923}h1,h2{color:#17543b}table{width:100%;border-collapse:collapse;margin:14px 0 24px}th,td{border:1px solid #cbd5ce;padding:7px;text-align:right;font-size:12px}th{background:#edf4ef}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.summary div{border:1px solid #cbd5ce;padding:10px;border-radius:6px}@media print{body{padding:0}}</style></head><body><h1>كشف العامل: ${escapeHtml(worker.name)}</h1><p>المسمى الوظيفي: ${escapeHtml(worker.jobTitle || "غير محدد")} · الدور: ${escapeHtml(worker.roleLabel)} · اسم المستخدم: ${escapeHtml(worker.username)}</p><p>الهاتف: ${escapeHtml(worker.phone || "—")} · الرقم القومي: ${escapeHtml(profile.nationalId || "—")} · العنوان: ${escapeHtml(profile.address || "—")} · الطوارئ: ${escapeHtml(profile.emergencyContact || "—")} · التعيين: ${escapeHtml(profile.hireDate || "—")}</p><div class="summary"><div>الأجر المستحق: ${workforceMoney(calculation.earned)}</div><div>السهر × 1.5: ${workforceMoney(calculation.overtimeAmount)}</div><div>السلف: ${workforceMoney(calculation.advances)}</div><div>الخصومات: ${workforceMoney(calculation.deductions)}</div><div>الرصيد المرحّل: ${workforceMoney(calculation.carryover)}</div><div>${calculation.netDue < 0 ? "المبلغ المستحق على العامل" : "صافي الحساب"}: ${workforceMoney(Math.abs(calculation.netDue))}</div></div><h2>سجل الحضور والغياب والتأخير والانصراف المبكر والسهر</h2><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th><th>التأخير</th><th>الانصراف المبكر</th><th>السهر</th><th>ملاحظات</th></tr></thead><tbody>${attendanceMarkup || '<tr><td colspan="8">لا توجد سجلات.</td></tr>'}</tbody></table><h2>حركة الحساب</h2><table><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>${accountMarkup || '<tr><td colspan="4">لا توجد حركات.</td></tr>'}</tbody></table><h2>الخصومات والجزاءات</h2><table><thead><tr><th>التاريخ</th><th>البند</th><th>القرار</th><th>الخصم</th><th>ملاحظات</th></tr></thead><tbody>${violationMarkup || '<tr><td colspan="5">لا توجد سجلات.</td></tr>'}</tbody></table><script>window.addEventListener('load',()=>window.print());</script></body></html>`);
    printWindow.document.close();
  });
  root.querySelector("[data-workforce-month]")?.addEventListener("change", (event) => {
    if (!/^\d{4}-\d{2}$/.test(event.currentTarget.value)) return;
    selectedWorkforceMonth = event.currentTarget.value;
    selectedWorkforceCutoffDate = "";
    void refresh().catch((error) => reportDashboardFailure(session, "تعذر تحميل الحضور للشهر المحدد", error));
  });
  root.querySelector("[data-workforce-cutoff]")?.addEventListener("change", (event) => {
    const date = event.currentTarget.value;
    const today = workforceDateKey(new Date());
    if (!date.startsWith(`${selectedWorkforceMonth}-`) || date > today) {
      window.factoryUI.toast("اختر تاريخ تصفية ضمن الشهر المحدد ولا يتجاوز اليوم.", "error");
      event.currentTarget.value = selectedWorkforceCutoffDate || today;
      return;
    }
    selectedWorkforceCutoffDate = date;
    void refresh().catch((error) => reportDashboardFailure(session, "تعذر تحديث حساب التصفية", error));
  });
  root.querySelectorAll("[data-workforce-clock]").forEach((button) => button.addEventListener("click", async () => {
    const workerId = button.dataset.workerId;
    const date = button.dataset.attendanceDate;
    const clockType = button.dataset.workforceClock;
    const employee = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    if (!employee || !date) {
      window.factoryUI.toast("تعذر تحديد العامل أو تاريخ الحضور.", "error");
      return;
    }
    const settings = workforceSettings(dashboardData);
    const record = workforceAttendanceRecord(dashboardData, workerId, date);
    const hasTime = clockType === "in" ? Boolean(record?.checkIn) : Boolean(record?.checkOut);
    if (clockType === "out" && !record?.checkIn) {
      window.factoryUI.toast("سجّل الحضور أولاً قبل تسجيل الانصراف.", "error");
      return;
    }
    if (clockType === "out") {
      const form = root.querySelector(".workforce-clock-form");
      const earlyViolation = dashboardData.workforceViolations.find((entry) =>
        entry.workerId === workerId && entry.ruleKey === "early_departure" && entry.date === date
      );
      form.elements.workerId.value = workerId;
      form.elements.date.value = date;
      form.elements.clockType.value = clockType;
      form.elements.time.value = record?.checkOut || settings.shiftEnd;
      form.elements.earlyDepartureDecision.value = earlyViolation?.decision === "waived" ? "waived" : "official";
      form.querySelector("[data-early-departure-option]").hidden = false;
      form.querySelector("[data-early-departure-preview]").textContent = "";
      form.dispatchEvent(new Event("input", { bubbles: true }));
      root.querySelector("[data-workforce-clock-modal]").hidden = false;
      return;
    }
    if (hasTime) {
      const form = root.querySelector(".workforce-clock-form");
      form.elements.workerId.value = workerId;
      form.elements.date.value = date;
      form.elements.clockType.value = clockType;
      form.elements.time.value = record.checkIn;
      form.querySelector("[data-early-departure-option]").hidden = true;
      root.querySelector("[data-workforce-clock-modal]").hidden = false;
      return;
    }
    const checkIn = settings.shiftStart;
    const status = clockType === "in" ? "present" : record.status || "present";
    const payload = {
      workerId,
      workerName: employee.name,
      date,
      status,
      checkIn,
      checkOut: record?.checkOut || "",
      paidLeave: record?.paidLeave !== false,
      notes: record?.notes || ""
    };
    button.disabled = true;
    try {
      await saveFlexibleRecord("workforce_attendance", payload, record?._recordId || null, workforceRecordOwnerId(employee, dashboardData));
      if (clockType === "in") await workforceCreditPreviousFriday(employee, date, dashboardData, payload);
      await refresh();
      window.factoryUI.toast(`تم تسجيل الحضور ${settings.shiftStart}.`);
    } catch (error) {
      reportDashboardFailure(session, "تعذر تسجيل الوقت", error);
    } finally {
      button.disabled = false;
    }
  }));
  root.querySelectorAll("[data-workforce-status]").forEach((button) => button.addEventListener("click", () => {
    const workerId = button.dataset.workerId;
    const date = button.dataset.attendanceDate;
    const record = workforceAttendanceRecord(dashboardData, workerId, date);
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    if (!record && !worker) return;
    const form = root.querySelector(".workforce-attendance-form");
    const statusSelect = form.elements.status;
    const isFriday = new Date(`${date}T00:00:00`).getDay() === 5;
    const states = isFriday
      ? ["friday_paid", "friday_unpaid", "friday_deducted"]
      : ["present", "absent", "leave", "late"];
    if (record?.status && !states.includes(record.status)) states.push(record.status);
    statusSelect.innerHTML = `<option value="">اختر الحالة</option>${states.map((status) => `<option value="${status}">${escapeHtml(WORKFORCE_ATTENDANCE_LABELS[status])}</option>`).join("")}`;
    statusSelect.required = true;
    form.elements.workerId.value = workerId;
    form.elements.date.value = date;
    statusSelect.value = record?.status || (isFriday ? "" : "present");
    form.elements.paidLeave.checked = record?.paidLeave !== false;
    form.elements.notes.value = record?.notes || "";
    root.querySelector("[data-workforce-attendance-modal]").hidden = false;
  }));
  root.querySelectorAll("[data-close-workforce-attendance]").forEach((button) => button.addEventListener("click", () => {
    root.querySelector("[data-workforce-attendance-modal]").hidden = true;
  }));
  root.querySelector(".workforce-attendance-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === form.elements.workerId.value);
    const date = form.elements.date.value;
    const existing = workforceAttendanceRecord(dashboardData, form.elements.workerId.value, date);
    if (!worker || !date) {
      window.factoryUI.toast("اختر العامل والتاريخ قبل حفظ الحضور.", "error");
      return;
    }
    const status = form.elements.status.value;
    if (status === "absent") {
      if (dashboardData.workforceViolations.some((item) =>
        item.workerId === worker.id && item.ruleKey === "absence" && item.date === date
      )) {
        window.factoryUI.toast("تم تسجيل خصم غياب لهذا العامل في هذا التاريخ من قبل.", "error");
        return;
      }
      root.querySelector("[data-workforce-attendance-modal]").hidden = true;
      showWorkforceAbsenceDecisionModal(root, worker, date, form.elements.notes.value.trim());
      return;
    }
    if (status === "late" && !existing?.checkIn) {
      window.factoryUI.toast("سجّل وقت الحضور أولاً حتى يتم حساب التأخير وتحديد قرار الخصم.", "error");
      return;
    }
    const payload = {
      workerId: worker.id,
      workerName: worker.name,
      date,
      status,
      checkIn: existing?.checkIn || "",
      checkOut: existing?.checkOut || "",
      paidLeave: status === "leave" && form.elements.paidLeave.checked,
      notes: form.elements.notes.value.trim()
    };
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveFlexibleRecord("workforce_attendance", payload, existing?._recordId || null, workforceRecordOwnerId(worker, dashboardData));
      if (["present", "late"].includes(status)) {
        await workforceCreditPreviousFriday(worker, date, dashboardData, payload);
      }
      root.querySelector("[data-workforce-attendance-modal]").hidden = true;
      const delay = status === "late" && existing?.checkIn
        ? Math.max(0, workforceTimeMinutes(existing.checkIn) - workforceTimeMinutes(workforceSettings(dashboardData).shiftStart))
        : 0;
      if (delay > 0) showWorkforceLateDecisionModal(root, worker, date, delay);
      try {
        await refresh();
      } catch (refreshError) {
        reportDashboardFailure(session, "تم حفظ حالة الحضور لكن تعذر تحديث اللوحة", refreshError);
      }
      if (delay <= 0) {
        window.factoryUI.toast("تم حفظ حالة اليوم.");
      }
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ الحضور", error);
    } finally {
      submit.disabled = false;
    }
  });
  root.querySelectorAll("[data-absence-permission]").forEach((button) => button.addEventListener("click", () => {
    if (!pendingWorkforceAbsenceDecision) return;
    pendingWorkforceAbsenceDecision.permission = button.dataset.absencePermission;
    const modal = root.querySelector("[data-workforce-absence-modal]");
    modal.querySelectorAll("[data-absence-permission]").forEach((choice) => {
      choice.classList.toggle("active", choice === button);
      choice.setAttribute("aria-pressed", String(choice === button));
    });
    modal.querySelector("[data-save-workforce-absence]").disabled = false;
  }));
  root.querySelectorAll("[data-close-workforce-absence]").forEach((button) => button.addEventListener("click", () => {
    pendingWorkforceAbsenceDecision = null;
    root.querySelector("[data-workforce-absence-modal]").hidden = true;
  }));
  root.querySelector("[data-save-workforce-absence]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const button = event.currentTarget;
    const pending = pendingWorkforceAbsenceDecision;
    if (!pending || !["permitted", "unexcused"].includes(pending.permission)) {
      window.factoryUI.toast("اختر غيابًا بإذن أو بدون إذن قبل الحفظ.", "error");
      return;
    }
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === pending.workerId);
    if (!worker) {
      window.factoryUI.toast("تعذر العثور على ملف العامل لتسجيل الغياب.", "error");
      return;
    }
    const profile = workforceProfile(dashboardData, worker.id);
    const settings = workforceSettings(dashboardData);
    const rates = workforceWageRates(profile, settings, pending.date.slice(0, 7), dashboardData, worker.id);
    if (rates.rate <= 0) {
      window.factoryUI.toast("سجل أجر العامل أولاً حتى يمكن احتساب خصم يوم الغياب.", "error");
      return;
    }
    const existingAttendance = workforceAttendanceRecord(dashboardData, worker.id, pending.date);
    const deductionDays = 1;
    const amount = rates.daily * deductionDays;
    const decisionDescription = pending.permission === "permitted"
      ? "غياب بإذن · خصم يوم واحد"
      : "غياب بدون إذن · لا أجر لليوم + جزاء يوم واحد";
    button.disabled = true;
    try {
      await saveFlexibleRecord("workforce_attendance", {
        workerId: worker.id,
        workerName: worker.name,
        date: pending.date,
        status: "absent",
        checkIn: existingAttendance?.checkIn || "",
        checkOut: existingAttendance?.checkOut || "",
        paidLeave: false,
        notes: pending.notes
      }, existingAttendance?._recordId || null, workforceRecordOwnerId(worker, dashboardData));
      const existingViolation = dashboardData.workforceViolations.find((record) =>
        record.workerId === worker.id && record.ruleKey === "absence" && record.date === pending.date
      );
      await saveFlexibleRecord("workforce_violations", {
        workerId: worker.id,
        workerName: worker.name,
        ruleKey: "absence",
        ruleLabel: pending.permission === "unexcused" ? "خصم يوم جزاء غياب بدون إذن" : "خصم يوم غياب بإذن",
        date: pending.date,
        decision: "official",
        decisionDescription,
        deductionAmount: amount,
        deductionDays,
        permission: pending.permission,
        notes: pending.notes
      }, existingViolation?._recordId || null, workforceRecordOwnerId(worker, dashboardData));
      pendingWorkforceAbsenceDecision = null;
      await refresh();
      window.factoryUI.toast(`تم تسجيل ${decisionDescription}. قيمة الخصم الحالية: ${workforceMoney(amount)}.`);
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ الغياب أو الخصم", error);
    } finally {
      button.disabled = false;
    }
  });
  root.querySelectorAll("[data-close-workforce-clock]").forEach((button) => button.addEventListener("click", () => {
    root.querySelector("[data-workforce-clock-modal]").hidden = true;
  }));
  root.querySelector(".workforce-clock-form")?.addEventListener("input", (event) => {
    const form = event.currentTarget;
    if (form.elements.clockType.value !== "out") return;
    const settings = workforceSettings(dashboardData);
    const earlyMinutes = workforceEarlyDepartureMinutes(form.elements.time.value, settings);
    const preview = form.querySelector("[data-early-departure-preview]");
    const option = form.querySelector("[data-early-departure-option]");
    option.hidden = earlyMinutes <= 0;
    if (!earlyMinutes) {
      preview.textContent = `موعد الانصراف الرسمي: ${settings.shiftEnd}.`;
      return;
    }
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === form.elements.workerId.value);
    const rates = worker
      ? workforceWageRates(workforceProfile(dashboardData, worker.id), settings, form.elements.date.value.slice(0, 7), dashboardData, worker.id)
      : { hourly: 0, rate: 0 };
    const deduction = rates.rate > 0 ? rates.hourly * earlyMinutes / 60 : 0;
    preview.textContent = `الخروج قبل الموعد بـ ${earlyMinutes} دقيقة${rates.rate > 0 ? ` · الخصم المتوقع ${workforceMoney(deduction)}` : " · يلزم تسجيل الأجر لحساب الخصم"}.`;
  });
  root.querySelector(".workforce-clock-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const workerId = form.elements.workerId.value;
    const date = form.elements.date.value;
    const clockType = form.elements.clockType.value;
    const time = form.elements.time.value;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    const existing = workforceAttendanceRecord(dashboardData, workerId, date);
    const settings = workforceSettings(dashboardData);
    if (!worker || !["in", "out"].includes(clockType) || workforceTimeMinutes(time) === null) {
      window.factoryUI.toast("بيانات الوقت غير مكتملة أو غير صحيحة.", "error");
      return;
    }
    const checkInMinutes = workforceTimeMinutes(existing?.checkIn);
    let checkOutMinutes = workforceTimeMinutes(time);
    const shiftStartMinutes = workforceTimeMinutes(settings.shiftStart);
    const shiftEndMinutes = workforceTimeMinutes(settings.shiftEnd);
    if (clockType === "out" && shiftStartMinutes !== null && shiftEndMinutes !== null
      && shiftEndMinutes <= shiftStartMinutes && checkOutMinutes !== null && checkOutMinutes < shiftStartMinutes) {
      checkOutMinutes += 24 * 60;
    }
    if (clockType === "out" && (checkInMinutes === null || checkOutMinutes < checkInMinutes)) {
      window.factoryUI.toast("وقت الانصراف لا يمكن أن يسبق وقت الحضور.", "error");
      return;
    }
    const delay = clockType === "in"
      ? Math.max(0, workforceTimeMinutes(time) - workforceTimeMinutes(settings.shiftStart))
      : 0;
    const payload = {
      ...(existing || {}),
      workerId,
      workerName: worker.name,
      date,
      checkIn: clockType === "in" ? time : existing.checkIn,
      checkOut: clockType === "out" ? time : existing.checkOut,
      status: clockType === "in" ? delay > 0 ? "late" : "present" : existing.status || "present"
    };
    const earlyMinutes = clockType === "out" ? workforceEarlyDepartureMinutes(time, settings) : 0;
    const earlyDecision = form.elements.earlyDepartureDecision.value;
    const profile = workforceProfile(dashboardData, workerId);
    const rates = workforceWageRates(profile, settings, date.slice(0, 7), dashboardData, workerId);
    if (earlyMinutes > 0 && earlyDecision === "official" && rates.rate <= 0) {
      window.factoryUI.toast("سجل أجر العامل أولاً حتى يمكن احتساب خصم الانصراف المبكر.", "error");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveFlexibleRecord("workforce_attendance", payload, existing._recordId || null, workforceRecordOwnerId(worker, dashboardData));
      if (clockType === "in") await workforceCreditPreviousFriday(worker, date, dashboardData, payload);
      if (clockType === "out") {
        const earlyMinutes = workforceEarlyDepartureMinutes(time, settings);
        const earlyViolation = dashboardData.workforceViolations.find((entry) =>
          entry.workerId === workerId && entry.ruleKey === "early_departure" && entry.date === date
        );
        if (earlyMinutes > 0) {
          const deductionAmount = earlyDecision === "official"
            ? rates.hourly * earlyMinutes / 60
            : 0;
          await saveFlexibleRecord("workforce_violations", {
            workerId,
            workerName: worker.name,
            ruleKey: "early_departure",
            ruleLabel: "خصم ساعات الانصراف المبكر",
            date,
            decision: earlyDecision,
            decisionDescription: earlyDecision === "official"
              ? `خصم ${earlyMinutes} دقيقة انصراف مبكر`
              : `عفو إداري عن ${earlyMinutes} دقيقة انصراف مبكر دون خصم`,
            actualMinutes: earlyMinutes,
            deductionAmount,
            deductionDays: 0,
            notes: ""
          }, earlyViolation?._recordId || null, workforceRecordOwnerId(worker, dashboardData));
        } else if (earlyViolation) {
          await deleteFlexibleRecord("workforce_violations", earlyViolation._recordId);
        }
      }
      root.querySelector("[data-workforce-clock-modal]").hidden = true;
      if (delay > 0) showWorkforceLateDecisionModal(root, worker, date, delay);
      try {
        await refresh();
      } catch (refreshError) {
        reportDashboardFailure(session, "تم حفظ الوقت لكن تعذر تحديث اللوحة", refreshError);
      }
      if (delay <= 0) {
        const earlyMinutes = clockType === "out" ? workforceEarlyDepartureMinutes(time, settings) : 0;
        window.factoryUI.toast(earlyMinutes ? `تم تسجيل انصراف مبكر ${earlyMinutes} دقيقة واحتساب القرار المحدد.` : "تم تحديث وقت الحضور والانصراف.");
      }
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ تعديل الوقت", error);
    } finally {
      submit.disabled = false;
    }
  });
  root.querySelectorAll("[data-late-decision]").forEach((button) => button.addEventListener("click", () => {
    if (!pendingWorkforceLateDecision) return;
    pendingWorkforceLateDecision.decision = button.dataset.lateDecision;
    const currentModal = document.querySelector("#workforce [data-workforce-late-modal]");
    currentModal?.querySelectorAll("[data-late-decision]").forEach((choice) => {
      choice.classList.toggle("active", choice === button);
      choice.setAttribute("aria-pressed", String(choice === button));
    });
    const saveButton = document.querySelector("#workforce [data-save-late-decision]");
    if (saveButton) saveButton.disabled = false;
  }));
  root.querySelector("[data-close-workforce-late]")?.addEventListener("click", () => {
    pendingWorkforceLateDecision = null;
    render(session, dashboardData, dashboardData.pendingAccounts || []);
  });
  root.querySelector("[data-save-late-decision]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    event.preventDefault();
    const pendingDecision = pendingWorkforceLateDecision;
    if (!pendingDecision) {
      window.factoryUI.toast("لا يوجد قرار تأخير معلق لحفظه.", "error");
      return;
    }
    const { workerId, date, delay: minutes, decision } = pendingDecision;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    if (!worker || !date || !Number.isFinite(minutes) || minutes <= 0) {
      window.factoryUI.toast("تعذر تحديد بيانات التأخير.", "error");
      return;
    }
    if (!["official", "actual_time", "waived"].includes(decision)) {
      window.factoryUI.toast("اختر قرار الخصم أولاً، ثم اضغط حفظ القرار.", "error");
      return;
    }
    const settings = workforceSettings(dashboardData);
    const profile = workforceProfile(dashboardData, workerId);
    const rates = workforceWageRates(profile, settings, date.slice(0, 7), dashboardData, workerId);
    if (decision !== "waived" && rates.rate <= 0) {
      window.factoryUI.toast("سجل أجر العامل في تبويب الأجور والتصفية قبل تطبيق قرار خصم.", "error");
      return;
    }
    const existingViolation = dashboardData.workforceViolations.find((record) =>
      record.workerId === workerId && record.ruleKey === "late" && record.date === date
    );
    const penalty = decision === "official"
      ? workforceOfficialPenalty("late", settings, profile, date.slice(0, 7), dashboardData, date, minutes, workerId)
      : { amount: decision === "actual_time"
        ? rates.hourly * minutes / 60
        : 0, description: decision === "actual_time" ? `خصم ${minutes} دقيقة فعلية` : "إعفاء من الخصم المالي" };
    button.disabled = true;
    try {
      await saveFlexibleRecord("workforce_violations", {
        workerId,
        workerName: worker.name,
        ruleKey: "late",
        ruleLabel: workforceRuleTitle(settings, "late"),
        date,
        decision,
        decisionDescription: penalty.description,
        actualMinutes: minutes,
        deductionAmount: penalty.amount,
        deductionDays: 0,
        notes: ""
      }, existingViolation?._recordId || null, workforceRecordOwnerId(worker, dashboardData));
      pendingWorkforceLateDecision = null;
      await refresh();
      window.factoryUI.toast(`تم تسجيل قرار التأخير: ${decision === "official" ? "تطبيق اللائحة" : decision === "actual_time" ? "خصم الوقت الفعلي" : "إعفاء"}.`);
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ قرار التأخير", error);
    } finally {
      button.disabled = false;
    }
  });
  root.querySelectorAll(".workforce-profile-form").forEach((form) => {
    const preview = () => {
      form.querySelector("[data-workforce-rate-preview]").textContent =
        workforceRatePreview(form.elements.wageBasis.value, form.elements.wageAmount.value);
    };
    form.addEventListener("input", preview);
    form.addEventListener("change", preview);
    preview();
    form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workerId = form.dataset.workforceProfileForm;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    if (!worker) return;
    const existing = workforceProfile(dashboardData, workerId);
    const wageAmount = Number(form.elements.wageAmount.value);
    if (!Number.isFinite(wageAmount) || wageAmount <= 0) {
      window.factoryUI.toast("أدخل قيمة أجر صحيحة أكبر من صفر قبل حفظ ملف العامل.", "error");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveFlexibleRecord("workforce_profiles", {
        ...existing,
        workerId,
        workerName: worker.name,
        wageBasis: form.elements.wageBasis.value,
        wageAmount
      }, existing._recordId || null, workforceRecordOwnerId(worker, dashboardData));
      await refresh();
      window.factoryUI.toast("تم حفظ أساس الأجر وقيمته للعامل.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ أجر العامل", error);
    } finally {
      submit.disabled = false;
    }
    });
  });
  root.querySelector("[data-add-late-rule]")?.addEventListener("click", () => {
    const list = root.querySelector("[data-workforce-late-rules]");
    const rules = [...list.querySelectorAll(".workforce-late-rule-row")].map((row) => ({
      maxMinutes: Number(row.querySelector('[name="lateRuleMax"]').value),
      deductionHours: Number(row.querySelector('[name="lateRuleHours"]').value)
    }));
    const finiteMaximum = Math.max(0, ...rules.map((rule) => rule.maxMinutes).filter((maximum) => maximum < 999999));
    const defaultHours = rules.at(-1)?.deductionHours || 0;
    const row = document.createElement("div");
    row.className = "workforce-late-rule-row";
    row.innerHTML = `<label class="field"><span>أقصى تأخير بالدقائق</span><input name="lateRuleMax" type="number" min="1" step="1" value="${finiteMaximum + 15}" required></label><label class="field"><span>ساعات الخصم</span><input name="lateRuleHours" type="number" min="0" step="0.25" value="${defaultHours}" required></label><button type="button" class="row-action order-delete-action" data-remove-late-rule>حذف القاعدة</button>`;
    list.append(row);
  });
  root.querySelector("[data-add-workforce-penalty]")?.addEventListener("click", () => {
    const row = document.createElement("div");
    row.className = "workforce-penalty-row";
    row.innerHTML = `<input type="hidden" name="penaltyId" value="${crypto.randomUUID()}"><label class="field"><span>اسم الخصم / المخالفة</span><input name="penaltyName" maxlength="160" required></label><label class="field"><span>قيمة الخصم (جنيه)</span><input name="penaltyAmount" type="number" min="0.01" step="0.01" required></label><button type="button" class="row-action order-delete-action" data-remove-workforce-penalty>حذف</button>`;
    root.querySelector("[data-workforce-penalties]").append(row);
    row.querySelector('[name="penaltyName"]').focus();
  });
  root.querySelector("[data-workforce-penalties]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-workforce-penalty]");
    if (button) button.closest(".workforce-penalty-row").remove();
  });
  root.querySelector("[data-workforce-late-rules]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-late-rule]");
    if (!button) return;
    button.closest(".workforce-late-rule-row").remove();
  });
  root.querySelector(".workforce-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const previous = dashboardData.workforceSettings.find((record) => record.settingKey === "main");
    const values = Object.fromEntries(new FormData(form));
    const penaltyIds = [...form.querySelectorAll('[name="penaltyId"]')].map((input) => input.value);
    const penaltyNames = [...form.querySelectorAll('[name="penaltyName"]')].map((input) => input.value.trim());
    const penaltyAmounts = [...form.querySelectorAll('[name="penaltyAmount"]')].map((input) => Number(input.value));
    const penalties = penaltyIds.map((id, index) => ({
      id,
      name: penaltyNames[index],
      amount: penaltyAmounts[index]
    }));
    if (penalties.some((penalty) => !penalty.id || !penalty.name || !Number.isFinite(penalty.amount) || penalty.amount <= 0)) {
      window.factoryUI.toast("أدخل اسمًا وقيمة صحيحة لكل خصم، أو احذف السطر غير المكتمل.", "error");
      return;
    }
    values.penalties = penalties;
    const lateRuleMaximums = [...form.querySelectorAll('[name="lateRuleMax"]')].map((input) => Number(input.value));
    const lateRuleHours = [...form.querySelectorAll('[name="lateRuleHours"]')].map((input) => Number(input.value));
    const lateRules = lateRuleMaximums.map((maxMinutes, index) => ({ maxMinutes, deductionHours: lateRuleHours[index] }))
      .sort((left, right) => left.maxMinutes - right.maxMinutes);
    if (lateRules.some((rule, index) => !Number.isFinite(rule.maxMinutes) || rule.maxMinutes <= 0
        || !Number.isFinite(rule.deductionHours) || rule.deductionHours < 0
        || (index > 0 && rule.maxMinutes <= lateRules[index - 1].maxMinutes))
      || (lateRules.length && lateRules[lateRules.length - 1].maxMinutes < 999999)) {
      window.factoryUI.toast("تحقق من قواعد التأخير: الحدود موجبة ومتزايدة، وساعات الخصم غير سالبة، وآخر قاعدة تغطي كل مدد التأخير.", "error");
      return;
    }
    values.lateRules = lateRules;
    const numericFields = Object.keys(WORKFORCE_DEFAULTS)
      .filter((key) => typeof WORKFORCE_DEFAULTS[key] === "number" && form.querySelector(`[name="${key}"]`));
    for (const key of numericFields) values[key] = Number(values[key] ?? WORKFORCE_DEFAULTS[key]);
    delete values.lateRuleMax;
    delete values.lateRuleHours;
    delete values.penaltyId;
    delete values.penaltyName;
    delete values.penaltyAmount;
    if (workforceTimeMinutes(values.shiftEnd) <= workforceTimeMinutes(values.shiftStart)
      || !Number.isFinite(values.overtimeMultiplier) || values.overtimeMultiplier < 1) {
      window.factoryUI.toast("تحقق من وقت الدوام ومضاعف أجر السهر (لا يقل عن 1).", "error");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveFlexibleRecord("workforce_settings", { ...values, settingKey: "main" }, previous?._recordId || null);
      await refresh();
      window.factoryUI.toast("تم حفظ إعدادات الدوام واللائحة.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ إعدادات اللائحة", error);
    } finally {
      submit.disabled = false;
    }
  });
  const violationForm = root.querySelector(".workforce-violation-form");
  if (violationForm) {
    const updatePenaltyPreview = () => {
      const selectedWorkerId = violationForm.elements.workerId.value;
      const ruleKey = violationForm.elements.ruleKey.value;
      const date = violationForm.elements.date.value;
      const minutes = workforceActualMinutes(violationForm, ruleKey, workforceSettings(dashboardData), dashboardData, selectedWorkerId, date);
      const decision = violationForm.elements.decision.value;
      const settings = workforceSettings(dashboardData);
      const employees = workforceEmployees(dashboardData);
      const targets = employees.filter((entry) => entry.id === selectedWorkerId);
      if (!targets.length || !date || !ruleKey) return;
      let totalAmount = 0;
      let description = selectedWorkerId === "all" ? "تأخير الإنتاج على الصالة بالكامل" : "";
      for (const worker of targets) {
        const profile = workforceProfile(dashboardData, worker.id);
        if (decision === "official" || (decision === "actual_time" && ruleKey.startsWith("penalty_"))) {
          const result = workforceOfficialPenalty(ruleKey, settings, profile, date.slice(0, 7), dashboardData, date, minutes, worker.id);
          totalAmount += result.amount;
          if (!description) description = result.description;
        } else if (decision === "actual_time" && ruleKey === "late") {
          totalAmount += workforceWageRates(profile, settings, date.slice(0, 7), dashboardData, worker.id).hourly * minutes / 60;
          description = `${minutes} دقيقة فعلية`;
        }
      }
      const noWage = decision !== "waived" && totalAmount === 0 && ruleKey === "late";
      root.querySelector("[data-workforce-penalty-preview]").textContent = decision === "waived"
        ? "سيُحفظ التنبيه دون خصم مالي."
        : `الخصم المتوقع ${selectedWorkerId === "all" ? "للصالة" : "للعامل"}: ${workforceMoney(totalAmount)}${description ? ` · ${description}` : ""}${noWage ? " · أضف أجر العامل لحساب قيمة الخصم" : ""}`;
    };
    ["change", "input"].forEach((eventName) => violationForm.addEventListener(eventName, updatePenaltyPreview));
    violationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedWorkerId = violationForm.elements.workerId.value;
      const ruleKey = violationForm.elements.ruleKey.value;
      const date = violationForm.elements.date.value;
      const decision = violationForm.elements.decision.value;
      const settings = workforceSettings(dashboardData);
      const employees = workforceEmployees(dashboardData);
      const targets = selectedWorkerId === "all" && ruleKey === "production"
        ? employees
        : employees.filter((entry) => entry.id === selectedWorkerId);
      if (!targets.length || !date || !ruleKey || !["official", "actual_time", "waived"].includes(decision)) {
        window.factoryUI.toast("أكمل بيانات العامل والتاريخ وقرار المخالفة.", "error");
        return;
      }
      if (selectedWorkerId === "all") {
        window.factoryUI.toast("اختر عاملاً واحداً لتسجيل الخصم.", "error");
        return;
      }
      const minutes = workforceActualMinutes(violationForm, ruleKey, settings, dashboardData, selectedWorkerId, date);
      if (ruleKey === "late" && minutes <= 0) {
        window.factoryUI.toast("أدخل مدة التأخير بالدقائق لتحديد الخصم.", "error");
        return;
      }
      const records = [];
      const groupId = crypto.randomUUID();
      let totalAmount = 0;
      let decisionDescription = "";
      for (const worker of targets) {
        const profile = workforceProfile(dashboardData, worker.id);
        const rates = workforceWageRates(profile, settings, date.slice(0, 7), dashboardData, worker.id);
        if (decision === "actual_time" && ruleKey === "late" && rates.rate <= 0) {
          window.factoryUI.toast(`سجل أجر العامل ${worker.name} أولاً لحساب خصم الوقت الفعلي.`, "error");
          return;
        }
        if (decision === "official" && ruleKey === "late" && rates.rate <= 0) {
          window.factoryUI.toast(`سجل أجر العامل ${worker.name} أولاً لحساب جزاء التأخير أو الغياب.`, "error");
          return;
        }
        let amount = 0;
        let deductionDays = 0;
        let description = "";
        if (decision === "official" || (decision === "actual_time" && ruleKey.startsWith("penalty_"))) {
          const penalty = workforceOfficialPenalty(ruleKey, settings, profile, date.slice(0, 7), dashboardData, date, minutes, worker.id);
          amount = penalty.amount;
          deductionDays = penalty.deductionDays || 0;
          description = decision === "actual_time" ? "قيمة الخصم المحددة في القائمة" : penalty.description || "تطبيق الخصم المحدد";
        } else if (decision === "actual_time" && ruleKey === "late") {
          amount = rates.hourly * minutes / 60;
          description = `خصم ${minutes} دقيقة فعلية`;
        } else {
          description = "إعفاء من الخصم المالي";
        }
        totalAmount += amount;
        decisionDescription = description;
        records.push({
          ownerId: workforceRecordOwnerId(worker, dashboardData),
          payload: {
            groupId,
            workerId: worker.id,
            workerName: worker.name,
            ruleKey,
            ruleLabel: workforceRuleTitle(settings, ruleKey),
            date,
            decision,
            decisionDescription: description,
            actualMinutes: minutes,
            deductionAmount: amount,
            deductionDays,
            notes: violationForm.elements.notes.value.trim()
          }
        });
      }
      if (!await window.factoryUI.confirmAction({
        title: "تأكيد تسجيل المخالفة",
        message: `${selectedWorkerId === "all" ? "جميع العاملين" : targets[0].name}: ${workforceRuleTitle(settings, ruleKey)} · القرار: ${decisionDescription} · إجمالي الخصم: ${workforceMoney(totalAmount)}.`,
        confirmLabel: "تسجيل القرار",
        danger: decision === "official" && totalAmount > 0
      })) return;
      const submit = violationForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await saveFlexibleRecordsBatch("workforce_violations", records);
        await refresh();
        window.factoryUI.toast(decision === "waived" ? "تم تسجيل المخالفة كتنبيه دون خصم." : `تم تسجيل المخالفة وقرارها، والخصم المسجل ${workforceMoney(totalAmount)}.`);
      } catch (error) {
        reportDashboardFailure(session, "تعذر تسجيل المخالفة", error);
      } finally {
        submit.disabled = false;
      }
    });
  }
  root.querySelectorAll(".workforce-settlement-form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workerId = form.dataset.workforceSettlementForm;
    const worker = workforceEmployees(dashboardData).find((entry) => entry.id === workerId);
    const throughDate = form.elements.throughDate.value;
    const settings = workforceSettings(dashboardData);
    if (!worker || !throughDate || throughDate.slice(0, 7) !== selectedWorkforceMonth || throughDate > workforceDateKey(new Date())) {
      window.factoryUI.toast("تعذر تحديد العامل أو تاريخ التصفية.", "error");
      return;
    }
    if (!workforceCanSettlePeriod(selectedWorkforceMonth)) {
      window.factoryUI.toast(`الفترة تبقى مفتوحة حتى ${formatRecordDate(workforceSettlementOpenDate(selectedWorkforceMonth))}، ولا يمكن تصفيتها قبل ذلك.`, "error");
      return;
    }
    if (dashboardData.workforceSettlements.some((record) => record.workerId === workerId && record.throughDate === throughDate)) {
      window.factoryUI.toast("توجد تصفية محفوظة لهذا العامل حتى هذا التاريخ بالفعل.", "error");
      return;
    }
    const calculation = workforceMonthAccrual(worker, dashboardData, settings, selectedWorkforceMonth, throughDate);
    if (calculation.rate.rate <= 0) {
      window.factoryUI.toast("أدخل أجر العامل في قسم إعداد أجور العمال قبل إجراء التصفية.", "error");
      return;
    }
    const paidAmount = Number(form.elements.paidAmount.value || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      window.factoryUI.toast("أدخل مبلغاً مدفوعاً صحيحاً وغير سالب.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "تأكيد تصفية حساب العامل",
      message: `${worker.name} · المستحق ${workforceMoney(calculation.earned)} · السلف ${workforceMoney(calculation.advances)} · مدفوعات سابقة ${workforceMoney(calculation.previousPaid)} · الخصومات ${workforceMoney(calculation.deductions)} · الرصيد السابق ${workforceMoney(calculation.carryover)} · المدفوع ${workforceMoney(paidAmount)} · الرصيد المرحّل ${workforceMoney(calculation.netDue - paidAmount)}.`,
      confirmLabel: "حفظ التصفية",
      danger: calculation.netDue < 0
    })) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveFlexibleRecord("workforce_settlements", {
        workerId,
        workerName: worker.name,
        period: selectedWorkforceMonth,
        throughDate,
        earnedAmount: calculation.earned,
        advanceAmount: calculation.advances,
        previousPaidAmount: calculation.previousPaid,
        deductionAmount: calculation.deductions,
        previousBalance: calculation.carryover,
        paidAmount,
        balanceAfter: calculation.netDue - paidAmount,
        creditedDays: calculation.creditedDays,
        wageBasis: calculation.profile.wageBasis || "monthly"
      }, null, workforceRecordOwnerId(worker, dashboardData));
      await refresh();
      window.factoryUI.toast(`تمت تصفية حساب ${worker.name} وترحيل رصيد ${workforceMoney(calculation.netDue - paidAmount)}.`);
    } catch (error) {
      reportDashboardFailure(session, "تعذر حفظ تصفية العامل", error);
    } finally {
      submit.disabled = false;
    }
  }));
}

function developerFooterMarkup() {
  const sidebarClass = document.body.dataset.dashboardRole ? " sidebar-developer-footer" : "";
  return `<footer class="page-footer${sidebarClass}"><a class="developer-contact" href="https://wa.me/201026230027" target="_blank" rel="noopener noreferrer" aria-label="تواصل عبر واتساب مع مطور الموقع ZERO"><img class="developer-avatar" src="../assets/developer-avatar.svg" alt=""><span class="developer-name">مطور الموقع: <span class="developer-code-icon" aria-hidden="true">&lt;/&gt;</span> ZERO</span><span class="developer-whatsapp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3.5 20l1.2-4.3a8.2 8.2 0 1 1 15.5-4Z"/><path d="M8.1 7.8c.3-.5.6-.5 1-.5h.4c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4 0 .6.5.9 1.2 1.6 2.2 2.1.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.5 0 .4-.2 1.2-.7 1.5-.5.4-1.1.6-1.8.5-1-.1-2.2-.6-3.5-1.7-1.6-1.3-2.6-2.9-2.9-4-.3-1 .1-1.7.8-2Z"/></svg><span class="developer-contact-copy">للتواصل اضغط هنا</span></span></a></footer>`;
}

function render(session, data, accounts) {
  bindImagePickerControls();
  data.pendingAccounts = accounts;
  initializeRealtimeNotifications(session);
  document.querySelectorAll("body > #order-modal").forEach((modal) => modal.remove());
  const info = roleInfo[session.role];
  const username = escapeHtml(session.username);
  const navigation = navigationItems(session.role, info, session).map((item, index) =>
    `<a class="nav-link${index === 0 ? " active" : ""}${item.last ? " nav-link-last" : ""}" href="#${item.id}" data-sidebar-link aria-current="${index === 0 ? "page" : "false"}"><span class="nav-icon">${item.icon}</span><span class="nav-text">${item.label}</span></a>`
  ).join("");
  const collapsedClass = sidebarCollapsed ? " sidebar-collapsed" : "";
  const content = session.role === "admin"
    ? adminView(data, accounts)
    : session.role === "client"
      ? clientView(data, session)
      : session.role === "cutting"
        ? `<section id="dashboard" class="dashboard-section">${cuttingDashboardView(data)}</section>${cuttingRequestsView(data)}${fabricStockView(data, false)}<section id="personal-account" class="dashboard-section">${cuttingPersonalAccountView(data, session)}</section>`
      : session.role === "sewing"
        ? `<section id="dashboard" class="dashboard-section">${sewingView(data)}</section>${factoryRegistersView(data, false, "sewing", true)}<section id="personal-account" class="dashboard-section">${cuttingPersonalAccountView(data, session)}</section>`
        : workerView(data, session);
  document.querySelector("#app").innerHTML = `
    <div class="app-shell${collapsedClass}">
      <button class="sidebar-backdrop" type="button" data-sidebar-close aria-label="إغلاق القائمة الجانبية"></button>
      <aside class="sidebar" id="sidebar"><a class="brand" href="../index.html"><img class="brand-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><span class="brand-copy"><strong>AL-MOTAMAYEZ</strong></span></a><nav aria-label="القائمة الرئيسية"><p class="side-label">القائمة الرئيسية</p>${navigation}</nav><div class="sidebar-bottom"><div class="profile-chip"><span class="avatar">${username.slice(0, 1)}</span><div class="profile-details"><strong>${username}</strong><span>${escapeHtml(session.roleName)}</span></div></div><button class="logout-button" id="logout" type="button">↪ تسجيل الخروج</button>${developerFooterMarkup()}</div></aside>
      <main class="main-content"><header class="topbar"><div class="topbar-leading"><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="sidebar" aria-expanded="true" aria-label="طي القائمة الجانبية"><span aria-hidden="true">☰</span></button><div class="topbar-title"><h1>${info.title}</h1><p>${info.description}</p></div></div><div class="header-brand">${session.role === "admin" ? `<button class="online-indicator${onlineUserCount ? " online" : ""}" data-online-indicator type="button" title="عرض الحسابات المتصلة"><span class="online-indicator-dot"></span><span>متصلون الآن: <strong data-online-count>${onlineUserCount}</strong></span></button>` : ""}<div class="notification-control"><button class="live-notification-button" type="button" data-live-notifications aria-label="إشعارات تحديثات البرنامج" aria-expanded="false"><span aria-hidden="true">🔔</span><span class="live-notification-badge" data-live-badge aria-live="polite" hidden></span></button><section class="notification-dropdown" data-notification-dropdown hidden aria-label="إشعارات تحديثات البرنامج"><header><strong>تحديثات البرنامج</strong><button type="button" class="notification-mark-read" data-mark-notifications-read>تعليم الكل كمقروء</button></header><div class="notification-list" data-notification-list>${notificationListMarkup()}</div></section></div><img class="header-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><div class="brand-copy"><strong>AL-MOTAMAYEZ</strong></div><span class="date-label">${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "full" }).format(new Date())}</span></div></header>
    ${data.orderReadWarning ? `<div class="notice" role="alert">${escapeHtml(data.orderReadWarning)}</div>` : ""}
    ${content}
      ${session.role === "admin" ? '<div class="modal-backdrop" data-online-users-modal hidden><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="online-users-title"><button class="modal-close" type="button" data-close-online-users aria-label="إغلاق">×</button><h2 id="online-users-title">المتصلون الآن</h2><div class="online-users-list" data-online-users-list></div><div class="form-actions"><button class="row-action" type="button" data-close-online-users>إغلاق</button></div></section></div>' : ""}
      </main>
    </div>
    <div class="modal-backdrop model-image-lightbox" id="model-image-lightbox" hidden>
      <section class="model-image-lightbox-card" role="dialog" aria-modal="true" aria-label="معاينة صورة القطعة">
        <button class="modal-close" type="button" data-close-model-image aria-label="إغلاق معاينة الصورة">×</button>
        <img alt="صورة القطعة">
      </section>
    </div>
    <div class="modal-backdrop production-details-modal" id="production-details-modal" hidden>
      <section class="modal-card production-details-modal-card" role="dialog" aria-modal="true" aria-label="تفاصيل الإنتاج">
        <button class="modal-close" type="button" data-close-production-details aria-label="إغلاق التفاصيل">×</button>
        <div data-production-details-content></div>
      </section>
    </div>`;
  activateDashboardView(window.location.hash.slice(1) || "dashboard", false);
  bindSidebar();
  bindActions(session);
  refreshNotificationDropdown();
  updateOnlineIndicator();
}

function activateDashboardView(viewId, updateHash = true) {
  if (viewId === "model-registry" || viewId === "cutting-history") {
    activeRegisterTab = viewId === "cutting-history" ? "history" : "models";
    viewId = "records";
  }
  if (viewId === "model-review") {
    activeOrdersTab = "status";
    viewId = "orders";
  }
  const sections = [...document.querySelectorAll(".main-content > .dashboard-section")];
  const availableViews = new Set(sections.map((section) => section.id));
  const selectedView = availableViews.has(viewId) ? viewId : sections[0]?.id;
  if (!selectedView) return;
  activeDashboardView = selectedView;
  sections.forEach((section) => {
    section.hidden = section.id !== selectedView;
  });
  updateRegisterTabs();
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

function updateRegisterTabs() {
  document.querySelectorAll("[data-register-tab]").forEach((button) => {
    const selected = button.dataset.registerTab === activeRegisterTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-register-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.registerPanel !== activeRegisterTab;
  });
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
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "طي القائمة الجانبية" : "فتح القائمة الجانبية");
  };
  setExpanded(!window.matchMedia("(max-width: 800px)").matches && !sidebarCollapsed);
  toggle?.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 800px)").matches) {
      app.classList.toggle("drawer-open");
      setExpanded(app.classList.contains("drawer-open"));
      return;
    }
    sidebarCollapsed = !sidebarCollapsed;
    app.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    setExpanded(!sidebarCollapsed);
  });
  document.querySelector("[data-sidebar-close]")?.addEventListener("click", () => {
    app.classList.remove("drawer-open");
    setExpanded(false);
  });
  const notificationButton = document.querySelector("[data-live-notifications]");
  const notificationDropdown = document.querySelector("[data-notification-dropdown]");
  if (notificationButton && notificationDropdown) {
    notificationButton.addEventListener("click", () => {
      notificationDropdown.hidden = !notificationDropdown.hidden;
      notificationButton.setAttribute("aria-expanded", String(!notificationDropdown.hidden));
    });
    document.querySelector("[data-mark-notifications-read]")?.addEventListener("click", () => {
      realtimeNotifications.forEach((notification) => { notification.read = true; });
      persistRealtimeNotifications();
      refreshNotificationDropdown();
    });
    notificationDropdown.addEventListener("click", (event) => {
      const notificationButtonClicked = event.target.closest("[data-notification-id]");
      if (!notificationButtonClicked) return;
      const notification = realtimeNotifications.find((entry) => entry.id === notificationButtonClicked.dataset.notificationId);
      if (notification) {
        notification.read = true;
        persistRealtimeNotifications();
        refreshNotificationDropdown();
        notificationDropdown.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
      }
    });
  }
  document.querySelector("[data-online-indicator]")?.addEventListener("click", () => {
    renderOnlineUsersList();
    const onlineUsersModal = document.querySelector("[data-online-users-modal]");
    if (onlineUsersModal) onlineUsersModal.hidden = false;
  });
  document.querySelectorAll("[data-close-online-users]").forEach((button) => button.addEventListener("click", () => {
    const onlineUsersModal = document.querySelector("[data-online-users-modal]");
    if (onlineUsersModal) onlineUsersModal.hidden = true;
  }));
  document.querySelector("[data-online-users-modal]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.hidden = true;
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

function updateRealtimeBadge() {
  const badge = document.querySelector("[data-live-badge]");
  if (!badge) return;
  const unreadCount = realtimeNotifications.filter((notification) => !notification.read).length;
  badge.hidden = unreadCount <= 0;
  badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
}

function updateOnlineIndicator() {
  const indicator = document.querySelector("[data-online-indicator]");
  if (!indicator) return;
  onlineUserCount = onlineUsers.length;
  indicator.classList.toggle("online", onlineUserCount > 0);
  const count = indicator.querySelector("[data-online-count]");
  if (count) count.textContent = String(onlineUserCount);
  if (!document.querySelector("[data-online-users-modal]")?.hidden) renderOnlineUsersList();
}

function renderOnlineUsersList() {
  const list = document.querySelector("[data-online-users-list]");
  if (!list) return;
  if (!onlineUsers.length) {
    list.innerHTML = '<p class="notification-empty">لا توجد حسابات متصلة حالياً.</p>';
    return;
  }
  list.innerHTML = onlineUsers.map((user) => {
    const knownRole = roleNames[user.role];
    const name = user.fullName || user.username || (knownRole ? "حساب بدون اسم" : "حساب غير مسجل");
    return `<article class="online-user-entry"><span class="online-user-dot"></span><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(knownRole || "حساب غير مسجل")}</small></div></article>`;
  }).join("");
}

function notificationStorageKey(accountId) {
  return `factory-live-notifications:${accountId}`;
}

function initializeRealtimeNotifications(session) {
  if (notificationStorageAccount === session.accountId) {
    filterRealtimeNotifications();
    return;
  }
  notificationStorageAccount = session.accountId;
  try {
    const saved = JSON.parse(localStorage.getItem(notificationStorageKey(session.accountId)) || "[]");
    realtimeNotifications = Array.isArray(saved)
      ? saved.filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: crypto.randomUUID(),
          message: REALTIME_NOTIFICATION_MESSAGE,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
          read: Boolean(item.read)
        }))
        .slice(0, 40)
      : [];
    filterRealtimeNotifications();
  } catch (error) {
    realtimeNotifications = [];
    console.warn("تعذر تحميل الإشعارات المحفوظة محلياً.", error);
  }
}

function filterRealtimeNotifications() {
  realtimeNotifications = realtimeNotifications.map((notification) => ({
    id: notification.id,
    message: REALTIME_NOTIFICATION_MESSAGE,
    createdAt: notification.createdAt,
    read: Boolean(notification.read)
  }));
  persistRealtimeNotifications();
}

function persistRealtimeNotifications() {
  if (!notificationStorageAccount) return;
  try {
    const safeNotifications = realtimeNotifications.slice(0, 40).map((notification) => ({
      id: notification.id,
      message: REALTIME_NOTIFICATION_MESSAGE,
      createdAt: notification.createdAt,
      read: Boolean(notification.read)
    }));
    localStorage.setItem(notificationStorageKey(notificationStorageAccount), JSON.stringify(safeNotifications));
  } catch (error) {
    console.warn("تعذر حفظ حالة قراءة الإشعارات محلياً.", error);
  }
}

function notificationListMarkup() {
  if (!realtimeNotifications.length) return '<p class="notification-empty">لا توجد تحديثات حديثة.</p>';
  return realtimeNotifications.slice(0, 20).map((notification) => `
    <button class="notification-entry${notification.read ? " read" : " unread"}" type="button" data-notification-id="${escapeHtml(notification.id)}">
      <span class="notification-entry-message">${REALTIME_NOTIFICATION_MESSAGE}</span>
      <time>${formatDateTime(notification.createdAt)}</time>
    </button>`).join("");
}

function refreshNotificationDropdown() {
  const list = document.querySelector("[data-notification-list]");
  if (list) list.innerHTML = notificationListMarkup();
  updateRealtimeBadge();
}

function recordRealtimeNotification(payload = {}) {
  realtimeNotifications.unshift({
    id: crypto.randomUUID(),
    message: REALTIME_NOTIFICATION_MESSAGE,
    createdAt: payload.commit_timestamp || new Date().toISOString(),
    read: false
  });
  realtimeNotifications = realtimeNotifications.slice(0, 40);
  persistRealtimeNotifications();
  refreshNotificationDropdown();
}

function subscribeToFactoryUpdates(session) {
  bindRealtimeEditProtection(session);
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  if (presenceChannel) supabaseClient.removeChannel(presenceChannel);
  let channel = supabaseClient
    .channel(`factory-dashboard-${session.accountId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_live_signals" }, (payload) => scheduleRealtimeRefresh(session, "الطلبات ومراحل الإنتاج", payload));
  channel = channel
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_records" }, (payload) => scheduleRealtimeRefresh(session, "السجلات", payload))
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_deliveries" }, (payload) => scheduleRealtimeRefresh(session, "التسليمات", payload))
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_worker_production_submissions" }, (payload) => scheduleRealtimeRefresh(session, "تسليمات الإنتاج", payload))
    .on("postgres_changes", { event: "*", schema: "public", table: "users" }, (payload) => {
      if (session.role === "admin") {
        scheduleRealtimeRefresh(session, "الحسابات", payload);
      } else {
        void revalidateSessionAfterAccountChange(session);
      }
    });
  if (["admin", "client"].includes(session.role)) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "factory_finished_goods" }, (payload) => scheduleRealtimeRefresh(session, "مخزون الإنتاج المستلم", payload));
  }
  if (["admin", "cutting"].includes(session.role)) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "factory_fabrics" }, (payload) => scheduleRealtimeRefresh(session, "مخزون القماش", payload));
  }
  if (session.role === "admin") {
    channel = channel
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_fabric_transactions" }, (payload) => scheduleRealtimeRefresh(session, "حركات القماش", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_cash_transactions" }, (payload) => scheduleRealtimeRefresh(session, "الحركة النقدية", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_auth_events" }, (payload) => scheduleRealtimeRefresh(session, "تسجيلات الدخول والحسابات", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_clients" }, (payload) => scheduleRealtimeRefresh(session, "ملفات العملاء", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_client_model_requests" }, (payload) => scheduleRealtimeRefresh(session, "طلبات قصص العملاء", payload));
  }
  realtimeChannel = channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("تعذر إنشاء اشتراك التحديثات الحية.", error || status);
        window.factoryUI.toast("تعذر الاتصال بالتحديثات الحية. تحقق من إعدادات Realtime في Supabase.", "error");
      }
    });
  presenceChannel = supabaseClient
    .channel("factory-online-presence", { config: { presence: { key: session.accountId } } })
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      onlineUsers = Object.entries(state).map(([key, metas]) => {
        const meta = Array.isArray(metas) ? metas[metas.length - 1] || {} : {};
        return {
          key,
          role: rolePages[meta.role] ? meta.role : "",
          username: String(meta.username || ""),
          fullName: String(meta.fullName || ""),
          onlineAt: meta.online_at || ""
        };
      });
      updateOnlineIndicator();
    })
    .subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        try {
          const trackStatus = await presenceChannel.track({
            username: session.username,
            fullName: session.fullName,
            role: session.role,
            online_at: new Date().toISOString()
          });
          if (trackStatus !== "ok") throw new Error(`Supabase Presence returned ${trackStatus}.`);
        } catch (trackError) {
          reportDashboardFailure(session, "تعذر تسجيل حالة الاتصال", trackError);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("تعذر إنشاء قناة حالة الاتصال.", error || status);
        window.factoryUI.toast("تعذر تحميل حالة اتصال المستخدمين عبر Realtime.", "error");
      }
    });
}

async function revalidateSessionAfterAccountChange(session) {
    try {
      const currentSession = await readSession();
      if (currentSession) scheduleRealtimeRefresh(session, "حالة الحساب");
    } catch (error) {
      reportDashboardFailure(session, "تعذر التحقق من صلاحية الجلسة بعد تحديث الحساب", error);
    }
}

function hasActiveDashboardEditor() {
  const hasOpenModal = [...document.querySelectorAll(".modal-backdrop:not([hidden])")]
    .some((modal) => modal.getClientRects().length > 0);
  if (hasOpenModal) return true;
  const focusedForm = document.activeElement?.closest?.("form");
  if (focusedForm?.getClientRects().length) return true;
  return [...document.querySelectorAll("form[data-dashboard-dirty='true']")]
    .some((form) => form.getClientRects().length > 0);
}

function bindRealtimeEditProtection(session) {
  if (realtimeEditProtectionBound) return;
  realtimeEditProtectionBound = true;
  const resumePendingRefresh = () => {
    if (!realtimeRefreshPending || hasActiveDashboardEditor() || realtimeRefreshRunning) return;
    realtimeRefreshPending = false;
    void refreshFromRealtime(session, "تحديث مؤجل بعد إغلاق نموذج التحرير");
  };
  document.addEventListener("input", (event) => {
    const form = event.target.closest("form");
    if (form) form.dataset.dashboardDirty = "true";
  }, true);
  document.addEventListener("change", (event) => {
    const form = event.target.closest("form");
    if (form) form.dataset.dashboardDirty = "true";
  }, true);
  document.addEventListener("reset", (event) => {
    const form = event.target;
    window.setTimeout(() => delete form.dataset.dashboardDirty);
  }, true);
  document.addEventListener("click", () => window.setTimeout(resumePendingRefresh, 0), true);
  document.addEventListener("focusout", () => window.setTimeout(resumePendingRefresh, 0), true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.setTimeout(resumePendingRefresh, 0);
  }, true);
}

function scheduleRealtimeRefresh(session, source, payload) {
  recordRealtimeNotification(payload);
  if (hasActiveDashboardEditor()) {
    realtimeRefreshPending = true;
    if (realtimeRefreshTimer) {
      window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = null;
    }
    return;
  }
  if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => {
    realtimeRefreshTimer = null;
    void refreshFromRealtime(session, source);
  }, 300);
}

async function refreshFromRealtime(session, source) {
  if (hasActiveDashboardEditor()) {
    realtimeRefreshPending = true;
    return;
  }
  if (realtimeRefreshRunning) {
    if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = window.setTimeout(() => {
      realtimeRefreshTimer = null;
      void refreshFromRealtime(session, source);
    }, 300);
    return;
  }
  realtimeRefreshRunning = true;
  try {
    await refreshDashboard(session, true);
  } catch (error) {
    reportDashboardFailure(session, "وصل تحديث جديد لكن تعذر تحميل البيانات", error);
  } finally {
    realtimeRefreshRunning = false;
  }
}

function enrichRealtimeNotifications() {
  filterRealtimeNotifications();
}

async function refreshDashboard(session, protectEdits = false) {
  if (!protectEdits) {
    realtimeRefreshPending = false;
    if (realtimeRefreshTimer) {
      window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = null;
    }
  }
  const data = await readDashboardData(session);
  if (protectEdits && hasActiveDashboardEditor()) {
    realtimeRefreshPending = true;
    return;
  }
  dashboardData = data;
  const accounts = await readAccounts(session);
  if (protectEdits && hasActiveDashboardEditor()) {
    realtimeRefreshPending = true;
    return;
  }
  enrichRealtimeNotifications();
  render(session, data, accounts);
}

async function persistFactoryOrder(order, changes = {}) {
  const updated = { ...order, ...changes };
  const currentOrder = updated.id
    ? dashboardData.models.find((item) => item.id === updated.id)
    : null;
  const { data, error } = await supabaseClient.rpc("save_factory_order", {
    requested_order_id: updated.id || null,
    requested_customer_id: updated.customerId,
    requested_model_name: updated.name || "",
    requested_model_number: updated.modelNumber || "",
    requested_quantity: Number(updated.quantity),
    requested_original_quantity: Number(updated.originalQuantity ?? updated.quantity),
    requested_status: factoryOrderStatusForSave(currentOrder, updated.status),
    requested_fabric: updated.fabric || "",
    requested_line_name: updated.line || "",
    requested_colors: updated.colors || "",
    requested_sizes: updated.sizes || "",
    requested_delivered_pieces: Number(updated.deliveredPieces || 0),
    requested_price_per_piece: Number(updated.pricePerPiece || 0),
    requested_paid_amount: Number(updated.paidAmount || 0),
    requested_expected_delivery_date: updated.expectedDeliveryDate || null,
    requested_model_image_url: updated.modelImageUrl || null,
    requested_model_image_url_2: updated.modelImageUrl2 || null,
    requested_priority: updated.priority || "عادي",
    requested_color_names: parseColorNames(updated.colorNames),
    requested_production_type: updated.productionType || "full_cutting",
    requested_color_size_distribution: updated.colorSizeDistribution || { colors: [] },
    requested_work_stages: updated.workStages || ["cutting", "sewing", "finishing"],
    requested_pricing_mode: updated.pricingMode || "total",
    requested_stage_prices: updated.stagePrices || {},
    requested_operational_expenses: Number(updated.operationalExpenses || 0),
    requested_client_model_code: updated.clientModelCode || ""
  });
  if (error?.code === "PGRST202") {
    throw new Error("دالة حفظ الطلبات المحدّثة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (error) throw error;
  return data;
}

function bindCuttingActions(session) {
  if (!cuttingEditorModalBound) {
    cuttingEditorModalBound = true;
    const closeCuttingEditor = (modal) => {
      modal.hidden = true;
      activeCuttingEditorTrigger?.focus();
      activeCuttingEditorTrigger = null;
    };
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-cutting-editor]");
      if (button) {
        const modal = [...document.querySelectorAll("[data-cutting-editor-modal]")]
          .find((entry) => entry.dataset.cuttingEditorModal === button.dataset.openCuttingEditor);
        if (!modal) {
          reportDashboardFailure(session, "تعذر فتح تعديل بيانات القص", new Error("لم يتم العثور على نموذج القص."));
          return;
        }
        activeCuttingEditorTrigger = button;
        modal.hidden = false;
        modal.querySelector("[data-close-cutting-editor]").focus();
        return;
      }
      const modal = event.target.closest("[data-cutting-editor-modal]");
      if (modal && (event.target === modal || event.target.closest("[data-close-cutting-editor]"))) closeCuttingEditor(modal);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const modal = [...document.querySelectorAll("[data-cutting-editor-modal]")]
          .find((entry) => !entry.hidden);
        if (modal) closeCuttingEditor(modal);
      }
    });
  }
  document.querySelectorAll("[data-fabric-select]").forEach((select) => {
    const form = select.closest("form");
    const applyClientStockFilter = () => {
      const customerId = form.elements.customerId?.value || form.dataset.customerId || "";
      [...select.options].forEach((option) => {
        if (!option.value || option.value === "external") return;
        const allowed = Boolean(customerId) && option.dataset.customer === customerId;
        option.disabled = !allowed;
        option.hidden = Boolean(customerId) && !allowed;
      });
      if (select.value && select.value !== "external" && select.selectedOptions[0]?.disabled) {
        select.value = "";
      }
    };
    const refreshFabricHint = () => {
      const selected = select.selectedOptions[0];
      const form = select.closest("form");
      const hint = form.querySelector("[data-fabric-stock-hint]");
      const externalFields = form.querySelectorAll("[data-external-fabric-source-field]");
      const externalInput = form.elements.externalFabricSource;
      const available = selected?.dataset.available;
      const external = select.value === "external";
      const unitSelect = form.elements.fabricUnit;
      const selectedUnit = external ? unitSelect.value || "متر" : selected?.dataset.unit || "متر";
      if (external) {
        unitSelect.disabled = false;
        if (!unitSelect.value) unitSelect.value = "متر";
      } else if (select.value) {
        unitSelect.value = selectedUnit;
        unitSelect.disabled = true;
      } else {
        unitSelect.disabled = false;
      }
      const requiresFabric = form.classList.contains("cutting-finish-form") || form.hasAttribute("data-admin-cutting-edit");
      const quantityInput = form.elements.fabricQuantity;
      quantityInput.step = selectedUnit === "توب" ? "1" : "0.001";
      quantityInput.min = selectedUnit === "توب" ? "1" : "0.001";
      quantityInput.placeholder = selectedUnit === "توب" ? "عدد التوب" : "الكمية بالمتر";
      if (form.elements.fabricAddition) {
        form.elements.fabricAddition.step = quantityInput.step;
        form.elements.fabricAddition.min = quantityInput.min;
        form.elements.fabricAddition.placeholder = selectedUnit === "توب" ? "عدد توب إضافي" : "متر إضافي";
      }
      form.elements.boltCount.value = selectedUnit === "توب" && quantityInput.value ? quantityInput.value : "0";
      if (form.elements.externalFabricUnit) form.elements.externalFabricUnit.value = external ? selectedUnit : "";
      if (select.value === "external") {
        externalFields.forEach((field) => { field.hidden = false; });
        if (externalInput) externalInput.required = requiresFabric;
        if (select.required) select.required = false;
        if (hint) hint.textContent = "الخامة الخارجية لا تخصم من مخزون القماش.";
      } else {
        externalFields.forEach((field) => { field.hidden = true; });
        if (externalInput) externalInput.required = false;
        select.required = requiresFabric;
        if (hint) hint.textContent = select.value
          ? `المتاح حاليًا: ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(Number(available || 0))} ${selected.dataset.unit || ""}`
          : "اختر صنفًا من مخزون القماش، أو سجّل مصدر خامة خارجية.";
      }
    };
    select.addEventListener("change", refreshFabricHint);
    form.elements.fabricUnit.addEventListener("change", refreshFabricHint);
    form.elements.fabricQuantity.addEventListener("input", refreshFabricHint);
    form.elements.customerId?.addEventListener("change", () => {
      applyClientStockFilter();
      refreshFabricHint();
    });
    applyClientStockFilter();
    refreshFabricHint();
  });
  const cuttingSubmitForm = document.querySelector("#cutting-submit-form");
  if (cuttingSubmitForm) {
    const typeSelect = cuttingSubmitForm.elements.fabricType;
    const lineList = cuttingSubmitForm.querySelector("[data-cutting-fabric-lines]");
    const externalSourceField = cuttingSubmitForm.querySelector("[data-cutting-external-source]");
    const renderFabricLines = () => {
      const typeKey = typeSelect.value;
      externalSourceField.hidden = typeKey !== "__external__";
      cuttingSubmitForm.elements.externalFabricSource.required = typeKey === "__external__";
      lineList.innerHTML = typeKey
        ? cuttingFabricLineMarkup(dashboardData.fabrics, typeKey, cuttingSubmitForm.elements.customerId.value)
        : '<p class="muted">اختر العميل ونوع القماش لإضافة الألوان والكميات.</p>';
    };
    const refreshFabricLine = (line) => {
      const colorSelect = line.querySelector("[data-fabric-line-id]");
      const quantityInput = line.querySelector("[data-fabric-line-quantity]");
      if (!quantityInput) return;
      if (!colorSelect) {
        const externalUnit = line.querySelector("[data-fabric-line-unit]").value;
        quantityInput.step = externalUnit === "توب" ? "1" : "0.001";
        quantityInput.min = externalUnit === "توب" ? "1" : "0.001";
        quantityInput.placeholder = externalUnit === "توب" ? "عدد التوب" : "الكمية بالمتر";
        return;
      }
      const option = colorSelect.selectedOptions[0];
      const unit = option?.dataset.unit || "متر";
      quantityInput.step = unit === "توب" ? "1" : "0.001";
      quantityInput.min = unit === "توب" ? "1" : "0.001";
      quantityInput.placeholder = unit === "توب" ? "عدد التوب" : "الكمية بالمتر";
      const stockHint = line.querySelector("[data-fabric-line-stock]");
      if (stockHint) stockHint.textContent = option?.value
        ? `المتاح لهذا اللون: ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(Number(option.dataset.available || 0))} ${unit}`
        : "";
    };
    const refreshTypeChoices = () => {
      const customerId = cuttingSubmitForm.elements.customerId.value;
      typeSelect.innerHTML = cuttingFabricTypeOptions(dashboardData.fabrics, customerId);
      lineList.innerHTML = '<p class="muted">اختر نوع القماش لإضافة الألوان والكميات.</p>';
      externalSourceField.hidden = true;
      cuttingSubmitForm.elements.externalFabricSource.required = false;
    };
    typeSelect.addEventListener("change", renderFabricLines);
    cuttingSubmitForm.querySelector("[data-add-cutting-fabric-line]").addEventListener("click", () => {
      if (!typeSelect.value) {
        window.factoryUI.toast("اختر نوع القماش أولاً.", "error");
        return;
      }
      if (lineList.querySelectorAll("[data-cutting-fabric-line]").length >= 100) {
        window.factoryUI.toast("الحد الأقصى 100 صف قماش للقصة الواحدة.", "error");
        return;
      }
      lineList.insertAdjacentHTML("beforeend", cuttingFabricLineMarkup(
        dashboardData.fabrics,
        typeSelect.value,
        cuttingSubmitForm.elements.customerId.value
      ));
    });
    cuttingSubmitForm.addEventListener("change", (event) => {
      const line = event.target.closest("[data-cutting-fabric-line]");
      if (line && event.target.matches("[data-fabric-line-id]")) refreshFabricLine(line);
      if (line && event.target.matches("[data-fabric-line-unit]")) refreshFabricLine(line);
    });
    cuttingSubmitForm.addEventListener("input", (event) => {
      const line = event.target.closest("[data-cutting-fabric-line]");
      if (line && event.target.matches("[data-fabric-line-quantity]")) refreshFabricLine(line);
    });
    cuttingSubmitForm.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-cutting-fabric-line]");
      if (!removeButton) return;
      const lines = lineList.querySelectorAll("[data-cutting-fabric-line]");
      if (lines.length <= 1) {
        const line = lines[0];
        const colorSelect = line.querySelector("[data-fabric-line-id]");
        if (colorSelect) colorSelect.value = "";
        const externalColor = line.querySelector("[data-external-fabric-color]");
        if (externalColor) externalColor.value = "";
        line.querySelector("[data-fabric-line-quantity]").value = "";
        return;
      }
      removeButton.closest("[data-cutting-fabric-line]").remove();
    });
    for (const customerSelect of [
      cuttingSubmitForm.elements.customerSelection,
      cuttingSubmitForm.elements.brandSelection
    ]) customerSelect.addEventListener("change", refreshTypeChoices);
    refreshTypeChoices();
  }
  const readCuttingInputs = (form, requireFinal = false, notifyOnInvalid = true) => {
    const cuttingData = updateCuttingCalculation(form);
    const useSavedFabric = form.classList.contains("cutting-finish-form") && form.dataset.savedFabric === "true";
    const hasMultiFabricPicker = form.dataset.multiFabric === "true";
    const fabricLines = hasMultiFabricPicker
      ? [...form.querySelectorAll("[data-cutting-fabric-line]")].map((line) => {
        const colorSelect = line.querySelector("[data-fabric-line-id]");
        const selectedColor = colorSelect?.selectedOptions[0];
        const externalColor = line.querySelector("[data-external-fabric-color]");
        const external = !colorSelect;
        const unit = external
          ? line.querySelector("[data-fabric-line-unit]").value
          : selectedColor?.dataset.unit || "";
        return {
          fabricId: external ? null : colorSelect.value || null,
          name: external
            ? String(form.elements.externalFabricSource.value).trim()
            : selectedColor?.dataset.name || "",
          fabricType: external ? "external" : selectedColor?.dataset.fabricType || "",
          colorName: external
            ? String(externalColor.value).trim()
            : selectedColor?.dataset.color || "",
          quantity: Number(line.querySelector("[data-fabric-line-quantity]").value),
          unit,
          source: external ? String(form.elements.externalFabricSource.value).trim() : ""
        };
      })
      : [];
    const multiFabricValid = !hasMultiFabricPicker || (
      fabricLines.length > 0
      && fabricLines.every((line) => line.name
        && (line.colorName || line.fabricId)
        && Number.isFinite(line.quantity)
        && line.quantity > 0
        && ["متر", "توب"].includes(line.unit)
        && (line.unit !== "توب" || Number.isSafeInteger(line.quantity))
        && (line.unit !== "متر" || Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) < 1e-7)
        && (line.fabricId || (line.source && line.source.length <= 120)))
      && [...new Set(fabricLines.filter((line) => line.fabricId).map((line) => line.fabricId))]
        .every((fabricId) => {
          const allocated = fabricLines
            .filter((line) => line.fabricId === fabricId)
            .reduce((sum, line) => sum + line.quantity, 0);
          const selectedOption = [...form.querySelectorAll("[data-fabric-line-id] option")]
            .find((option) => option.value === fabricId);
          return selectedOption && allocated <= Number(selectedOption.dataset.available || 0) + 1e-9;
        })
    );
    const selectedFabricId = useSavedFabric
      ? form.dataset.savedFabricId
      : form.elements.fabricId?.value || "";
    const isExternal = selectedFabricId === "external";
    const fabricUnit = useSavedFabric
      ? (isExternal ? form.dataset.savedExternalFabricUnit : form.dataset.savedFabricUnit)
      : form.elements.fabricUnit?.value || "";
    const fabricId = isExternal ? null : selectedFabricId || null;
    const fabricQuantity = useSavedFabric
      ? Number(form.dataset.savedFabricQuantity)
      : Number(form.elements.fabricQuantity?.value);
    const boltCount = useSavedFabric
      ? Number(form.dataset.savedFabricBoltCount || 0)
      : fabricUnit === "توب" ? fabricQuantity : 0;
    const externalFabricSource = isExternal
      ? useSavedFabric
        ? String(form.dataset.savedExternalFabricSource || form.dataset.savedFabricName || "").trim()
        : String(form.elements.externalFabricSource?.value || form.elements.fabricDetails?.value || "").trim()
      : "";
    const fabric = useSavedFabric
      ? form.dataset.savedFabricName
      : isExternal ? externalFabricSource : form.elements.fabricId?.selectedOptions[0]?.dataset.name || "";
    const { sizeData, total } = cuttingData;
    if ((!hasMultiFabricPicker && !useSavedFabric && ((!isExternal && !fabricId) || !fabric || !Number.isFinite(fabricQuantity) || fabricQuantity <= 0
      || !["متر", "توب"].includes(fabricUnit)
      || (!isExternal && fabricUnit !== form.elements.fabricId?.selectedOptions[0]?.dataset.unit)
      || (isExternal && externalFabricSource.length > 120)
      || (fabricUnit === "توب" && !Number.isSafeInteger(boltCount))
      || !Number.isSafeInteger(boltCount)))
      || (useSavedFabric && (!fabric || !Number.isFinite(fabricQuantity) || fabricQuantity <= 0))
      || !multiFabricValid
      || (requireFinal && (!sizeData.type || !Object.keys(sizeData.counts).length || !Number.isSafeInteger(total) || total <= 0
        || cuttingData.colorPlyData.colors.length === 0
        || cuttingData.colorPlyData.colors.some((entry) => !entry.name || !Number.isSafeInteger(entry.plys) || entry.plys < 1)
        || new Set(cuttingData.colorPlyData.colors.map((entry) => entry.color)).size !== cuttingData.colorPlyData.colors.length))) {
      if (notifyOnInvalid) {
        window.factoryUI.toast(requireFinal
          ? "أكمل المقاسات والألوان وعدد الراقات لكل لون قبل إنهاء القص."
          : hasMultiFabricPicker
            ? "أكمل اختيار لون وكمية صحيحة لكل صنف، ولا تتجاوز الكمية المتاحة."
            : "اختر القماش وأدخل كمية سحب صحيحة تطابق وحدة الصنف المسجلة.", "error");
      }
      return null;
    }
    return {
      ...cuttingData,
      fabric: hasMultiFabricPicker
        ? [...new Set(fabricLines.map((line) => `${line.name} (${line.colorName})`))].join("، ")
        : fabric,
      fabricId: hasMultiFabricPicker ? fabricLines[0]?.fabricId || null : fabricId,
      fabricQuantity: hasMultiFabricPicker ? fabricLines[0]?.quantity || 0 : fabricQuantity,
      fabricUnit: hasMultiFabricPicker ? fabricLines[0]?.unit || "" : fabricUnit,
      externalFabricUnit: hasMultiFabricPicker
        ? fabricLines[0]?.fabricId ? null : fabricLines[0]?.unit || null
        : isExternal ? fabricUnit : null,
      fabricLines,
      usesSavedFabric: useSavedFabric,
      boltCount: hasMultiFabricPicker
        ? fabricLines[0]?.unit === "توب" ? fabricLines[0].quantity : 0
        : boltCount,
      externalFabricSource,
      fabricDetails: String(form.elements.fabricDetails?.value || "").trim(),
      technicalNotes: String(form.elements.technicalNotes.value).trim()
    };
  };
  const saveProgress = async (form, cuttingData) => {
    const { data, error } = await supabaseClient.rpc("update_factory_cutting_progress", {
      requested_order_id: form.dataset.finishCutting,
      requested_size_data: cuttingData.sizeData,
      requested_color_ply_data: cuttingData.colorPlyData,
      requested_fabric: cuttingData.fabric,
      requested_bolt_count: cuttingData.boltCount,
      requested_technical_notes: cuttingData.technicalNotes,
      requested_fabric_id: cuttingData.fabricId,
      requested_fabric_quantity: cuttingData.fabricQuantity,
      requested_external_fabric_unit: cuttingData.externalFabricUnit
    });
    if (error?.code === "PGRST202") throw new Error("دالة تحديث الفرش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
    if (error) throw error;
    return data;
  };
  const bindAdminCuttingEditor = (form) => {
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";
    bindPickers(form);
    const fabricSelect = form.elements.fabricId;
    const applyFabricClientFilter = () => {
      const customerId = form.dataset.customerId || "";
      [...fabricSelect.options].forEach((option) => {
        if (!option.value || option.value === "external") return;
        const allowed = !customerId || option.dataset.customer === customerId;
        option.disabled = !allowed;
        option.hidden = !allowed;
      });
    };
    const refreshFabricFields = () => {
      const selected = fabricSelect.selectedOptions[0];
      const external = fabricSelect.value === "external";
      const fabricUnit = form.elements.fabricUnit;
      const quantity = form.elements.fabricQuantity;
      if (!external && fabricSelect.value) {
        fabricUnit.value = selected.dataset.unit || "متر";
        fabricUnit.disabled = true;
      } else {
        fabricUnit.disabled = false;
        if (!fabricUnit.value) fabricUnit.value = "متر";
      }
      quantity.step = fabricUnit.value === "توب" ? "1" : "0.001";
      quantity.min = fabricUnit.value === "توب" ? "1" : "0.001";
      form.elements.boltCount.value = fabricUnit.value === "توب" ? quantity.value || "0" : "0";
      form.elements.externalFabricUnit.value = external ? fabricUnit.value : "";
      form.querySelectorAll("[data-external-fabric-source-field]").forEach((field) => { field.hidden = !external; });
      if (form.elements.externalFabricSource) form.elements.externalFabricSource.required = external;
      const hint = form.querySelector("[data-fabric-stock-hint]");
      if (hint) hint.textContent = external
        ? "الخامة الخارجية لا تخصم من مخزون القماش."
        : selected?.dataset.available
          ? `المتاح حاليًا: ${selected.dataset.available} ${selected.dataset.unit || ""}`
          : "اختر صنفًا من مخزون القماش.";
    };
    fabricSelect.addEventListener("change", refreshFabricFields);
    form.elements.fabricUnit.addEventListener("change", refreshFabricFields);
    form.elements.fabricQuantity.addEventListener("input", refreshFabricFields);
    applyFabricClientFilter();
    refreshFabricFields();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const cuttingData = readCuttingInputs(form, true);
      if (!cuttingData) return;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const { error } = await supabaseClient.rpc("admin_update_factory_cutting_details", {
          requested_order_id: form.dataset.adminCuttingEdit,
          requested_size_data: cuttingData.sizeData,
          requested_color_ply_data: cuttingData.colorPlyData,
          requested_fabric: cuttingData.fabric,
          requested_fabric_details: cuttingData.fabricDetails,
          requested_bolt_count: cuttingData.boltCount,
          requested_technical_notes: cuttingData.technicalNotes,
          requested_fabric_id: cuttingData.fabricId,
          requested_fabric_quantity: cuttingData.fabricQuantity,
          requested_external_fabric_unit: cuttingData.externalFabricUnit,
          requested_cutter_name: String(form.elements.cutterName.value || "").trim()
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة تعديل بيانات القص غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
        await refreshDashboard(session);
        window.factoryUI.toast("تم حفظ بيانات القص وتحديث إجمالي القصة دون تغيير حالتها.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, "تعذر حفظ بيانات القص", error);
      }
    });
  };
  document.querySelector("#app").addEventListener("click", (event) => {
    const summary = event.target.closest(".admin-cutting-edit > summary");
    if (!summary) return;
    const form = summary.parentElement.querySelector("[data-admin-cutting-edit]");
    if (form) bindAdminCuttingEditor(form);
  });
  document.addEventListener("focusin", (event) => {
    const form = event.target.closest("form[data-admin-cutting-edit]");
    if (form) bindAdminCuttingEditor(form);
  });
  document.querySelectorAll("[data-ready-cutting]").forEach((button) => button.addEventListener("click", async () => {
    const form = button.closest("form");
    const cuttingData = readCuttingInputs(form, true);
    if (!cuttingData) return;
    button.disabled = true;
    let progressSaved = false;
    try {
      const totalPlys = await saveProgress(form, cuttingData);
      progressSaved = true;
      const { error } = await supabaseClient.rpc("mark_factory_cutting_ready", {
        requested_order_id: form.dataset.finishCutting
      });
      if (error?.code === "PGRST202") throw new Error("دالة اعتماد جاهزية الفرش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast(`تم حفظ ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(totalPlys)} راقات واعتماد الفرشة جاهزة للقص.`);
    } catch (error) {
      if (progressSaved) await refreshDashboard(session);
      reportDashboardFailure(session, progressSaved ? "تم حفظ الراقات لكن تعذر اعتماد جاهزية الفرشة" : "تعذر تحديث الفرش", error);
    } finally {
      button.disabled = false;
    }
  }));
  document.querySelectorAll(".cutting-finish-form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cuttingData = readCuttingInputs(form, true);
    if (!cuttingData) return;
    const { sizeData, total } = cuttingData;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    let imageUploaded = false;
    let recordSaved = false;
    try {
      const file = form.elements.modelImage.files[0];
      const imageUrl = await uploadModelImage(form.dataset.finishCutting, file);
      imageUploaded = Boolean(imageUrl);
      const { data, error } = await supabaseClient.rpc("finish_factory_cutting", {
        requested_order_id: form.dataset.finishCutting,
        requested_size_data: sizeData,
        requested_color_ply_data: cuttingData.colorPlyData,
        requested_model_image_url: imageUrl,
        requested_fabric: cuttingData.usesSavedFabric ? null : cuttingData.fabric,
        requested_bolt_count: cuttingData.usesSavedFabric ? null : cuttingData.boltCount,
        requested_technical_notes: cuttingData.technicalNotes,
        requested_fabric_id: cuttingData.usesSavedFabric ? null : cuttingData.fabricId,
        requested_fabric_quantity: cuttingData.usesSavedFabric ? null : cuttingData.fabricQuantity,
        requested_external_fabric_unit: cuttingData.usesSavedFabric ? null : cuttingData.externalFabricUnit,
        requested_cutter_name: String(form.elements.cutterName?.value || "").trim()
      });
      if (error) logSupabaseRpcError("finish_factory_cutting", error);
      if (error?.code === "PGRST202") throw new Error("دالة إنهاء القص غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast(`تم تسجيل ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(data)} قطعة واعتماد حالة «تم القص».`);
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, imageUploaded ? "تم رفع الصورة لكن لم يُسجل إنهاء القص" : "تعذر إنهاء القص", error);
    }
  }));
  document.querySelectorAll("[data-repeat-cut]").forEach((button) => button.addEventListener("click", () => {
    const sourceModel = dashboardData.models.find((model) => model.id === button.dataset.repeatCut);
    if (!sourceModel) {
      window.factoryUI.toast("تعذر العثور على الموديل الأصلي لتكرار القصة.", "error");
      return;
    }
    if (session.role === "admin") {
      activeAdminCuttingTab = "new";
      window.history.replaceState(null, "", "#cutting");
      render(session, dashboardData, dashboardData.pendingAccounts || []);
      activateDashboardView("cutting", false);
    } else {
      window.location.hash = "#new-cutting";
    }
    const form = document.querySelector("#cutting-submit-form");
    if (!form) {
      window.factoryUI.toast("تعذر فتح نموذج القصة الجديدة.", "error");
      return;
    }
    const catalogModel = dashboardData.modelCatalog.find((entry) =>
      entry.factory_model_code === sourceModel.factoryModelCode
    );
    form.elements.repeatModelId.value = catalogModel
      ? `catalog:${catalogModel.id}`
      : `order:${sourceModel.id}`;
    form.elements.repeatModelId.dispatchEvent(new Event("change", { bubbles: true }));
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelectorAll("[data-request-cut]").forEach((button) => button.addEventListener("click", async () => {
    if (session.role !== "admin") return;
    button.disabled = true;
    try {
      const catalogRequest = button.dataset.requestCutKind === "catalog";
      const model = catalogRequest
        ? dashboardData.modelCatalog.find((entry) => entry.id === button.dataset.requestCut)
        : dashboardData.models.find((entry) => entry.id === button.dataset.requestCut);
      if (!model) throw new Error("تعذر العثور على الموديل المحدد.");
      const details = await cuttingRequestDetailsDialog(model.customer_id || model.customerId);
      if (!details) {
        button.disabled = false;
        return;
      }
      const { error } = await supabaseClient.rpc(
        catalogRequest ? "admin_create_factory_model_cutting_request" : "admin_create_factory_cutting_request",
        {
          ...(catalogRequest
            ? { requested_catalog_model_id: button.dataset.requestCut }
            : { requested_source_order_id: button.dataset.requestCut }),
          requested_fabric_id: details.fabricId,
          requested_roll_details: details.rollDetails,
          requested_operational_notes: details.operationalNotes
        }
      );
      if (error?.code === "PGRST202") throw new Error("دالة طلب القص بالتفاصيل غير موجودة. شغّل أحدث نسخة من supabase/schema.sql في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم إرسال طلب القصة إلى مخزن القص مع بيانات الموديل وكوده الثابت.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر إرسال طلب القصة إلى مخزن القص", error);
    }
  }));
  document.querySelectorAll("[data-edit-cutting-request]").forEach((button) => button.addEventListener("click", async () => {
    if (session.role !== "admin") return;
    const request = dashboardData.cuttingRequests.find((entry) => entry.id === button.dataset.editCuttingRequest);
    if (!request || request.archived_at || request.status !== "pending") {
      window.factoryUI.toast("طلب القص غير متاح للتعديل.", "error");
      return;
    }
    const catalogModel = dashboardData.modelCatalog.find((entry) => entry.id === request.catalog_model_id);
    const sourceModel = dashboardData.models.find((entry) => entry.id === request.source_order_id);
    const imageOwnerId = catalogModel?.id || sourceModel?.id;
    if (!imageOwnerId) {
      window.factoryUI.toast("تعذر العثور على الموديل المرتبط بالطلب.", "error");
      return;
    }
    button.disabled = true;
    try {
      const currentImageUrl = catalogModel?.model_image_url || sourceModel?.modelImageUrl || "";
      const details = await cuttingRequestDetailsDialog(request.customer_id, request, currentImageUrl);
      if (!details) {
        button.disabled = false;
        return;
      }
      const modelImageUrl = details.modelImage
        ? await uploadModelImage(imageOwnerId, details.modelImage)
        : "";
      const { error } = await supabaseClient.rpc("admin_update_factory_cutting_request", {
        requested_request_id: request.id,
        requested_fabric_id: details.fabricId,
        requested_roll_details: details.rollDetails,
        requested_operational_notes: details.operationalNotes,
        requested_model_image_url: modelImageUrl
      });
      if (error?.code === "PGRST202") throw new Error("دالة تعديل طلب القص غير موجودة. شغّل أحدث نسخة من supabase/schema.sql.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم حفظ تعديلات طلب القص.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر تعديل طلب القص", error);
    }
  }));
  document.querySelectorAll("[data-catalog-image-trigger]").forEach((button) => button.addEventListener("click", () => {
    [...document.querySelectorAll("[data-catalog-image-input]")]
      .find((input) => input.dataset.catalogImageInput === button.dataset.catalogImageTrigger)
      ?.click();
  }));
  document.querySelectorAll("[data-catalog-image-input]").forEach((input) => input.addEventListener("change", async () => {
    if (session.role !== "admin" || !input.files?.[0]) return;
    const model = dashboardData.modelCatalog.find((entry) => entry.id === input.dataset.catalogImageInput)
      || dashboardData.models.find((entry) => entry.id === input.dataset.catalogImageInput);
    if (!model) {
      window.factoryUI.toast("تعذر العثور على الموديل لإضافة الصورة.", "error");
      return;
    }
    const file = input.files[0];
    const trigger = [...document.querySelectorAll("[data-catalog-image-trigger]")]
      .find((entry) => entry.dataset.catalogImageTrigger === model.id)
      || input.closest(".catalog-image-control")?.querySelector(".catalog-image-change");
    if (trigger) trigger.disabled = true;
    try {
      const imageUrl = await uploadModelImage(model.id, file);
      const { error } = await supabaseClient.rpc("admin_update_factory_model_image", {
        requested_model_id: model.id,
        requested_model_image_url: imageUrl
      });
      if (error?.code === "PGRST202") throw new Error("دالة تحديث صورة الموديل غير موجودة. شغّل أحدث نسخة من supabase/schema.sql.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم حفظ صورة الموديل.");
    } catch (error) {
      if (trigger) trigger.disabled = false;
      reportDashboardFailure(session, "تعذر حفظ صورة الموديل", error);
    } finally {
      input.value = "";
    }
  }));
  document.querySelectorAll("[data-delete-factory-model]").forEach((button) => button.addEventListener("click", async () => {
    if (session.role !== "admin") return;
    const model = dashboardData.modelCatalog.find((entry) => entry.id === button.dataset.deleteFactoryModel);
    if (!model) {
      window.factoryUI.toast("تعذر العثور على سجل الموديل.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "حذف / أرشفة الموديل",
      message: `سيُحذف موديل ${model.model_name} نهائياً فقط إذا لم يرتبط بأي قصة أو أمر إنتاج أو سجل مالي. إذا وُجد تاريخ مرتبط فسيُؤرشف الموديل مع الحفاظ على كل السجلات.`,
      confirmLabel: "متابعة"
    })) return;
    button.disabled = true;
    try {
      const { data: result, error } = await supabaseClient.rpc("admin_delete_factory_model_catalog", {
        requested_model_id: model.id
      });
      if (error?.code === "PGRST202") throw new Error("دالة حذف/أرشفة الموديل غير موجودة. شغّل أحدث نسخة من supabase/schema.sql.");
      if (error) throw error;
      if (!["deleted", "archived"].includes(result)) throw new Error("أعاد الخادم نتيجة غير متوقعة لعملية الموديل.");
      let imageCleanupFailed = false;
      if (result === "deleted" && model.model_image_url) {
        try {
          await deleteOrderModelImage(model.model_image_url, model.id);
        } catch (imageError) {
          imageCleanupFailed = true;
          console.warn("The catalog model was deleted, but its image could not be removed.", imageError);
        }
      }
      await refreshDashboard(session);
      window.factoryUI.toast(result === "deleted"
        ? imageCleanupFailed ? "تم حذف الموديل، لكن تعذر حذف صورته من التخزين." : "تم حذف الموديل غير المرتبط بسجلات."
        : "تمت أرشفة الموديل للحفاظ على سجلات الإنتاج والماليات.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف / أرشفة الموديل", error);
    }
  }));
  document.querySelectorAll("[data-delete-cutting-request]").forEach((button) => button.addEventListener("click", async () => {
    if (session.role !== "admin") return;
    const request = dashboardData.cuttingRequests.find((entry) => entry.id === button.dataset.deleteCuttingRequest);
    if (!request) {
      window.factoryUI.toast("تعذر العثور على طلب القص.", "error");
      return;
    }
    if (request.archived_at) return;
    if (!await window.factoryUI.confirmAction({
      title: "حذف / أرشفة طلب القص",
      message: "سيُحذف نهائياً فقط إذا كان ما زال بانتظار القص ولا توجد قصة مرتبطة به. بخلاف ذلك سيُؤرشف مع حفظ سجل الإنتاج.",
      confirmLabel: "متابعة"
    })) return;
    button.disabled = true;
    try {
      const { data: result, error } = await supabaseClient.rpc("admin_delete_factory_cutting_request", {
        requested_request_id: request.id
      });
      if (error?.code === "PGRST202") throw new Error("دالة حذف/أرشفة طلب القص غير موجودة. شغّل أحدث نسخة من supabase/schema.sql.");
      if (error) throw error;
      if (!["deleted", "archived"].includes(result)) throw new Error("أعاد الخادم نتيجة غير متوقعة لطلب القص.");
      await refreshDashboard(session);
      window.factoryUI.toast(result === "deleted" ? "تم حذف طلب القص غير المنفذ." : "تمت أرشفة الطلب مع الحفاظ على قصة الإنتاج المرتبطة.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف / أرشفة طلب القص", error);
    }
  }));
  document.querySelectorAll("[data-archive-factory-order]").forEach((button) => button.addEventListener("click", async () => {
    if (session.role !== "admin") return;
    const order = dashboardData.models.find((entry) => entry.id === button.dataset.archiveFactoryOrder);
    if (!order || order.workflowArchivedAt) return;
    if (!await window.factoryUI.confirmAction({
      title: "إيقاف / أرشفة الموديل تشغيلياً",
      message: "سيُوقف الموديل من قوائم التشغيل الجديدة مع الاحتفاظ بأوامره وحركاته المالية وسجلات إنتاجه دون تغيير الحسابات.",
      confirmLabel: "إيقاف وأرشفة"
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("admin_archive_factory_order", {
        requested_order_id: order.id
      });
      if (error?.code === "PGRST202") throw new Error("دالة أرشفة الموديل غير موجودة. شغّل أحدث نسخة من supabase/schema.sql.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم إيقاف الموديل وأرشفته تشغيلياً مع الحفاظ على سجلاته المالية والإنتاجية.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر أرشفة الموديل", error);
    }
  }));
  document.querySelectorAll("[data-open-cutting-request]").forEach((button) => button.addEventListener("click", () => {
    const request = dashboardData.cuttingRequests.find((entry) => entry.id === button.dataset.openCuttingRequest);
    const catalogModel = dashboardData.modelCatalog.find((entry) => entry.id === request?.catalog_model_id);
    const sourceModel = catalogModel || dashboardData.models.find((entry) => entry.id === request?.source_order_id);
    const form = document.querySelector("#cutting-submit-form");
    if (!request || !sourceModel || !form) {
      window.factoryUI.toast("تعذر فتح طلب القص؛ حدّث الصفحة وتأكد من وجود الموديل الأصلي.", "error");
      return;
    }
    form.elements.repeatModelId.value = `${catalogModel ? "catalog" : "order"}:${sourceModel.id}`;
    form.elements.repeatModelId.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.cuttingRequestId.value = request.id;
    const requestRolls = cuttingRequestRollDetails(request);
    const reservedFabrics = requestRolls.map((roll) => ({
      roll,
      fabric: dashboardData.fabrics.find((entry) => entry.id === roll.fabric_id)
    })).filter(({ roll, fabric }) => fabric && Number(roll.quantity) > 0);
    const firstReservedFabric = reservedFabrics[0]?.fabric;
    if (firstReservedFabric) {
      const typeSelect = form.elements.fabricType;
      typeSelect.value = cuttingFabricTypeKey(firstReservedFabric);
      typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      const sameTypeRolls = reservedFabrics.filter(({ fabric }) =>
        cuttingFabricTypeKey(fabric) === typeSelect.value
      );
      for (let index = 1; index < sameTypeRolls.length; index += 1) {
        form.querySelector("[data-add-cutting-fabric-line]").click();
      }
      [...form.querySelectorAll("[data-cutting-fabric-line]")].forEach((line, index) => {
        const reserved = sameTypeRolls[index];
        if (!reserved) return;
        const select = line.querySelector("[data-fabric-line-id]");
        select.value = reserved.fabric.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        line.querySelector("[data-fabric-line-quantity]").value = String(reserved.roll.quantity);
      });
    }
    const requestNotes = [
      request.operational_notes,
      requestRolls.length
        ? `أقمشة وكميات الطلب: ${requestRolls.map((roll) => {
          const fabric = dashboardData.fabrics.find((entry) => entry.id === roll.fabric_id);
          return fabric
            ? `${fabric.name}${fabric.color_name ? ` (${fabric.color_name})` : ""}: ${roll.quantity} ${fabric.unit}`
            : `توب ${roll.roll_number || "—"}${roll.color_name ? ` (${roll.color_name})` : ""}`;
        }).join("، ")}`
        : ""
    ].filter(Boolean).join("\n");
    if (requestNotes && form.elements.technicalNotes) form.elements.technicalNotes.value = requestNotes;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    window.location.hash = "#new-cutting";
  }));
  document.querySelectorAll("[data-register-factory-model]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.saving === "true") return;
    const values = new FormData(form);
    const modelName = String(values.get("modelName") || "").trim();
    const customerId = String(values.get("customerId") || "");
    const clientModelCode = String(values.get("clientModelCode") || "").trim();
    const imageFile = form.elements.modelImage.files[0];
    if (!customerId || !modelName) {
      window.factoryUI.toast("اختر العميل وأدخل اسم الموديل قبل التسجيل.", "error");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    const modelId = crypto.randomUUID();
    form.dataset.saving = "true";
    submit.disabled = true;
    let imageUrl = null;
    let modelSaved = false;
    try {
      imageUrl = imageFile
        ? await uploadModelImage(modelId, imageFile)
        : DEFAULT_MODEL_IMAGE_URL;
      const { error } = await supabaseClient.rpc("admin_create_factory_model", {
        requested_model_id: modelId,
        requested_customer_id: customerId,
        requested_model_name: modelName,
        requested_client_model_code: clientModelCode,
        requested_model_image_url: imageUrl
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسجيل الموديل غير موجودة. شغّل أحدث نسخة من supabase/schema.sql في SQL Editor.");
      if (error) throw error;
      modelSaved = true;
      await refreshDashboard(session);
      window.factoryUI.toast(`تم تسجيل الموديل في السجل بكود نظامي ثابت${imageFile ? " وحُفظت صورته" : " مع صورة افتراضية"}. أرسل بعد ذلك طلب قصة جديدة إلى مخزن القص.`);
    } catch (error) {
      if (imageUrl && !modelSaved) {
        try {
          await deleteOrderModelImage(imageUrl, modelId);
        } catch (cleanupError) {
          console.error("Failed to remove an unreferenced catalog model image", cleanupError);
        }
      }
      reportDashboardFailure(session, modelSaved ? "تم تسجيل الموديل لكن تعذر تحديث السجل" : imageUrl ? "تم رفع الصورة لكن تعذر تسجيل الموديل" : "تعذر تسجيل الموديل", error);
    } finally {
      form.dataset.saving = "false";
      submit.disabled = false;
    }
  }));
  const submitForm = document.querySelector("#cutting-submit-form");
  if (submitForm) {
    const setSelectedCustomer = (source) => {
      const customerId = submitForm.elements[source].value;
      submitForm.elements.customerId.value = customerId || "";
      const other = source === "customerSelection" ? "brandSelection" : "customerSelection";
      if (customerId) submitForm.elements[other].value = "";
      submitForm.elements.fabricType.innerHTML = cuttingFabricTypeOptions(dashboardData.fabrics, customerId);
      submitForm.querySelector("[data-cutting-fabric-lines]").innerHTML =
        '<p class="muted">اختر نوع القماش لإضافة الألوان والكميات.</p>';
      submitForm.querySelector("[data-cutting-external-source]").hidden = true;
      submitForm.elements.externalFabricSource.required = false;
    };
    submitForm.elements.customerSelection.addEventListener("change", () => setSelectedCustomer("customerSelection"));
    submitForm.elements.brandSelection.addEventListener("change", () => setSelectedCustomer("brandSelection"));
    const repeatModelSelect = submitForm.elements.repeatModelId;
    repeatModelSelect.addEventListener("change", () => {
      submitForm.elements.cuttingRequestId.value = "";
      const [modelType, modelId] = repeatModelSelect.value.split(":", 2);
      const catalogModel = modelType === "catalog"
        ? dashboardData.modelCatalog.find((entry) => entry.id === modelId)
        : null;
      const sourceOrder = modelType === "order"
        ? dashboardData.models.find((entry) => entry.id === modelId)
        : null;
      const model = catalogModel
        ? {
          id: catalogModel.id,
          customerId: catalogModel.customer_id,
          name: catalogModel.model_name,
          clientModelCode: catalogModel.client_model_code,
          factoryModelCode: catalogModel.factory_model_code,
          modelImageUrl: catalogModel.model_image_url || DEFAULT_MODEL_IMAGE_URL,
          modelImageUrls: [catalogModel.model_image_url || DEFAULT_MODEL_IMAGE_URL, ""]
        }
        : sourceOrder;
      const codePreview = submitForm.querySelector("[data-repeat-model-code]");
      const codeLabel = submitForm.querySelector("[data-cutting-model-code]");
      const imagePreview = submitForm.querySelector("[data-repeat-model-image]");
      if (!model) {
        submitForm.elements.sourceOrderId.value = "";
        submitForm.elements.catalogModelId.value = "";
        submitForm.elements.modelName.disabled = false;
        submitForm.elements.modelName.value = "";
        submitForm.elements.modelNumber.value = "";
        submitForm.elements.customerSelection.value = "";
        submitForm.elements.brandSelection.value = "";
        submitForm.elements.customerId.value = "";
        submitForm.elements.fabricType.innerHTML = cuttingFabricTypeOptions(dashboardData.fabrics, "");
        submitForm.querySelector("[data-cutting-fabric-lines]").innerHTML =
          '<p class="muted">اختر نوع القماش لإضافة الألوان والكميات.</p>';
        codePreview.hidden = true;
        codePreview.textContent = "";
        codeLabel.textContent = "كود الموديل بالنظام: يُنشأ عند اعتماد الموديل.";
        imagePreview.replaceChildren();
        return;
      }
      submitForm.elements.sourceOrderId.value = sourceOrder?.id || "";
      submitForm.elements.catalogModelId.value = catalogModel?.id || "";
      submitForm.elements.modelName.value = model.name || "";
      submitForm.elements.modelName.disabled = true;
      submitForm.elements.modelNumber.value = model.clientModelCode || model.modelNumber || "";
      const client = dashboardData.clients.find((entry) => entry.id === model.customerId);
      if (client?.brand_name) {
        submitForm.elements.brandSelection.value = client.id;
        setSelectedCustomer("brandSelection");
      } else {
        submitForm.elements.customerSelection.value = model.customerId || "";
        setSelectedCustomer("customerSelection");
      }
      const code = model.factoryModelCode || "";
      codePreview.textContent = `كود الموديل بالنظام الثابت: ${code || "—"}`;
      codePreview.hidden = false;
      codeLabel.textContent = `كود الموديل بالنظام: ${code || "—"} (ثابت عند تكرار القص)`;
      imagePreview.innerHTML = modelImageMarkup(model.modelImageUrls || model.modelImageUrl, `صورة الموديل ${model.name || ""}`);
    });
    submitForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitForm.dataset.saving === "true") return;
      const submitButtons = [...submitForm.querySelectorAll('[type="submit"]')];
      const modelName = String(submitForm.elements.modelName.value).trim();
      const modelNumber = String(submitForm.elements.modelNumber.value).trim();
      const customerId = submitForm.elements.customerId.value;
      if (!modelName && !modelNumber) {
        window.factoryUI.toast("أدخل اسم الموديل أو رقمه لاعتماد القصة المكتملة.", "error");
        return;
      }
      if (!customerId) {
        window.factoryUI.toast("اختر العميل لاعتماد القصة المكتملة.", "error");
        return;
      }
      const completeCuttingData = readCuttingInputs(submitForm, true);
      if (!completeCuttingData) return;
      submitForm.dataset.saving = "true";
      submitButtons.forEach((submitButton) => { submitButton.disabled = true; });
      let imageUploaded = false;
      let recordSaved = false;
      const orderId = crypto.randomUUID();
      try {
        const uploadedImageUrl = await uploadModelImage(orderId, submitForm.elements.modelImage.files[0]);
        imageUploaded = Boolean(uploadedImageUrl);
        const sourceModel = dashboardData.models.find((model) => model.id === submitForm.elements.sourceOrderId.value);
        const catalogModel = dashboardData.modelCatalog.find((model) => model.id === submitForm.elements.catalogModelId.value);
        const imageUrl = uploadedImageUrl || sourceModel?.modelImageUrl || catalogModel?.model_image_url || "";
        const { data, error } = await supabaseClient.rpc("submit_factory_cutting", {
          requested_order_id: orderId,
          requested_customer_id: customerId,
          requested_model_name: modelName,
          requested_model_number: modelNumber,
          requested_size_data: completeCuttingData.sizeData,
          requested_color_ply_data: completeCuttingData.colorPlyData,
          requested_model_image_url: imageUrl,
          requested_fabric: completeCuttingData.fabric,
          requested_fabric_details: String(submitForm.elements.fabricDetails.value || "").trim(),
          requested_bolt_count: completeCuttingData.boltCount,
          requested_technical_notes: completeCuttingData.technicalNotes,
          requested_fabric_id: completeCuttingData.fabricId,
          requested_fabric_quantity: completeCuttingData.fabricQuantity,
          requested_external_fabric_unit: completeCuttingData.externalFabricUnit,
          requested_source_order_id: sourceModel?.id || null,
          requested_cutting_request_id: submitForm.elements.cuttingRequestId.value || null,
          requested_catalog_model_id: catalogModel?.id || null,
          requested_fabric_lines: completeCuttingData.fabricLines.map((line) => ({
            fabric_id: line.fabricId,
            name: line.name,
            fabric_type: line.fabricType,
            color_name: line.colorName,
            quantity: line.quantity,
            unit: line.unit,
            source: line.source
          }))
        });
        if (error?.code === "PGRST202") throw new Error("دالة تسجيل القصة بالدفعة الواحدة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        if (error) throw error;
        recordSaved = true;
        if (session.role === "admin") activeAdminCuttingTab = "active";
        await refreshDashboard(session);
        window.factoryUI.toast(session.role === "admin"
          ? `تم حفظ القصة في سجل المراجعة بإجمالي ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(data)} قطعة.`
          : `تم إرسال القصة للإدارة للمراجعة، بإجمالي ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(data)} قطعة. لم تُضف إلى الموديلات بعد.`);
      } catch (error) {
        reportDashboardFailure(session, recordSaved ? "تم حفظ القصة لكن تعذر تحديث الشاشة" : imageUploaded ? "رُفعت الصورة لكن تعذر حفظ بيانات القصة" : "تعذر حفظ القصة", error);
      } finally {
        submitForm.dataset.saving = "false";
        submitButtons.forEach((submitButton) => { submitButton.disabled = false; });
      }
    });
  }
}

function bindClientDetailActions(session) {
  document.querySelectorAll("#client-details [data-client-profile-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeClientProfileTab = button.dataset.clientProfileTab;
      document.querySelectorAll("#client-details [data-client-profile-tab]").forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });
      document.querySelectorAll("#client-details [data-client-profile-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.clientProfilePanel !== activeClientProfileTab;
      });
    });
  });
  const filterStatement = () => {
    const from = document.querySelector("#client-details [data-client-statement-from]")?.value || "";
    const to = document.querySelector("#client-details [data-client-statement-to]")?.value || "";
    const rows = [...document.querySelectorAll("#client-details [data-client-statement-row]")];
    let visibleCount = 0;
    rows.forEach((row) => {
      const date = row.dataset.clientStatementRow;
      const visible = (!from || (date && date >= from)) && (!to || (date && date <= to));
      row.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    const count = document.querySelector("#client-details [data-client-statement-count]");
    if (count) count.textContent = `${visibleCount} حركة`;
  };
  document.querySelectorAll("#client-details [data-client-statement-from], #client-details [data-client-statement-to]")
    .forEach((input) => input.addEventListener("change", filterStatement));
  document.querySelectorAll("#client-details [data-clear-client-statement-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelector("#client-details [data-client-statement-from]").value = "";
      document.querySelector("#client-details [data-client-statement-to]").value = "";
      filterStatement();
    })
  );
  document.querySelectorAll("#client-details [data-edit-client-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      const payment = dashboardData.payments.find((entry) => entry._recordId === button.dataset.editClientPayment);
      const modal = document.querySelector("#client-details [data-client-payment-modal]");
      const form = modal?.querySelector("[data-client-payment-edit-form]");
      if (!payment || !form || !modal) {
        window.factoryUI.toast("تعذر العثور على الدفعة أو نموذج تعديلها.", "error");
        return;
      }
      form.elements.recordId.value = payment._recordId;
      form.elements.amount.value = payment.amount;
      form.elements.date.value = String(payment.date || payment._createdAt || payment.created_at || "").slice(0, 10);
      form.elements.method.value = payment.method || "نقدي";
      if (![...form.elements.method.options].some((option) => option.value === form.elements.method.value)) {
        form.elements.method.add(new Option(form.elements.method.value, form.elements.method.value));
      }
      form.elements.reference.value = payment.reference || payment.orderReference || "";
      form.elements.notes.value = payment.notes || "";
      modal.hidden = false;
    });
  });
  document.querySelectorAll("#client-details [data-close-client-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = document.querySelector("#client-details [data-client-payment-modal]");
      if (modal) modal.hidden = true;
    });
  });
  document.querySelectorAll("#client-details [data-client-payment-modal]").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  });
  document.querySelectorAll("#client-details [data-client-payment-edit-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const values = new FormData(form);
      const amount = Number(values.get("amount"));
      const date = String(values.get("date") || "");
      if (!Number.isFinite(amount) || amount <= 0 || !date) {
        window.factoryUI.toast("أدخل مبلغًا موجبًا وتاريخًا صالحًا للدفعة.", "error");
        return;
      }
      submit.disabled = true;
      let saved = false;
      try {
        const { error } = await supabaseClient.rpc("save_factory_payment", {
          requested_record_id: String(values.get("recordId")),
          requested_customer_id: selectedClientId,
          requested_amount: amount,
          requested_date: date,
          requested_method: String(values.get("method") || "غير محدد"),
          requested_reference: String(values.get("reference") || "").trim(),
          requested_notes: String(values.get("notes") || "").trim()
        });
        if (error?.code === "PGRST202") throw new Error("دالة حفظ الدفعات غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        if (error) throw error;
        saved = true;
        await refreshDashboard(session);
        window.factoryUI.toast("تم تعديل الدفعة وإعادة احتساب حساب العميل.");
      } catch (error) {
        reportDashboardFailure(session, saved
          ? "تم تعديل الدفعة، لكن تعذر تحديث كشف العميل"
          : "تعذر تعديل الدفعة", error);
      } finally {
        submit.disabled = false;
      }
    });
  });
  document.querySelectorAll("#client-details [data-quick-client-payment]").forEach((button) => {
    button.addEventListener("click", () => openClientPayment(button.dataset.quickClientPayment));
  });
  document.querySelectorAll("#client-details [data-open-account-adjustment]").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = document.querySelector("#client-details [data-account-adjustment-modal]");
      if (modal) modal.hidden = false;
    });
  });
  document.querySelectorAll("#client-details [data-close-account-adjustment]").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = document.querySelector("#client-details [data-account-adjustment-modal]");
      if (modal) modal.hidden = true;
    });
  });
  document.querySelectorAll("#client-details [data-account-adjustment-modal]").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  });
  document.querySelectorAll("#client-details [data-account-adjustment-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const amount = Number(values.get("amount"));
      const reason = String(values.get("reason") || "").trim();
      const notes = String(values.get("notes") || "").trim();
      if (!Number.isFinite(amount) || amount <= 0 || !reason) {
        window.factoryUI.toast("أدخل مبلغًا موجبًا وحدد سبب الخصم.", "error");
        return;
      }
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      let adjustmentSaved = false;
      try {
        const { error } = await supabaseClient.rpc("save_factory_client_account_adjustment", {
          requested_customer_id: form.dataset.accountAdjustmentForm,
          requested_amount: amount,
          requested_reason: reason,
          requested_notes: notes
        });
        if (error?.code === "PGRST202") throw new Error("دالة خصم تسوية العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        if (error) throw error;
        adjustmentSaved = true;
        await refreshDashboard(session);
        const client = dashboardData.clients.find((entry) => entry.id === selectedClientId);
        if (!client) throw new Error("تم حفظ الخصم لكن تعذر العثور على ملف العميل لتحديث العرض.");
        document.querySelector("#client-details").innerHTML = clientDetailsView(client, dashboardData);
        bindClientDetailActions(session);
        window.factoryUI.toast("تم خصم التسوية من رصيد العميل دون تسجيل حركة بالخزنة.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, adjustmentSaved
          ? "تم حفظ الخصم، لكن تعذر تحديث كشف العميل"
          : "تعذر حفظ خصم التسوية", error);
      }
    });
  });
  document.querySelectorAll("[data-print-account]").forEach((button) => button.addEventListener("click", () => {
    const client = dashboardData.clients.find((entry) => entry.id === selectedClientId);
    if (!client) {
      window.factoryUI.toast("تعذر العثور على ملف العميل للطباعة.", "error");
      return;
    }
    printClientAccount(client, dashboardData);
  }));
  document.querySelectorAll("[data-print-selected-models]").forEach((button) => button.addEventListener("click", () => {
    const selectedIds = new Set([...document.querySelectorAll("#client-details [data-print-model-select]:checked")].map((input) => input.dataset.printModelSelect));
    const selectedOrders = dashboardData.models.filter((order) => selectedIds.has(order.id));
    if (!selectedOrders.length) {
      window.factoryUI.toast("حدد موديلًا واحدًا على الأقل للطباعة.", "error");
      return;
    }
    const client = dashboardData.clients.find((entry) => entry.id === selectedClientId);
    printDocument("فاتورة الموديلات", selectedOrders.map((order) => modelPrintMarkup(order, client?.name)).join(""));
  }));
  document.querySelectorAll("[data-client-cash-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const occurredAt = new Date(String(values.get("occurredAt") || ""));
    const amount = Number(values.get("amount"));
    if (Number.isNaN(occurredAt.getTime()) || !Number.isFinite(amount) || amount <= 0) {
      window.factoryUI.toast("أدخل مبلغًا موجبًا وتاريخًا صحيحًا للحركة.", "error");
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("save_factory_cash_transaction", {
        requested_direction: "expense",
        requested_category: String(values.get("category")).trim(),
        requested_description: String(values.get("description")).trim(),
        requested_amount: amount,
        requested_payment_method: String(values.get("method") || "نقدي").trim(),
        requested_occurred_at: occurredAt.toISOString(),
        requested_customer_id: form.dataset.clientCashForm
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسجيل الحركة النقدية المرتبطة بالعميل غير محدثة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم تسجيل المصروف وربطه بحساب العميل وسجل الخزينة.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر تسجيل حركة العميل", error);
    }
  }));
  document.querySelectorAll(".client-note-form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    let noteSaved = false;
    try {
      await saveFlexibleRecord("client_notes", {
        customerId: form.dataset.clientNote,
        note: String(new FormData(form).get("note")).trim()
      });
      noteSaved = true;
      await refreshDashboard(session);
      const client = dashboardData.clients.find((entry) => entry.id === selectedClientId);
      document.querySelector("#client-details").innerHTML = clientDetailsView(client, dashboardData);
      bindClientDetailActions(session);
      window.factoryUI.toast("تم حفظ ملاحظة العميل.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, noteSaved
        ? "تم حفظ الملاحظة، لكن تعذر تحديث الصفحة"
        : "تعذر حفظ ملاحظة العميل", error);
    }
  }));
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
    if (summary.hasUndeliveredGoods) {
      window.factoryUI.toast("لا يمكن تصفية الحساب ما دامت هناك بضاعة غير مسلّمة. ستبقى خارج المديونية حتى إتمام التسليم.", "error");
      return;
    }
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
      reportDashboardFailure(session, settlementSaved
        ? "تمت التصفية، لكن تعذر تحديث البيانات المعروضة"
        : "تعذر تصفية حساب العميل", error);
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

function bindIncomingFabricActions(session) {
  const form = document.querySelector("#incoming-fabric-form");
  if (form) form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    let registered = false;
    try {
      const receivedAt = new Date(form.elements.receivedAt.value);
      if (Number.isNaN(receivedAt.getTime())) throw new Error("أدخل تاريخ ووقت استلام صالحين.");
      const items = [...form.querySelectorAll("[data-incoming-fabric-group]")].flatMap((group) => {
        const fabricType = group.querySelector('[name="fabricType"]').value;
        const name = fabricType === "__new__"
          ? String(group.querySelector('[name="name"]').value).trim()
          : String(fabricType).trim();
        if (!name) throw new Error("اختر اسم قماش مسجلاً أو أدخل اسم نوع جديد.");
        return [...group.querySelectorAll("[data-incoming-fabric-color-row]")].map((row) => ({
          name,
          colorName: String(row.querySelector('[name="colorName"]').value).trim(),
          colorHex: row.querySelector('[name="colorHex"]').value,
          quantity: Number(row.querySelector('[name="quantity"]').value),
          unit: row.querySelector('[name="unit"]').value
        }));
      });
      const { error } = await supabaseClient.rpc("register_factory_incoming_fabrics", {
        requested_customer_id: form.elements.customerId.value || null,
        requested_items: items,
        requested_received_at: receivedAt.toISOString(),
        requested_notes: String(form.elements.notes.value).trim()
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسجيل أصناف القماش الداخل المتعددة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      registered = true;
      form.reset();
      form.querySelector("[data-incoming-fabric-groups]").innerHTML = incomingFabricGroupMarkup(dashboardData.fabrics);
      form.querySelectorAll('[name="colorHex"]').forEach((input) => {
        input.value = "#FFFFFF";
        syncCustomColorTrigger(input);
      });
      form.elements.receivedAt.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      await refreshDashboard(session);
      window.factoryUI.toast("تم تسجيل أصناف القماش الداخل وتحديث سجل القص.");
    } catch (error) {
      reportDashboardFailure(session, registered
        ? "تم تسجيل القماش، لكن تعذر تحديث الشاشة"
        : "تعذر تسجيل القماش الداخل", error);
    } finally {
      button.disabled = false;
    }
  });

  if (session.role !== "admin") return;
  document.querySelectorAll("[data-assign-incoming-fabric]").forEach((button) => button.addEventListener("click", async () => {
    const fabricId = button.dataset.assignIncomingFabric;
    const select = button.closest("tr")?.querySelector("[data-incoming-customer]");
    if (!select) {
      window.factoryUI.toast("تعذر العثور على اختيار العميل لهذا القماش.", "error");
      return;
    }
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("assign_factory_incoming_fabric", {
        requested_fabric_id: fabricId,
        requested_customer_id: select.value || null
      });
      if (error?.code === "PGRST202") throw new Error("دالة تعيين العميل للقماش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast(select.value ? "تم ربط القماش بالعميل." : "تم وضع القماش ضمن الوارد غير المحدد.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر تعيين العميل للقماش", error);
    }
  }));
}

function bindFabricEntryRows() {
  document.querySelectorAll("#incoming-fabric-form, #fabric-receipt-form").forEach((form) => {
    form.addEventListener("click", (event) => {
      if (form.id === "incoming-fabric-form") {
        const addTypeButton = event.target.closest("[data-add-incoming-type]");
        if (addTypeButton) {
          const groups = form.querySelector("[data-incoming-fabric-groups]");
          groups.insertAdjacentHTML("beforeend", incomingFabricGroupMarkup(dashboardData.fabrics, true));
          groups.lastElementChild.querySelector("[data-remove-incoming-type]").hidden = false;
          groups.lastElementChild.querySelector('[name="name"]').focus();
          return;
        }
        const addColorButton = event.target.closest("[data-add-incoming-color]");
        if (addColorButton) {
          const list = addColorButton.closest("[data-incoming-fabric-group]").querySelector("[data-incoming-fabric-color-list]");
          list.insertAdjacentHTML("beforeend", incomingFabricColorRowMarkup());
          const row = list.lastElementChild;
          syncIncomingFabricQuantity(row);
          row.querySelector('[name="colorName"]').focus();
          return;
        }
        const removeTypeButton = event.target.closest("[data-remove-incoming-type]");
        if (removeTypeButton) {
          if (form.querySelectorAll("[data-incoming-fabric-group]").length > 1) {
            removeTypeButton.closest("[data-incoming-fabric-group]").remove();
          }
          return;
        }
        const removeColorButton = event.target.closest("[data-remove-incoming-color]");
        if (removeColorButton) {
          const list = removeColorButton.closest("[data-incoming-fabric-color-list]");
          if (list.querySelectorAll("[data-incoming-fabric-color-row]").length > 1) {
            removeColorButton.closest("[data-incoming-fabric-color-row]").remove();
          }
          return;
        }
      }
      const addButton = event.target.closest("[data-add-fabric-row]");
      if (addButton) {
        const list = form.querySelector("[data-fabric-entry-list]");
        const markup = ownerFabricReceiptLineMarkup(dashboardData.fabrics.filter((fabric) => fabric.stock_scope === "owner"));
        list.insertAdjacentHTML("beforeend", markup);
        return;
      }
      const removeButton = event.target.closest("[data-remove-fabric-row]");
      const row = removeButton?.closest("[data-fabric-entry-row]");
      if (row && row.parentElement.querySelectorAll("[data-fabric-entry-row]").length > 1) row.remove();
    });
    if (form.id === "incoming-fabric-form") {
      form.addEventListener("change", (event) => {
        const unitSelect = event.target.closest('[data-incoming-fabric-color-row] [name="unit"]');
        if (unitSelect) syncIncomingFabricQuantity(unitSelect.closest("[data-incoming-fabric-color-row]"));
        const typeSelect = event.target.closest("[data-incoming-fabric-type]");
        if (typeSelect) {
          const newTypeField = typeSelect.closest("[data-incoming-fabric-group]").querySelector(".incoming-new-type-field");
          const newTypeInput = newTypeField.querySelector('[name="name"]');
          const isNewType = typeSelect.value === "__new__";
          newTypeField.hidden = !isNewType;
          newTypeInput.disabled = !isNewType;
          newTypeInput.required = isNewType;
          if (isNewType) newTypeInput.focus();
        }
      });
      form.querySelectorAll("[data-incoming-fabric-color-row]").forEach(syncIncomingFabricQuantity);
    }
  });
}

function bindFabricAdminActions(session) {
  const fabricForm = document.querySelector("#fabric-form");
  const receiptForm = document.querySelector("#fabric-receipt-form");
  const adjustmentForm = document.querySelector("#fabric-adjustment-form");
  if (!fabricForm || !receiptForm || !adjustmentForm) return;

  const resetFabricForm = () => {
    fabricForm.reset();
    fabricForm.elements.fabricId.value = "";
    fabricForm.querySelector('[type="submit"]').textContent = "حفظ بيانات القماش";
    fabricForm.querySelector("[data-cancel-fabric-edit]").hidden = true;
  };
  fabricForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = fabricForm.querySelector('[type="submit"]');
    button.disabled = true;
    let saved = false;
    try {
      const { error } = await supabaseClient.rpc("save_factory_fabric", {
        requested_fabric_id: fabricForm.elements.fabricId.value || null,
        requested_name: String(fabricForm.elements.name.value).trim(),
        requested_type: "",
        requested_color_name: String(fabricForm.elements.colorName.value).trim(),
        requested_color_hex: fabricForm.elements.colorHex.value,
        requested_unit: fabricForm.elements.unit.value
      });
      if (error?.code === "PGRST202") throw new Error("دالة إدارة أصناف القماش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      saved = true;
      resetFabricForm();
      await refreshDashboard(session);
      window.factoryUI.toast("تم حفظ بيانات صنف القماش.");
    } catch (error) {
      reportDashboardFailure(session, saved
        ? "تم حفظ صنف القماش، لكن تعذر تحديث الشاشة"
        : "تعذر حفظ صنف القماش", error);
    } finally {
      button.disabled = false;
    }
  });

  receiptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = receiptForm.querySelector('[type="submit"]');
    button.disabled = true;
    let recorded = false;
    try {
      const receivedAt = new Date(receiptForm.elements.receivedAt.value);
      if (Number.isNaN(receivedAt.getTime())) throw new Error("أدخل تاريخ ووقتًا صالحين للورود.");
      const items = [...receiptForm.querySelectorAll("[data-fabric-entry-row]")].map((row) => ({
        fabricId: row.querySelector('[name="fabricId"]').value,
        quantity: Number(row.querySelector('[name="quantity"]').value)
      }));
      const { error } = await supabaseClient.rpc("record_factory_fabric_receipts", {
        requested_items: items,
        requested_received_at: receivedAt.toISOString(),
        requested_notes: String(receiptForm.elements.notes.value).trim()
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسجيل واردات القماش المتعددة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      recorded = true;
      [...receiptForm.querySelectorAll('[name="quantity"]')].forEach((input) => { input.value = ""; });
      receiptForm.elements.notes.value = "";
      await refreshDashboard(session);
      window.factoryUI.toast("تم تسجيل كميات القماش الداخل وتحديث الأرصدة.");
    } catch (error) {
      reportDashboardFailure(session, recorded
        ? "تم تسجيل القماش الداخل، لكن تعذر تحديث الشاشة"
        : "تعذر تسجيل القماش الداخل", error);
    } finally {
      button.disabled = false;
    }
  });

  adjustmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = adjustmentForm.querySelector('[type="submit"]');
    button.disabled = true;
    let adjusted = false;
    try {
      const adjustedAt = new Date(adjustmentForm.elements.adjustedAt.value);
      if (Number.isNaN(adjustedAt.getTime())) throw new Error("أدخل تاريخ ووقتًا صالحين للتسوية.");
      const { error } = await supabaseClient.rpc("adjust_factory_fabric_stock", {
        requested_fabric_id: adjustmentForm.elements.fabricId.value,
        requested_adjustment: Number(adjustmentForm.elements.adjustment.value),
        requested_adjusted_at: adjustedAt.toISOString(),
        requested_notes: String(adjustmentForm.elements.notes.value).trim()
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسوية المخزون غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      adjusted = true;
      adjustmentForm.elements.adjustment.value = "";
      adjustmentForm.elements.notes.value = "";
      await refreshDashboard(session);
      window.factoryUI.toast("تمت تسوية رصيد القماش وتسجيل الحركة.");
    } catch (error) {
      reportDashboardFailure(session, adjusted
        ? "تم تسجيل التسوية، لكن تعذر تحديث الشاشة"
        : "تعذرت تسوية المخزون", error);
    } finally {
      button.disabled = false;
    }
  });

  fabricForm.querySelector("[data-cancel-fabric-edit]").addEventListener("click", resetFabricForm);
  document.querySelectorAll("[data-edit-fabric]").forEach((button) => button.addEventListener("click", () => {
    const fabric = dashboardData.fabrics.find((item) => item.id === button.dataset.editFabric);
    if (!fabric) {
      window.factoryUI.toast("تعذر العثور على صنف القماش.", "error");
      return;
    }
    fabricForm.elements.fabricId.value = fabric.id;
    fabricForm.elements.name.value = fabric.name;
    fabricForm.elements.colorName.value = fabric.color_name;
    fabricForm.elements.colorHex.value = fabric.color_hex;
    syncCustomColorTrigger(fabricForm.elements.colorHex);
    fabricForm.elements.unit.value = fabric.unit;
    fabricForm.querySelector('[type="submit"]').textContent = "حفظ التعديلات";
    fabricForm.querySelector("[data-cancel-fabric-edit]").hidden = false;
    fabricForm.scrollIntoView({ behavior: "smooth", block: "center" });
    fabricForm.elements.name.focus({ preventScroll: true });

  }));
  document.querySelectorAll("[data-delete-fabric]").forEach((button) => button.addEventListener("click", async () => {
    const fabric = dashboardData.fabrics.find((item) => item.id === button.dataset.deleteFabric);
    if (!fabric) {
      window.factoryUI.toast("تعذر العثور على صنف القماش.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "حذف صنف القماش",
      message: `سيُحذف ${fabric.name} ورصيده وحركاته غير المرتبطة بقصة قص نهائياً. لا يمكن حذف صنف مرتبط بقصة قص مسجلة.`,
      confirmLabel: "حذف الصنف",
      danger: true
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("delete_factory_fabric", { requested_fabric_id: fabric.id });
      if (error?.code === "PGRST202") throw new Error("دالة حذف صنف القماش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم حذف صنف القماش غير المستخدم.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف الصنف", error);
    }
  }));
  document.querySelectorAll("[data-delete-fabric-transaction]").forEach((button) => button.addEventListener("click", async () => {
    const transaction = dashboardData.fabricTransactions.find((item) => item.id === button.dataset.deleteFabricTransaction);
    if (!transaction) {
      window.factoryUI.toast("تعذر العثور على حركة القماش.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "حذف حركة القماش",
      message: "سيتم حذف الحركة نهائياً وعكس أثرها على المخزون. لا يمكن حذف حركة مرتبطة بأمر قص أو إذا كان عكسها سيجعل الرصيد سالباً.",
      confirmLabel: "حذف الحركة",
      danger: true
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("delete_factory_fabric_transaction", {
        requested_transaction_id: transaction.id
      });
      if (error?.code === "PGRST202") throw new Error("دالة حذف حركة القماش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم حذف حركة القماش وعكس أثرها على الرصيد.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف حركة القماش", error);
    }
  }));
}

function bindSewingStageActions(session) {
  if (!sewingEditorModalBound) {
    sewingEditorModalBound = true;
    const closeSewingEditor = (modal) => {
      modal.hidden = true;
      activeSewingEditorTrigger?.focus();
      activeSewingEditorTrigger = null;
    };
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-sewing-editor]");
      if (button) {
        const modal = [...document.querySelectorAll("[data-sewing-editor-modal]")]
          .find((entry) => entry.dataset.sewingEditorModal === button.dataset.openSewingEditor);
        if (!modal) {
          reportDashboardFailure(session, "تعذر فتح تعديل بيانات الخياطة", new Error("لم يتم العثور على نموذج الخياطة."));
          return;
        }
        activeSewingEditorTrigger = button;
        modal.hidden = false;
        modal.querySelector("input[name='targetQuantity']").focus();
        return;
      }
      const modal = event.target.closest("[data-sewing-editor-modal]");
      if (modal && (event.target === modal || event.target.closest("[data-close-sewing-editor]"))) closeSewingEditor(modal);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const modal = [...document.querySelectorAll("[data-sewing-editor-modal]")]
          .find((entry) => !entry.hidden);
        if (modal) closeSewingEditor(modal);
      }
    });
  }
  document.querySelectorAll("[data-sewing-edit-order]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const targetQuantity = Number(form.elements.targetQuantity.value);
      const technicalNotes = String(form.elements.technicalNotes.value || "").trim();
      if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0 || targetQuantity > 2147483647
        || technicalNotes.length > 2000) {
        window.factoryUI.toast("أدخل كمية صحيحة وتعليمات لا تتجاوز 2000 حرف.", "error");
        return;
      }
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const { error } = await supabaseClient.rpc("update_factory_sewing_details", {
          requested_order_id: form.dataset.sewingEditOrder,
          requested_target_quantity: targetQuantity,
          requested_technical_notes: technicalNotes
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة تعديل بيانات الخياطة غير موجودة. شغّل supabase/schema.sql المحدّث في SQL Editor.");
        }
        if (error) throw error;
        await refreshDashboard(session);
        window.factoryUI.toast("تم حفظ كمية وتعليمات الخياطة.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, "تعذر حفظ بيانات الخياطة", error);
      }
    });
  });
  document.querySelectorAll("[data-sewing-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.sewingAction;
    const orderId = button.dataset.sewingOrder;
    if (!orderId || !["start", "finish"].includes(action)) {
      window.factoryUI.toast("تعذر تحديد أمر الخياطة أو الإجراء المطلوب.", "error");
      return;
    }
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("transition_factory_sewing_stage", {
        requested_order_id: orderId,
        requested_action: action
      });
      if (error?.code === "PGRST202") {
        throw new Error("دالة انتقال مراحل الخياطة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      }
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast(action === "start"
        ? "تم استلام القصّة وبدء الخياطة الفعلية."
        : "اكتملت الخياطة وتم تحويل القصّة للمرحلة التالية.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر تحديث مرحلة الخياطة", error);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }));
  document.querySelectorAll("[data-make-sewing-available]").forEach((button) => button.addEventListener("click", async () => {
    const orderId = button.dataset.makeSewingAvailable;
    if (!orderId) {
      window.factoryUI.toast("تعذر تحديد أمر القص.", "error");
      return;
    }
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("transition_factory_sewing_stage", {
        requested_order_id: orderId,
        requested_action: "make_available"
      });
      if (error?.code === "PGRST202") {
        throw new Error("دالة انتقال مراحل الخياطة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      }
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("أصبحت القصّة متاحة لمشرف الخياطة، ولم يبدأ تنفيذها بعد.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر إتاحة القصّة للخياطة", error);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }));
}

function productionColorsFromForm(form) {
  return workerProductionColorsFromForm(form);
}

function bindWorkerProductionActions(session) {
  if (!session.canSubmitProduction) return;
  document.querySelectorAll("[data-worker-production-form]").forEach((form) => {
    bindPickers(form);
    bindWorkerProductionAllocation(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const modelName = String(form.elements.modelName.value).trim();
      const colors = productionColorsFromForm(form);
      const modelNumber = String(form.elements.modelNumber.value).trim();
      const countInputs = [...form.querySelectorAll("[data-worker-production-count]")];
      const selectedSizes = Object.keys(workerProductionSelectedSizeData(form).counts);
      const quantity = workerProductionTotalFromForm(form);
      form.elements.quantity.value = String(quantity);
      if (!modelName && !modelNumber) {
        window.factoryUI.toast("أدخل اسم الموديل أو رقمه على الأقل.", "error");
        form.elements.modelName.focus();
        return;
      }
      if (modelName.length > 160 || modelNumber.length > 120) {
        window.factoryUI.toast("تحقق من طول اسم الموديل (160 حرفاً) ورقمه (120 حرفاً) كحد أقصى.", "error");
        (modelName.length > 160 ? form.elements.modelName : form.elements.modelNumber).focus();
        return;
      }
      const imageFile = form.elements.modelImage.files?.[0];
      if (!imageFile) {
        window.factoryUI.toast("أرفق صورة الموديل قبل إرسال التسليم.", "error");
        form.elements.modelImage.focus();
        return;
      }
      if (!colors.length || !selectedSizes.length || countInputs.length !== colors.length * selectedSizes.length) {
        window.factoryUI.toast("اختر لوناً واحداً ومقاساً واحداً على الأقل قبل إدخال التوزيع.", "error");
        return;
      }
      if (!workerProductionCountsAreValid(form) || countInputs.some((input) => !input.value || Number(input.value) < 1)) {
        window.factoryUI.toast("أدخل عدداً صحيحاً موجباً لكل لون ومقاس.", "error");
        const invalidCount = countInputs.find((input) => input.value !== "" && (
          !Number.isSafeInteger(Number(input.value))
          || Number(input.value) < 1
          || Number(input.value) > 2147483647
        ));
        (invalidCount || countInputs.find((input) => !input.value))?.focus();
        return;
      }
      if (quantity < 1 || quantity > 2147483647
        || colors.some((entry) => !Object.keys(entry.sizes).length
          || !Object.values(entry.sizes).every((count) => Number.isSafeInteger(count) && count > 0))) {
        window.factoryUI.toast("أدخل عدداً موجباً واحداً على الأقل لكل لون؛ يُحسب الإجمالي تلقائياً من التوزيع.", "error");
        return;
      }
      button.disabled = true;
      let imagePath = null;
      let submissionSaved = false;
      try {
        imagePath = await uploadWorkerProductionImage(session.accountId, imageFile);
        const { error } = await supabaseClient.from("factory_worker_production_submissions").insert({
          worker_id: session.accountId,
          worker_name: session.fullName,
          job_title: session.jobTitle || "غير محدد",
          model_name: modelName || modelNumber,
          model_number: modelNumber,
          quantity,
          colors,
          image_path: imagePath,
          notes: "",
          parent_submission_id: form.dataset.parentSubmission || null
        });
        if (error) throw error;
        submissionSaved = true;
        form.reset();
        setColorPicker(form.querySelector("[data-color-picker]"), "");
        const sizePicker = form.querySelector("[data-size-picker]");
        sizePicker.querySelectorAll("[data-size-toggle]").forEach((toggle) => {
          toggle.setAttribute("aria-pressed", "false");
          toggle.closest(".size-choice").classList.remove("active");
        });
        updateSizePicker(sizePicker);
        renderWorkerProductionAllocation(form);
        await refreshDashboard(session);
        window.factoryUI.toast(form.dataset.parentSubmission
          ? "تم إرسال التسليم التابع كدفعة جديدة مرتبطة بالتسليم السابق."
          : "تم إرسال التسليم للإدارة للمراجعة.");
      } catch (error) {
        if (imagePath && !submissionSaved) {
          const { error: cleanupError } = await supabaseClient.storage.from("factory-model-images").remove([imagePath]);
          if (cleanupError) console.warn("تعذر حذف صورة تسليم العامل بعد فشل الحفظ.", cleanupError);
        }
        reportDashboardFailure(session, submissionSaved
          ? "تم إرسال التسليم، لكن تعذر تحديث البيانات"
          : "تعذر إرسال تسليم الإنتاج", error);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function bindWorkerProductionReview(session) {
  document.querySelectorAll("[data-worker-submission]").forEach((form) => {
    bindPickers(form);
    bindWorkerProductionAllocation(form);
    const customerSelect = form.elements.customerId;
    const orderSelect = form.elements.orderId;
    customerSelect.addEventListener("change", () => {
      [...orderSelect.options].forEach((option) => {
        if (!option.value) return;
        option.hidden = option.dataset.customer !== customerSelect.value;
        if (option.selected && option.hidden) orderSelect.value = "";
      });
    });
    customerSelect.dispatchEvent(new Event("change"));
  });
  document.querySelectorAll("[data-save-production-submission]").forEach((button) => button.addEventListener("click", async () => {
    const form = button.closest("[data-worker-submission]");
    if (!form) return;
    const quantity = Number(form.elements.quantity.value);
    const modelName = String(form.elements.modelName.value).trim();
    const colors = productionColorsFromForm(form);
    const modelNumber = String(form.elements.modelNumber.value).trim();
    const hasDistribution = colors.some((entry) => Object.keys(entry.sizes).length);
    const colorsToSave = hasDistribution
      ? colors
      : colors.map(({ sizes, ...entry }) => entry);
    if (!modelName || modelNumber.length > 120 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647
      || (hasDistribution && (colors.some((entry) => !Object.keys(entry.sizes).length)
        || workerProductionTotalFromForm(form) !== quantity
        || !workerProductionCountsAreValid(form)))) {
      window.factoryUI.toast("تحقق من بيانات الموديل والكمية وتوزيع الألوان والمقاسات قبل الحفظ.", "error");
      return;
    }
    button.disabled = true;
    try {
      const { data, error } = await supabaseClient.from("factory_worker_production_submissions")
        .update({ model_name: modelName, model_number: modelNumber, quantity, colors: colorsToSave, notes: String(form.elements.notes.value).trim(), updated_at: new Date().toISOString() })
        .eq("id", form.dataset.workerSubmission)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم تعد هذه التسليمة بانتظار المراجعة.");
      await refreshDashboard(session);
      window.factoryUI.toast("تم حفظ تعديلات التسليمة.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حفظ تعديلات التسليمة", error);
    }
  }));
  document.querySelectorAll("[data-confirm-production-submission]").forEach((button) => button.addEventListener("click", async () => {
    const form = button.closest("[data-worker-submission]");
    if (!form) return;
    const modelName = String(form.elements.modelName.value).trim();
    const modelNumber = String(form.elements.modelNumber.value).trim();
    const quantity = Number(form.elements.quantity.value);
    const customerId = form.elements.customerId.value;
    const orderId = form.elements.orderId.value || null;
    const colors = productionColorsFromForm(form);
    const hasDistribution = colors.some((entry) => Object.keys(entry.sizes).length);
    if (!modelName || modelNumber.length > 120 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647 || !customerId
      || !hasDistribution
      || colors.some((entry) => !Object.keys(entry.sizes).length)
      || workerProductionTotalFromForm(form) !== quantity
      || !workerProductionCountsAreValid(form)) {
      window.factoryUI.toast("أدخل الموديل والكمية، وأكمل توزيع الألوان والمقاسات، واختر العميل قبل التأكيد.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "تأكيد واستلام الإنتاج النهائي",
      message: `سيُضاف ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(quantity)} قطعة من «${modelName}» إلى مخزون العميل المختار.`,
      confirmLabel: "تأكيد واستلام"
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("confirm_factory_worker_production", {
        requested_submission_id: form.dataset.workerSubmission,
        requested_model_name: modelName,
        requested_model_number: modelNumber,
        requested_quantity: quantity,
        requested_colors: colors,
        requested_customer_id: customerId,
        requested_order_id: orderId
      });
      if (error?.code === "PGRST202") throw new Error("دالة اعتماد تسليمات العامل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم اعتماد الإنتاج وإضافته إلى مخزون حساب العميل.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر اعتماد تسليم الإنتاج", error);
    }
  }));
  document.querySelectorAll("[data-reject-production-submission]").forEach((button) => button.addEventListener("click", async () => {
    const submissionId = button.dataset.rejectProductionSubmission;
    if (!submissionId || !await window.factoryUI.confirmAction({
      title: "رفض تسليم الإنتاج",
      message: "سيُنقل الطلب إلى سجل التسليمات المرفوضة، ولن يضاف إلى مخزون العميل.",
      confirmLabel: "رفض الطلب"
    })) return;
    button.disabled = true;
    try {
      const { data, error } = await supabaseClient.from("factory_worker_production_submissions")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", submissionId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يعد هذا الطلب بانتظار المراجعة.");
      await refreshDashboard(session);
      window.factoryUI.toast("تم رفض طلب التسليم.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر رفض طلب التسليم", error);
    }
  }));
  document.querySelectorAll("[data-delete-production-submission]").forEach((button) => button.addEventListener("click", async () => {
    const submissionId = button.dataset.deleteProductionSubmission;
    if (!submissionId || !await window.factoryUI.confirmAction({
      title: "حذف تسليم الإنتاج",
      message: "سيُحذف هذا الطلب نهائياً. لا يمكن حذف تسليم معتمد أو تسليم أصلي له دفعات تابعة.",
      confirmLabel: "حذف الطلب"
    })) return;
    button.disabled = true;
    try {
      const { data, error } = await supabaseClient.from("factory_worker_production_submissions")
        .delete()
        .eq("id", submissionId)
        .in("status", ["pending", "rejected"])
        .select("id, image_path")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يُحذف الطلب: قد يكون معتمداً أو مرتبطاً بتسليم تابع.");
      let imageCleanupFailed = false;
      if (data.image_path) {
        const { error: imageError } = await supabaseClient.storage.from("factory-model-images").remove([data.image_path]);
        if (imageError) {
          imageCleanupFailed = true;
          console.warn("حُذف سجل التسليم لكن تعذر حذف صورته من التخزين.", imageError);
        }
      }
      await refreshDashboard(session);
      window.factoryUI.toast(imageCleanupFailed
        ? "تم حذف الطلب، لكن تعذر حذف الصورة من التخزين."
        : "تم حذف طلب التسليم.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف طلب التسليم", error);
    }
  }));
}

function bindWorkerPermissionActions(session) {
  document.querySelectorAll("[data-save-worker-permissions]").forEach((button) => button.addEventListener("click", async () => {
    const row = button.closest("[data-worker-permissions]");
    const jobTitle = row?.querySelector('[name="jobTitle"]').value;
    const canSubmitProduction = Boolean(row?.querySelector('[name="canSubmitProduction"]').checked);
    if (!row || !WORKER_JOB_TITLES.includes(jobTitle)) {
      window.factoryUI.toast("اختر مسمى وظيفياً صالحاً للعامل.", "error");
      return;
    }
    button.disabled = true;
    try {
      const { data, error } = await supabaseClient.from("users")
        .update({ job_title: jobTitle, can_submit_production: canSubmitProduction, updated_at: new Date().toISOString() })
        .eq("id", button.dataset.saveWorkerPermissions)
        .eq("role", "worker")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يتم العثور على حساب العامل.");
      await refreshDashboard(session);
      window.factoryUI.toast("تم تحديث مسمى العامل وصلاحيات تسليم الإنتاج.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر تحديث صلاحيات العامل", error);
    }
  }));
}

function bindClientModelRequestActions(session) {
  const form = document.querySelector("[data-client-model-request]");
  if (!form) return;
  const imageInput = form.elements.modelImage;
  let previewUrl = "";
  imageInput.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = imageInput.files[0];
    previewUrl = file ? URL.createObjectURL(file) : "";
    form.querySelector("[data-client-model-image-preview]").innerHTML = previewUrl
      ? `<img class="model-image-preview" src="${previewUrl}" alt="معاينة صورة الموديل">`
      : "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.saving === "true") return;
    const quantityValue = String(form.elements.quantity.value).trim();
    const quantity = quantityValue ? Number(quantityValue) : null;
    if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0)) {
      window.factoryUI.toast("أدخل عدداً صحيحاً موجباً أو اترك الحقل فارغاً.", "error");
      return;
    }
    const button = form.querySelector('[type="submit"]');
    const imageFile = imageInput.files[0] || null;
    let imagePath = null;
    let requestSaved = false;
    form.dataset.saving = "true";
    button.disabled = true;
    try {
      if (imageFile) imagePath = await uploadFactoryModelImage(`client-submissions/${session.accountId}`, imageFile);
      const { error } = await supabaseClient.rpc("submit_factory_client_model_request", {
        requested_model_name: String(form.elements.modelName.value).trim() || null,
        requested_model_number: String(form.elements.modelNumber.value).trim() || null,
        requested_quantity: quantity,
        requested_notes: String(form.elements.notes.value).trim(),
        requested_image_path: imagePath
      });
      if (error?.code === "PGRST202") {
        throw new Error("دالة إرسال قصة العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      }
      if (error) throw error;
      requestSaved = true;
      await refreshDashboard(session);
      window.factoryUI.toast("تم إرسال القصة / الموديل إلى الإدارة للمراجعة.");
    } catch (error) {
      if (imagePath && !requestSaved) {
        const { error: cleanupError } = await supabaseClient.storage.from("factory-model-images").remove([imagePath]);
        if (cleanupError) console.error("تعذر حذف صورة طلب العميل بعد فشل الحفظ.", cleanupError);
      }
      reportDashboardFailure(session, requestSaved
        ? "تم إرسال الطلب لكن تعذر تحديث الشاشة"
        : imagePath ? "رُفعت الصورة لكن تعذر حفظ طلب الموديل" : "تعذر إرسال طلب الموديل", error);
    } finally {
      form.dataset.saving = "false";
      button.disabled = false;
    }
  });
}

function bindModelImageLightbox() {
  if (modelImageLightboxBound) return;
  modelImageLightboxBound = true;
  let lastTrigger = null;
  const close = () => {
    const modal = document.querySelector("#model-image-lightbox");
    if (!modal) return;
    modal.hidden = true;
    modal.querySelector("img").removeAttribute("src");
    lastTrigger?.focus();
    lastTrigger = null;
  };
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-model-image-lightbox]");
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      const modal = document.querySelector("#model-image-lightbox");
      if (!modal) return;
      lastTrigger = trigger;
      const image = modal.querySelector("img");
      image.src = trigger.dataset.modelImageLightbox;
      image.alt = trigger.dataset.imageAlt || "صورة القطعة";
      modal.hidden = false;
      modal.querySelector("[data-close-model-image]").focus();
      return;
    }
    const modal = document.querySelector("#model-image-lightbox");
    if (event.target.closest("[data-close-model-image]") || event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#model-image-lightbox")?.hidden) close();
  });
}

function bindProductionDetailsModal(session) {
  if (productionDetailsModalBound) return;
  productionDetailsModalBound = true;
  let lastTrigger = null;
  const close = () => {
    const modal = document.querySelector("#production-details-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.querySelector("[data-production-details-content]").replaceChildren();
    lastTrigger?.focus();
    lastTrigger = null;
  };
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-production-details]");
    if (trigger) {
      let item;
      try {
        item = JSON.parse(decodeURIComponent(trigger.dataset.productionDetails));
      } catch (error) {
        reportDashboardFailure(session, "تعذر قراءة تفاصيل الإنتاج", error);
        return;
      }
      const renderDetails = {
        cutting: cuttingOrderDetailsMarkup,
        sewing: sewingOrderDetailsMarkup,
        "sewing-history": sewingHistoryDetailsMarkup,
        story: cuttingStoryDetailsMarkup
      }[trigger.dataset.productionDetailsKind];
      const modal = document.querySelector("#production-details-modal");
      if (!renderDetails || !modal) {
        reportDashboardFailure(session, "تعذر فتح تفاصيل الإنتاج", new Error("نوع تفاصيل الإنتاج غير معروف."));
        return;
      }
      lastTrigger = trigger;
      modal.querySelector("[data-production-details-content]").innerHTML = renderDetails(item);
      modal.hidden = false;
      modal.querySelector("[data-close-production-details]").focus();
      return;
    }
    const modal = document.querySelector("#production-details-modal");
    if (event.target.closest("[data-close-production-details]") || event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#production-details-modal")?.hidden) close();
  });
}

function bindActions(session) {
  bindModelImageLightbox();
  bindProductionDetailsModal(session);
  document.querySelectorAll("[data-register-tab]").forEach((button) => button.addEventListener("click", () => {
    activeRegisterTab = button.dataset.registerTab;
    updateRegisterTabs();
  }));
  document.querySelector("#logout").addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      reportDashboardFailure(session, "تعذر تسجيل الخروج", error);
      return;
    }
    window.location.replace("../index.html");
  });

  bindFabricEntryRows();
  bindIncomingFabricActions(session);
  bindCustomColorPickers();
  if (session.role === "client") bindClientModelRequestActions(session);
  if (session.role === "cutting") {
    bindPickers(document.querySelector("#app"));
    bindCuttingActions(session);
    return;
  }
  if (session.role === "sewing") {
    document.querySelectorAll("[data-sewing-dashboard-tab]").forEach((button) => button.addEventListener("click", () => {
      activeSewingDashboardTab = button.dataset.sewingDashboardTab;
      document.querySelectorAll("[data-sewing-dashboard-tab]").forEach((tab) => {
        const selected = tab.dataset.sewingDashboardTab === activeSewingDashboardTab;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });
      document.querySelectorAll("[data-sewing-dashboard-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.sewingDashboardPanel !== activeSewingDashboardTab;
      });
    }));
    bindSewingStageActions(session);
    return;
  }
  if (session.role === "worker") {
    bindWorkerProductionActions(session);
    return;
  }
  if (session.role !== "admin") return;
  bindModelExpenseActions(session);
  bindWorkforceActions(session);
  bindWorkerPermissionActions(session);
  bindWorkerProductionReview(session);
  bindPickers(document.querySelector("#app"));
  bindCuttingActions(session);
  document.querySelectorAll("[data-confirm-custom-color], [data-custom-color-trigger]").forEach((item) => {
    item.setAttribute("aria-haspopup", "dialog");
  });
  bindFabricAdminActions(session);
  bindSewingStageActions(session);
  document.querySelectorAll("[data-admin-cutting-tab]").forEach((button) => button.addEventListener("click", () => {
    activeAdminCuttingTab = button.dataset.adminCuttingTab;
    document.querySelectorAll("[data-admin-cutting-tab]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll("[data-admin-cutting-panel]").forEach((tabPanel) => {
      tabPanel.hidden = tabPanel.dataset.adminCuttingPanel !== activeAdminCuttingTab;
    });
  }));
  document.querySelectorAll("[data-pending-account-type]").forEach((select) => select.addEventListener("change", () => {
    const card = select.closest("[data-pending-account]");
    card.querySelectorAll("[data-pending-options]").forEach((section) => {
      section.hidden = section.dataset.pendingOptions !== select.value;
    });
  }));
  document.querySelectorAll("[data-orders-tab]").forEach((button) => button.addEventListener("click", () => {
    activeOrdersTab = button.dataset.ordersTab;
    document.querySelectorAll("[data-orders-tab]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll("[data-orders-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.ordersTabPanel !== activeOrdersTab;
    });
  }));
  document.querySelectorAll("[data-finance-tab]").forEach((button) => button.addEventListener("click", () => {
    activeFinanceTab = button.dataset.financeTab;
    document.querySelectorAll("[data-finance-tab]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll("[data-finance-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.financePanel !== activeFinanceTab;
    });
  }));
  const resetFactoryButton = document.querySelector("[data-reset-factory]");
  if (resetFactoryButton) {
    resetFactoryButton.addEventListener("click", async () => {
      const confirmed = await window.factoryUI.confirmAction({
        title: "مسح بيانات النظام والحسابات",
        message: "سيتم حذف جميع العملاء والموديلات والمخزون والحركات والسجلات وصور الموديلات وجميع حسابات الدخول الأخرى نهائياً. سيبقى حساب الأدمن الحالي فقط لتتمكن من استخدام النظام بعد المسح. لا يمكن التراجع عن هذا الإجراء.",
        confirmLabel: "مسح كل البيانات والحسابات",
        cancelLabel: "إلغاء",
        danger: true
      });
      if (!confirmed) return;
      resetFactoryButton.disabled = true;
      let resetApplied = false;
      let modelImagesCleared = false;
      try {
        const { error } = await supabaseClient.rpc("reset_factory_data");
        if (error?.code === "PGRST202") {
          throw new Error("دالة إعادة ضبط المصنع غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }

        if (error) throw error;
        resetApplied = true;
        await deleteFactoryModelImages();
        modelImagesCleared = true;
        await refreshDashboard(session);
        window.factoryUI.toast("تم مسح بيانات النظام وحسابات المستخدمين الأخرى. بقي حساب الأدمن الحالي.");
      } catch (error) {
        reportDashboardFailure(session, resetApplied
          ? modelImagesCleared
            ? "تمت إعادة الضبط، لكن تعذر تحديث الشاشة"
            : "تم مسح بيانات النظام، لكن تعذر حذف صور الموديلات"
          : "تعذر إعادة ضبط المصنع", error);
      } finally {
        resetFactoryButton.disabled = false;
      }
    });
  }
  const cashTransactionForm = document.querySelector("#cash-transaction-form");
  const resetCashTransactionForm = () => {
    cashTransactionForm.reset();
    cashTransactionForm.elements.transactionId.value = "";
    cashTransactionForm.elements.method.value = "نقدي";
    cashTransactionForm.elements.occurredAt.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    cashTransactionForm.querySelector('[type="submit"]').textContent = "حفظ الحركة النقدية";
    cashTransactionForm.querySelector("[data-cancel-cash-edit]").hidden = true;
  };
  cashTransactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = cashTransactionForm.querySelector('[type="submit"]');
    button.disabled = true;
    let saved = false;
    try {
      const occurredAt = new Date(cashTransactionForm.elements.occurredAt.value);
      if (Number.isNaN(occurredAt.getTime())) throw new Error("أدخل تاريخ ووقتًا صالحين.");
      const transactionId = cashTransactionForm.elements.transactionId.value;
      const args = {
        requested_direction: cashTransactionForm.elements.direction.value,
        requested_category: String(cashTransactionForm.elements.category.value).trim(),
        requested_description: String(cashTransactionForm.elements.description.value).trim(),
        requested_amount: Number(cashTransactionForm.elements.amount.value),
        requested_payment_method: String(cashTransactionForm.elements.method.value).trim(),
        requested_occurred_at: occurredAt.toISOString()
      };
      const { error } = transactionId
        ? await supabaseClient.rpc("update_factory_cash_transaction", {
          requested_transaction_id: transactionId,
          ...args
        })
        : await supabaseClient.rpc("save_factory_cash_transaction", {
          ...args,
          requested_customer_id: null
        });
      if (error?.code === "PGRST202") throw new Error("دالة سجل النقدية غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      saved = true;
      resetCashTransactionForm();
      await refreshDashboard(session);
      window.factoryUI.toast(transactionId ? "تم تعديل الحركة النقدية وتحديث السجل." : "تم تسجيل الحركة النقدية وتحديث رصيد السجل.");
    } catch (error) {
      reportDashboardFailure(session, saved
        ? "تم تسجيل الحركة، لكن تعذر تحديث الشاشة"
        : "تعذر تسجيل الحركة النقدية", error);
    } finally {
      button.disabled = false;
    }
  });
  cashTransactionForm.querySelector("[data-cancel-cash-edit]").addEventListener("click", resetCashTransactionForm);
  document.querySelectorAll("[data-edit-cash-transaction]").forEach((button) => button.addEventListener("click", () => {
    const transaction = dashboardData.cashTransactions.find((entry) => entry.id === button.dataset.editCashTransaction);
    if (!transaction) {
      window.factoryUI.toast("تعذر العثور على الحركة النقدية.", "error");
      return;
    }
    if (transaction.order_id) {
      window.factoryUI.toast("مصاريف التشغيل المرتبطة بالموديل تُعدّل من شاشة تعديل الطلبية.", "error");
      return;
    }
    const occurredAt = new Date(transaction.occurred_at);
    cashTransactionForm.elements.transactionId.value = transaction.id;
    cashTransactionForm.elements.direction.value = transaction.direction;
    cashTransactionForm.elements.category.value = transaction.category;
    cashTransactionForm.elements.description.value = transaction.description || "";
    cashTransactionForm.elements.amount.value = transaction.amount;
    cashTransactionForm.elements.method.value = transaction.payment_method || "غير محدد";
    cashTransactionForm.elements.occurredAt.value = new Date(occurredAt.getTime() - occurredAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    cashTransactionForm.querySelector('[type="submit"]').textContent = "حفظ تعديل الحركة";
    cashTransactionForm.querySelector("[data-cancel-cash-edit]").hidden = false;
    if (button.closest("#client-details")) {
      document.querySelector('[data-finance-tab="ledger"]')?.click();
      activateDashboardView("finance");
    }
    cashTransactionForm.scrollIntoView({ behavior: "smooth", block: "center" });
    cashTransactionForm.elements.category.focus({ preventScroll: true });
  }));
  document.querySelectorAll("[data-delete-cash-transaction]").forEach((button) => button.addEventListener("click", async () => {
    const transaction = dashboardData.cashTransactions.find((entry) => entry.id === button.dataset.deleteCashTransaction);
    if (!transaction) {
      window.factoryUI.toast("تعذر العثور على الحركة النقدية.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "حذف حركة نقدية",
      message: `سيتم حذف حركة ${transaction.direction === "income" ? "الإيراد" : "المصروف"} بقيمة ${money(transaction.amount)} نهائياً من السجل.`,
      confirmLabel: "حذف الحركة",
      danger: true
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("delete_factory_cash_transaction", {
        requested_transaction_id: transaction.id
      });
      if (error?.code === "PGRST202") throw new Error("دالة حذف الحركة النقدية غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم حذف الحركة النقدية وتحديث سجل الخزينة.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف الحركة النقدية", error);
    }
  }));
  document.querySelectorAll("#clients [data-quick-client-payment]").forEach((button) => {
    button.addEventListener("click", () => openClientPayment(button.dataset.quickClientPayment));
  });
  document.querySelectorAll("#clients [data-open-client-adjustment]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedClientId = button.dataset.openClientAdjustment;
      activeClientProfileTab = "overview";
      clientManagementTab = "profiles";
      render(session, dashboardData, dashboardData.pendingAccounts || []);
      activateDashboardView("client-details");
      document.querySelector("#client-details [data-open-account-adjustment]")?.click();
    });
  });
  document.querySelectorAll("[data-client-tab]").forEach((button) => button.addEventListener("click", () => {
    clientManagementTab = button.dataset.clientTab;
    document.querySelectorAll("[data-client-tab]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll("[data-client-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.clientPanel !== clientManagementTab;
    });
  }));
  const modelStatusFilter = document.querySelector("[data-filter-model-status]");
  modelStatusFilter.addEventListener("change", () => {
    document.querySelectorAll("[data-model-status-row]").forEach((row) => {
      row.hidden = Boolean(modelStatusFilter.value) && row.dataset.currentStatus !== modelStatusFilter.value;
    });
  });
  document.querySelectorAll("[data-save-model-status]").forEach((button) => button.addEventListener("click", async () => {
    const order = dashboardData.models.find((item) => item.id === button.dataset.saveModelStatus);
    const select = button.closest("[data-model-status-row]")?.querySelector("[data-model-status]");
    if (!order || !select) {
      window.factoryUI.toast("تعذر العثور على الموديل أو الحالة المحددة.", "error");
      return;
    }
    if (order.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status)) {
      window.factoryUI.toast("تم تسليم الموديل أو إغلاقه؛ لا يمكن تغيير حالته.", "error");
      return;
    }
    if (canonicalFactoryOrderStatus(select.value) === canonicalFactoryOrderStatus(order.status)) {
      window.factoryUI.toast("الحالة المحددة هي الحالة الحالية بالفعل.");
      return;
    }
    if (["في انتظار الخياطة", "جاري الخياطة", "تمت الخياطة"].includes(canonicalFactoryOrderStatus(select.value))) {
      window.factoryUI.toast("لا تغيّر حالة الخياطة يدوياً؛ استخدم أزرار نقل الطلب وبدء الخياطة وإنهائها.", "error");
      return;
    }
    button.disabled = true;
    try {
      const stageManagedStatuses = [
        "جاري التشطيب", "تم التشطيب", "جاري المكواة", "تم الكي",
        "جاري الطباعة", "تمت الطباعة", "جاري التكييس", "تم التكييس",
        "جاري الفرز", "تم الفرز", "جاهز للتسليم"
      ];
      if (stageManagedStatuses.includes(select.value)) {
        const { error } = await supabaseClient.rpc("admin_update_factory_order_stage_status", {
          requested_order_id: order.id,
          requested_status: select.value
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة تحديث حالة المراحل الإضافية غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
      } else {
        await persistFactoryOrder(order, { status: select.value });
      }
      activeOrdersTab = "status";
      await refreshDashboard(session);
      activateDashboardView("orders");
      window.factoryUI.toast(`تم تحديث حالة «${order.name}» يدوياً.`);
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر تحديث حالة الموديل", error);
    }
  }));
  const orderModal = document.querySelector("#order-modal");
  const modelDetailsModal = document.querySelector("#model-details-modal");
  const clientAccountModal = document.querySelector("#client-account-modal");
  document.body.append(orderModal);
  const editConfigs = {
    models: { form: "model-form", collection: "models", fields: ["customerId", "name", "clientModelCode", "colors", "sizes", "quantity", "productionType", "pricingMode", "expectedDeliveryDate", "pricePerPiece", "paidAmount", "operationalExpenses", "status", "priority"] },
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
    if (button.dataset.editKind === "models") {
      openOrderEditor(item);
      return;
    }
    const form = document.querySelector(`#${config.form}`);
    form.elements.editIndex.value = button.dataset.editKind === "payments" ? item._recordId : button.dataset.index;
    for (const field of config.fields) {
      form.elements[field].value = field === "quantity" && !item[field] ? "" : item[field];
    }
    form.querySelector('[type="submit"]').textContent = "حفظ التعديلات";
    form.querySelector("[data-cancel-edit]").hidden = false;
    activateDashboardView("finance");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.elements[config.fields[0]].focus();
  }));
  const orderForm = document.querySelector("#model-form");
  const updateOrderConditionalFields = () => {
    const isDelivered = orderForm.elements.status.value === "تم التسليم";
    const isEditing = Boolean(orderForm.elements.editIndex.value);
    const initialDeliveryField = orderForm.querySelector("[data-initial-delivery-field]");
    const showInitialDelivery = isDelivered && !isEditing;
    initialDeliveryField.hidden = !showInitialDelivery;
    orderForm.elements.deliveredPieces.required = false;
    orderForm.querySelector("[data-expected-delivery-field]").hidden = isDelivered;
    orderForm.querySelector("[data-model-priority-field]").hidden = isDelivered;
    if (!isEditing && !isDelivered) orderForm.elements.deliveredPieces.value = "";
  };
  const updateProductionPathFields = () => {
    const readySewing = orderForm.elements.productionType.value === "ready_sewing";
    const cuttingStage = orderForm.querySelector('[name="workStage"][value="cutting"]');
    orderForm.elements.productionType.disabled = Boolean(orderForm.elements.editIndex.value);
    cuttingStage.disabled = readySewing;
    if (readySewing) {
      cuttingStage.checked = false;
      if (!WORKFLOW_MANAGED_FACTORY_ORDER_STATUSES.includes(orderForm.elements.status.value)
          || orderForm.elements.status.value === "تم التسليم") {
        orderForm.elements.status.value = "في انتظار الخياطة";
      }
    } else {
      if (!cuttingStage.checked && !orderForm.elements.editIndex.value) cuttingStage.checked = true;
      if (WORKFLOW_MANAGED_FACTORY_ORDER_STATUSES.includes(orderForm.elements.status.value)
          && orderForm.elements.status.value !== "تم التسليم") {
        orderForm.elements.status.value = "قيد الانتظار";
      }
    }
    updateStagePricing(orderForm);
    updateOrderConditionalFields();
  };
  bindPickers(orderForm);
  orderForm.noValidate = true;
  orderForm.elements.customerSelection.addEventListener("change", () => {
    syncOrderCustomerSelection(orderForm, orderForm.elements.customerSelection.value, "customerSelection");
    updateOrderTotals();
  });
  orderForm.elements.brandSelection.addEventListener("change", () => {
    syncOrderCustomerSelection(orderForm, orderForm.elements.brandSelection.value, "brandSelection");
    updateOrderTotals();
  });
  orderForm.addEventListener("change", (event) => {
    if (event.target.matches('[name="workStage"]')) {
      updateStagePricing(orderForm);
      updateOrderTotals();
    } else if (event.target.matches('[name="pricingMode"]')) {
      updateStagePricing(orderForm);
      updateOrderTotals();
    } else if (event.target.matches('[name="status"]')) {
      updateOrderConditionalFields();
    } else if (event.target.matches('[name="productionType"]')) {
      updateProductionPathFields();
      updateOrderTotals();
    }
  });
  orderForm.addEventListener("input", (event) => {
    if (event.target.matches("[data-stage-price]")) {
      syncStagePriceInputs(orderForm);
      updateOrderTotals();
    }
  });
  const modelImageSlots = [
    { url: "", originalUrl: "", file: null, previewUrl: "" },
    { url: "", originalUrl: "", file: null, previewUrl: "" }
  ];
  const renderModelImageSlot = (index) => {
    const slotNumber = index + 1;
    const slot = modelImageSlots[index];
    const section = orderForm.querySelector(`[data-model-image-slot="${slotNumber}"]`);
    const imageUrl = slot.previewUrl || slot.url;
    section.querySelector(`[data-model-image-preview="${slotNumber}"]`).innerHTML = imageUrl
      ? modelImageMarkup(imageUrl, `معاينة الصورة ${slotNumber}`)
      : '<p class="muted">لا توجد صورة مضافة.</p>';
    section.querySelector(`[data-model-image-delete="${slotNumber}"]`).hidden = !imageUrl;
    section.querySelector(`[data-model-image-replace="${slotNumber}"]`).textContent = imageUrl
      ? "تبديل الصورة"
      : index === 0 ? "إضافة الصورة" : "إضافة الصورة الثانية";
  };
  const resetModelImageSlots = (urls = []) => {
    modelImageSlots.forEach((slot, index) => {
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      slot.url = urls[index] || "";
      slot.originalUrl = slot.url;
      slot.file = null;
      slot.previewUrl = "";
      orderForm.elements[`modelImage${index + 1}`].value = "";
      renderModelImageSlot(index);
    });
  };
  orderForm.querySelector("[data-model-image-slots]").addEventListener("click", (event) => {
    const replaceButton = event.target.closest("[data-model-image-replace]");
    if (replaceButton) {
      orderForm.elements[`modelImage${replaceButton.dataset.modelImageReplace}`].click();
      return;
    }
    const deleteButton = event.target.closest("[data-model-image-delete]");
    if (!deleteButton) return;
    const index = Number(deleteButton.dataset.modelImageDelete) - 1;
    const slot = modelImageSlots[index];
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    slot.url = "";
    slot.file = null;
    slot.previewUrl = "";
    orderForm.elements[`modelImage${index + 1}`].value = "";
    renderModelImageSlot(index);
  });
  modelImageSlots.forEach((slot, index) => {
    const input = orderForm.elements[`modelImage${index + 1}`];
    input.addEventListener("change", () => {
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      slot.file = input.files[0] || null;
      slot.previewUrl = slot.file ? URL.createObjectURL(slot.file) : "";
      renderModelImageSlot(index);
    });
  });
  const removeWorkflowStatusOptions = () => {
    orderForm.elements.status.querySelectorAll("[data-workflow-status-option]").forEach((option) => option.remove());
  };
  const closeOrderModal = () => {
    orderModal.hidden = true;
    removeWorkflowStatusOptions();
    orderForm.reset();
    updateProductionPathFields();
    const cuttingEditor = orderForm.parentElement.querySelector("[data-order-cutting-editor]");
    cuttingEditor.hidden = true;
    cuttingEditor.replaceChildren();
    orderForm.elements.editIndex.value = "";
    orderForm.elements.status.disabled = false;
    orderForm.elements.operationalExpenses.readOnly = false;
    orderForm.querySelector("[data-original-quantity-field]").hidden = true;
    updateOrderConditionalFields();
    updateStagePricing(orderForm);
    orderForm.querySelector("#model-price-history-note").hidden = true;
    orderForm.querySelector("[data-cutting-pricing-details]").innerHTML = '<p class="muted">تظهر تفاصيل القص والخامة هنا عند تسعير موديل مسجل.</p>';
    resetModelImageSlots();
    orderForm.querySelector('[type="submit"]').textContent = "حفظ الطلبية";
    orderForm.querySelector("[data-cancel-edit]").hidden = true;
    document.querySelector("#order-modal-title").textContent = "إضافة موديل / طلبية";
    updateOrderTotals();
  };
  const openOrderEditor = (order) => {
    const currentOrder = dashboardData.models.find((entry) => entry.id === order?.id);
    const orderIndex = currentOrder ? dashboardData.models.indexOf(currentOrder) : -1;
    if (!currentOrder || currentOrder.archivedAt) {
      window.factoryUI.toast("هذا الطلب غير متاح للتعديل.", "error");
      return;
    }
    resetModelImageSlots();
    removeWorkflowStatusOptions();
    orderForm.reset();
    if (![...orderForm.elements.status.options].some((option) => option.value === currentOrder.status)) {
      const option = new Option(currentOrder.status, currentOrder.status);
      option.dataset.workflowStatusOption = "";
      orderForm.elements.status.add(option);
    }
    orderForm.elements.savedOrderId.value = "";
    orderForm.elements.editIndex.value = String(orderIndex);
    const closedOrder = LOCKED_FACTORY_ORDER_STATUSES.includes(currentOrder.status);
    const workflowManagedOrder = isFactoryOrderWorkflowManaged(currentOrder);
    orderForm.querySelector("[data-original-quantity-field]").hidden = !closedOrder;
    orderForm.elements.originalQuantity.value = String(currentOrder.originalQuantity);
    orderForm.elements.status.disabled = closedOrder || workflowManagedOrder;
    orderForm.querySelector("[data-workflow-status-hint]").hidden = !workflowManagedOrder;
    orderForm.elements.operationalExpenses.readOnly = true;
    for (const field of ["customerId", "name", "clientModelCode", "pricePerPiece", "paidAmount", "operationalExpenses", "status", "priority", "productionType", "pricingMode", "expectedDeliveryDate"]) {
      orderForm.elements[field].value = currentOrder[field] ?? "";
    }
    orderForm.elements.factoryModelCode.value = currentOrder.factoryModelCode || "";
    syncOrderCustomerSelection(orderForm, currentOrder.customerId);
    orderForm.elements.stagePrices.value = JSON.stringify(currentOrder.stagePrices || {});
    orderForm.querySelectorAll('[name="workStage"]').forEach((input) => {
      input.checked = (currentOrder.workStages || []).includes(input.value);
    });
    updateProductionPathFields();
    updateStagePricing(orderForm);
    orderForm.elements.quantity.value = currentOrder.quantity || "";
    orderForm.elements.deliveredPieces.value = currentOrder.deliveredPieces;
    updateOrderConditionalFields();
    setSizePicker(orderForm.querySelector("[data-size-picker]"), cuttingSizePickerValue(currentOrder.sizes, currentOrder.colorPlyData));
    setColorPicker(orderForm.querySelector("[data-color-picker]"), currentOrder.colors, currentOrder.colorNames);
    renderModelAllocation(orderForm, currentOrder.colorSizeDistribution);
    orderForm.querySelector("[data-cutting-pricing-details]").innerHTML = cuttingDetailsMarkup(currentOrder);
    const cuttingEditor = orderForm.parentElement.querySelector("[data-order-cutting-editor]");
    if (currentOrder.cuttingStageStatus) {
      cuttingEditor.innerHTML = `<section class="form-section"><h3>تعديل بيانات القصة والخامات</h3>${adminCuttingEditFormMarkup(currentOrder, true, `admin-cutting-edit-order-${currentOrder.id}`)}</section>`;
      cuttingEditor.hidden = false;
    } else {
      cuttingEditor.hidden = true;
      cuttingEditor.replaceChildren();
    }
    resetModelImageSlots(currentOrder.modelImageUrls || [currentOrder.modelImageUrl]);
    orderForm.querySelector("#model-price-history-note").hidden = currentOrder.deliveredPieces <= 0;
    orderForm.querySelector('[type="submit"]').textContent = "حفظ التعديلات";
    orderForm.querySelector("[data-cancel-edit]").hidden = false;
    document.querySelector("#order-modal-title").textContent = "تعديل بيانات الموديل";
    updateOrderTotals();
    orderModal.hidden = false;
    orderForm.elements.pricePerPiece.focus();
  };
  document.querySelector("#app").addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-model-view]") || event.target === modelDetailsModal) {
      modelDetailsModal.hidden = true;
      return;
    }
    if (event.target.closest("[data-close-client-view]") || event.target === clientAccountModal) {
      clientAccountModal.hidden = true;
      return;
    }
    if (event.target.closest("[data-print-model-details]")) {
      const order = dashboardData.models.find((item) => item.id === modelDetailsModal.dataset.orderId);
      if (!order) {
        window.factoryUI.toast("تعذر العثور على الموديل للطباعة.", "error");
        return;
      }
      printDocument("فاتورة موديل", modelPrintMarkup(order));
      return;
    }
    const saveDeliveryQuantityButton = event.target.closest("[data-save-delivery-quantity]");
    if (saveDeliveryQuantityButton) {
      const orderId = modelDetailsModal.dataset.orderId;
      const deliveryId = saveDeliveryQuantityButton.dataset.saveDeliveryQuantity;
      const input = modelDetailsModal.querySelector(`[data-edit-delivery-quantity="${CSS.escape(deliveryId)}"]`);
      const quantity = Number(input?.value);
      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        window.factoryUI.toast("أدخل كمية صحيحة غير سالبة لدفعة التسليم.", "error");
        return;
      }
      saveDeliveryQuantityButton.disabled = true;
      try {
        const { error } = await supabaseClient.rpc("admin_update_factory_delivery_quantity", {
          requested_order_id: orderId,
          requested_delivery_id: deliveryId,
          requested_quantity: quantity
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة تعديل دفعة التسليم غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
        await refreshDashboard(session);
        window.factoryUI.toast(quantity === 0
          ? "تم حذف دفعة التسليم وإعادة احتساب إجمالي المسلّم وحساب العميل."
          : "تم تعديل كمية الدفعة وتحديث إجمالي المسلّم وحساب العميل.");
      } catch (error) {
        saveDeliveryQuantityButton.disabled = false;
        reportDashboardFailure(session, "تعذر تعديل كمية الدفعة", error);
      }
      return;
    }
    const modelEditButton = event.target.closest("[data-edit-model-from-details]");
    if (modelEditButton) {
      const order = dashboardData.models.find((item) => item.id === modelDetailsModal.dataset.orderId);
      modelDetailsModal.hidden = true;
      if (session.role === "admin" && order) openOrderEditor(order);
      return;
    }
    if (event.target.closest("[data-open-final-handover]")) {
      const order = dashboardData.models.find((item) => item.id === modelDetailsModal.dataset.orderId);
      openFinalHandover(order);
      return;
    }
    const previewButton = event.target.closest("[data-open-model-id]");
    if (previewButton) {
      const order = dashboardData.models.find((item) => item.id === previewButton.dataset.openModelId);
      if (!order) {
        window.factoryUI.toast("تعذر العثور على الموديل.", "error");
        return;
      }
      modelDetailsModal.dataset.orderId = order.id;
      modelDetailsModal.querySelector("#model-details-modal-content").innerHTML = modelDetailsModalView(order, session.role === "admin");
      modelDetailsModal.querySelector("[data-edit-model-from-details]").hidden = session.role !== "admin"
        || Boolean(order.archivedAt);
      const deleteButton = modelDetailsModal.querySelector("[data-action='delete-order']");
      deleteButton.dataset.orderId = order.id;
      deleteButton.hidden = session.role !== "admin" || !orderCanBeDeleted(order);
      if (previewButton.closest("#client-account-modal")) clientAccountModal.hidden = true;
      modelDetailsModal.hidden = false;
      return;
    }
    const clientDetailsButton = event.target.closest("[data-open-client-details]");
    if (clientDetailsButton) {
      const client = dashboardData.clients.find((item) => item.id === clientDetailsButton.dataset.openClientDetails);
      if (!client) {
        window.factoryUI.toast("تعذر العثور على ملف العميل.", "error");
        return;
      }
      clientAccountModal.querySelector("#client-account-modal-content").innerHTML = clientQuickDetailsModalView(client, dashboardData);
      const quickPayment = clientAccountModal.querySelector("[data-quick-client-payment]");
      quickPayment.addEventListener("click", () => {
        clientAccountModal.hidden = true;
        document.querySelector(`#clients [data-quick-client-payment="${CSS.escape(client.id)}"]`)?.click();
      });
      const editButton = clientAccountModal.querySelector("[data-edit-customer]");
      editButton.addEventListener("click", () => {
        clientAccountModal.hidden = true;
        document.querySelector(`#clients [data-edit-customer="${CSS.escape(client.id)}"]`)?.click();
      });
      clientAccountModal.hidden = false;
      return;
    }
    const openClientProfileButton = event.target.closest("[data-open-client-profile]");
    if (openClientProfileButton) {
      selectedClientId = openClientProfileButton.dataset.openClientProfile;
      activeClientProfileTab = "overview";
      clientManagementTab = "profiles";
      clientAccountModal.hidden = true;
      render(session, dashboardData, dashboardData.pendingAccounts || []);
      activateDashboardView("client-details");
      return;
    }
  });
  for (const modal of [modelDetailsModal, clientAccountModal]) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  }
  document.querySelector("[data-open-order-modal]").addEventListener("click", () => {
    closeOrderModal();
    orderForm.querySelector("[data-cutting-pricing-details]").innerHTML = '<p class="muted">تظهر تفاصيل القص والخامة هنا عند تسعير موديل مسجل.</p>';
    updateOrderConditionalFields();
    orderModal.hidden = false;
    orderForm.elements.customerSelection.focus();
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
      brand_name: String(formData.get("brandName")).trim(),
      code_letter: String(formData.get("codeLetter")).trim().toUpperCase(),
      client_number: String(formData.get("clientNumber")).trim(),
      phone: String(formData.get("phone")).trim(),
      cash_phone: String(formData.get("cashPhone")).trim(),
      instagram: String(formData.get("instagram")).trim(),
      whatsapp: String(formData.get("whatsapp")).trim(),
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
      reportDashboardFailure(session, "تعذر حفظ ملف العميل", error);
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
    form.elements.brandName.value = client.brand_name || "";
    form.elements.codeLetter.value = client.code_letter || "";
    form.elements.clientNumber.value = client.client_number || "";
    form.elements.phone.value = client.phone;
    form.elements.cashPhone.value = client.cash_phone || "";
    form.elements.instagram.value = client.instagram || "";
    form.elements.whatsapp.value = client.whatsapp || "";
    form.elements.notes.value = client.notes;
    form.querySelector('[type="submit"]').textContent = "حفظ تعديلات العميل";
    document.querySelector("#client-modal-title").textContent = "تعديل بيانات العميل";
    document.querySelector("#client-modal").hidden = false;
    clientManagementTab = "profiles";
    document.querySelector('[data-client-tab="profiles"]').click();
    activateDashboardView("clients");
    form.elements.name.focus();
  }));
  document.querySelectorAll("[data-delete-customer]").forEach((button) => button.addEventListener("click", async () => {
    const client = dashboardData.clients.find((entry) => entry.id === button.dataset.deleteCustomer);
    if (!client) {
      window.factoryUI.toast("تعذر العثور على ملف العميل.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "حذف ملف العميل",
      message: `سيتم حذف ملف ${client.name} نهائيًا إذا لم يكن مرتبطًا بحساب دخول أو طلبات أو حركات مالية أو مخزون. ستبقى السجلات المرتبطة محمية.`,
      confirmLabel: "حذف العميل",
      danger: true
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("delete_factory_client", {
        requested_client_id: client.id
      });
      if (error?.code === "PGRST202") {
        throw new Error("دالة حذف ملف العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      }
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم حذف ملف العميل.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف ملف العميل", error);
    }
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
  const deliveryModalTitle = document.querySelector("#delivery-modal-title");
  const deliveryModalDescription = document.querySelector("#delivery-modal-description");
  const deliveryQuantityLabel = document.querySelector("#delivery-quantity-label");
  const deliverySubmitButton = deliveryForm.querySelector('[type="submit"]');
  const deliveryRecipientInput = deliveryForm.elements.recipientName;
  const settlementChoice = deliveryForm.elements.settlementChoice;
  const settlementChoiceFields = deliveryForm.querySelectorAll("[data-settlement-choice-field]");
  let deliverySubmissionPending = false;
  const applySettlementChoice = () => {
    const order = dashboardData.models.find((item) => item.id === deliveryForm.elements.orderId.value);
    if (!order) return;
    const hasEarlierDeliveries = Boolean(order.deliveryHistory?.length || order.deliveredPieces > 0);
    if (hasEarlierDeliveries) {
      deliveryForm.elements.quantity.value = settlementChoice.value === "deliver-remainder" ? String(order.remainingPieces) : "0";
      deliveryForm.elements.quantity.readOnly = true;
      return;
    }
    deliveryForm.elements.quantity.readOnly = settlementChoice.value === "full";
    deliveryForm.elements.quantity.value = settlementChoice.value === "full" ? String(order.quantity) : "1";
  };
  const updateDeliveryRecipientRequirement = () => {
    const isFinalHandover = deliveryForm.elements.finalize.value === "true";
    const quantity = Number(deliveryForm.elements.quantity.value);
    deliveryRecipientInput.required = !isFinalHandover || quantity > 0;
  };
  const openFinalHandover = (order) => {
    if (!order || order.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status)) {
      window.factoryUI.toast("هذا الطلب مغلق أو غير متاح للتسوية.", "error");
      return;
    }
    if (!order.quantity) {
      window.factoryUI.toast("سجّل العدد الفعلي بعد الفرش والقص قبل التسوية.", "error");
      return;
    }
    const hasEarlierDeliveries = Boolean(order.deliveryHistory?.length || order.deliveredPieces > 0);
    deliveryForm.elements.orderId.value = order.id;
    deliveryForm.elements.finalize.value = "true";
    deliveryForm.elements.quantity.min = hasEarlierDeliveries && order.remainingPieces === 0 ? "0" : "1";
    deliveryForm.elements.quantity.max = hasEarlierDeliveries ? String(order.remainingPieces) : String(order.quantity);
    deliveryModalTitle.textContent = "تسوية وإغلاق الطلب";
    settlementChoiceFields.forEach((field) => { field.hidden = false; });
    if (hasEarlierDeliveries) {
      settlementChoice.innerHTML = order.remainingPieces > 0
        ? `<option value="deliver-remainder">تسليم جميع القطع المتبقية (${order.remainingPieces} قطعة) ثم الإغلاق</option>`
        : `<option value="close-current">اكتمل تسليم جميع القطع (${order.deliveredPieces} قطعة)</option>`;
      settlementChoice.value = order.remainingPieces > 0 ? "deliver-remainder" : "close-current";
      deliveryModalDescription.textContent = order.remainingPieces > 0
        ? `سبق تسجيل ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.deliveredPieces)} قطعة. يجب تسليم جميع القطع المتبقية قبل إغلاق الطلب.`
        : `تم تسجيل تسليم كامل العدد (${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.deliveredPieces)} قطعة). يمكنك الآن إغلاق الطلب.`;
      deliveryQuantityLabel.textContent = "كمية الدفعة الأخيرة";
      deliverySubmitButton.textContent = "تسوية وإغلاق الطلب";
    } else {
      settlementChoice.innerHTML = `<option value="full">تسليم كامل العدد (${order.quantity} قطعة)</option>`;
      settlementChoice.value = "full";
      deliveryModalDescription.textContent = `لم تُسجل دفعات سابقة. يجب تسجيل استلام كامل العدد (${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة) قبل إغلاق الطلب.`;
      deliveryQuantityLabel.textContent = "كمية التسليم";
      deliverySubmitButton.textContent = "تسليم وإغلاق الطلب";
    }
    deliveryRecipientInput.value = "";
    applySettlementChoice();
    updateDeliveryRecipientRequirement();
    deliveryModal.hidden = false;
    deliveryForm.elements.quantity.focus();
  };
  const closeDeliveryModal = (force = false) => {
    if (deliverySubmissionPending && !force) return;
    deliveryModal.hidden = true;
    deliveryForm.reset();
    deliveryForm.elements.quantity.min = "1";
    deliveryForm.elements.quantity.max = "";
    deliveryForm.elements.quantity.readOnly = false;
    settlementChoiceFields.forEach((field) => { field.hidden = true; });
    deliveryRecipientInput.required = true;
    deliveryModalTitle.textContent = "تسجيل تسليم جديد";
    deliveryModalDescription.textContent = "أدخل كمية هذه الدفعة واسم مستلمها؛ ستُضاف إلى إجمالي ما تم تسليمه حتى الآن.";
    deliveryQuantityLabel.textContent = "كمية التسليم";
    deliverySubmitButton.textContent = "تسجيل التسليم";
  };
  document.querySelectorAll("[data-close-delivery]").forEach((button) => button.addEventListener("click", closeDeliveryModal));
  deliveryModal.addEventListener("click", (event) => {
    if (event.target === deliveryModal) closeDeliveryModal();
  });
  deliveryForm.elements.quantity.addEventListener("input", updateDeliveryRecipientRequirement);
  settlementChoice.addEventListener("change", () => {
    applySettlementChoice();
    updateDeliveryRecipientRequirement();
  });
  deliveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deliverySubmissionPending) return;
    const order = dashboardData.models.find((item) => item.id === deliveryForm.elements.orderId.value);
    const quantity = Number(deliveryForm.elements.quantity.value);
    const finalize = deliveryForm.elements.finalize.value === "true";
    const recipientName = String(deliveryRecipientInput.value).trim();
    if (!order || order.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status)) {
      window.factoryUI.toast("هذا الطلب مغلق أو غير متاح للتسليم.", "error");
      closeDeliveryModal();
      return;
    }
    if (!Number.isSafeInteger(quantity) || (finalize ? quantity < 0 : quantity <= 0)) {
      window.factoryUI.toast(finalize ? "أدخل كمية دفعة أخيرة صحيحة (صفر أو أكثر)." : "اختر طلبية وأدخل كمية تسليم صحيحة.", "error");
      return;
    }
    if (!order.quantity) {
      window.factoryUI.toast("سجّل العدد الفعلي بعد الفرش والقص قبل إدخال التسليمات.", "error");
      return;
    }
    if (finalize) {
      const hasEarlierDeliveries = Boolean(order.deliveryHistory?.length || order.deliveredPieces > 0);
      const validFinalQuantity = hasEarlierDeliveries
        ? quantity === order.remainingPieces
        : quantity === order.quantity;
      if (!validFinalQuantity) {
        window.factoryUI.toast(hasEarlierDeliveries
          ? "لا يمكن إغلاق الطلب قبل تسليم جميع القطع المتبقية."
          : "لا يمكن إغلاق الطلب إلا بعد تسجيل تسليم كامل العدد.", "error");
        return;
      }
    } else if (quantity > order.remainingPieces) {
      window.factoryUI.toast("كمية التسليم تتجاوز المتبقي من الطلب.", "error");
      return;
    }
    if ((!finalize || quantity > 0) && !recipientName) {
      window.factoryUI.toast("أدخل اسم المستلم للتسليم.", "error");
      deliveryRecipientInput.focus();
      return;
    }
    deliverySubmissionPending = true;
    const submitButton = deliverySubmitButton;
    submitButton.disabled = true;
    deliveryModal.querySelectorAll("[data-close-delivery]").forEach((button) => { button.disabled = true; });
    let deliverySaved = false;
    try {
      if (finalize && !await window.factoryUI.confirmAction({
        title: "تأكيد إنهاء التسليم",
        message: `${quantity > 0 ? `ستضاف دفعة ${quantity} قطعة، ليصبح إجمالي المسلّم ${order.deliveredPieces + quantity} قطعة. ` : "سيُغلق الطلب على إجمالي الكمية المسلّمة حالياً. "}سيُقفل الطلب أمام التسليمات الجديدة، مع إتاحة تعديل الإدارة.`,
        confirmLabel: "إنهاء التسليم وإغلاق الطلب"
      })) return;

      const currentOrder = dashboardData.models.find((item) => item.id === order.id);
      if (!currentOrder || currentOrder.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(currentOrder.status)) {
        window.factoryUI.toast("تم إغلاق الطلب أو تغييره قبل تنفيذ التسليم. حدّث البيانات وحاول مجددًا.", "error");
        closeDeliveryModal(true);
        return;
      }

      const { error } = finalize
        ? await supabaseClient.rpc("complete_factory_handover", {
          requested_order_id: order.id,
          requested_final_batch_qty: quantity,
          requested_recipient_name: recipientName
        })
        : await supabaseClient.rpc("record_factory_delivery", {
          requested_order_id: order.id,
          requested_quantity: quantity,
          requested_recipient_name: recipientName
        });
      if (error?.code === "PGRST202") {
        throw new Error(finalize
          ? "دالة إنهاء التسليم غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor."
          : "دالة تسجيل التسليم غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      }
      if (error) throw error;
      deliverySaved = true;
      closeDeliveryModal(true);
      await refreshDashboard(session);
      window.factoryUI.toast(finalize
        ? "تم إنهاء التسليم وتسوية حساب الطلب."
        : "تم تسجيل التسليم وإضافته إلى إجمالي الكمية المسلّمة.");
    } catch (error) {
      reportDashboardFailure(session, deliverySaved
        ? `تم ${finalize ? "إنهاء التسليم" : "تسجيل التسليم"}، لكن تعذر تحديث البيانات المعروضة`
        : `تعذر ${finalize ? "إنهاء التسليم" : "تسجيل التسليم"}`, error);
    } finally {
      deliverySubmissionPending = false;
      submitButton.disabled = false;
      deliveryModal.querySelectorAll("[data-close-delivery]").forEach((button) => { button.disabled = false; });
    }
  });
  const updateOrderTotals = () => {
    if (!orderForm) return;
    const quantity = Number(orderForm.elements.quantity.value || sizePickerTotal(orderForm) || 0);
    const price = Number(orderForm.elements.pricePerPiece.value || 0);
    const paid = Number(orderForm.elements.paidAmount.value || 0);
    const operationalExpenses = Number(orderForm.elements.operationalExpenses.value || 0);
    const expectedTotal = roundMoney(quantity * price + operationalExpenses);
    const formatAmount = (value) => `${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 2 }).format(value)} ج.م`;
    orderForm.elements.paidAmount.removeAttribute("max");
    orderForm.querySelector("#model-expected-total").textContent = formatAmount(expectedTotal);
    orderForm.querySelector("#model-remaining").textContent = formatAmount(subtractMoney(expectedTotal, paid));
    const selectedClient = dashboardData.clients.find((client) => client.id === orderForm.elements.customerId.value);
    const preview = orderForm.querySelector("#client-balance-preview");
    if (!selectedClient) {
      preview.textContent = "اختر العميل";
    } else {
      const editIndex = orderForm.elements.editIndex.value;
      const existingOrder = editIndex ? dashboardData.models[Number(editIndex)] : null;
      const previousImpact = existingOrder
        ? subtractMoney(addMoney(existingOrder.totalAmount, existingOrder.expectedAmount), existingOrder.paidAmount)
        : 0;
      preview.textContent = formatAmount(
        addMoney(subtractMoney(clientAccountSummary(selectedClient, dashboardData).balance, previousImpact), subtractMoney(expectedTotal, paid))
      );
    }
  };
  document.querySelector("#client-details").addEventListener("click", (event) => {
    const newOrderButton = event.target.closest("[data-open-order-for-client]");
    if (newOrderButton) {
      removeWorkflowStatusOptions();
      orderForm.reset();
      resetModelImageSlots();
      orderForm.elements.editIndex.value = "";
      orderForm.elements.operationalExpenses.readOnly = false;
      orderForm.querySelector("[data-cutting-pricing-details]").innerHTML = '<p class="muted">تظهر تفاصيل القص والخامة هنا عند تسعير موديل مسجل.</p>';
      updateOrderConditionalFields();
      syncOrderCustomerSelection(orderForm, newOrderButton.dataset.openOrderForClient);
      updateStagePricing(orderForm);
      orderForm.querySelector("#model-price-history-note").hidden = true;
      orderForm.querySelector('[type="submit"]').textContent = "حفظ الطلبية";
      orderForm.querySelector("[data-cancel-edit]").hidden = true;
      document.querySelector("#order-modal-title").textContent = "إضافة موديل للعميل";
      updateOrderTotals();
      orderModal.hidden = false;
      orderForm.elements.name.focus();
      return;
    }
    const button = event.target.closest("[data-edit-client-order]");
    if (!button) return;
    const order = dashboardData.models.find((item) => item.id === button.dataset.editClientOrder);
    if (!order) {
      window.factoryUI.toast("تعذر العثور على الموديل المطلوب تعديله.", "error");
      return;
    }
    openOrderEditor(order);
  });
  orderForm.elements.quantity.addEventListener("input", () => {
    distributeModelQuantity(orderForm, true);
    updateOrderTotals();
  });
  ["pricePerPiece", "paidAmount", "operationalExpenses"].forEach((name) => orderForm.elements[name].addEventListener("input", updateOrderTotals));
  orderForm.addEventListener("input", (event) => {
    if (event.target.closest("[data-size-picker]")) {
      distributeModelQuantity(orderForm, !event.target.matches("[data-size-count]") && Number(orderForm.elements.quantity.value) > 0);
      updateOrderTotals();
    } else if (event.target.closest("[data-color-picker]")) {
      distributeModelQuantity(orderForm, Number(orderForm.elements.quantity.value) > 0);
      updateOrderTotals();
    }
  });
  orderForm.addEventListener("click", (event) => {
    if (event.target.closest("[data-size-toggle], [data-add-color], [data-remove-color]")) {
      distributeModelQuantity(orderForm, Number(orderForm.elements.quantity.value) > 0);
      updateOrderTotals();
    }
  });
  orderForm.addEventListener("change", (event) => {
    if (event.target.matches("[data-size-type]")) {
      distributeModelQuantity(orderForm, Number(orderForm.elements.quantity.value) > 0);
      updateOrderTotals();
    }
  });
  updateOrderTotals();
  document.querySelector("#model-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const invalidVisibleControl = [...form.elements].find((control) =>
      typeof control.checkValidity === "function"
      && control.willValidate
      && !control.disabled
      && !control.closest("[hidden]")
      && !control.checkValidity()
    );
    if (invalidVisibleControl) {
      invalidVisibleControl.reportValidity();
      return;
    }
    const formData = new FormData(form);
    const submitButton = form.querySelector('[type="submit"]');
    const editIndex = String(formData.get("editIndex") || "");
    const existingOrder = editIndex ? dashboardData.models[Number(editIndex)] : null;
    const quantityValue = String(formData.get("quantity")).trim();
    const sizeQuantity = sizePickerTotal(form);
    const quantity = quantityValue ? Number(quantityValue) : sizeQuantity;
    const deliveredPieces = Number(formData.get("deliveredPieces"));
    const currentStoredStatus = existingOrder?.storedStatus || existingOrder?.status || "";
    const isWorkflowManagedOrder = existingOrder && isFactoryOrderWorkflowManaged(existingOrder);
    const requestedStatus = String(formData.get("status") || currentStoredStatus);
    const statusForSave = existingOrder && (isWorkflowManagedOrder
      || canonicalFactoryOrderStatus(requestedStatus) === existingOrder.status)
      ? currentStoredStatus || requestedStatus
      : requestedStatus;
    const pricePerPiece = Number(formData.get("pricePerPiece"));
    const paidAmount = Number(formData.get("paidAmount"));
    const operationalExpenses = Number(formData.get("operationalExpenses") || 0);
    const modelName = String(formData.get("name")).trim();
    const customerId = String(formData.get("customerId"));
    const workStages = [...form.querySelectorAll('[name="workStage"]:checked')].map((input) => input.value);
    const productionType = String(formData.get("productionType") || existingOrder?.productionType || "full_cutting");
    const initialReadyStage = INITIAL_READY_STAGE_BY_STATUS[requestedStatus];
    const pricingMode = String(formData.get("pricingMode"));
    const stagePrices = JSON.parse(String(formData.get("stagePrices") || "{}"));
    const colors = String(formData.get("colors") || "").trim();
    const colorNames = parseColorNames(formData.get("colorNames"));
    const colorSizeDistribution = JSON.parse(String(formData.get("colorSizeDistribution") || '{"colors":[]}'));
    if (!modelName) {
      window.factoryUI.toast("أدخل اسم الموديل.", "error");
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(deliveredPieces) || deliveredPieces < 0) {
      window.factoryUI.toast("تحقق من إدخال أعداد صحيحة غير سالبة للكمية والتسليم.", "error");
      return;
    }
    if (!existingOrder && requestedStatus === "تم التسليم" && (quantity <= 0 || deliveredPieces <= 0)) {
      window.factoryUI.toast("أدخل العدد الكلي والعدد المسلّم لإضافة موديل بحالة تم التسليم.", "error");
      return;
    }
    const requestedOriginalQuantity = existingOrder && LOCKED_FACTORY_ORDER_STATUSES.includes(existingOrder.status)
      ? Number(form.elements.originalQuantity.value)
      : Number(existingOrder?.originalQuantity ?? quantity);
    if (!Number.isSafeInteger(requestedOriginalQuantity) || requestedOriginalQuantity < 0) {
      window.factoryUI.toast("أدخل العدد المطلوب الأصلي كعدد صحيح غير سالب.", "error");
      return;
    }
    if (!Number.isFinite(operationalExpenses) || operationalExpenses < 0 || operationalExpenses > 999999999999.99) {
      window.factoryUI.toast("أدخل مصاريف تشغيل إضافية صحيحة وغير سالبة.", "error");
      return;
    }
    if (!workStages.length) {
      window.factoryUI.toast("اختر قسماً واحداً على الأقل للموديل.", "error");
      return;
    }
    if (!existingOrder && initialReadyStage && productionType !== "ready_sewing") {
      window.factoryUI.toast("اختر مسار «موديل جاهز ومقصوص مسبقاً» للدخول مباشرة إلى مراحل التشغيل.", "error");
      return;
    }
    if (!existingOrder && productionType === "ready_sewing"
        && (!initialReadyStage || !workStages.includes(initialReadyStage) || workStages.includes("cutting"))) {
      window.factoryUI.toast("حدد حالة تشغيل مباشرة وقسماً مطابقاً لها، ولا تضف قسم القص للموديل الجاهز.", "error");
      return;
    }
    if (!["total", "stages"].includes(pricingMode)) {
      window.factoryUI.toast("اختر طريقة تسعير صالحة.", "error");
      return;
    }
    if (pricingMode === "stages" && workStages.some((stage) =>
      String(stagePrices[stage] ?? "").trim() === ""
      || !Number.isFinite(Number(stagePrices[stage]))
      || Number(stagePrices[stage]) < 0
    )) {
      window.factoryUI.toast("أدخل سعراً صالحاً لكل قسم مختار.", "error");
      return;
    }
    if (quantity === 0 && deliveredPieces > 0) {
      window.factoryUI.toast("أدخل العدد الفعلي بعد القص قبل تسجيل أي تسليم.", "error");
      return;
    }
    const unnamedColor = colors.split(",").map((color) => color.trim().toUpperCase())
      .find((color) => /^#[0-9A-F]{6}$/.test(color) && !colorNames[color]);
    if (unnamedColor) {
      window.factoryUI.toast(`أدخل اسم اللون ${unnamedColor} قبل حفظ الطلبية.`, "error");
      return;
    }
    const customer = dashboardData.clients.find((client) => client.id === customerId);
    if (!customer) {
      window.factoryUI.toast("اختر ملف عميل صالحًا للطلبية.", "error");
      return;
    }
    submitButton.disabled = true;
    let savedOrderId = "";
    try {
      const orderToSave = {
        ...existingOrder,
        id: existingOrder?.id || form.elements.savedOrderId.value || undefined,
        customerId,
        name: modelName,
        modelNumber: existingOrder?.modelNumber || "",
        clientModelCode: String(formData.get("clientModelCode") || "").trim(),
        quantity,
        originalQuantity: requestedOriginalQuantity,
        deliveredPieces,
        pricePerPiece,
        paidAmount,
        operationalExpenses,
        status: existingOrder && LOCKED_FACTORY_ORDER_STATUSES.includes(existingOrder.status)
          ? existingOrder.storedStatus || existingOrder.status
          : statusForSave,
        priority: String(formData.get("priority")),
        productionType,
        workStages,
        pricingMode,
        stagePrices: pricingMode === "stages" ? stagePrices : {},
        colors,
        colorNames,
        colorSizeDistribution,
        sizes: String(formData.get("sizes") || "").trim(),
        modelImageUrl: modelImageSlots[0].file ? modelImageSlots[0].originalUrl : modelImageSlots[0].url,
        modelImageUrl2: modelImageSlots[1].file ? modelImageSlots[1].originalUrl : modelImageSlots[1].url,
        expectedDeliveryDate: String(formData.get("expectedDeliveryDate") || "")
      };
      const previousImageUrls = modelImageSlots.map((slot) => slot.originalUrl);
      savedOrderId = await persistFactoryOrder(orderToSave);
      form.elements.savedOrderId.value = savedOrderId;
      const savedImageUrls = [orderToSave.modelImageUrl, orderToSave.modelImageUrl2];
      for (const [index, slot] of modelImageSlots.entries()) {
        if (slot.file) savedImageUrls[index] = await uploadModelImage(savedOrderId, slot.file);
      }
      if (savedImageUrls[0] !== orderToSave.modelImageUrl || savedImageUrls[1] !== orderToSave.modelImageUrl2) {
        await persistFactoryOrder({
          ...orderToSave,
          id: savedOrderId,
          modelImageUrl: savedImageUrls[0] || "",
          modelImageUrl2: savedImageUrls[1] || ""
        });
      }
      for (const [index, previousUrl] of previousImageUrls.entries()) {
        if (previousUrl && previousUrl !== savedImageUrls[index]) {
          await deleteOrderModelImage(previousUrl, savedOrderId);
        }
      }
      closeOrderModal();
      await refreshDashboard(session);
      window.factoryUI.toast(editIndex ? "تم تحديث أمر التشغيل بنجاح." : "تم حفظ أمر التشغيل بنجاح.");
    } catch (error) {
      let refreshError = "";
      if (savedOrderId) {
        try {
          await refreshDashboard(session);
        } catch (dashboardRefreshError) {
          console.error("تعذر تحديث العرض بعد حفظ الطلبية.", dashboardRefreshError);
          refreshError = session.role === "admin"
            ? ` كما تعذر تحديث العرض: ${dashboardRefreshError.message}`
            : " كما تعذر تحديث العرض.";
        }
      }
      reportDashboardFailure(session,
        savedOrderId ? `تم حفظ الطلبية لكن تعذر إكمال الصورة أو تحديث البيانات${refreshError}` : "تعذر حفظ أمر التشغيل",
        error);
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
      let refreshError = "";
      if (paymentSaved) {
        try {
          await refreshDashboard(session);
        } catch (dashboardRefreshError) {
          console.error("تعذر تحديث العرض بعد حفظ الدفعة.", dashboardRefreshError);
          if (session.role === "admin") refreshError = ` وتعذر تحديث العرض: ${dashboardRefreshError.message}`;
          else refreshError = " وتعذر تحديث العرض.";
        }
      }
      reportDashboardFailure(session, paymentSaved
        ? `تم حفظ الدفعة، لكن تعذر تحديث البيانات المعروضة${refreshError}`
        : "تعذر حفظ الدفعة", error);
    } finally {
      submitButton.disabled = false;
    }
  });
  document.querySelectorAll("[data-delete-payment]").forEach((button) => button.addEventListener("click", async () => {
    const payment = dashboardData.payments.find((entry) => entry._recordId === button.dataset.deletePayment);
    if (!payment) {
      window.factoryUI.toast("تعذر العثور على الدفعة.", "error");
      return;
    }
    if (!await window.factoryUI.confirmAction({
      title: "حذف دفعة مالية",
      message: `سيتم استبعاد دفعة ${money(payment.amount)} الخاصة بـ${payment.clientName || payment.client || "العميل"} من حساب العميل وإعادة احتساب رصيده، مع إبقاء أثرها المسجل في الخزنة دون إنشاء حركة صرف عكسية. لا يمكن حذف دفعات فترة تمت تصفيتها.`,
      confirmLabel: "حذف الدفعة",
      danger: true
    })) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("delete_factory_payment", {
        requested_record_id: payment._recordId
      });
      if (error?.code === "PGRST202") throw new Error("دالة حذف الدفعة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast("تم استبعاد الدفعة من حساب العميل مع الحفاظ على رصيد الخزنة.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف الدفعة", error);
    }
  }));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.action === "reject-cutting-story") {
      const storyId = button.dataset.storyId;
      const story = dashboardData.cuttingStories.find((entry) => entry.id === storyId);
      if (!story || story.status !== "pending") {
        window.factoryUI.toast("القصة لم تعد معلقة أو تعذر العثور عليها. حدّث الصفحة.", "error");
        return;
      }
      if (!await window.factoryUI.confirmAction({
        title: "رفض قصة القص",
        message: `سيتم رفض قصة «${story.model_name || story.model_number}» وإبقاؤها في سجل القص للرجوع إليها. لن تُضاف إلى الموديلات أو الخياطة.`,
        confirmLabel: "رفض القصة",
        danger: true
      })) return;
      button.disabled = true;
      let rejectionSaved = false;
      try {
        const { error } = await supabaseClient.rpc("admin_reject_factory_cutting_story", {
          requested_story_id: storyId
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة رفض قصة القص غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
        rejectionSaved = true;
        await refreshDashboard(session);
        window.factoryUI.toast("تم رفض القصة وحفظها في سجل القص.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, rejectionSaved
          ? "تم رفض القصة لكن تعذر تحديث اللوحة"
          : "تعذر رفض قصة القص", error);
      }
      return;
    }
    if (["approve-cutting-story-model", "approve-cutting-story-sewing"].includes(button.dataset.action)) {
      const storyId = button.dataset.storyId;
      const requestedAction = button.dataset.action === "approve-cutting-story-sewing" ? "send_to_sewing" : "add_to_models";
      const story = dashboardData.cuttingStories.find((entry) => entry.id === storyId);
      if (!story || story.status !== "pending") {
        window.factoryUI.toast("القصة لم تعد معلقة أو تعذر العثور عليها. حدّث الصفحة.", "error");
        return;
      }
      const sendsToSewing = requestedAction === "send_to_sewing";
      if (!await window.factoryUI.confirmAction({
        title: sendsToSewing ? "اعتماد القصة وإرسالها للخياطة" : "اعتماد القصة وإضافتها للموديلات",
        message: sendsToSewing
          ? `سيُنشأ الموديل الرسمي «${story.model_name || story.model_number}» وتصبح القصة متاحة لمشرف الخياطة. سيبقى سجل القص محفوظاً.`
          : `سيُنشأ الموديل الرسمي «${story.model_name || story.model_number}» دون إتاحته للخياطة الآن. سيبقى سجل القص محفوظاً.`,
        confirmLabel: sendsToSewing ? "تأكيد وإرسال للخياطة" : "تأكيد وإضافة للموديلات"
      })) return;
      button.disabled = true;
      let approvalSaved = false;
      try {
        const { error } = await supabaseClient.rpc("admin_approve_factory_cutting_story", {
          requested_story_id: storyId,
          requested_action: requestedAction
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة اعتماد قصة القص غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
        approvalSaved = true;
        await refreshDashboard(session);
        window.factoryUI.toast(sendsToSewing
          ? "تم اعتماد القصة وإضافتها للموديلات وإتاحتها لمشرف الخياطة. بقي سجل القص محفوظاً."
          : "تم اعتماد القصة وإضافتها للموديلات. بقي سجل القص محفوظاً.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, approvalSaved
          ? "تم اعتماد القصة لكن تعذر تحديث اللوحة"
          : "تعذر اعتماد قصة القص", error);
      }
      return;
    }
    if (["approve-client-existing", "approve-client-new", "link-client-account"].includes(button.dataset.action)) {
      const isManualLink = button.dataset.action === "link-client-account";
      const isExistingProfileApproval = button.dataset.action === "approve-client-existing";
      const accountId = isManualLink
        ? document.querySelector(`[data-client-link-account="${button.dataset.customerId}"]`)?.value
        : button.dataset.accountId;
      const customerId = isManualLink
        ? button.dataset.customerId
        : isExistingProfileApproval
          ? document.querySelector(`[data-pending-client-map="${button.dataset.accountId}"]`)?.value
          : null;
      if (!accountId || (isExistingProfileApproval && !customerId)) {
        window.factoryUI.toast(isManualLink
          ? "اختر حساب تسجيل الدخول أولاً."
          : "اختر ملف العميل الذي تريد ربط طلب التسجيل به.",
        "error");
        return;
      }
      const account = [...dashboardData.users, ...(dashboardData.pendingAccounts || [])]
        .find((entry) => entry.id === accountId);
      if (!await window.factoryUI.confirmAction({
        title: isManualLink ? "ربط حساب بالعميل" : "اعتماد تسجيل عميل",
        message: isManualLink
          ? `هل تريد ربط ${account?.username || "الحساب المحدد"} بملف العميل؟ إذا كان الحساب معلقاً فسيتم اعتماده كعميل.`
          : isExistingProfileApproval
            ? `سيتم اعتماد ${account?.name || "الحساب"} كعميل وربطه بملف العميل المحدد.`
            : `سيتم اعتماد ${account?.name || "الحساب"} وإنشاء ملف عميل جديد مرتبط به.`,
        confirmLabel: isManualLink ? "ربط الحساب" : "اعتماد العميل"
      })) return;
      button.disabled = true;
      let mappingSaved = false;
      try {
        const { error } = await supabaseClient.rpc("admin_link_factory_client_account", {
          requested_customer_id: customerId,
          requested_user_id: accountId
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة ربط حساب العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
        mappingSaved = true;
        await refreshDashboard(session);
        window.factoryUI.toast(isManualLink
          ? "تم ربط حساب الدخول بملف العميل."
          : isExistingProfileApproval
            ? "تم اعتماد العميل وربط الحساب بالملف الموجود."
            : "تم اعتماد الحساب وإنشاء ملف عميل جديد.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, mappingSaved
          ? "تم اعتماد / ربط الحساب لكن تعذر تحديث اللوحة"
          : "تعذر اعتماد / ربط حساب العميل", error);
      }
      return;
    }
    if (button.dataset.action === "delete-order") {
      const order = dashboardData.models.find((item) => item.id === button.dataset.orderId);
      if (!order) {
        window.factoryUI.toast("تعذر العثور على الموديل. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      if (!await window.factoryUI.confirmAction({
        title: "حذف الموديل",
        message: `سيُحذف ${order.name || order.modelNumber || "الموديل"} فقط إذا لم يبدأ قصه ولم يرتبط بأي سجل إنتاجي أو مالي. سيرفض النظام الحذف عند وجود أثر، ويمكن عندها استخدام «إيقاف / أرشفة» للحفاظ على الحسابات والتاريخ.`,
        confirmLabel: "حذف الموديل",
        danger: true
      })) return;
      button.disabled = true;
      try {
        const { error } = await supabaseClient.rpc("delete_factory_order", {
          requested_order_id: order.id
        });
        if (error?.code === "PGRST202") {
          throw new Error("دالة حذف الموديل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
        }
        if (error) throw error;
        let imageCleanupFailed = false;
        for (const imageUrl of new Set([...(order.modelImageUrls || []), order.modelImageUrl, order.modelImageUrl2].filter(Boolean))) {
          try {
            await deleteOrderModelImage(imageUrl, order.id);
          } catch (imageError) {
            imageCleanupFailed = true;
            console.warn("The model was deleted, but one of its images could not be removed.", imageError);
          }
        }
        await refreshDashboard(session);
        window.factoryUI.toast(imageCleanupFailed
          ? "تم حذف الموديل، لكن تعذر حذف إحدى صوره من التخزين."
          : "تم حذف الموديل.");
      } catch (error) {
        button.disabled = false;
        reportDashboardFailure(session, "تعذر حذف الموديل", error);
      }
      return;
    }
    if (button.dataset.action === "record-delivery" || button.dataset.action === "complete-handover") {
      const order = dashboardData.models[Number(button.dataset.index)];
      if (!order) {
        window.factoryUI.toast("تعذر العثور على الطلبية. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      if (button.dataset.action === "record-delivery") {
        deliveryForm.elements.orderId.value = order.id;
        deliveryForm.elements.finalize.value = "";
        settlementChoiceFields.forEach((field) => { field.hidden = true; });
        deliveryForm.elements.quantity.readOnly = false;
        deliveryForm.elements.quantity.max = String(Math.max(0, order.remainingPieces));
        deliveryForm.elements.quantity.min = "1";
        deliveryForm.elements.quantity.value = "";
        deliveryRecipientInput.required = true;
        deliveryRecipientInput.required = true;
        deliveryModalTitle.textContent = "تسجيل تسليم جديد";
        deliveryModalDescription.textContent = "أدخل كمية هذه الدفعة واسم مستلمها؛ ستُضاف إلى إجمالي ما تم تسليمه حتى الآن.";
        deliveryQuantityLabel.textContent = "كمية التسليم";
        deliverySubmitButton.textContent = "تسجيل التسليم";
        deliveryModal.hidden = false;
        deliveryForm.elements.quantity.focus();
        return;
      }
      openFinalHandover(order);
      return;
    }
    if (button.dataset.action === "activate-account") {
      const roleSelect = [...document.querySelectorAll("[data-pending-role]")].find((item) => item.dataset.pendingRole === button.dataset.accountId);
      if (!roleSelect || roleSelect.value !== "client") {
        window.factoryUI.toast("لا يُفعّل حساب العامل أو المشرف مباشرة؛ أنشئ ملفه من تبويب العاملين واربط الحساب المعلق منه.", "error");
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
        reportDashboardFailure(session, "تعذر تفعيل الحساب", error);
        return;
      }
      if (!data) {
        button.disabled = false;
        window.factoryUI.toast("لم يعد طلب الحساب معلقًا. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      window.factoryUI.toast("تم تفعيل الحساب بنجاح.");
      refreshDashboard(session).catch((error) => reportDashboardFailure(session, "تعذر تحديث اللوحة", error));
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
        reportDashboardFailure(session, "تعذر تغيير حالة الحساب", error);
        return;
      }
      if (!data) {
        button.disabled = false;
        window.factoryUI.toast("لم يتغير الحساب. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      window.factoryUI.toast(suspending ? "تم إيقاف الحساب بنجاح." : "تمت إعادة تفعيل الحساب بنجاح.");
      refreshDashboard(session).catch((refreshError) => reportDashboardFailure(session, "تغيرت حالة الحساب، لكن تعذر تحديث اللوحة", refreshError));
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
        reportDashboardFailure(session, "تعذر حذف الحساب", error);
        return;
      }
      window.factoryUI.toast("تم حذف الحساب بنجاح.");
      refreshDashboard(session).catch((refreshError) => reportDashboardFailure(session, "حُذف الحساب، لكن تعذر تحديث اللوحة", refreshError));
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
        reportDashboardFailure(session, "تعذر تحديث طلب الانصراف", error);
      }
    }
  }));
}

function bindModelExpenseActions(session) {
  const modal = document.querySelector("#model-expense-modal");
  const form = modal?.querySelector("[data-model-expense-form]");
  if (!modal || !form) return;
  const close = () => {
    modal.hidden = true;
    form.reset();
    form.elements.orderId.value = "";
  };
  document.querySelector("#app").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-model-expense]");
    if (!button) return;
    const order = dashboardData.models.find((item) => item.id === button.dataset.addModelExpense);
    if (!order) {
      window.factoryUI.toast("تعذر العثور على الموديل لإضافة المصروف.", "error");
      return;
    }
    form.reset();
    form.elements.orderId.value = order.id;
    modal.querySelector("[data-model-expense-name]").textContent = `${order.name} · ${order.factoryModelCode || "دون كود بالنظام"}`;
    modal.hidden = false;
    form.elements.description.focus();
  });
  modal.querySelectorAll("[data-close-model-expense]").forEach((button) => button.addEventListener("click", close));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const orderId = form.elements.orderId.value;
    const description = String(form.elements.description.value).trim();
    const amount = Number(form.elements.amount.value);
    const expenseType = form.elements.expenseType.value;
    if (!orderId || !description || !Number.isFinite(amount) || amount <= 0
      || !["customer_cash", "treasury_only", "included_in_price"].includes(expenseType)) {
      window.factoryUI.toast("أدخل بيان المصروف ونوعه وقيمة صحيحة أكبر من صفر.", "error");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("admin_add_factory_order_expense", {
        requested_order_id: orderId,
        requested_description: description,
        requested_amount: amount,
        requested_expense_type: expenseType
      });
      if (error?.code === "PGRST202") {
        throw new Error("دالة إضافة مصروف الموديل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      }
      if (error) throw error;
      close();
      await refreshDashboard(session);
      window.factoryUI.toast("تمت إضافة المصروف كبند جديد دون استبدال المصروفات السابقة.");
    } catch (error) {
      reportDashboardFailure(session, "تعذر إضافة مصروف الموديل", error);
    } finally {
      submit.disabled = false;
    }
  });
}

async function initializeDashboard() {
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") window.location.replace("../index.html");
  });
  const session = await readSession();
  if (session) {
    await refreshDashboard(session);
    subscribeToFactoryUpdates(session);
  }
}

initializeDashboard().catch((error) => {
  console.error("تعذر تحميل بيانات لوحة المصنع.", error);
  const adminError = document.body.dataset.dashboardRole === "admin";
  const message = adminError
    ? `تعذر تحميل لوحة الإدارة: ${escapeHtml(error.message)}.`
    : "تعذر تحميل البيانات الآن. أعد المحاولة لاحقًا أو تواصل مع الإدارة.";
  document.querySelector("#app").innerHTML = `<main class="main-content"><div class="notice">${message}</div></main>${developerFooterMarkup()}`;
  window.factoryUI.toast(adminError ? `تعذر تحميل لوحة الإدارة: ${error.message}` : "تعذر تحميل البيانات الآن. أعد المحاولة لاحقًا.", "error");
});
