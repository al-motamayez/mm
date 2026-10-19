const supabaseClient = window.supabaseClient;
const ADMIN_USERNAME = "ZERO0";
const ADMIN_AUTH_EMAIL = "mohamed01007033454@gmail.com";
let dashboardData;
let usersTableHasStatus = false;
let selectedClientId = "";
let clientManagementTab = "summary";
let realtimeChannel = null;
let presenceChannel = null;
let realtimeRefreshTimer = null;
let realtimeRefreshRunning = false;
let realtimeNotifications = [];
let notificationStorageAccount = "";
let notificationStorageRole = "";
let onlineUserCount = 0;
let onlineUsers = [];
let activeFinanceTab = "payments";
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
const SIZE_OPTIONS = {
  men: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  women: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  children: Array.from({ length: 16 }, (_, index) => String(index + 1))
};
const SIZE_TYPE_LABELS = { men: "رجالي", women: "حريمي", children: "أطفال" };
const WORK_STAGES = [
  ["cutting", "قص"],
  ["sewing", "خياطة"],
  ["finishing", "تشطيب"],
  ["ironing", "مكوى"],
  ["packaging", "تكييس"]
];
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
    roleName: roleNames[account.role]
  };
  return session;
}

function emptyDashboardData() {
  return {
    models: [],
    clients: [],
    fabrics: [],
    fabricTransactions: [],
    authEvents: [],
    cashTransactions: [],
    payments: [],
    settlements: [],
    deliveries: [],
    users: [],
    leaves: [],
    cutting: [],
    sewing: [],
    tasks: [],
    clientNotes: [],
    personalAttendance: [],
    personalAdvances: [],
    personalPayroll: [],
    workerAdvances: [],
    workerPayroll: []
  };
}

function reportDashboardFailure(session, publicMessage, error) {
  console.error(publicMessage, error);
  const message = session.role === "admin"
    ? `${publicMessage}: ${error?.message || error}`
    : `${publicMessage}. حاول مرة أخرى لاحقًا أو تواصل مع الإدارة.`;
  window.factoryUI.toast(message, "error");
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
  const fabricTransactionsPromise = ["admin", "cutting"].includes(session.role)
    ? supabaseClient.from("factory_fabric_transactions")
      .select("id, fabric_id, order_id, transaction_type, quantity, notes, actor_id, created_at")
      .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const fabricPromises = ["admin", "cutting"].includes(session.role)
    ? [
      (() => {
        let query = supabaseClient.from("factory_fabrics")
          .select("id, stock_scope, customer_id, name, color_name, color_hex, unit, quantity_available, received_at, received_by, created_at, updated_at")
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
  const [payments, leaves, tasks, settlements, deliveriesResult, cashTransactionsResult, personalAttendance, personalAdvances, personalPayroll, workerAdvances, workerPayroll, fabricsResult, fabricTransactionsResult, authEventsResult] = await Promise.all([
    readFlexibleRecords("payments"),
    readFlexibleRecords("leaves"),
    readFlexibleRecords("tasks"),
    readFlexibleRecords("settlements"),
    deliveriesPromise,
    cashTransactionsPromise,
    session.role === "cutting" ? readFlexibleRecords("attendance") : Promise.resolve([]),
    session.role === "cutting" ? readFlexibleRecords("advances") : Promise.resolve([]),
    session.role === "cutting" ? readFlexibleRecords("payroll") : Promise.resolve([]),
    session.role === "admin" ? readFlexibleRecords("advances") : Promise.resolve([]),
    session.role === "admin" ? readFlexibleRecords("payroll") : Promise.resolve([]),
    ...fabricPromises,
    authEventsPromise
  ]);
  if (["42P01", "PGRST205"].includes(deliveriesResult.error?.code)) {
    throw new Error("سجل التسليمات غير موجود في قاعدة البيانات. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (deliveriesResult.error) throw deliveriesResult.error;
  if (session.role === "client" && cashTransactionsResult.error?.code === "PGRST202") {
    throw new Error("دالة قراءة مصروفات حساب العميل غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (cashTransactionsResult.error) throw cashTransactionsResult.error;
  if (["42P01", "PGRST205"].includes(fabricsResult.error?.code)
      || ["42P01", "PGRST205"].includes(fabricTransactionsResult.error?.code)) {
    throw new Error("جداول مخزون القماش غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (fabricsResult.error) throw fabricsResult.error;
  if (fabricTransactionsResult.error) throw fabricTransactionsResult.error;
  if (authEventsResult.error) throw authEventsResult.error;
  data.payments = payments;
  data.settlements = settlements;
  data.deliveries = deliveriesResult.data || [];
  data.cashTransactions = cashTransactionsResult.data || [];
  data.fabrics = fabricsResult.data || [];
  data.fabricTransactions = fabricTransactionsResult.data || [];
  data.authEvents = authEventsResult.data || [];
  data.personalAttendance = personalAttendance;
  data.personalAdvances = personalAdvances;
  data.personalPayroll = personalPayroll;
  data.workerAdvances = workerAdvances;
  data.workerPayroll = workerPayroll;
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
  } else {
    let ordersQuery = supabaseClient
      .from("orders")
      .select("id, model_name, model_number, sender_name, colors, color_size_distribution, production_type, work_stages, sizes, total_pieces, model_image_url, priority, archived_at, status, created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    ({ data: orders, error: ordersError } = await ordersQuery);
    if (ordersError?.code === "42703") {
      ordersQuery = supabaseClient
        .from("orders")
        .select("id, model_name, model_number, sender_name, colors, sizes, total_pieces, model_image_url, priority, status, created_at")
        .order("created_at", { ascending: false });
      ({ data: orders, error: ordersError } = await ordersQuery);
    }
  }
  if (ordersError) throw ordersError;

  if (session.role === "admin") {
    const { data: clients, error: clientsError } = await supabaseClient
      .from("factory_clients")
      .select("id, user_id, name, brand_name, client_number, phone, cash_phone, instagram, whatsapp, notes, account_period_started_at, created_at")
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
      .select("id, order_id, stage_name, worker_name, fabric, fabric_id, external_fabric_source, external_fabric_unit, fabric_quantity, bolt_count, layer_count, color_ply_data, technical_notes, line_name, target_quantity, completed_quantity, status, updated_at");
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
      .filter((stage) => ["cutting", "sewing", "finishing", "ironing", "packaging"].includes(stage.stage_name))
      .reduce((maximum, stage) => Math.max(maximum, Number(stage.completed_quantity || 0)), 0);
    const originalQuantity = Number(order.original_total_pieces ?? order.total_pieces ?? 0);
    const deliveredPieces = Number(order.delivered_pieces || 0);
    return {
      id: order.id,
      clientId: order.client_id,
      customerId: order.customer_id,
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
      colorSizeDistribution: order.color_size_distribution || { colors: [] },
      productionType: order.production_type || "full_cutting",
      workStages: order.work_stages || ["cutting", "sewing", "finishing"],
      pricingMode: order.pricing_mode || "total",
      stagePrices: order.stage_prices || {},
      sizes: order.sizes || "",
      modelImageUrl: order.model_image_url || "",
      priority: order.priority || "عادي",
      deliveredPieces,
      deliveryHistory: data.deliveries
        .filter((delivery) => delivery.order_id === order.id)
        .sort((left, right) => new Date(left.delivered_at).getTime() - new Date(right.delivered_at).getTime()),
      archivedAt: order.archived_at || null,
      remainingPieces: Math.max(Number(order.total_pieces) - Number(order.delivered_pieces || 0), 0),
      quantityDifference: deliveredPieces - originalQuantity,
      pricePerPiece: Number(order.price_per_piece || 0),
      totalAmount: Number(order.total_amount || 0),
      expectedAmount: ["مكتمل", "تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"].includes(order.status)
        ? 0
        : Number(order.expected_total_amount ?? (Math.max(Number(order.total_pieces || 0) - Number(order.delivered_pieces || 0), 0) * Number(order.price_per_piece || 0))),
      operationalExpenses: Number(order.operational_expenses || 0),
      paidAmount: Number(order.paid_amount || 0),
      remainingAmount: Number(order.remaining_amount || 0),
      expectedDeliveryDate: order.expected_delivery_date || "",
      status: order.status,
      displayStatus: order.status === "قيد الفرش" && Number(cuttingStage?.layer_count) > 0
        ? `قيد الفرش - تم فرش ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(cuttingStage.layer_count)} راقات`
        : order.status,
      cuttingPlys: Number(cuttingStage?.layer_count || 0),
      fabric: cuttingStage?.fabric || "",
      fabricId: cuttingStage?.fabric_id || (cuttingStage?.external_fabric_source ? "external" : ""),
      externalFabricSource: cuttingStage?.external_fabric_source || "",
      externalFabricUnit: cuttingStage?.external_fabric_unit || "متر",
      fabricUnit: cuttingStage?.external_fabric_unit || data.fabrics.find((fabric) => fabric.id === cuttingStage?.fabric_id)?.unit || "متر",
      fabricQuantity: Number(cuttingStage?.fabric_quantity || 0),
      boltCount: Number(cuttingStage?.bolt_count || 0),
      layerCount: Number(cuttingStage?.layer_count || 0),
      colorPlyData: cuttingStage?.color_ply_data || null,
      cuttingNotes: cuttingStage?.technical_notes || "",
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
      customerId: ordersById.get(stage.order_id)?.client_id || ordersById.get(stage.order_id)?.customer_id || "",
      model: ordersById.get(stage.order_id)?.model_name || ordersById.get(stage.order_id)?.model_number || "موديل غير محدد",
      modelNumber: ordersById.get(stage.order_id)?.model_number || "",
      sizes: ordersById.get(stage.order_id)?.sizes || "",
      colors: ordersById.get(stage.order_id)?.colors || "",
      modelImageUrl: ordersById.get(stage.order_id)?.model_image_url || "",
      fabric: stage.fabric || "—",
      fabricId: stage.fabric_id || (stage.external_fabric_source ? "external" : ""),
      externalFabricSource: stage.external_fabric_source || "",
      externalFabricUnit: stage.external_fabric_unit || "متر",
      fabricUnit: stage.external_fabric_unit || data.fabrics.find((fabric) => fabric.id === stage.fabric_id)?.unit || "متر",
      fabricQuantity: Number(stage.fabric_quantity || 0),
      boltCount: Number(stage.bolt_count || 0),
      layerCount: Number(stage.layer_count || 0),
      colorPlyData: stage.color_ply_data || null,
      technicalNotes: stage.technical_notes || "",
      priority: ordersById.get(stage.order_id)?.priority || "عادي",
      total: stage.target_quantity || ordersById.get(stage.order_id)?.total_pieces || 0,
      cut: stage.completed_quantity || 0,
      status: stage.status,
      orderStatus: ordersById.get(stage.order_id)?.status || stage.status,
      senderName: ordersById.get(stage.order_id)?.sender_name || ""
    }));
  data.sewing = stages
    .filter((stage) => stageNames.get(stage.stage_name) === "sewing")
    .map((stage) => ({
      id: stage.id,
      order: stage.order_id,
      line: stage.line_name || "—",
      model: ordersById.get(stage.order_id)?.model_name || ordersById.get(stage.order_id)?.model_number || "موديل غير محدد",
      modelNumber: ordersById.get(stage.order_id)?.model_number || "",
      client: clientsById.get(ordersById.get(stage.order_id)?.customer_id)?.name || "",
      modelImageUrl: ordersById.get(stage.order_id)?.model_image_url || "",
      colors: ordersById.get(stage.order_id)?.colors || "",
      sizes: ordersById.get(stage.order_id)?.sizes || "",
      workStages: ordersById.get(stage.order_id)?.work_stages || [],
      technicalNotes: stage.technical_notes || "",
      orderStatus: ordersById.get(stage.order_id)?.status || "",
      supervisor: stage.worker_name || "—",
      target: stage.target_quantity || ordersById.get(stage.order_id)?.total_pieces || 0,
      produced: stage.completed_quantity || 0,
      status: stage.status === "قيد التنفيذ" ? "قيد الخياطة" : stage.status
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
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  return `${new Intl.NumberFormat("ar-EG-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(rounded)} ج.م`;
}

function parseSizeData(value) {
  if (!value) return { type: "", counts: {}, legacy: "" };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && parsed.counts && typeof parsed.counts === "object") {
      return { type: parsed.type || "", counts: parsed.counts, legacy: "" };
    }
  } catch {
    return { type: "", counts: {}, legacy: String(value) };
  }
  return { type: "", counts: {}, legacy: String(value) };
}

function sizePickerMarkup(value, prefix, showCounts = true) {
  const sizeData = parseSizeData(value);
  const pickerOptions = Object.entries(SIZE_OPTIONS).map(([type, sizes]) => `
    <div class="size-option-group" data-size-group="${type}" ${sizeData.type === type ? "" : "hidden"}>
      ${sizes.map((size) => {
        const active = Object.hasOwn(sizeData.counts, size);
        const count = Number(sizeData.counts[size] || 0);
        return `<div class="size-choice${active ? " active" : ""}"><button type="button" class="size-toggle" data-size-toggle="${size}" aria-pressed="${active}">${size}</button>${showCounts ? `<label class="size-count-label" ${active ? "" : "hidden"}><span class="visually-hidden">عدد مقاس ${size}</span><input data-size-count="${size}" type="number" min="0" step="1" value="${active && count ? count : ""}" placeholder="العدد" ${active ? "" : "disabled"}></label>` : ""}</div>`;
      }).join("")}
    </div>`).join("");
  return `<div class="field size-picker" data-size-picker="${prefix}" data-size-legacy="${escapeHtml(sizeData.legacy)}" data-auto-quantity="${showCounts ? "false" : "true"}">
    <label for="${prefix}-type">نوع المقاسات</label>
    <select id="${prefix}-type" data-size-type><option value="">اختر النوع</option>${Object.entries(SIZE_TYPE_LABELS).map(([type, label]) => `<option value="${type}" ${sizeData.type === type ? "selected" : ""}>${label}</option>`).join("")}</select>
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
    <label class="field"><span>درجة اللون</span><input type="color" data-ply-color value="${/^#[0-9A-F]{6}$/i.test(color) ? escapeHtml(color) : "#000000"}"></label>
    <label class="field"><span>عدد الراقات لهذا اللون</span><input type="number" data-ply-count min="1" step="1" value="${escapeHtml(plys)}"></label>
    <button class="row-action color-ply-remove" type="button" data-remove-ply-color aria-label="حذف اللون">حذف اللون</button>
  </div>`;
}

function updateCuttingCalculation(form) {
  const sizePicker = form.querySelector("[data-size-picker]");
  const sizeType = sizePicker.querySelector("[data-size-type]").value;
  const selectedSizes = [...sizePicker.querySelectorAll(".size-option-group:not([hidden]) .size-toggle[aria-pressed='true']")]
    .map((button) => button.dataset.sizeToggle);
  const colorRows = [...form.querySelectorAll("[data-color-ply-row]")].map((row) => ({
    color: row.querySelector("[data-ply-color]").value.toUpperCase(),
    name: String(row.querySelector("[data-ply-name]").value).trim(),
    plys: Number(row.querySelector("[data-ply-count]").value)
  }));
  const validRows = colorRows.filter((entry) => entry.name && Number.isSafeInteger(entry.plys) && entry.plys > 0);
  const plysPerSize = validRows.reduce((sum, entry) => sum + entry.plys, 0);
  const counts = Object.fromEntries(selectedSizes.map((size) => [size, String(plysPerSize)]));
  const sizeData = { type: sizeType, counts };
  const total = plysPerSize * selectedSizes.length;
  sizePicker.querySelector("[data-size-value]").value = sizeType ? JSON.stringify(sizeData) : "";

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
      `<tr><td><span class="color-breakdown-swatch" style="--swatch-color:${escapeHtml(entry.color)}"></span>${escapeHtml(entry.name)} · ${escapeHtml(entry.color)}</td><td>${escapeHtml(size)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(entry.plys)}</td></tr>`
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

function colorPickerMarkup(value, prefix) {
  const selected = String(value || "").split(",").map((color) => color.trim()).filter(Boolean);
  const choices = [...new Set(selected)].map((color) => colorPickerChoice(color)).join("");
  return `<div class="field color-picker" data-color-picker="${prefix}">
    <label>اختيار درجات الألوان</label>
    <div class="color-picker-controls"><input type="color" data-color-input value="#000000" aria-label="اختر درجة لون"><button class="row-action" type="button" data-add-color>إضافة لون آخر</button></div>
    <div class="color-swatch-list" data-color-list>${choices || '<span class="muted">لم يتم اختيار ألوان بعد.</span>'}</div>
    <input type="hidden" name="colors" data-color-value value="${escapeHtml(value || "")}">
    <input type="hidden" name="colorNames" data-color-names-value value="{}">
  </div>`;
}

function colorPickerChoice(color, name = "") {
  const isHex = /^#[0-9a-f]{6}$/i.test(color);
  return `<span class="color-choice" data-color-choice="${escapeHtml(color)}"><span class="color-choice-swatch"${isHex ? ` style="--swatch-color:${escapeHtml(color)}"` : ""}></span><span class="color-choice-value">${escapeHtml(color)}</span><label class="color-choice-name"><span>اسم اللون</span><input type="text" data-color-name maxlength="64" value="${escapeHtml(name)}" aria-label="اسم اللون ${escapeHtml(color)}"></label><button type="button" data-remove-color="${escapeHtml(color)}" aria-label="إزالة اللون ${escapeHtml(color)}">×</button></span>`;
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
    return `<span class="model-color-chip">${isHex ? `<span class="color-breakdown-swatch" style="--swatch-color:${escapeHtml(color)}"></span>` : ""}<strong>${escapeHtml(label)}</strong>${isHex ? `<small>${escapeHtml(color)}</small>` : ""}</span>`;
  }).join("")}</span>`;
}

function sizeSummary(value) {
  const sizeData = parseSizeData(value);
  const countedSizes = Object.entries(sizeData.counts)
    .filter(([, count]) => Number(count) > 0)
    .map(([size, count]) => `${size}: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Number(count))}`);
  return countedSizes.length
    ? `${SIZE_TYPE_LABELS[sizeData.type] || ""} ${countedSizes.join(" · ")}`.trim()
    : sizeData.legacy || "—";
}

function updateSizePicker(root) {
  const typeSelect = root.querySelector("[data-size-type]");
  const selectedType = typeSelect.value;
  root.querySelectorAll("[data-size-group]").forEach((group) => {
    group.hidden = group.dataset.sizeGroup !== selectedType;
  });
  const sizeData = { type: selectedType, counts: {} };
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
    .map((choice) => [choice.dataset.colorChoice.toUpperCase(), String(choice.querySelector("[data-color-name]").value).trim()])
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
    root.querySelectorAll("[data-size-count]").forEach((input) => input.addEventListener("input", () => updateSizePicker(root)));
    updateSizePicker(root);
  });
  form.querySelectorAll("[data-color-picker]").forEach((root) => {
    const renderColors = () => {
      const list = root.querySelector("[data-color-list]");
      const names = Object.fromEntries([...root.querySelectorAll("[data-color-choice]")].map((choice) =>
        [choice.dataset.colorChoice, String(choice.querySelector("[data-color-name]").value).trim()]
      ));
      const colors = [...new Set([...root.querySelectorAll("[data-color-choice]")].map((choice) => choice.dataset.colorChoice))];
      list.innerHTML = colors.length
        ? colors.map((color) => colorPickerChoice(color, names[color])).join("")
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
  root.querySelectorAll("[data-size-toggle]").forEach((button) => {
    const selected = Object.hasOwn(data.counts, button.dataset.sizeToggle);
    button.setAttribute("aria-pressed", String(selected));
    button.closest(".size-choice").classList.toggle("active", selected);
    const label = button.nextElementSibling;
    if (label?.matches(".size-count-label")) {
      const input = label.querySelector("input");
      label.hidden = !selected;
      input.disabled = !selected;
      input.value = selected ? data.counts[button.dataset.sizeToggle] : "";
    }
  });
  updateSizePicker(root);
}

function setColorPicker(root, value, colorNames = {}) {
  const colors = String(value || "").split(",").map((color) => color.trim()).filter(Boolean);
  const names = parseColorNames(colorNames);
  root.querySelector("[data-color-list]").innerHTML = colors.length
    ? [...new Set(colors)].map((color) => colorPickerChoice(color, names[color.toUpperCase()] || "")).join("")
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
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("اختر صورة JPG أو PNG أو WEBP لا يتجاوز حجمها 5 ميجابايت.");
  }
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${orderId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabaseClient.storage.from("factory-model-images").upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return supabaseClient.storage.from("factory-model-images").getPublicUrl(path).data.publicUrl;
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

function modelImageMarkup(url, label = "صورة الموديل") {
  return url ? `<img class="model-thumbnail" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy">` : "";
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

function statusClass(value) {
  if (String(value).startsWith("قيد الفرش")
    || ["قيد المراجعة", "قيد التنفيذ", "قيد الخياطة", "قيد الإنتاج", "قيد الانتظار", "معلق", "تحت الإنشاء", "تم الفرش / جاهز للقص", "معلق - في انتظار الخياطة", "جار العمل"].includes(value)) return "warning";
  if (["جديدة", "جاهز للتسليم", "تم القص", "في الخياطة", "متاح للخياطة", "متاح للإمبلاج / التعبئة"].includes(value)) return "info";
  if (value === "جاهز للتسليم" || value === "مكتمل" || value === "تم التسليم" || value === "تم التسليم بالكامل" || value === "تم التسليم والإغلاق") return "";
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

function table(headers, rows) {
  if (!rows.length) return '<div class="empty-state">لا توجد بيانات لعرضها حاليًا.</div>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
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
  return !item.archivedAt;
}

function orderCards(models, withActions = false) {
  if (!models.length) return '<div class="empty-state">لا توجد طلبيات لعرضها حاليًا.</div>';
  return `<div class="order-cards">${models.map((item) => {
    const index = dashboardData.models.findIndex((order) => order.id === item.id);
    return `<article class="order-card order-compact-row">
      ${modelImageMarkup(item.modelImageUrl)}
      <div class="order-compact-name"><strong>${escapeHtml(item.name || item.modelNumber || "موديل بدون اسم")}</strong><small>رقم الموديل: ${escapeHtml(item.modelNumber || "—")} · الأقسام: ${escapeHtml(workStageLabels(item.workStages).join("، ") || "—")}</small></div>
      <span class="order-compact-client">${escapeHtml(item.client || "غير مربوط بعميل")}</span>
      <span class="order-compact-quantity">${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity)} قطعة${["تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"].includes(item.status) ? `<small>الأصلي: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.originalQuantity)} · المسلّم: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.deliveredPieces)} · ${item.quantityDifference > 0 ? `زيادة ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantityDifference)}` : item.quantityDifference < 0 ? `نقص ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Math.abs(item.quantityDifference))}` : "مطابق"}</small>` : ""}</span>
      <span class="order-compact-price">${money(item.pricePerPiece)} / قطعة</span>
      ${statusTag(item.displayStatus || item.status)}
      <button class="row-action" type="button" data-open-model-id="${escapeHtml(item.id)}">تفاصيل الطلبية</button>
      ${withActions ? `<div class="order-card-actions">${item.archivedAt ? "" : `<button class="row-action" type="button" data-edit-kind="models" data-index="${index}">تعديل الطلبية</button>`}${item.customerId ? `${item.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(item.status) ? "" : `<button class="row-action" type="button" data-action="record-delivery" data-index="${index}"${item.remainingPieces > 0 ? "" : " disabled"}>تسجيل تسليم</button><button class="row-action order-close-action" type="button" data-action="complete-handover" data-index="${index}"${item.quantity ? "" : " disabled"}>تسوية التسليم وإغلاق الطلب</button>`}` : '<span class="order-delete-protected">عيّن العميل قبل تسجيل أي تسليم</span>'}${item.archivedAt || LOCKED_FACTORY_ORDER_STATUSES.includes(item.status) ? '<span class="status">مغلق / تم التسليم</span>' : ""}${orderCanBeDeleted(item) ? `<button class="row-action order-delete-action" type="button" data-action="delete-order" data-order-id="${escapeHtml(item.id)}">حذف الموديل</button>` : '<span class="order-delete-protected">محمي بسجل مالي / تسليم</span>'}</div>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function orderProgress(status) {
  const stages = ["قيد الانتظار", "قيد الفرش", "تم الفرش / جاهز للقص", "تم القص", "معلق - في انتظار الخياطة", "في الخياطة", "متاح للإمبلاج / التعبئة", "جاهز للتسليم", "تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"];
  const activeStatus = status === "معلق" || status === "تحت الإنشاء" ? "قيد الانتظار" : status;
  const activeIndex = Math.max(0, stages.indexOf(activeStatus));
  const steps = stages.map((stage, index) => `<span class="order-progress-step${index <= activeIndex ? " complete" : ""}${index === activeIndex ? " current" : ""}">${stage}</span>`).join("");
  return `<div class="order-progress" aria-label="تقدم الطلب: ${escapeHtml(activeStatus)}">${steps}</div>`;
}

function clientOrderRows(orders) {
  return orders.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</td><td>${escapeHtml(item.sizes || "—")}</td><td>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity) : "بانتظار الحصر"}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.deliveredPieces)}</td><td>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.remainingPieces) : "بانتظار الحصر"}</td><td>${statusTag(item.displayStatus || item.status)}</td><td>${orderProgress(item.status)}</td></tr>`);
}

function clientOrderCards(orders) {
  if (!orders.length) return '<div class="empty-state">لا توجد طلبيات لعرضها حاليًا.</div>';
  return `<div class="order-cards">${orders.map((item) => `<article class="order-card client-order-card">
    <header class="order-card-heading">${modelImageMarkup(item.modelImageUrl)}<div><p class="order-card-label">الموديل ${item.modelNumber ? `· رقم ${escapeHtml(item.modelNumber)}` : ""}</p><h3>${escapeHtml(item.name || item.modelNumber || "موديل بدون اسم")}</h3></div>${statusTag(item.displayStatus || item.status)}</header>
    <dl class="order-card-details">
      <div><dt>الألوان</dt><dd>${colorSummaryMarkup(item.colors, item.colorNames, item.colorPlyData)}</dd></div><div><dt>المقاسات / العدد لكل مقاس</dt><dd>${escapeHtml(sizeSummary(item.sizes))}</dd></div>
      <div><dt>العدد المطلوب الأصلي</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.originalQuantity)}</dd></div><div><dt>العدد الفعلي بعد القص</dt><dd>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity) : "بانتظار الحصر"}</dd></div><div><dt>الكمية المنجزة</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.completedPieces)}</dd></div>
      <div><dt>الكمية المسلّمة</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.deliveredPieces)}</dd></div><div><dt>المتبقي</dt><dd>${item.quantity ? new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.remainingPieces) : "بانتظار الحصر بعد القص"}</dd></div>
      ${["تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"].includes(item.status) ? `<div><dt>فرق التسليم عن العدد المطلوب الأصلي</dt><dd>${item.quantityDifference > 0 ? `زيادة ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantityDifference)} قطعة` : item.quantityDifference < 0 ? `نقص ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(Math.abs(item.quantityDifference))} قطعة` : "مطابق للعدد المطلوب"}</dd></div>` : ""}
      ${item.senderName ? `<div><dt>تم الإرسال بواسطة</dt><dd>${escapeHtml(item.senderName)}</dd></div>` : ""}
      <div><dt>سعر القطعة</dt><dd>${money(item.pricePerPiece)}</dd></div><div><dt>المتوقع للكمية غير المسلّمة</dt><dd>${money(item.expectedAmount)}</dd></div><div><dt>إجمالي قيمة المسلّم</dt><dd>${money(item.totalAmount)}</dd></div>
      <div><dt>التسليم المتوقع</dt><dd>${formatDateOnly(item.expectedDeliveryDate)}</dd></div>
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
      : `${withActions && item.roleKey === "client" ? `<button class="row-action" type="button" data-edit-client="${escapeHtml(item.id)}">تعديل البيانات</button> ` : ""}<button class="row-action" type="button" data-action="toggle-user-status" data-account-id="${escapeHtml(item.id)}" data-next-status="${suspended ? "active" : "suspended"}">${suspended ? "إعادة تفعيل" : "توقيف / تعطيل"}</button> <button class="row-action" type="button" data-action="delete-user" data-account-id="${escapeHtml(item.id)}">حذف الحساب</button>`;
    return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.role)}</td><td>${suspended ? "متوقف" : "نشط"}</td><td>${actions}</td></tr>`;
  });
}

function clientAccountSummary(client, data) {
  const settlements = data.settlements
    .filter((entry) => entry.customerId === client.id)
    .sort((left, right) => new Date(right.date || right._createdAt).getTime() - new Date(left.date || left._createdAt).getTime());
  const latestSettlement = settlements[0] || null;
  const openingBalance = roundMoney(latestSettlement?.balance || 0);
  const orders = data.models.filter((order) => order.customerId === client.id && !order.archivedAt);
  const deliveredTotal = sumMoney(orders.map((order) => Number(order.totalAmount)));
  const expectedTotal = sumMoney(orders.map((order) => order.expectedAmount));
  const orderPaid = sumMoney(orders.map((order) => order.paidAmount));
  const periodStart = client.account_period_started_at || latestSettlement?.date || null;
  const payments = data.payments.filter((payment) =>
    payment.customerId === client.id
    && (!periodStart || new Date(payment._createdAt || payment.created_at).getTime() >= new Date(periodStart).getTime())
  );
  const paymentsTotal = sumMoney(payments.map((payment) => payment.amount));
  const clientExpenses = data.cashTransactions.filter((entry) =>
    entry.customer_id === client.id
    && entry.direction === "expense"
    && (!periodStart || new Date(entry.occurred_at).getTime() >= new Date(periodStart).getTime())
  );
  const clientExpensesTotal = sumMoney(clientExpenses.map((entry) => entry.amount));
  const grossDue = addMoney(addMoney(openingBalance, deliveredTotal), clientExpensesTotal);
  const paid = addMoney(orderPaid, paymentsTotal);
  const due = subtractMoney(grossDue, paid);
  const balance = due;
  const remainingOpeningBalance = openingBalance > 0
    ? Math.max(0, subtractMoney(openingBalance, paid))
    : openingBalance;
  return {
    settlements,
    latestSettlement,
    openingBalance,
    orders,
    archivedOrders: data.models.filter((order) => order.customerId === client.id && order.archivedAt),
    deliveredTotal,
    expectedTotal,
    requiredAfterDelivery: deliveredTotal,
    grossDue,
    orderPaid,
    payments,
    paymentsTotal,
    clientExpenses,
    clientExpensesTotal,
    due,
    paid,
    remainingOpeningBalance,
    balance
  };
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
    ? `<div class="model-preview-list" id="${id}" role="group" aria-label="معاينة الموديلات">${orders.map((order) => `<button class="model-preview-item model-preview-link" type="button" data-open-model-id="${escapeHtml(order.id)}" aria-label="فتح ${escapeHtml(order.name)} للتعديل"><strong>${escapeHtml(order.name)}</strong><span>رقم الموديل: ${escapeHtml(order.modelNumber || "دون رقم")}</span><span>الكمية: ${order.quantity > 0 ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة` : "بانتظار الحصر"}</span><span>المقاسات: ${escapeHtml(sizeSummary(order.sizes))}</span><span>الألوان: ${colorSummaryMarkup(order.colors, order.colorNames, order.colorPlyData)}</span>${statusTag(order.displayStatus || order.status)}</button>`).join("")}</div>`
    : `<div class="model-preview-list" id="${id}" role="tooltip"><span>لا توجد موديلات ضمن هذه الفئة.</span></div>`;
  return `<div class="client-account-grid">${clients.map((client) => {
    const summary = clientAccountSummary(client, data);
    const linkedUser = data.users.find((user) => user.id === client.user_id);
    const underConstructionOrders = summary.orders.filter((order) => order.status === "تحت الإنشاء");
    const inProductionOrders = summary.orders.filter((order) =>
      ["قيد الفرش", "تم الفرش / جاهز للقص", "تم القص", "معلق - في انتظار الخياطة", "في الخياطة"].includes(order.status)
    );
    const unpricedOrders = summary.orders.filter((order) => order.pricePerPiece <= 0);
    const uncountedOrders = summary.orders.filter((order) => order.quantity <= 0);
    const modelMetric = (label, orders, id) => `<div class="model-preview"><span>${label}</span><button class="model-preview-trigger" type="button" aria-label="${orders.length} ${label}" aria-describedby="${id}"${orders.length === 1 ? ` data-open-model-id="${escapeHtml(orders[0].id)}"` : ""}>${orders.length}</button>${previewList(orders, id)}</div>`;
    return `<article class="client-account-card">
      <header><div><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.phone || "بدون هاتف")}${linkedUser ? ` · ${escapeHtml(linkedUser.username)}` : " · ملف عميل بلا حساب دخول"}</p></div>${statusTag(linkedUser?.status === "suspended" ? "متوقف" : "نشط")}</header>
      <div class="client-balance-grid"><div><span>المطلوب بعد خصم المدفوع</span><strong>${money(summary.due)}</strong></div><div><span>الإجمالي المتوقع للطلبات</span><strong>${money(summary.expectedTotal)}</strong></div><div><span>المطلوب بعد التسليم</span><strong>${money(summary.requiredAfterDelivery)}</strong></div><div><span>المدفوع</span><strong>${money(summary.paid)}</strong></div><div><span>الرصيد المتبقي</span><strong>${money(summary.balance)}</strong><small>${summary.balance === 0 ? "تم السداد بالكامل" : summary.balance < 0 ? "رصيد دائن للعميل" : "مستحق على العميل"}</small></div></div>
      ${unpricedOrders.length ? '<p class="client-unpriced-alert" role="status">يوجد موديلات لم تحدد أسعارها بعد</p>' : ""}
      <div class="client-activity-grid">
        ${modelMetric("تحت الإنشاء", underConstructionOrders, `construction-${escapeHtml(client.id)}`)}
        ${modelMetric("قيد التصنيع", inProductionOrders, `production-${escapeHtml(client.id)}`)}
        ${modelMetric("لم يُحدد سعرها", unpricedOrders, `unpriced-${escapeHtml(client.id)}`)}
        ${modelMetric("لم يُحدد عددها", uncountedOrders, `uncounted-${escapeHtml(client.id)}`)}
      </div>
      <p class="client-notes-preview">${escapeHtml(client.notes || "لا توجد ملاحظات مسجلة.")}</p>
      <div class="client-card-actions"><button class="button button-primary" type="button" data-open-client-details="${escapeHtml(client.id)}">التفاصيل</button><button class="button button-secondary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">＋ إضافة دفعة مالية</button><button class="row-action" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل بيانات العميل</button><button class="row-action order-delete-action" type="button" data-delete-customer="${escapeHtml(client.id)}">حذف العميل</button></div>
    </article>`;
  }).join("")}</div>`;
}

function clientAccountsOverview(data) {
  const summaries = data.clients.map((client) => clientAccountSummary(client, data));
  const totalGoods = sumMoney(summaries.map((summary) => summary.deliveredTotal));
  const totalExpected = sumMoney(summaries.map((summary) => summary.expectedTotal));
  const totalPaid = sumMoney(summaries.map((summary) => summary.paid));
  const totalBalance = sumMoney(summaries.map((summary) => summary.balance));
  const unpricedCount = summaries.reduce((count, summary) =>
    count + summary.orders.filter((order) => order.pricePerPiece <= 0).length, 0);
  return `<div class="clients-toolbar"><div><h2>حسابات العملاء</h2><p>متابعة الأرصدة والدفعات وقيمة البضاعة وحالات الموديلات لكل عميل.</p></div></div>
    <div class="stats-grid">${stat("قيمة البضاعة المسلّمة", money(totalGoods), "تشمل مصاريف التشغيل المحملة")}${stat("الإجمالي المتوقع", money(totalExpected), "غير المسلم ومصاريف التشغيل")}${stat("إجمالي المدفوع", money(totalPaid), "دفعات العملاء والمدفوع على الطلب")}${stat("الرصيد الصافي", money(totalBalance), totalBalance < 0 ? "أرصدة دائنة للعملاء" : "المطلوب من العملاء")}${stat("موديلات بلا سعر", unpricedCount, "تحتاج إلى استكمال التسعير")}</div>
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
  const customerIncome = data.payments.reduce((sum, payment) => addMoney(sum, payment.amount), 0);
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

const FACTORY_ORDER_STATUSES = [
  "قيد الانتظار", "معلق", "تحت الإنشاء", "قيد الفرش",
  "تم الفرش / جاهز للقص", "تم القص", "معلق - في انتظار الخياطة",
  "في الخياطة", "متاح للإمبلاج / التعبئة", "جاهز للتسليم"
];
const MANUAL_FACTORY_ORDER_STATUSES = FACTORY_ORDER_STATUSES.filter((status) =>
  !["معلق - في انتظار الخياطة", "في الخياطة", "متاح للإمبلاج / التعبئة"].includes(status)
);
const LOCKED_FACTORY_ORDER_STATUSES = ["مكتمل", "تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"];

function adminDashboardView(data) {
  const activeOrders = data.models.filter((order) => !order.archivedAt);
  const deliveredOrders = activeOrders.filter((order) => LOCKED_FACTORY_ORDER_STATUSES.includes(order.status));
  const operatingOrders = activeOrders.filter((order) => !LOCKED_FACTORY_ORDER_STATUSES.includes(order.status));
  const drawerIncome = sumMoney([
    ...data.payments.map((payment) => payment.amount),
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
    amount: Math.max(0, sumMoney([
      summary.openingBalance,
      summary.deliveredTotal,
      -summary.orderPaid,
      -summary.paymentsTotal
    ]))
  })).filter((entry) => entry.amount > 0).sort((left, right) => right.amount - left.amount);
  const customerReceivables = sumMoney(clientDebts.map((entry) => entry.amount));
  const upcomingReceivables = sumMoney(clientSummaries.map((summary) => summary.expectedTotal));
  const orderDetail = (order, quantity, amount) => ({
    label: `${order.name}${order.client ? ` · ${order.client}` : ""}`,
    note: `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(quantity)} قطعة · ${order.displayStatus || order.status || "الحالة غير محددة"} · الأقسام: ${workStageLabels(order.workStages).join("، ") || "غير محددة"}`,
    value: money(amount)
  });
  const cashDetails = [
    { label: "دفعات العملاء", note: `${data.payments.length} دفعة`, value: money(sumMoney(data.payments.map((payment) => payment.amount))) },
    { label: "مدفوعات على الطلبات", note: `${activeOrders.length} موديل`, value: money(sumMoney(data.models.map((order) => order.paidAmount))) },
    { label: "إيرادات أخرى", note: `${data.cashTransactions.filter((entry) => entry.direction === "income").length} حركة`, value: money(sumMoney(data.cashTransactions.filter((entry) => entry.direction === "income").map((entry) => entry.amount))) },
    { label: "مصروفات ومسحوبات", note: `${data.cashTransactions.filter((entry) => entry.direction === "expense").length + workerCashOutflows(data).length} حركة`, value: money(drawerExpenses) }
  ];
  const activeOrderDetails = operatingOrders.map((order) => orderDetail(order, order.remainingPieces ?? order.quantity, order.expectedAmount));
  const deliveredOrderDetails = deliveredOrders.map((order) => orderDetail(order, order.deliveredPieces, order.totalAmount));
  const groups = [
    ["قيد الانتظار", operatingOrders.filter((order) => order.status === "قيد الانتظار").length],
    ["في الفرش", operatingOrders.filter((order) => order.status === "قيد الفرش").length],
    ["في الخياطة", operatingOrders.filter((order) => order.status === "في الخياطة").length]
  ];
  return `<div class="stats-grid">${stat("النقدية في الدرج", money(drawerBalance), "", statDetailList(cashDetails))}${stat("مديونيات العملاء", money(customerReceivables), "", statDetailList(clientDebts.map(({ client, amount }) => ({
    label: `${client.name || "عميل بدون اسم"}${client.brand_name ? ` · ${client.brand_name}` : ""}`,
    value: money(amount)
  })), "لا توجد مديونيات مستحقة على العملاء."))}${stat("بضاعة تحت التسليم", money(upcomingReceivables), "", statDetailList(clientSummaries.flatMap((summary) => summary.orders
    .filter((order) => order.expectedAmount > 0)
    .map((order) => orderDetail(order, order.remainingPieces ?? order.quantity, order.expectedAmount))), "لا توجد بضاعة متبقية للتسليم."))}${stat("شغل حالياً", operatingOrders.length, "طلبات قيد التشغيل", statDetailList(activeOrderDetails, "لا توجد طلبات قيد التشغيل."))}${stat("تم التسليم", deliveredOrders.length, "طلبات تم تسليمها", statDetailList(deliveredOrderDetails, "لا توجد طلبات تم تسليمها."))}${groups.map(([label, value]) => stat(label, value, "", statDetailList(operatingOrders
    .filter((order) => order.status === label)
    .map((order) => orderDetail(order, order.remainingPieces ?? order.quantity, order.expectedAmount)), `لا توجد موديلات في مرحلة ${label}.`))).join("")}</div>
    ${panel("آخر الموديلات وحالتها", activeOrders.length
      ? table(["الموديل","العميل","العدد","سعر القطعة","الحالة"], activeOrders.slice(0, 12).map((order) => `<tr><td>${escapeHtml(order.name)}${order.modelNumber ? ` · ${escapeHtml(order.modelNumber)}` : ""}</td><td>${escapeHtml(order.client || "—")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)}</td><td>${money(order.pricePerPiece)}</td><td>${statusTag(order.displayStatus || order.status)}</td></tr>`))
      : '<div class="empty-state">لا توجد موديلات حالية.</div>')}`;
}

function modelStatusReviewView(data) {
  const orders = data.models;
  const statusOptions = (selected, includeLocked = false) => [...new Set([
    ...MANUAL_FACTORY_ORDER_STATUSES,
    ...(includeLocked ? LOCKED_FACTORY_ORDER_STATUSES : []),
    ...(selected && !MANUAL_FACTORY_ORDER_STATUSES.includes(selected) ? [selected] : [])
  ])]
    .map((status) => `<option value="${escapeHtml(status)}"${selected === status ? " selected" : ""}>${escapeHtml(status)}</option>`)
    .join("");
  return `<div class="clients-toolbar"><div><h2>الموديلات</h2><p>حالة الموديل لا تتغير تلقائياً. تُقفل نهائياً بعد التسليم.</p></div><label class="field model-status-filter"><span>تصفية حسب الحالة</span><select data-filter-model-status><option value="">كل الحالات</option>${statusOptions("", true)}</select></label></div>
    ${orders.length ? `<div class="model-status-list">${orders.map((order) => {
      const isLocked = Boolean(order.archivedAt) || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status);
      const workflowManaged = ["معلق - في انتظار الخياطة", "في الخياطة", "متاح للإمبلاج / التعبئة"].includes(order.status);
      return `<article class="model-status-row" data-model-status-row data-current-status="${escapeHtml(order.status)}">
      <div class="model-status-info"><strong>${escapeHtml(order.name)}</strong><span>العميل: ${escapeHtml(order.client || "—")}</span><span>العدد: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة</span><span>السعر: ${money(order.pricePerPiece)}</span></div>
      ${statusTag(order.displayStatus || order.status)}
      <label class="model-status-control"><span>الحالة اليدوية${isLocked ? " · مقفلة" : workflowManaged ? " · تُدار من سير الإنتاج" : ""}</span><select data-model-status="${escapeHtml(order.id)}"${isLocked || workflowManaged ? " disabled" : ""}>${statusOptions(order.status, isLocked)}</select></label>
      <button class="button button-secondary" type="button" data-save-model-status="${escapeHtml(order.id)}"${isLocked || workflowManaged ? " disabled" : ""}>حفظ الحالة</button>
      ${isLocked ? '<span class="order-delete-protected">لا يمكن تغيير حالة موديل تم تسليمه أو إغلاقه.</span>' : ""}
      ${workflowManaged ? '<span class="order-delete-protected">تُحدّث هذه الحالة من أزرار إتاحة الخياطة وبدء الخياطة والإمبلاج.</span>' : ""}
    </article>`;
    }).join("")}</div>` : '<div class="empty-state">لا توجد موديلات لمراجعتها.</div>'}`;
}

function clientDetailsView(client, data) {
  const summary = clientAccountSummary(client, data);
  const pricedOrders = summary.orders.filter((order) => order.pricePerPiece > 0);
  const unpricedOrders = summary.orders.filter((order) => order.pricePerPiece <= 0);
  const archivedOrders = summary.archivedOrders;
  const deliveries = data.deliveries.filter((delivery) => delivery.customer_id === client.id);
  const clientFabrics = data.fabrics.filter((fabric) => fabric.customer_id === client.id);
  const clientFabricIds = new Set(clientFabrics.map((fabric) => fabric.id));
  const clientFabricTransactions = data.fabricTransactions.filter((transaction) => clientFabricIds.has(transaction.fabric_id));
  const payments = data.payments.filter((payment) => payment.customerId === client.id);
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
      date: payment._createdAt || payment.created_at || payment.date
    })),
    ...data.models.filter((order) => order.customerId === client.id && Number(order.paidAmount) > 0).map((order) => ({
      type: "دفعة مثبتة على الموديل",
      reference: order.name || order.modelNumber || "—",
      detail: `الموديل ${order.modelNumber || ""}`,
      amount: -Number(order.paidAmount),
      date: order.created_at
    })),
    ...summary.settlements.map((entry) => ({
      type: "تصفية وترحيل رصيد",
      reference: "رصيد سابق مرحّل",
      detail: `افتتاحي ${money(entry.openingBalance)} · ختامي ${money(entry.balance)}`,
      amount: Number(entry.balance),
      date: entry.date || entry._createdAt
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const orderCard = (order, archived = false) => {
    const index = dashboardData.models.findIndex((item) => item.id === order.id);
    const locked = Boolean(order.archivedAt) || LOCKED_FACTORY_ORDER_STATUSES.includes(order.status);
    return `<article class="order-card client-history-card">
    <label class="print-model-select"><input type="checkbox" data-print-model-select="${escapeHtml(order.id)}"><span>اختيار للطباعة</span></label>
    <header class="order-card-heading">${modelImageMarkup(order.modelImageUrl)}<div><p class="order-card-label">${archived ? "طلب مؤرشف" : "طلب حالي"}${order.modelNumber ? ` · رقم ${escapeHtml(order.modelNumber)}` : ""}</p><h3>${escapeHtml(order.name || "موديل بدون اسم")}</h3></div>${statusTag(order.displayStatus || order.status)}</header>
    <dl class="order-card-details">
      <div><dt>العدد الإجمالي بعد القص</dt><dd>${order.quantity ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة` : "بانتظار الحصر"}</dd></div>
      <div><dt>المستلم</dt><dd>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.deliveredPieces)} قطعة</dd></div>
      <div><dt>المتبقي</dt><dd>${order.quantity ? `${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.remainingPieces)} قطعة` : "بانتظار الحصر"}</dd></div>
      <div><dt>الألوان</dt><dd>${colorSummaryMarkup(order.colors, order.colorNames, order.colorPlyData)}</dd></div>
      <div><dt>المقاسات / العدد لكل مقاس</dt><dd>${escapeHtml(sizeSummary(order.sizes))}</dd></div>
      ${order.pricePerPiece > 0 ? `<div><dt>سعر القطعة</dt><dd>${money(order.pricePerPiece)}</dd></div>` : '<div><dt>التسعير</dt><dd>لم يُسعّر بعد</dd></div>'}
      <div><dt>مصاريف التشغيل الإضافية</dt><dd>${money(order.operationalExpenses)}</dd></div>
      ${order.expectedAmount > 0 ? `<div><dt>المتوقع للكمية غير المسلّمة</dt><dd>${money(order.expectedAmount)}</dd></div>` : ""}
      ${order.totalAmount > 0 ? `<div><dt>إجمالي المستحق بعد التسليم</dt><dd>${money(order.totalAmount)}</dd></div>` : ""}
      <div><dt>التسليم المتوقع</dt><dd>${formatDateOnly(order.expectedDeliveryDate)}</dd></div>
      <div><dt>تاريخ الإنشاء</dt><dd>${formatDateTime(order.created_at)}</dd></div>
      ${order.senderName ? `<div><dt>تم الإرسال بواسطة</dt><dd>${escapeHtml(order.senderName)}</dd></div>` : ""}
      ${archived ? `<div><dt>تاريخ الأرشفة</dt><dd>${formatDateTime(order.archivedAt)}</dd></div>` : ""}
    </dl>
    ${!archived ? `<footer class="order-card-actions"><button class="row-action" type="button" data-edit-client-order="${escapeHtml(order.id)}">تعديل السعر أو بيانات الموديل</button>${locked ? '<span class="status">تم التسليم / مغلق</span>' : order.customerId ? `<button class="row-action" type="button" data-action="record-delivery" data-index="${index}"${order.quantity ? "" : " disabled"}>تسجيل تسليم</button><button class="row-action order-close-action" type="button" data-action="complete-handover" data-index="${index}"${order.quantity ? "" : " disabled"}>تسوية التسليم وإغلاق الطلب</button>` : ""}${orderCanBeDeleted(order) ? `<button class="row-action order-delete-action" type="button" data-action="delete-order" data-order-id="${escapeHtml(order.id)}">حذف الموديل</button>` : '<span class="order-delete-protected" title="لا يمكن حذف طلب له تسليمات أو مصروفات تشغيل أو مبالغ مسجلة">محمي بسجل مالي / مصروفات / تسليم</span>'}</footer>` : ""}
  </article>`;
  };
  const clientNotes = data.clientNotes.filter((note) => note.customerId === client.id);
  return `<div class="clients-toolbar client-detail-toolbar"><div><h2>${escapeHtml(client.name)} · تفاصيل الحساب والعمولة</h2><p>${escapeHtml(client.brand_name || "لا يوجد اسم محل/براند")} · رقم العميل: ${escapeHtml(client.client_number || "—")} · واتساب: ${escapeHtml(client.whatsapp || "—")}</p></div><div class="client-detail-actions"><button class="button button-primary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">＋ إضافة دفعة</button><button class="button button-secondary" type="button" data-print-account>طباعة كشف الحساب</button><button class="button button-secondary" type="button" data-print-selected-models>طباعة الموديلات المحددة</button><button class="row-action" type="button" data-return-clients>العودة للعملاء</button></div></div>
    <div class="client-profile-compact"><span>الهاتف: ${escapeHtml(client.phone || "—")}</span><span>كاش: ${escapeHtml(client.cash_phone || "—")}</span><span>إنستا: ${escapeHtml(client.instagram || "—")}</span><span>تاريخ الملف: ${formatDateTime(client.created_at)}</span></div>
    <div class="stats-grid client-finance-summary">${summary.latestSettlement ? stat("الرصيد السابق المرحّل", money(summary.remainingOpeningBalance)) : ""}${stat("المطلوب المتوقع غير المسلّم", money(summary.expectedTotal), "الكمية غير المسلّمة + مصاريف التشغيل")}${stat("المبلغ المستحق فعلياً", money(summary.requiredAfterDelivery), "قيمة المسلّم + مصاريف التشغيل")}${stat("مصروفات وعهد العميل", money(summary.clientExpensesTotal))}${stat("إجمالي المطلوب بعد المدفوع", money(summary.due), "الرصيد المرحّل + المستحق + المصروفات − المدفوع")}${stat("إجمالي المدفوع", money(summary.paid))}${stat("الرصيد الحالي", money(summary.balance), summary.balance === 0 ? "تم السداد بالكامل" : summary.balance < 0 ? "رصيد دائن للعميل" : "مستحق على العميل")}</div>
    <section class="client-detail-section"><header class="section-heading"><div><h2>الموديلات التي تم تسعيرها</h2><p>يُحتسب المطلوب المالي على الكمية التي تم تسليمها.</p></div><button class="button button-secondary" type="button" data-open-order-for-client="${escapeHtml(client.id)}">＋ إضافة موديل للعميل</button></header>${pricedOrders.length ? `<div class="order-cards">${pricedOrders.map((order) => orderCard(order)).join("")}</div>` : '<div class="empty-state">لا توجد موديلات مسعّرة في الفترة الحالية.</div>'}</section>
    <section class="client-detail-section"><header class="section-heading"><div><h2>موديلات لم تُسعّر بعد</h2><p>طلبات في القص أو الانتظار أو مراحل التشغيل الأخرى.</p></div></header>${unpricedOrders.length ? `<div class="order-cards">${unpricedOrders.map((order) => orderCard(order)).join("")}</div>` : '<div class="empty-state">لا توجد موديلات بانتظار التسعير.</div>'}</section>
    <section class="client-detail-section">${panel("الموديلات المسلّمة", deliveries.length ? table(["الموديل","الكمية","سعر القطعة","القيمة المستحقة","المستلم","التاريخ"], deliveries.map((delivery) => { const order = data.models.find((item) => item.id === delivery.order_id); return `<tr><td>${escapeHtml(order?.name || "طلب مؤرشف")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(delivery.quantity)} قطعة</td><td>${money(delivery.price_per_piece)}</td><td>${money(delivery.amount)}</td><td>${escapeHtml(delivery.recipient_name || "—")}</td><td>${formatDateTime(delivery.delivered_at)}</td></tr>`; })) : '<div class="empty-state">لا توجد تسليمات مسجلة لهذا العميل.</div>')}</section>
    <section class="client-detail-section">${panel("سجل القماش الداخل للعميل", clientFabrics.length ? table(["القماش / اللون","المتاح","الحركة","الكمية","التاريخ"], clientFabricTransactions.map((transaction) => { const fabric = clientFabrics.find((item) => item.id === transaction.fabric_id); return `<tr><td>${escapeHtml(fabric?.name || "—")} · ${escapeHtml(fabric?.color_name || "لون غير مسمى")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric?.quantity_available || 0)} ${escapeHtml(fabric?.unit || "")}</td><td>${escapeHtml(transaction.transaction_type)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(transaction.quantity)} ${escapeHtml(fabric?.unit || "")}</td><td>${formatDateTime(transaction.created_at)}</td></tr>`; })) : '<div class="empty-state">لا يوجد قماش مرتبط بهذا العميل.</div>')}</section>
    <section class="client-detail-section">${panel("الداخل والخارج للعميل", `<form class="form-grid client-cash-form" data-client-cash-form="${escapeHtml(client.id)}"><div class="field"><label for="client-cash-category-${escapeHtml(client.id)}">بند المصروف / العهدة</label><input id="client-cash-category-${escapeHtml(client.id)}" name="category" maxlength="120" placeholder="مثل: سلفة، خيط، نقل" required></div><div class="field"><label for="client-cash-amount-${escapeHtml(client.id)}">المبلغ على حساب العميل (ج.م)</label><input id="client-cash-amount-${escapeHtml(client.id)}" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="client-cash-method-${escapeHtml(client.id)}">طريقة الصرف</label><input id="client-cash-method-${escapeHtml(client.id)}" name="method" value="نقدي" maxlength="80"></div><div class="field"><label for="client-cash-date-${escapeHtml(client.id)}">تاريخ الحركة</label><input id="client-cash-date-${escapeHtml(client.id)}" name="occurredAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field wide"><label for="client-cash-description-${escapeHtml(client.id)}">البيان / التفاصيل</label><input id="client-cash-description-${escapeHtml(client.id)}" name="description" maxlength="500" required></div><div class="form-actions"><button class="button button-primary" type="submit">تسجيل المصروف على الحساب</button></div></form>${financialEntries.length ? table(["النوع","الموديل / المرجع","التفاصيل","الأثر المالي","التاريخ والوقت"], financialEntries.map((entry) => `<tr><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.reference)}</td><td>${escapeHtml(entry.detail)}</td><td class="${entry.amount < 0 ? "financial-credit" : "financial-debit"}">${money(entry.amount)}</td><td>${formatDateTime(entry.date)}</td></tr>`)) : '<div class="empty-state">لا توجد حركات مالية مسجلة لهذا العميل حتى الآن.</div>'}`)}</section>
    <section class="client-detail-section">${panel("ملاحظات وتنبيهات خاصة بالعميل", `${clientNotes.length ? `<div class="client-note-list">${clientNotes.map((note) => `<article><p>${escapeHtml(note.note || "")}</p><time>${formatDateTime(note._createdAt || note.created_at)}</time></article>`).join("")}</div>` : '<div class="empty-state">لا توجد ملاحظات مسجلة.</div>'}<form class="client-note-form" data-client-note="${escapeHtml(client.id)}"><label for="client-note-${escapeHtml(client.id)}">إضافة ملاحظة أو تنبيه</label><textarea id="client-note-${escapeHtml(client.id)}" name="note" rows="3" required></textarea><button class="button button-secondary" type="submit">حفظ الملاحظة</button></form>`)}</section>
    <section class="client-detail-section"><header class="section-heading"><div><h2>الفترات المالية السابقة</h2><p>الأوامر والتسليمات محفوظة في الأرشيف ولا تُحذف عند التصفية.</p></div><button class="button button-primary" type="button" data-settle-client="${escapeHtml(client.id)}">تصفية الحساب وترحيل الرصيد</button></header>
      ${summary.settlements.length ? `<div class="settlement-history">${summary.settlements.map((entry) => `<article class="settlement-card"><div><strong>رصيد سابق مرحّل</strong><small>${formatDateTime(entry.date || entry._createdAt)}</small></div><div><span>رصيد افتتاحي</span><strong>${money(entry.openingBalance)}</strong></div><div><span>قيمة التسليمات</span><strong>${money(entry.deliveredTotal)}</strong></div><div><span>مصروفات وعهد</span><strong>${money(entry.clientExpensesTotal || 0)}</strong></div><div><span>المدفوع</span><strong>${money(Number(entry.orderPaidTotal || 0) + Number(entry.paymentsTotal || 0))}</strong></div><div><span>رصيد الفترة الختامي</span><strong>${money(entry.balance)}</strong></div></article>`).join("")}</div>` : '<div class="empty-state">لم تتم تصفية حساب العميل سابقًا.</div>'}
      ${archivedOrders.length ? `<h3 class="history-subheading">الموديلات والطلبات المؤرشفة</h3><div class="order-cards">${archivedOrders.map((order) => orderCard(order, true)).join("")}</div>` : ""}
    </section>`;
}

function pendingAccountRows(accounts) {
  const pending = accounts.filter((account) => account.status === "pending");
  return pending.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.username)}</td><td>${formatDateTime(account.created_at)}</td><td><select aria-label="الدور الجديد" data-pending-role="${escapeHtml(account.id)}"><option value="">اختر الدور</option><option value="client">عميل</option><option value="worker">عامل</option><option value="cutting">مشرف قص</option><option value="sewing">مشرف خياطة</option></select></td><td><button class="row-action" type="button" data-action="activate-account" data-account-id="${escapeHtml(account.id)}">تفعيل الحساب</button></td></tr>`);
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
  return `<header class="modal-view-heading">${modelImageMarkup(order.modelImageUrl)}<div><small>تفاصيل الطلبية / الفرشة</small><h2 id="model-details-title">${escapeHtml(order.name || "موديل بدون اسم")}</h2><p>رقم الموديل: ${escapeHtml(order.modelNumber || "—")} · العميل: ${escapeHtml(order.client || "—")}</p></div>${statusTag(order.displayStatus || order.status)}</header>
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
      <div><span>الألوان</span><strong>${colorSummaryMarkup(order.colors, order.colorNames, order.colorPlyData)}</strong></div>
      <div><span>المقاسات</span><strong>${escapeHtml(sizeSummary(order.sizes))}</strong></div>
      <div><span>القماش / الفرشة</span><strong>${escapeHtml(order.fabric || "—")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(order.fabricQuantity)} ${escapeHtml(order.fabricUnit || "متر")} · ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.layerCount)} راقات</strong></div>
      <div><span>أقسام الشغل</span><strong>${escapeHtml(workStageLabels(order.workStages).join(" · ") || "—")}</strong></div>
      <div><span>طريقة التسعير</span><strong>${order.pricingMode === "stages" ? "سعر مستقل لكل قسم" : "سعر إجمالي للقطعة"}</strong></div>
      ${pricingDetails}
      <div><span>ملاحظات القص</span><strong>${escapeHtml(order.cuttingNotes || "—")}</strong></div>
      <div><span>تم الإرسال بواسطة</span><strong>${escapeHtml(order.senderName || "—")}</strong></div>
      <div><span>التسليم المتوقع</span><strong>${formatDateOnly(order.expectedDeliveryDate)}</strong></div>
    </div>
    <h3 class="modal-subheading">سجل دفعات التسليم</h3>${deliveryHistory}
    ${showPricingBreakdown && order.quantity > 0 && !order.archivedAt && !LOCKED_FACTORY_ORDER_STATUSES.includes(order.status)
      ? '<div class="form-actions"><button class="button button-primary" type="button" data-open-final-handover>تسليم / تسوية وإغلاق الطلب</button></div>'
      : ""}`;
}

function clientQuickDetailsModalView(client, data) {
  const summary = clientAccountSummary(client, data);
  const orders = summary.orders.slice(0, 8);
  return `<header class="modal-view-heading"><div><small>ملف العميل</small><h2 id="client-account-modal-title">${escapeHtml(client.name)}</h2><p>${escapeHtml(client.brand_name || "—")} · رقم العميل ${escapeHtml(client.client_number || "—")}</p></div></header>
    <div class="client-balance-primary"><span>الرصيد الحالي</span><strong>${money(summary.balance)}</strong><small>${summary.balance < 0 ? "رصيد دائن للعميل" : summary.balance === 0 ? "تم السداد بالكامل" : "مستحق على العميل"}</small></div>
    <div class="compact-detail-grid">
      <div><span>المتوقع / لم يتم التسليم بعد</span><strong>${money(summary.expectedTotal)}</strong></div>
      <div><span>المستحق فعلياً بعد التسليم</span><strong>${money(summary.requiredAfterDelivery)}</strong></div>
      <div><span>المدفوع</span><strong>${money(summary.paid)}</strong></div>
    </div>
    <h3 class="modal-subheading">شغال حالياً</h3>
    ${orders.length ? `<div class="compact-model-list">${orders.map((order) => `<button type="button" class="compact-model-item" data-open-model-id="${escapeHtml(order.id)}"><strong>${escapeHtml(order.name || order.modelNumber || "موديل بدون اسم")}</strong><span>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة · ${money(order.pricePerPiece)}</span>${statusTag(order.displayStatus || order.status)}</button>`).join("")}</div>` : '<p class="empty-state">لا توجد موديلات حالية.</p>'}
    <div class="form-actions"><button class="button button-primary" type="button" data-quick-client-payment="${escapeHtml(client.id)}">إضافة دفعة</button><button class="button button-secondary" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل ملف العميل</button></div>`;
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
  return `<section class="print-section"><h2>بيانات الموديل</h2><table><thead><tr><th>اسم الموديل</th><th>رقم الموديل</th><th>العميل</th><th>العدد</th><th>سعر القطعة</th><th>مصاريف التشغيل</th><th>الإجمالي</th></tr></thead><tbody><tr><td>${escapeHtml(order.name || "—")}</td><td>${escapeHtml(order.modelNumber || "—")}</td><td>${escapeHtml(clientName || order.client || "—")}</td><td>${new Intl.NumberFormat("en-US").format(order.quantity || 0)}</td><td>${money(order.pricePerPiece)}</td><td>${money(order.operationalExpenses)}</td><td>${money(orderTotal)}</td></tr></tbody></table></section>`;
}

function printClientAccount(client, data) {
  const summary = clientAccountSummary(client, data);
  const orders = data.models.filter((order) => order.customerId === client.id);
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
    return `<tr><td>${escapeHtml(order.name || "—")}</td><td>${escapeHtml(order.modelNumber || "—")}</td><td>${new Intl.NumberFormat("en-US").format(order.quantity || 0)}</td><td>${money(order.pricePerPiece)}</td><td>${money(order.operationalExpenses)}</td><td>${money(total)}</td><td>${escapeHtml(order.status || "—")}</td></tr>`;
  }).join("");
  const movementRows = movements.map((entry) =>
    `<tr><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.description || "—")}</td><td>${money(entry.amount)}</td><td>${formatDateTime(entry.date)}</td></tr>`
  ).join("");
  const body = `<section class="print-section"><h2>كشف الحساب · ${escapeHtml(client.name)}</h2><p>البراند: ${escapeHtml(client.brand_name || "—")} · رقم العميل: ${escapeHtml(client.client_number || "—")}</p><div class="print-summary"><div><span>الرصيد السابق المرحّل</span><strong>${money(summary.openingBalance)}</strong></div><div><span>المستحق بعد التسليم</span><strong>${money(summary.deliveredTotal)}</strong></div><div><span>المتوقع غير المسلّم</span><strong>${money(summary.expectedTotal)}</strong></div><div><span>المصروفات والعهد الحالية</span><strong>${money(summary.clientExpensesTotal)}</strong></div><div><span>إجمالي المدفوع</span><strong>${money(summary.paid)}</strong></div><div><span>الرصيد الحالي</span><strong>${money(summary.balance)}</strong></div></div></section>
    <section class="print-section"><h2>الموديلات والطلبيات</h2><table><thead><tr><th>الموديل</th><th>الرقم</th><th>العدد</th><th>سعر القطعة</th><th>مصاريف التشغيل</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>${modelRows || '<tr><td colspan="7">لا توجد موديلات مسجلة.</td></tr>'}</tbody></table></section>
    <section class="print-section"><h2>حركة الحساب</h2><table><thead><tr><th>نوع الحركة</th><th>البيان</th><th>الأثر المالي</th><th>التاريخ</th></tr></thead><tbody>${movementRows || '<tr><td colspan="4">لا توجد حركات مسجلة.</td></tr>'}</tbody></table></section>`;
  printDocument("كشف حساب العميل", body);
}

function fabricSelectOptions(fabrics, selectedId = "", clients = [], allowExternal = false) {
  const selectableFabrics = allowExternal ? fabrics.filter((fabric) => fabric.unit === "توب") : fabrics;
  return `<option value="">اختر خامة من المخزون</option>${allowExternal ? `<option value="external" ${selectedId === "external" ? "selected" : ""}>خامة أخرى / خارجية غير مسجلة بالمخزن</option>` : ""}${selectableFabrics.map((fabric) =>
    `<option value="${escapeHtml(fabric.id)}" data-name="${escapeHtml(fabric.name)}" data-unit="${escapeHtml(fabric.unit)}" data-customer="${escapeHtml(fabric.customer_id || "")}" data-color="${escapeHtml(fabric.color_name || "")}" data-available="${escapeHtml(fabric.quantity_available)}" ${fabric.stock_scope === "incoming" && !fabric.customer_id ? "disabled" : ""} ${fabric.id === selectedId ? "selected" : ""}>${escapeHtml(fabric.name)}${fabric.customer_id ? ` · ${escapeHtml(clients.find((client) => client.id === fabric.customer_id)?.name || "عميل مرتبط")}` : fabric.stock_scope === "incoming" ? " · بانتظار تعيين العميل" : ""} · ${escapeHtml(fabric.color_name || fabric.color_hex)} · متاح ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric.quantity_available)} ${escapeHtml(fabric.unit)}</option>`
  ).join("")}`;
}

function incomingFabricColorRowMarkup() {
  return `<div class="incoming-fabric-color-row" data-incoming-fabric-color-row>
    <label class="field"><span>اسم اللون</span><input name="colorName" maxlength="64"></label>
    <label class="field"><span>درجة اللون</span><input name="colorHex" type="color" value="#ffffff" required></label>
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
  const fabricRows = (fabrics, showActions) => fabrics.map((fabric) => {
    const color = `<span class="fabric-color"><i style="--fabric-color:${escapeHtml(fabric.color_hex)}"></i>${escapeHtml(fabric.color_name || "دون اسم")} · ${escapeHtml(fabric.color_hex)}</span>`;
    const actions = showActions
      ? `<button class="row-action" type="button" data-edit-fabric="${escapeHtml(fabric.id)}">تعديل البيانات</button> <button class="row-action" type="button" data-delete-fabric="${escapeHtml(fabric.id)}">حذف</button>`
      : "متاح للقص";
    return `<tr><td>${escapeHtml(fabric.name)}</td><td>${color}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric.quantity_available)} ${escapeHtml(fabric.unit)}</td><td>${formatDateTime(fabric.received_at || fabric.updated_at)}</td><td>${actions}</td></tr>`;
  });
  const incomingRows = incomingFabrics.map((fabric) => {
    const color = `<span class="fabric-color"><i style="--fabric-color:${escapeHtml(fabric.color_hex)}"></i>${escapeHtml(fabric.color_name || "دون اسم")} · ${escapeHtml(fabric.color_hex)}</span>`;
    const assignment = isAdmin
      ? `<div class="incoming-assignment"><select aria-label="تعيين العميل للقماش" data-incoming-customer="${escapeHtml(fabric.id)}"><option value="">عميل غير معروف / غير محدد حالياً</option>${data.clients.map((client) => `<option value="${escapeHtml(client.id)}" ${client.id === fabric.customer_id ? "selected" : ""}>${escapeHtml(client.name)}</option>`).join("")}</select><button class="row-action" type="button" data-assign-incoming-fabric="${escapeHtml(fabric.id)}">حفظ العميل</button><button class="row-action" type="button" data-edit-fabric="${escapeHtml(fabric.id)}">تعديل</button><button class="row-action order-delete-action" type="button" data-delete-fabric="${escapeHtml(fabric.id)}">حذف</button></div>`
      : "";
    return `<tr><td>${escapeHtml(fabric.name)}</td><td>${color}</td><td>${escapeHtml(customerName(fabric.customer_id) || "عميل غير معروف / غير محدد حالياً")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(fabric.quantity_available)} ${escapeHtml(fabric.unit)}</td><td>${formatDateTime(fabric.received_at || fabric.created_at)}</td><td>${assignment}</td></tr>`;
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
    <div class="stats-grid">${stat("سجلات القماش الداخل", incomingFabrics.length, "مرتبطة بعميل أو بانتظار التحديد")}${stat("المتاح حالياً للقص", new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(incomingFabrics.reduce((sum, fabric) => sum + Number(fabric.quantity_available), 0)), "بعد خصم القماش المستخدم")}${isAdmin ? stat("حركات القماش", totalTransactions, "استلام وسحب") : ""}</div>
    ${panel("القماش الداخل", incomingForm, "اكتب نوع القماش مرة واحدة، ثم أضف لوناً وكمية ووحدة لكل لون. يمكن تسجيل عدة أنواع في الشحنة نفسها.")}
    ${panel("مخزون القماش الحالي للقص", table(["اسم القماش","اللون","العميل","المتاح","تاريخ الاستلام","إجراء"], incomingRows))}
    ${isAdmin ? panel("حركات المخزون", table(["القماش","الحركة","الكمية","رقم الطلب","البيان","التاريخ والوقت","إجراء"], transactionRows)) : ""}
  </section>`;
  if (!isAdmin) return incomingSection;
  const ownerSection = `<section id="owner-fabric" class="dashboard-section">
    <div class="stats-grid">${stat("أصناف قماش الإدارة", ownerFabrics.length, "إدارة خاصة بالأدمن")}${stat("حركات المخزون", totalTransactions, "وارد وسحب")}</div>
    <div class="fabric-admin-tools">
      ${panel("أنواع القماش", `<form class="form-grid fabric-form" id="fabric-form"><input type="hidden" name="fabricId"><div class="field"><label for="fabric-name">اسم القماش</label><input id="fabric-name" name="name" maxlength="120" required></div><div class="field fabric-color-name-field"><label for="fabric-color-name">اسم اللون</label><input id="fabric-color-name" name="colorName" maxlength="64"></div><div class="field fabric-color-picker-field"><label for="fabric-color-hex">درجة اللون</label><input id="fabric-color-hex" name="colorHex" type="color" value="#ffffff" required></div><div class="field"><label for="fabric-unit">وحدة القياس</label><select id="fabric-unit" name="unit" required><option value="متر">متر</option><option value="توب">توب</option></select></div><div class="form-actions"><button class="button button-primary" type="submit">حفظ بيانات القماش</button><button class="row-action" type="button" data-cancel-fabric-edit hidden>إلغاء التعديل</button></div></form>`, "تغيير الوحدة غير متاح بعد تسجيل حركات على الصنف")}
      ${panel("القماش الداخل", `<form class="form-grid fabric-form" id="fabric-receipt-form"><div class="field"><label for="fabric-receipt-date">تاريخ الإدخال</label><input id="fabric-receipt-date" name="receivedAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field"><label for="fabric-receipt-notes">ملاحظات / مرجع</label><input id="fabric-receipt-notes" name="notes" maxlength="500"></div><div class="wide fabric-entry-list" data-fabric-entry-list>${ownerFabricReceiptLineMarkup(ownerFabrics)}</div><div class="form-actions"><button class="button button-secondary" type="button" data-add-fabric-row>＋ إضافة صنف</button><button class="button button-primary" type="submit">＋ تسجيل الكميات الداخلة</button></div></form>`, "هذا رصيد الإدارة فقط، ولا يظهر في سجل القماش الداخل الخاص بمشرف القص")}
      ${panel("تعديل المخزون", `<form class="form-grid fabric-form" id="fabric-adjustment-form"><div class="field"><label for="fabric-adjustment-item">صنف قماش الإدارة</label><select id="fabric-adjustment-item" name="fabricId" required>${fabricSelectOptions(ownerFabrics)}</select></div><div class="field"><label for="fabric-adjustment-quantity">فرق الكمية (+ زيادة / − نقص)</label><input id="fabric-adjustment-quantity" name="adjustment" type="number" step="0.001" required></div><div class="field"><label for="fabric-adjustment-date">تاريخ التعديل</label><input id="fabric-adjustment-date" name="adjustedAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div><div class="field"><label for="fabric-adjustment-notes">سبب التعديل</label><input id="fabric-adjustment-notes" name="notes" maxlength="500" required></div><div class="form-actions"><button class="button button-secondary" type="submit">حفظ التعديل</button></div></form>`, "يُسجل الفرق كحركة تدقيقية ولا يمكن أن يخفض الرصيد إلى أقل من صفر")}
    </div>
    ${panel("مخزون القماش الحالي للإدارة", table(["اسم القماش","اللون","المتاح","آخر تحديث","إجراء"], fabricRows(ownerFabrics, true)))}
    ${panel("سجل حركات مخزون الإدارة", table(["القماش","نوع الحركة","الكمية","رقم الطلب","ملاحظات","التاريخ والوقت"], transactionRows.filter((transaction) => ownerFabrics.some((fabric) => fabric.id === transaction.fabric_id))))}
  </section>`;
  return `${ownerSection}${incomingSection}`;
}

function adminView(data, accounts) {
  const activeOrders = data.models.filter((order) => !order.archivedAt);
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
      <div class="modal-backdrop" id="order-modal" hidden><section class="modal-card order-modal-card" role="dialog" aria-modal="true" aria-labelledby="order-modal-title"><button class="modal-close" type="button" data-close-order aria-label="إغلاق">×</button><h2 id="order-modal-title">إضافة موديل / طلبية</h2><p>يمكن ترك العدد فارغًا حتى انتهاء الفرش والقص، ثم إدخال العدد الفعلي عند تعديل الطلب.</p>      <form id="model-form" class="order-form modal-form"><input type="hidden" name="editIndex" value=""><input type="hidden" name="savedOrderId" value=""><input type="hidden" name="productionType" value="full_cutting">
        <section class="form-section"><h3>المعلومات الأساسية <span>إجباري</span></h3><div class="form-section-grid">
          <input type="hidden" name="customerId">
          <div class="field model-customer-field"><label for="model-client">اختيار اسم العميل</label><select id="model-client" name="customerSelection"><option value="">اختر اسم العميل</option>${clientOptions}</select><small>اختر العميل أو البراند؛ اختيار أحدهما يلغي الآخر.</small></div>
          <div class="field model-brand-field"><label for="model-brand">اختيار اسم البراند</label><select id="model-brand" name="brandSelection"><option value="">اختر اسم البراند</option>${brandOptions}</select></div>
          <div class="field model-name-field"><label for="model-name">اسم الموديل</label><input id="model-name" name="name"></div>
          <div class="field model-number-field"><label for="model-number">رقم الموديل</label><input id="model-number" name="modelNumber"></div>
          <div class="field model-quantity-field"><label for="model-quantity">العدد الكلي</label><input id="model-quantity" name="quantity" type="number" min="0" step="1" placeholder="أدخل العدد أو اتركه حتى انتهاء القص"><small>يمكن إدخال العدد الآن أو تأجيله؛ عند اختيار الألوان والمقاسات يوزع النظام العدد تلقائياً.</small></div>
          <div class="field" data-original-quantity-field hidden><label for="model-original-quantity">العدد المطلوب الأصلي</label><input id="model-original-quantity" name="originalQuantity" type="number" min="0" step="1"></div>
        </div></section>
        <section class="form-section"><h3>التفاصيل التشغيلية <span>اختياري</span></h3><div class="form-section-grid">
          <fieldset class="field work-stage-picker"><legend>الأقسام المطلوبة</legend><div class="work-stage-options">${WORK_STAGES.map(([key, label]) => `<label><input type="checkbox" name="workStage" value="${key}" ${["cutting", "sewing", "finishing"].includes(key) ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset>
          ${colorPickerMarkup("", "model-colors")}
          ${sizePickerMarkup("", "model-sizes")}
          <div class="model-allocation field"><label>توزيع العدد على الألوان والمقاسات</label><div data-model-allocation-grid><p class="muted">أدخل العدد الكلي واختر الألوان والمقاسات لعرض التوزيع.</p></div><input type="hidden" name="colorSizeDistribution" value='{"colors":[]}'></div>
          <label class="field model-image-field"><span>صورة الموديل (اختياري)</span><input type="file" name="modelImage" accept="image/jpeg,image/png,image/webp"><small>JPG أو PNG أو WEBP بحد أقصى 5 ميجابايت.</small><div data-model-image-preview></div></label>
          <div class="field" data-expected-delivery-field><label for="model-expected-delivery">تاريخ التسليم المتوقع (اختياري)</label><input id="model-expected-delivery" name="expectedDeliveryDate" type="date"></div>
          <div class="field"><label for="model-status">حالة الطلب</label><select id="model-status" name="status"><option>قيد الانتظار</option><option>معلق</option><option>تحت الإنشاء</option><option>قيد الفرش</option><option>تم الفرش / جاهز للقص</option><option>تم القص</option><option>جاهز للتسليم</option><option>تم التسليم</option></select></div>
          <div class="field" data-initial-delivery-field hidden><label for="model-delivered-pieces">العدد المسلّم</label><input id="model-delivered-pieces" name="deliveredPieces" type="number" min="1" step="1"><small>يُسجل كدفعة تسليم تاريخية ويُحتسب ضمن حساب العميل.</small></div>
          <div class="field" data-model-priority-field><label for="model-priority">أولوية التنفيذ</label><select id="model-priority" name="priority"><option>عادي</option><option>مرتفع</option><option>عاجل</option></select></div>
        </div></section>
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
      </form></section></div>
      <div class="modal-backdrop" id="delivery-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="delivery-modal-title"><button class="modal-close" type="button" data-close-delivery aria-label="إغلاق">×</button><h2 id="delivery-modal-title">تسجيل تسليم جديد</h2><p id="delivery-modal-description">أدخل كمية هذه الدفعة واسم مستلمها؛ ستُضاف إلى إجمالي ما تم تسليمه حتى الآن.</p><form id="delivery-form" class="modal-form"><input type="hidden" name="orderId"><input type="hidden" name="finalize" value=""><label for="delivery-settlement-choice" data-settlement-choice-field hidden>طريقة التسوية</label><select id="delivery-settlement-choice" name="settlementChoice" data-settlement-choice-field hidden></select><label for="delivery-quantity" id="delivery-quantity-label">كمية التسليم</label><input id="delivery-quantity" name="quantity" type="number" min="1" step="1" required><label for="delivery-recipient">اسم المستلم</label><input id="delivery-recipient" name="recipientName" required><div class="form-actions"><button class="button button-primary" type="submit">تسجيل التسليم</button><button class="row-action" type="button" data-close-delivery>إلغاء</button></div></form></section></div>
    </section>
    <section id="cutting" class="dashboard-section">${adminCuttingTransferView(data)}</section>
    <section id="sewing" class="dashboard-section">${adminSewingView(data)}</section>
    <section id="finance" class="dashboard-section">
      <div class="client-management-tabs finance-management-tabs" role="tablist" aria-label="حسابات العملاء والمصاريف">
        <button type="button" role="tab" aria-selected="${activeFinanceTab === "payments"}" class="client-management-tab${activeFinanceTab === "payments" ? " active" : ""}" data-finance-tab="payments">الدفعات المالية</button>
        <button type="button" role="tab" aria-selected="${activeFinanceTab === "ledger"}" class="client-management-tab${activeFinanceTab === "ledger" ? " active" : ""}" data-finance-tab="ledger">الداخل والخارج</button>
      </div>
      <div data-finance-panel="payments"${activeFinanceTab === "payments" ? "" : " hidden"}>
        ${panel("تسجيل دفعة مالية", `<div class="panel-body"><form id="payment-form" class="form-grid payment-form"><input type="hidden" name="editIndex" value=""><div class="field"><label for="payment-client">العميل</label><select id="payment-client" name="customerId" required><option value="">اختر العميل</option>${paymentClientOptions}</select></div><div class="field"><label for="payment-amount">المبلغ المدفوع (ج.م)</label><input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="payment-date">تاريخ الدفعة</label><input id="payment-date" name="date" type="date" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}" required></div><div class="field"><label for="payment-method">طريقة الدفع</label><select id="payment-method" name="method"><option>تحويل بنكي</option><option>نقدي</option><option>محفظة إلكترونية</option></select></div><div class="field"><label for="payment-reference">رقم الطلبية / مرجع</label><input id="payment-reference" name="reference" autocomplete="off"></div><div class="field"><label for="payment-notes">ملاحظات</label><input id="payment-notes" name="notes"></div><div class="form-actions"><button class="button button-primary" type="submit">تسجيل الدفعة</button><button class="row-action" type="button" data-cancel-edit hidden>إلغاء التعديل</button></div></form></div>`, "تُربط الدفعة بملف العميل المحدد")}
        ${panel("سجل الدفعات المالية", `<div class="panel-body"><div class="payment-filter field"><label for="payment-filter-client">تصفية حسب العميل</label><select id="payment-filter-client"><option value="">كل العملاء</option>${paymentFilterOptions}</select></div>${table(["العميل","المبلغ","التاريخ والوقت","طريقة الدفع","رقم الطلبية / المرجع","ملاحظات","إجراء"], paymentRows(data.payments, true, data.clients))}</div>`)}
      </div>
      <div data-finance-panel="ledger"${activeFinanceTab === "ledger" ? "" : " hidden"}>${cashLedgerView(data)}</div>
    </section>
    <section id="workers-production" class="dashboard-section">${panel("طلبات وأذونات الانصراف", table(["الموظف","التاريخ","السبب","الحالة","إجراء"], data.leaves.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${formatRecordDate(item.date)}</td><td>${escapeHtml(item.reason)}</td><td>${statusTag(item.status)}</td><td>${item.status === "قيد المراجعة" ? `<button class="row-action" data-action="approve-leave" data-index="${index}" type="button">اعتماد</button> <button class="row-action" data-action="deny-leave" data-index="${index}" type="button">رفض</button>` : "—"}</td></tr>`)))}</section>
    ${fabricStockView(data, true)}
    <section id="clients" class="dashboard-section">
      <div class="client-management-tabs" role="tablist" aria-label="إدارة العملاء">
        <button type="button" role="tab" aria-selected="${clientManagementTab === "summary"}" class="client-management-tab${clientManagementTab === "summary" ? " active" : ""}" data-client-tab="summary">حسابات العملاء</button>
        <button type="button" role="tab" aria-selected="${clientManagementTab === "profiles"}" class="client-management-tab${clientManagementTab === "profiles" ? " active" : ""}" data-client-tab="profiles">ملفات العملاء</button>
      </div>
      <div data-client-panel="summary"${clientManagementTab === "summary" ? "" : " hidden"}>${clientAccountsOverview(data)}</div>
      <div data-client-panel="profiles"${clientManagementTab === "profiles" ? "" : " hidden"}>
      <div class="clients-toolbar"><div><h2>ملفات العملاء</h2><p>بيانات العميل والمحل ووسائل التواصل والحساب.</p></div><button class="button button-primary" type="button" data-open-client-modal>＋ إضافة عميل جديد</button></div>
      ${panel("سجل ملفات العملاء", table(["العميل / المحل","رقم العميل","الهاتف / واتساب","حساب الدخول","إجراء"], data.clients.map((client) => {
        const linkedUser = data.users.find((user) => user.id === client.user_id);
        return `<tr><td>${escapeHtml(client.name)}${client.brand_name ? `<br><small>${escapeHtml(client.brand_name)}</small>` : ""}</td><td>${escapeHtml(client.client_number || "—")}</td><td>${escapeHtml(client.whatsapp || client.phone || "—")}</td><td>${linkedUser ? `${escapeHtml(linkedUser.username)} · ${escapeHtml(linkedUser.status === "suspended" ? "متوقف" : "نشط")}` : "لا يوجد حساب دخول"}</td><td><button class="row-action" type="button" data-open-client-details="${escapeHtml(client.id)}">تفاصيل الحساب والعمولة</button> <button class="row-action" type="button" data-edit-customer="${escapeHtml(client.id)}">تعديل البيانات</button> <button class="row-action order-delete-action" type="button" data-delete-customer="${escapeHtml(client.id)}">حذف العميل</button></td></tr>`;
      })))}
      <div class="modal-backdrop" id="client-modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="client-modal-title"><button class="modal-close" type="button" data-close-client aria-label="إغلاق">×</button><h2 id="client-modal-title">إضافة عميل جديد</h2><p>بيانات ملف العميل ووسائل التواصل.</p><form id="client-form" class="modal-form client-profile-form"><input type="hidden" name="clientId"><label for="client-name">اسم العميل الشخصي</label><input id="client-name" name="name" required><label for="client-brand">اسم المحل أو البراند</label><input id="client-brand" name="brandName"><label for="client-number">رقم العميل</label><input id="client-number" name="clientNumber"><label for="client-phone">رقم الهاتف</label><input id="client-phone" name="phone" type="tel"><label for="client-cash-phone">رقم كاش</label><input id="client-cash-phone" name="cashPhone" type="tel"><label for="client-instagram">حساب إنستا</label><input id="client-instagram" name="instagram"><label for="client-whatsapp">رقم واتساب</label><input id="client-whatsapp" name="whatsapp" type="tel"><label for="client-notes">ملاحظات</label><textarea id="client-notes" name="notes" rows="3"></textarea><div class="form-actions"><button class="button button-primary" type="submit">حفظ العميل</button><button class="row-action" type="button" data-close-client>إلغاء</button></div></form></section></div>
      </div>
    </section>
    <section id="client-details" class="dashboard-section">${data.clients.some((client) => client.id === selectedClientId) ? clientDetailsView(data.clients.find((client) => client.id === selectedClientId), data) : '<div class="empty-state">اختر عميلاً لعرض تفاصيل حسابه.</div>'}</section>
    <section id="accounts" class="dashboard-section">
        ${panel("طلبات الحسابات الجديدة", table(["الاسم الكامل","اسم المستخدم","تاريخ الطلب","تحديد الدور","إجراء"], pendingAccountRows(accounts)))}
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
    <div class="modal-backdrop" data-notification-details-modal hidden><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="notification-details-title"><button class="modal-close" type="button" data-close-notification-details aria-label="إغلاق">×</button><div data-notification-details-content></div><div class="form-actions"><button class="button button-primary" type="button" data-open-notification-model hidden>فتح الموديل</button><button class="row-action" type="button" data-close-notification-details>إغلاق</button></div></section></div>
    <div class="modal-backdrop" data-online-users-modal hidden><section class="modal-card compact-view-modal" role="dialog" aria-modal="true" aria-labelledby="online-users-title"><button class="modal-close" type="button" data-close-online-users aria-label="إغلاق">×</button><h2 id="online-users-title">المتصلون الآن</h2><div class="online-users-list" data-online-users-list></div><div class="form-actions"><button class="row-action" type="button" data-close-online-users>إغلاق</button></div></section></div>`;
}

function cuttingView(data) {
  const priorityOrder = { عاجل: 0, مرتفع: 1, عادي: 2 };
  const readyStatus = "تم الفرش / جاهز للقص";
  const activeCutting = data.cutting
    .filter((item) => ["قيد الانتظار", "معلق", "تحت الإنشاء", "قيد الفرش", readyStatus].includes(item.orderStatus))
    .sort((left, right) => (priorityOrder[left.priority] ?? 3) - (priorityOrder[right.priority] ?? 3));
  const cards = activeCutting.length ? `<div class="cutting-order-grid">${activeCutting.map((item) => {
    const bedReady = item.orderStatus === readyStatus;
    const displayStatus = item.orderStatus === "قيد الفرش" && item.layerCount > 0
      ? `قيد الفرش - تم فرش ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.layerCount)} راقات`
      : item.orderStatus;
    return `<article class="order-card cutting-order-card">
    <header class="order-card-heading">${modelImageMarkup(item.modelImageUrl)}<div><p class="order-card-label">أمر قص · ${escapeHtml(item.order.slice(0, 8))} · الأولوية: ${escapeHtml(item.priority)}</p><h3>${escapeHtml(item.model)}</h3>${item.senderName ? `<p>تم الإرسال بواسطة: ${escapeHtml(item.senderName)}</p>` : ""}</div>${statusTag(displayStatus)}</header>
    <p class="cutting-target">${item.total > 0 ? `العدد الحالي: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.total)} قطعة` : "العدد النهائي: بانتظار اعتماد القص"}</p>
    <form class="cutting-finish-form" data-finish-cutting="${escapeHtml(item.order)}" data-customer-id="${escapeHtml(item.customerId || "")}">
      <div class="form-section-grid cutting-bed-inputs">
        <label class="field"><span>اختيار قماش الفرشة</span><select name="fabricId" data-fabric-select required>${fabricSelectOptions(data.fabrics, item.fabricId, data.clients, true)}</select><small data-fabric-stock-hint></small></label>
        <label class="field"><span>وحدة السحب</span><select name="fabricUnit" data-fabric-unit-select><option value="توب" ${item.fabricUnit === "توب" ? "selected" : ""}>عدد التوب</option><option value="متر" ${item.fabricUnit === "متر" ? "selected" : ""}>الكمية بالمتر</option></select></label>
        <label class="field"><span>الكمية المستخدمة</span><input name="fabricQuantity" type="number" min="0.001" step="0.001" value="${item.fabricQuantity || ""}" required></label>
        <input type="hidden" name="boltCount" value="${item.boltCount || 0}">
        <label class="field" data-external-fabric-source-field hidden><span>مصدر الخامة الخارجية</span><input name="externalFabricSource" maxlength="160" value="${escapeHtml(item.externalFabricSource || "")}" placeholder="مثال: بواقي قماش قديم من المخزن"></label>
        <input type="hidden" name="externalFabricUnit" value="متر">
      </div>
      ${sizePickerMarkup(item.sizes, `cutting-${item.order}`, false)}
      ${cuttingColorPlyMarkup(item.colorPlyData, item.colors, item.layerCount, `cutting-${item.order}`)}
      <p class="cutting-calculated-total">إجمالي الراقات: <strong data-cutting-plys>0</strong> · إجمالي قطع القصة الناتجة: <strong data-cutting-total>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.total)}</strong> قطعة</p>
      <div class="cutting-breakdown" data-cutting-breakdown></div>
      <label class="field"><span>صورة الموديل (اختياري)</span><input type="file" name="modelImage" accept="image/jpeg,image/png,image/webp"><small>الحد الأقصى 5 ميجابايت.</small></label>
      <label class="field"><span>ملاحظات فنية للفرشة والقص</span><textarea name="technicalNotes" rows="3">${escapeHtml(item.technicalNotes || "")}</textarea></label>
      <div class="form-actions">${bedReady ? "" : `<button type="button" class="button button-primary" data-ready-cutting="${escapeHtml(item.order)}">حفظ التفاصيل واعتمادها جاهزة للقص</button>`}<button type="submit" class="button button-primary" ${bedReady ? "" : "hidden"}>تأكيد انتهاء القص</button></div>
    </form>
  </article>`;
  }).join("")}</div>` : '<div class="empty-state">لا توجد أوامر قص نشطة حاليًا.</div>';
  return panel("طلبات الإدارة", cards, "أوامر العمل المحولة من الإدارة");
}

function cuttingDashboardView(data) {
  const active = data.cutting.filter((item) => ["قيد الانتظار", "معلق", "تحت الإنشاء", "قيد الفرش", "تم الفرش / جاهز للقص"].includes(item.orderStatus));
  const activeTotal = active.reduce((sum, item) => sum + Number(item.total), 0);
  const completed = data.cutting.filter((item) => ["تم القص", "معلق - في انتظار الخياطة", "في الخياطة", "مكتمل", "تم التسليم", "تم التسليم بالكامل", "تم التسليم والإغلاق"].includes(item.orderStatus));
  return `<div class="stats-grid">${stat("طلبات الإدارة", active.length, "بانتظار استكمال القص")}${stat("العدد المطلوب لطلبات الإدارة", new Intl.NumberFormat("ar-EG-u-nu-latn").format(activeTotal), "قطعة")}${stat("عمليات قص مكتملة", completed.length, "مسجلة على أوامر الإنتاج")}${stat("أصناف القماش المتاحة", data.fabrics.length, "متابعة مباشرة للمخزون")}</div>${panel("ملخص العمل الحالي", `<div class="empty-state">استخدم «طلبات الإدارة» لمراجعة الأوامر وتسجيل بيانات الفرشة والقص، أو «قصة جديدة» لإنشاء قصة مباشرة.</div>`)}`;
}

function cuttingRequestsView(data) {
  const clientOptions = data.clients.map((client) =>
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`
  ).join("");
  const brandOptions = data.clients.filter((client) => client.brand_name)
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.brand_name)}</option>`)
    .join("");
  return `<section id="admin-requests" class="dashboard-section">${cuttingView(data)}</section>
    <section id="new-cutting" class="dashboard-section">${panel("قصة جديدة", `<form class="cutting-submit-form modal-form" id="cutting-submit-form">
      <section class="form-section"><h3>تسجيل القصة بعد الفرش <span>أدخل التفاصيل كاملة مرة واحدة</span></h3><div class="form-section-grid">
        <input type="hidden" name="customerId">
        <label class="field"><span>اسم العميل</span><select name="customerSelection"><option value="">اختر العميل</option>${clientOptions}</select></label>
        <label class="field"><span>اسم البراند</span><select name="brandSelection"><option value="">اختر البراند</option>${brandOptions}</select></label>
        <label class="field model-name-field"><span>اسم الموديل</span><input name="modelName" autocomplete="off"></label>
        <label class="field model-number-field"><span>رقم الموديل</span><input name="modelNumber" autocomplete="off"></label>
        <label class="field"><span>اختيار قماش الفرشة</span><select name="fabricId" data-fabric-select required>${fabricSelectOptions(data.fabrics, "", data.clients, true)}</select><small data-fabric-stock-hint></small></label>
        <label class="field"><span>وحدة السحب</span><select name="fabricUnit" data-fabric-unit-select><option value="توب">عدد التوب</option><option value="متر">الكمية بالمتر</option></select></label>
        <label class="field"><span>الكمية المستخدمة</span><input name="fabricQuantity" type="number" min="0.001" step="0.001" placeholder="الكمية" required></label>
        <input type="hidden" name="boltCount" value="0">
        <label class="field" data-external-fabric-source-field hidden><span>مصدر الخامة الخارجية</span><input name="externalFabricSource" maxlength="160" placeholder="مثال: بواقي قماش قديم من المخزن"></label>
        <input type="hidden" name="externalFabricUnit" value="">
      </div></section>
      ${sizePickerMarkup("", "new-cutting", false)}
      ${cuttingColorPlyMarkup(null, "", 0, "new-cutting")}
      <p class="cutting-calculated-total">إجمالي الراقات: <strong data-cutting-plys>0</strong> · إجمالي قطع القصة: <strong data-cutting-total>0</strong> قطعة</p>
      <div class="cutting-breakdown" data-cutting-breakdown></div>
      <label class="field"><span>صورة الموديل (اختياري)</span><input type="file" name="modelImage" accept="image/jpeg,image/png,image/webp"><small>الحد الأقصى 5 ميجابايت.</small></label>
      <label class="field"><span>ملاحظات فنية للفرشة والقص</span><textarea name="technicalNotes" rows="3"></textarea></label>
      <div class="form-actions"><button type="submit" class="button button-primary">حفظ القصة واعتمادها جاهزة للقص</button></div>
    </form>`, "بعد إتمام الفرش، سجّل كمية القماش والألوان والمقاسات وعدد الراقات دفعة واحدة. تُحفظ القصة جاهزة للقص عند الإرسال.")}</section>`;
}

function cuttingPersonalAccountView(data) {
  const amountOf = (record) => Number(record.amount ?? record.salary ?? record.netAmount ?? record.value ?? 0);
  const datedRows = (records, columns) => records.map((record) =>
    `<tr>${columns(record).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}<td>${formatDateTime(record._createdAt || record.created_at || record.date)}</td></tr>`
  );
  const advances = data.personalAdvances;
  const payroll = data.personalPayroll;
  const attendance = data.personalAttendance;
  const totalAdvances = advances.reduce((sum, record) => sum + amountOf(record), 0);
  const lastPayroll = payroll[0] || null;
  return `<div class="stats-grid">${stat("سجلات الحضور", attendance.length, "سجل خاص بحسابك")}${stat("إجمالي السُلف المسجلة", money(totalAdvances), "حسب السجلات المتاحة")}${stat("آخر مرتب مسجل", lastPayroll ? money(amountOf(lastPayroll)) : "—", lastPayroll?.period || lastPayroll?.month || "")}</div>
    ${panel("سجل الحضور والغياب", attendance.length
      ? table(["التاريخ","الحالة","ملاحظات","تاريخ التسجيل"], datedRows(attendance, (record) => [formatRecordDate(record.date || record.day || record._createdAt), record.status || record.type || "—", record.notes || record.note || "—"]))
      : '<div class="empty-state">لا توجد سجلات حضور أو غياب مرتبطة بحسابك حاليًا.</div>')}
    ${panel("سجل السُلف", advances.length
      ? table(["المبلغ","البيان","ملاحظات","تاريخ التسجيل"], datedRows(advances, (record) => [money(amountOf(record)), record.description || record.reason || record.reference || "—", record.notes || record.note || "—"]))
      : '<div class="empty-state">لا توجد سُلف مسجلة لحسابك حاليًا.</div>')}
    ${panel("سجل المرتب", payroll.length
      ? table(["الفترة","المرتب","المدفوع","المتبقي","تاريخ التسجيل"], payroll.map((record) => `<tr><td>${escapeHtml(record.period || record.month || record.date || "—")}</td><td>${money(Number(record.salary ?? record.amount ?? 0))}</td><td>${money(Number(record.paidAmount ?? record.paid ?? 0))}</td><td>${money(Number(record.remainingAmount ?? record.remaining ?? 0))}</td><td>${formatDateTime(record._createdAt || record.created_at || record.date)}</td></tr>`))
      : '<div class="empty-state">لا توجد سجلات مرتب مسجلة لحسابك حاليًا.</div>')}`;
}

function sewingOrderRows(orders, actionLabel = "", action = "") {
  return orders.length
    ? table(["رقم الأمر", "الموديل", "العميل", "الكمية", "خط الخياطة", "الحالة", "إجراء"], orders.map((item) =>
      `<tr><td>${escapeHtml(item.order.slice(0, 8))}</td><td>${escapeHtml(item.model)}${item.modelNumber ? `<small> · ${escapeHtml(item.modelNumber)}</small>` : ""}<details class="sewing-order-preview"><summary>معاينة التفاصيل</summary><div>${modelImageMarkup(item.modelImageUrl)}<span>المقاسات: ${escapeHtml(item.sizes || "—")}</span><span>الألوان: ${escapeHtml(item.colors || "—")}</span><span>الأقسام: ${escapeHtml(workStageLabels(item.workStages).join("، ") || "—")}</span>${item.technicalNotes ? `<span>ملاحظات القص: ${escapeHtml(item.technicalNotes)}</span>` : ""}</div></details></td><td>${escapeHtml(item.client || "—")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.target)} قطعة${item.produced ? `<small> · المنجز: ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.produced)}</small>` : ""}</td><td>${escapeHtml(item.line)}</td><td>${statusTag(item.status)}</td><td>${action ? `<button class="button button-secondary" type="button" data-sewing-action="${action}" data-sewing-order="${escapeHtml(item.order)}">${actionLabel}</button>` : "—"}</td></tr>`
    ))
    : '<div class="empty-state">لا توجد قصّات في هذه القائمة.</div>';
}

function sewingView(data) {
  const available = data.sewing.filter((item) => item.status === "متاح للخياطة");
  const inProgress = data.sewing.filter((item) => item.status === "قيد الخياطة");
  const completed = data.sewing.filter((item) => item.status === "مكتمل");
  return `<div class="stats-grid">${stat("قصّات متاحة للبدء", available.length)}${stat("قيد الخياطة الفعلية", inProgress.length)}${stat("محوّلة للإمبلاج / التعبئة", completed.length)}</div>
    ${panel("قصّات متاحة للبدء", sewingOrderRows(available, "بدء الخياطة / استلام على المكنة", "start"), "لا يبدأ العمل إلا بعد استلام المشرف للقصّة")}
    ${panel("قصّات قيد الخياطة الفعلية", sewingOrderRows(inProgress, "تحويل للإمبلاج / التعبئة", "finish"))}
    ${panel("قصّات مكتملة الخياطة", sewingOrderRows(completed), "تم تسليمها للمرحلة التالية")}`;
}

function adminSewingView(data) {
  const available = data.sewing.filter((item) => item.status === "متاح للخياطة");
  const inProgress = data.sewing.filter((item) => item.status === "قيد الخياطة");
  const completed = data.sewing.filter((item) => item.status === "مكتمل");
  return `<div class="stats-grid">${stat("متاحة للخياطة", available.length)}${stat("بدأت الخياطة", inProgress.length)}${stat("مكتملة / محوّلة", completed.length)}</div>
    ${panel("قصّات متاحة للخياطة", sewingOrderRows(available))}
    ${panel("قصّات بدأ المشرف خياطتها", sewingOrderRows(inProgress))}
    ${panel("قصّات مكتملة ومحوّلة للإمبلاج / التعبئة", sewingOrderRows(completed))}`;
}

function adminCuttingTransferView(data) {
  const finishedCutting = data.models.filter((order) =>
    !order.archivedAt
    && ["تم القص", "معلق - في انتظار الخياطة"].includes(order.status)
    && (order.workStages || []).includes("sewing")
  );
  return panel("قصّات جاهزة للإتاحة للخياطة", finishedCutting.length
    ? table(["الموديل", "العميل", "الكمية", "حالة الخياطة", "إجراء"], finishedCutting.map((order) => {
      const sewing = data.sewing.find((stage) => stage.order === order.id);
      const stageStatus = sewing?.status || "مرحلة الخياطة غير موجودة";
      const canTransfer = sewing && !["متاح للخياطة", "قيد الخياطة", "مكتمل"].includes(sewing.status);
      return `<tr><td>${escapeHtml(order.name)}</td><td>${escapeHtml(order.client || "—")}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة</td><td>${statusTag(stageStatus)}</td><td>${canTransfer ? `<button class="button button-secondary" type="button" data-make-sewing-available="${escapeHtml(order.id)}">إتاحة للخياطة</button>` : "—"}</td></tr>`;
    }))
    : '<div class="empty-state">لا توجد قصّات مكتملة تنتظر إتاحتها للخياطة.</div>',
  "لا تبدأ الخياطة تلقائياً عند الإتاحة؛ يستلم المشرف القصّة من لوحته لبدء العمل.");
}

function workerView(data, session) {
  const tasks = data.tasks.filter((item) => item.worker === session.username);
  return `<div class="stats-grid">${stat("المهام المسندة إليّ", tasks.length, "حسب حساب العامل")}${stat("قيد التنفيذ", tasks.filter((item) => item.status === "قيد التنفيذ").length)}${stat("مهام جديدة", tasks.filter((item) => item.status === "جديدة").length)}</div>${panel("مهامي", table(["المهمة","الموديل","الكمية","موعد التسليم","الحالة"], tasks.map((item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.model)}</td><td>${new Intl.NumberFormat("ar-EG-u-nu-latn").format(item.quantity)}</td><td>${escapeHtml(item.due)}</td><td>${statusTag(item.status)}</td></tr>`)))}`;
}

function clientView(data, session) {
  const settlements = data.settlements
    .filter((entry) => entry._ownerId === session.accountId)
    .sort((left, right) => new Date(right.date || right._createdAt).getTime() - new Date(left.date || left._createdAt).getTime());
  const latestSettlement = settlements[0] || null;
  const openingBalance = roundMoney(latestSettlement?.balance || 0);
  const currentOrders = data.models.filter((item) => !item.archivedAt);
  const archivedOrders = data.models.filter((item) => item.archivedAt);
  const payments = data.payments.filter((item) =>
    ((item.clientId || item._ownerId) === session.accountId || item.client === session.username)
    && (!latestSettlement || new Date(item._createdAt || item.created_at).getTime() >= new Date(latestSettlement.date || latestSettlement._createdAt).getTime())
  );
  const totalAmount = sumMoney(currentOrders.map((item) => Number(item.totalAmount)));
  const expectedTotal = sumMoney(currentOrders.map((item) => item.expectedAmount));
  const clientExpensesTotal = sumMoney(data.cashTransactions
    .filter((entry) =>
      entry.direction === "expense"
      && (!latestSettlement || new Date(entry.occurred_at).getTime() >= new Date(latestSettlement.date || latestSettlement._createdAt).getTime())
    )
    .map((entry) => entry.amount));
  const paymentsTotal = sumMoney(payments.map((item) => item.amount));
  const orderPaid = sumMoney(currentOrders.map((item) => item.paidAmount));
  const totalPaid = addMoney(paymentsTotal, orderPaid);
  const grossDue = addMoney(addMoney(openingBalance, totalAmount), clientExpensesTotal);
  const remaining = subtractMoney(grossDue, totalPaid);
  const due = remaining;
  const remainingOpeningBalance = openingBalance > 0
    ? Math.max(0, subtractMoney(openingBalance, totalPaid))
    : openingBalance;
  const deliveredUnits = currentOrders.reduce((sum, item) => sum + Number(item.quantity), 0);
  const paymentPanel = panel("دفعاتي المالية", table(
    ["المبلغ", "تاريخ ووقت التسجيل", "طريقة الدفع"],
    payments.map((item) => `<tr><td>${money(item.amount)}</td><td>${formatDateTime(item._createdAt || item.created_at || item.date)}</td><td>${escapeHtml(item.method)}</td></tr>`)
  ));
  const expensePanel = data.cashTransactions.length
    ? panel("مصروفات وعهد مسجلة على الحساب", table(
      ["البند", "البيان", "المبلغ", "التاريخ"],
      data.cashTransactions.map((entry) => `<tr><td>${escapeHtml(entry.category)}</td><td>${escapeHtml(entry.description || "—")}</td><td>${money(entry.amount)}</td><td>${formatDateTime(entry.occurred_at)}</td></tr>`)
    ))
    : "";
  return `<section id="dashboard" class="dashboard-section"><div class="stats-grid">${stat("موديلاتي الحالية", currentOrders.length, "ضمن الفترة الحالية")}${stat("العدد الفعلي", new Intl.NumberFormat("ar-EG-u-nu-latn").format(deliveredUnits), "قطعة بعد القص")}${latestSettlement ? stat("الرصيد السابق المرحّل المتبقي", money(remainingOpeningBalance), "بعد احتساب المدفوعات الحالية") : ""}${stat("الإجمالي المتوقع للطلبات", money(expectedTotal), "يشمل مصاريف التشغيل")}${stat("المطلوب بعد التسليم", money(totalAmount), "قيمة الشغل المسلّم ومصاريفه")}${stat("مصروفات وعهد على الحساب", money(clientExpensesTotal))}${stat("إجمالي المطلوب بعد خصم المدفوع", money(due), "الرصيد المرحّل + المستحق + المصروفات − المدفوع")}${stat("إجمالي المدفوع", money(totalPaid))}${stat("الرصيد المتبقي", money(remaining), remaining === 0 ? "تم السداد بالكامل" : remaining < 0 ? "رصيد دائن للعميل" : "مستحق على العميل")}</div></section><section id="orders" class="dashboard-section">${panel("موديلاتي والطلبيات الحالية", clientOrderCards(currentOrders))}${archivedOrders.length ? panel("الطلبات المؤرشفة", clientOrderCards(archivedOrders)) : ""}</section><section id="finance" class="dashboard-section">${paymentPanel}${expensePanel}</section>`;
}

let sidebarCollapsed = false;
let activeDashboardView = "";
let activeOrdersTab = "models";

function navigationItems(role, info) {
  if (role === "admin") {
    return [
      { id: "dashboard", icon: "▦", label: "لوحة التحكم" },
      { id: "clients", icon: "◇", label: "إدارة العملاء" },
      { id: "orders", icon: "▤", label: "الموديلات والطلبيات" },
      { id: "cutting", icon: "✂", label: "القص" },
      { id: "sewing", icon: "⌁", label: "الخياطة" },
      { id: "workers-production", icon: "⌁", label: "العمال والإنتاج" },
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
      { id: "finance", icon: "ج.م", label: "الدفعات المالية" }
    ];
  }
  if (role === "cutting") {
    return [
      { id: "dashboard", icon: info.icon, label: "لوحة التحكم" },
      { id: "admin-requests", icon: "✂", label: "طلبات الإدارة" },
      { id: "new-cutting", icon: "＋", label: "قصة جديدة" },
      { id: "incoming-fabric", icon: "↘", label: "القماش الداخل" },
      { id: "personal-account", icon: "◷", label: "متابعة الحساب والراتب", last: true }
    ];
  }
  return [{ id: "dashboard", icon: info.icon, label: "لوحة التحكم" }];
}

function render(session, data, accounts) {
  initializeRealtimeNotifications(session);
  document.querySelectorAll("body > #order-modal").forEach((modal) => modal.remove());
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
      : session.role === "cutting"
        ? `<section id="dashboard" class="dashboard-section">${cuttingDashboardView(data)}</section>${cuttingRequestsView(data)}${fabricStockView(data, false)}<section id="personal-account" class="dashboard-section">${cuttingPersonalAccountView(data)}</section>`
      : `<section id="dashboard" class="dashboard-section">${session.role === "cutting" ? cuttingView(data) : session.role === "sewing" ? sewingView(data) : workerView(data, session)}</section>`;
  document.querySelector("#app").innerHTML = `
    <div class="app-shell${collapsedClass}">
      <button class="sidebar-backdrop" type="button" data-sidebar-close aria-label="إغلاق القائمة الجانبية"></button>
      <aside class="sidebar" id="sidebar"><a class="brand" href="../index.html"><img class="brand-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><span class="brand-copy"><strong>AL-MOTAMAYEZ</strong></span></a><nav aria-label="القائمة الرئيسية"><p class="side-label">القائمة الرئيسية</p>${navigation}</nav><div class="sidebar-bottom"><div class="profile-chip"><span class="avatar">${username.slice(0, 1)}</span><div class="profile-details"><strong>${username}</strong><span>${escapeHtml(session.roleName)}</span></div></div><button class="logout-button" id="logout" type="button">↪ تسجيل الخروج</button></div></aside>
      <main class="main-content"><header class="topbar"><div class="topbar-leading"><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="sidebar" aria-expanded="true" aria-label="طي القائمة الجانبية"><span aria-hidden="true">☰</span></button><div class="topbar-title"><h1>${info.title}</h1><p>${info.description}</p></div></div><div class="header-brand"><button class="online-indicator${onlineUserCount ? " online" : ""}" data-online-indicator type="button" title="عرض الحسابات المتصلة"><span class="online-indicator-dot"></span><span>متصلون الآن: <strong data-online-count>${onlineUserCount}</strong></span></button><div class="notification-control"><button class="live-notification-button" type="button" data-live-notifications aria-label="الإشعارات" aria-expanded="false"><span aria-hidden="true">🔔</span><span class="live-notification-badge" data-live-badge aria-live="polite" hidden></span></button><section class="notification-dropdown" data-notification-dropdown hidden aria-label="الإشعارات"><header><strong>آخر التحديثات</strong><button type="button" class="notification-mark-read" data-mark-notifications-read>تعليم الكل كمقروء</button></header><div class="notification-list" data-notification-list>${notificationListMarkup()}</div></section></div><img class="header-logo" src="../assets/al-motamayez-logo.png" alt="AL-MOTAMAYEZ logo"><div class="brand-copy"><strong>AL-MOTAMAYEZ</strong></div><span class="date-label">${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "full" }).format(new Date())}</span></div></header>
    ${content}
      <footer class="page-footer">AL-MOTAMAYEZ</footer></main>
    </div>`;
  activateDashboardView(window.location.hash.slice(1) || "dashboard", false);
  bindSidebar();
  bindActions(session);
  refreshNotificationDropdown();
  updateOnlineIndicator();
}

function activateDashboardView(viewId, updateHash = true) {
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
  const notificationButton = document.querySelector("[data-live-notifications]");
  const notificationDropdown = document.querySelector("[data-notification-dropdown]");
  notificationButton.addEventListener("click", () => {
    notificationDropdown.hidden = !notificationDropdown.hidden;
    notificationButton.setAttribute("aria-expanded", String(!notificationDropdown.hidden));
  });
  document.querySelector("[data-mark-notifications-read]").addEventListener("click", () => {
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
      showNotificationDetails(notification);
    }
  });
  document.querySelector("[data-online-indicator]").addEventListener("click", () => {
    renderOnlineUsersList();
    document.querySelector("[data-online-users-modal]").hidden = false;
  });
  document.querySelector("[data-open-notification-model]").addEventListener("click", (event) => {
    const order = dashboardData.models.find((item) => item.id === event.currentTarget.dataset.orderId);
    if (!order) {
      window.factoryUI.toast("لم يعد الموديل المرتبط بهذا الإشعار متاحاً لحسابك.", "error");
      return;
    }
    document.querySelector("[data-notification-details-modal]").hidden = true;
    const modelDetailsModal = document.querySelector("#model-details-modal");
    modelDetailsModal.dataset.orderId = order.id;
    modelDetailsModal.querySelector("#model-details-modal-content").innerHTML = modelDetailsModalView(order, session.role === "admin");
    modelDetailsModal.querySelector("[data-edit-model-from-details]").hidden = session.role !== "admin" || Boolean(order.archivedAt);
    const deleteButton = modelDetailsModal.querySelector("[data-action='delete-order']");
    deleteButton.dataset.orderId = order.id;
    deleteButton.hidden = session.role !== "admin" || !orderCanBeDeleted(order);
    modelDetailsModal.hidden = false;
  });
  document.querySelectorAll("[data-close-notification-details]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("[data-notification-details-modal]").hidden = true;
  }));
  document.querySelector("[data-notification-details-modal]").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.hidden = true;
  });
  document.querySelectorAll("[data-close-online-users]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("[data-online-users-modal]").hidden = true;
  }));
  document.querySelector("[data-online-users-modal]").addEventListener("click", (event) => {
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
  if (notificationStorageAccount === session.accountId && notificationStorageRole === session.role) {
    filterRealtimeNotifications(session);
    return;
  }
  notificationStorageAccount = session.accountId;
  notificationStorageRole = session.role;
  try {
    const saved = JSON.parse(localStorage.getItem(notificationStorageKey(session.accountId)) || "[]");
    realtimeNotifications = Array.isArray(saved)
      ? saved.filter((item) => item && typeof item.id === "string" && typeof item.message === "string")
        .map((item) => ({
          ...item,
          sources: Array.isArray(item.sources) ? item.sources : [],
          details: Array.isArray(item.details)
            ? item.details.filter((detail) => detail && typeof detail.label === "string" && typeof detail.value === "string")
            : []
        }))
        .slice(0, 40)
      : [];
    filterRealtimeNotifications(session);
  } catch (error) {
    realtimeNotifications = [];
    console.warn("تعذر تحميل الإشعارات المحفوظة محلياً.", error);
  }
}

function notificationSourceAllowed(notification, session) {
  if (session.role === "admin") return true;
  const publicOrderSources = ["الطلبات ومراحل الإنتاج", "التسليمات"];
  return publicOrderSources.includes(notification.source)
    && Boolean(notification.orderId)
    && Boolean(dashboardData?.models.some((order) => order.id === notification.orderId));
}

function filterRealtimeNotifications(session) {
  const filtered = realtimeNotifications.filter((notification) => notificationSourceAllowed(notification, session));
  if (session.role !== "admin") {
    filtered.forEach((notification) => {
      notification.personName = "";
      notification.details = (notification.details || []).filter((detail) => ["حالة الطلب", "الكمية"].includes(detail.label));
      notification.message = notification.clientMessage || `تم تحديث طلبك: ${notification.modelName || "طلبية"}`;
    });
  }
  if (filtered.length !== realtimeNotifications.length) {
    realtimeNotifications = filtered;
    persistRealtimeNotifications();
  }
}

function persistRealtimeNotifications() {
  if (!notificationStorageAccount) return;
  try {
    localStorage.setItem(notificationStorageKey(notificationStorageAccount), JSON.stringify(realtimeNotifications.slice(0, 40)));
  } catch (error) {
    console.warn("تعذر حفظ حالة قراءة الإشعارات محلياً.", error);
  }
}

function notificationListMarkup() {
  if (!realtimeNotifications.length) return '<p class="notification-empty">لا توجد تحديثات حديثة.</p>';
  return realtimeNotifications.slice(0, 20).map((notification) => {
    const summary = [notification.modelName, notification.personName === "غير محدد في سجل التحديث" ? "" : notification.personName].filter(Boolean).join(" · ");
    return `
    <button class="notification-entry${notification.read ? " read" : " unread"}" type="button" data-notification-id="${escapeHtml(notification.id)}">
      <span class="notification-entry-message">${escapeHtml(notification.message)}</span>
      ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
      <time>${formatDateTime(notification.createdAt)}</time>
    </button>`;
  }).join("");
}

function showNotificationDetails(notification) {
  const detailsModal = document.querySelector("[data-notification-details-modal]");
  const details = notification.details || [];
  document.querySelector("[data-notification-details-content]").innerHTML = `
    <h2 id="notification-details-title">${escapeHtml(notification.message)}</h2>
    <p>وقت التحديث: ${formatDateTime(notification.createdAt)}</p>
    <dl class="notification-detail-list">${details.map((detail) => `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`).join("") || "<div><dt>التفاصيل</dt><dd>تم تسجيل التحديث.</dd></div>"}</dl>`;
  const openModelButton = document.querySelector("[data-open-notification-model]");
  const relatedOrder = dashboardData.models.find((order) => order.id === notification.orderId);
  openModelButton.hidden = !relatedOrder;
  openModelButton.dataset.orderId = relatedOrder?.id || "";
  detailsModal.hidden = false;
}

function refreshNotificationDropdown() {
  const list = document.querySelector("[data-notification-list]");
  if (list) list.innerHTML = notificationListMarkup();
  updateRealtimeBadge();
}

function recordRealtimeNotification(source, payload = {}) {
  const eventType = payload.eventType || payload.event || "";
  const action = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" }[eventType] || "تحديث";
  const row = payload.new || payload.old || {};
  const orderId = row.order_id || row.model_id || "";
  const order = dashboardData?.models.find((item) => item.id === orderId);
  const modelName = order?.name || order?.modelNumber || "الطلبية";
  let eventLabel = source;
  if (source === "التسليمات") {
    eventLabel = eventType === "DELETE" ? "حذف تسليم" : eventType === "UPDATE" ? "تعديل تسليم" : "تسجيل تسليم";
  } else if (source === "الطلبات ومراحل الإنتاج") {
    eventLabel = row.signal_type === "stage" ? "تحديث مرحلة تشغيل" : "تحديث طلبية";
  } else {
    const adminLabels = {
      "السجلات": "سجل النظام",
      "الحركة النقدية": "حركة نقدية",
      "تسجيلات الدخول والحسابات": "نشاط حساب",
      "الحسابات": "حساب مستخدم",
      "ملفات العملاء": "ملف عميل",
      "مخزون القماش": "مخزون القماش",
      "حركات القماش": "حركة قماش",
      "حالة الحساب": "حالة حساب"
    };
    eventLabel = adminLabels[source] || "تحديث إداري";
  }
  const isAdmin = notificationStorageRole === "admin";
  const isOrderNotification = ["الطلبات ومراحل الإنتاج", "التسليمات"].includes(source)
    && Boolean(orderId)
    && (isAdmin || Boolean(order));
  if (!isAdmin && !isOrderNotification) return;
  const clientMessage = source === "التسليمات"
    ? `تم تسجيل تسليم لطلبك: ${modelName}`
    : `تم تحديث طلبك: ${modelName}`;
  let initialMessage = isAdmin
    ? `${action}: ${eventLabel}${orderId ? ` — ${modelName}` : ""}`
    : clientMessage;
  const beforeOrder = order ? {
    status: order.status,
    quantity: Number(order.quantity || 0),
    originalQuantity: Number(order.originalQuantity || 0),
    pricePerPiece: Number(order.pricePerPiece || 0),
    deliveredPieces: Number(order.deliveredPieces || 0),
    expectedDeliveryDate: order.expectedDeliveryDate || "",
    priority: order.priority || "",
    workStages: [...(order.workStages || [])]
  } : null;
  const beforeDelivery = source === "التسليمات"
    ? order?.deliveryHistory?.find((delivery) => delivery.id === row.id)
    : null;
  const details = [];
  const deliveryQuantity = Number(row.quantity || 0);
  if (source === "التسليمات" && isAdmin && eventType === "INSERT") {
    const amount = Number(row.amount ?? deliveryQuantity * Number(row.price_per_piece || 0));
    initialMessage = `تم تسجيل تسليم: ${modelName} - العدد: ${deliveryQuantity} - القيمة: ${money(amount)}`;
    details.push(
      { label: "الكمية المسلّمة", value: `${deliveryQuantity} قطعة` },
      { label: "قيمة الدفعة", value: money(amount) }
    );
  } else if (source === "التسليمات" && isAdmin && eventType === "UPDATE") {
    const oldRow = payload.old || {};
    for (const [key, label] of [["quantity", "كمية التسليم"], ["price_per_piece", "سعر القطعة"]]) {
      if (oldRow[key] !== undefined && row[key] !== undefined && Number(oldRow[key]) !== Number(row[key])) {
        const format = key === "quantity" ? (value) => `${Number(value)} قطعة` : (value) => money(value);
        details.push({ label, value: `من ${format(oldRow[key])} إلى ${format(row[key])}` });
      }
    }
  }
  if (isAdmin && !["الطلبات ومراحل الإنتاج", "التسليمات"].includes(source)) {
    const labels = { INSERT: "تم تسجيل", UPDATE: "تم تحديث", DELETE: "تم حذف" };
    details.push({ label: "الإجراء", value: `${labels[eventType] || "تم تحديث"} ${eventLabel}` });
  }
  if (isAdmin && source === "الطلبات ومراحل الإنتاج" && row.signal_type === "order") {
    initialMessage = `${order ? "تم تعديل طلبية" : "تم تحديث طلبية"}: ${modelName}`;
  }
  const commitKey = payload.commit_timestamp || "";
  const fingerprint = `${source}:${eventType}:${row.id || orderId || crypto.randomUUID()}:${commitKey}`;
  if (realtimeNotifications.some((notification) => notification.id === fingerprint)) return;
  realtimeNotifications.unshift({
    id: fingerprint,
    message: initialMessage,
    clientMessage,
    action,
    eventLabel,
    source,
    orderId,
    modelName,
    quantity: deliveryQuantity,
    details,
    sources: [eventLabel],
    beforeOrder,
    beforeDelivery: beforeDelivery ? {
      quantity: Number(beforeDelivery.quantity || 0),
      pricePerPiece: Number(beforeDelivery.price_per_piece || 0)
    } : null,
    deliveryId: source === "التسليمات" ? row.id || "" : "",
    eventType,
    signalType: row.signal_type || "",
    commitKey,
    createdAt: payload.commit_timestamp || new Date().toISOString(),
    read: false
  });
  realtimeNotifications = realtimeNotifications.slice(0, 40);
  persistRealtimeNotifications();
  refreshNotificationDropdown();
}

function subscribeToFactoryUpdates(session) {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  if (presenceChannel) supabaseClient.removeChannel(presenceChannel);
  let channel = supabaseClient
    .channel(`factory-dashboard-${session.accountId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_live_signals" }, (payload) => scheduleRealtimeRefresh(session, "الطلبات ومراحل الإنتاج", payload));
  channel = channel
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_records" }, (payload) => scheduleRealtimeRefresh(session, "السجلات", payload))
    .on("postgres_changes", { event: "*", schema: "public", table: "factory_deliveries" }, (payload) => scheduleRealtimeRefresh(session, "التسليمات", payload))
    .on("postgres_changes", { event: "*", schema: "public", table: "users" }, (payload) => {
      if (session.role === "admin") {
        scheduleRealtimeRefresh(session, "الحسابات", payload);
      } else {
        void revalidateSessionAfterAccountChange(session);
      }
    });
  if (["admin", "cutting"].includes(session.role)) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "factory_fabrics" }, (payload) => scheduleRealtimeRefresh(session, "مخزون القماش", payload));
  }
  if (session.role === "admin") {
    channel = channel
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_fabric_transactions" }, (payload) => scheduleRealtimeRefresh(session, "حركات القماش", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_cash_transactions" }, (payload) => scheduleRealtimeRefresh(session, "الحركة النقدية", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_auth_events" }, (payload) => scheduleRealtimeRefresh(session, "تسجيلات الدخول والحسابات", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_clients" }, (payload) => scheduleRealtimeRefresh(session, "ملفات العملاء", payload));
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

function scheduleRealtimeRefresh(session, source, payload) {
  recordRealtimeNotification(source, payload);
  if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => {
    realtimeRefreshTimer = null;
    void refreshFromRealtime(session, source);
  }, 300);
}

async function refreshFromRealtime(session, source) {
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
    await refreshDashboard(session);
  } catch (error) {
    reportDashboardFailure(session, "وصل تحديث جديد لكن تعذر تحميل البيانات", error);
  } finally {
    realtimeRefreshRunning = false;
  }
}

function enrichRealtimeNotifications(session) {
  for (const notification of realtimeNotifications) {
    if (notification.enriched) continue;
    const order = dashboardData.models.find((item) => item.id === notification.orderId);
    if (order) {
      notification.modelName = order.name || order.modelNumber || "طلبية";
      notification.clientMessage = notification.source === "التسليمات"
        ? `تم تسجيل تسليم لطلبك: ${notification.modelName}`
        : `تم تحديث طلبك: ${notification.modelName}`;
    }
    notification.details = Array.isArray(notification.details) ? notification.details : [];
    if (session.role === "admin" && notification.source === "التسليمات" && order && notification.eventType !== "INSERT") {
      const oldDelivery = notification.beforeDelivery;
      const updatedDelivery = order.deliveryHistory?.find((delivery) => delivery.id === notification.deliveryId);
      if (notification.eventType === "DELETE" && oldDelivery) {
        notification.details = [{ label: "الدفعة المحذوفة", value: `${oldDelivery.quantity} قطعة` }];
      } else if (oldDelivery && updatedDelivery) {
        const changes = [];
        if (oldDelivery.quantity !== Number(updatedDelivery.quantity)) {
          changes.push({ label: "كمية التسليم", value: `من ${oldDelivery.quantity} قطعة إلى ${Number(updatedDelivery.quantity)} قطعة` });
        }
        if (oldDelivery.pricePerPiece !== Number(updatedDelivery.price_per_piece)) {
          changes.push({ label: "سعر القطعة", value: `من ${money(oldDelivery.pricePerPiece)} إلى ${money(updatedDelivery.price_per_piece)}` });
        }
        notification.details = changes;
      }
    }
    if (session.role === "admin" && notification.source === "الطلبات ومراحل الإنتاج" && order) {
      if (notification.signalType === "order") {
        if (!notification.beforeOrder) {
          notification.action = "إضافة";
          notification.eventLabel = "طلبية";
          notification.details = [
            { label: "العدد", value: `${Number(order.quantity || 0)} قطعة` },
            { label: "سعر القطعة", value: money(order.pricePerPiece) }
          ];
        } else {
          const current = {
            status: order.status,
            quantity: Number(order.quantity || 0),
            originalQuantity: Number(order.originalQuantity || 0),
            pricePerPiece: Number(order.pricePerPiece || 0),
            deliveredPieces: Number(order.deliveredPieces || 0),
            expectedDeliveryDate: order.expectedDeliveryDate || "",
            priority: order.priority || "",
            workStages: [...(order.workStages || [])]
          };
          const fields = [
            ["status", "حالة الطلب", (value) => value],
            ["quantity", "العدد المطلوب", (value) => `${value} قطعة`],
            ["originalQuantity", "العدد الأصلي", (value) => `${value} قطعة`],
            ["pricePerPiece", "سعر القطعة", (value) => money(value)],
            ["deliveredPieces", "العدد المسلّم", (value) => `${value} قطعة`],
            ["expectedDeliveryDate", "تاريخ التسليم المتوقع", (value) => value || "غير محدد"],
            ["priority", "الأولوية", (value) => value || "عادي"],
            ["workStages", "الأقسام المطلوبة", (value) => workStageLabels(value).join("، ") || "—"]
          ];
          const changes = fields.flatMap(([key, label, format]) =>
            JSON.stringify(notification.beforeOrder[key]) !== JSON.stringify(current[key])
              ? [{ label, value: `من ${format(notification.beforeOrder[key])} إلى ${format(current[key])}` }]
              : []
          );
          if (changes.length) {
            notification.action = "تعديل";
            notification.eventLabel = "طلبية";
            notification.details = changes;
          } else {
            notification.details = [];
          }
        }
      } else {
        notification.details = [{ label: "التحديث", value: "تم تحديث مرحلة تشغيل الطلبية." }];
      }
    }
    if (session.role !== "admin") {
      notification.details = notification.details.filter((detail) => ["حالة الطلب", "الكمية المسلّمة"].includes(detail.label));
      notification.message = notification.clientMessage || `تم تحديث طلبك: ${notification.modelName || "طلبية"}`;
    } else {
      const verb = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" }[notification.eventType] || "تحديث";
      if (notification.source === "التسليمات") {
        notification.message = notification.eventType === "INSERT"
          ? `تم تسجيل تسليم: ${notification.modelName} - العدد: ${notification.quantity} - القيمة: ${notification.details.find((detail) => detail.label === "قيمة الدفعة")?.value || money(0)}`
          : `تم ${verb} تسليم: ${notification.modelName}`;
      } else if (notification.source === "الطلبات ومراحل الإنتاج" && notification.signalType === "order") {
        notification.message = `${notification.action === "إضافة" ? "تم إضافة طلبية" : "تم تعديل طلبية"}: ${notification.modelName}`;
        if (notification.action === "إضافة" && order) {
          notification.message += ` - العدد: ${Number(order.quantity || 0)} - السعر: ${money(order.pricePerPiece)}`;
        }
      } else if (notification.orderId) {
        notification.message = `تم تحديث ${notification.eventLabel || "الطلبية"}: ${notification.modelName}`;
      } else {
        notification.message = `تم ${verb} ${notification.eventLabel || "سجل النظام"}`;
      }
    }
    notification.enriched = true;
  }
  filterRealtimeNotifications(session);
  persistRealtimeNotifications();
}

async function refreshDashboard(session) {
  const data = await readDashboardData(session);
  dashboardData = data;
  const accounts = await readAccounts(session);
  enrichRealtimeNotifications(session);
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
    requested_original_quantity: Number(updated.originalQuantity ?? updated.quantity),
    requested_status: updated.status,
    requested_fabric: updated.fabric || "",
    requested_line_name: updated.line || "",
    requested_colors: updated.colors || "",
    requested_sizes: updated.sizes || "",
    requested_delivered_pieces: Number(updated.deliveredPieces || 0),
    requested_price_per_piece: Number(updated.pricePerPiece || 0),
    requested_paid_amount: Number(updated.paidAmount || 0),
    requested_expected_delivery_date: updated.expectedDeliveryDate || null,
    requested_model_image_url: updated.modelImageUrl || null,
    requested_priority: updated.priority || "عادي",
    requested_color_names: parseColorNames(updated.colorNames),
    requested_production_type: updated.productionType || "full_cutting",
    requested_color_size_distribution: updated.colorSizeDistribution || { colors: [] },
    requested_work_stages: updated.workStages || ["cutting", "sewing", "finishing"],
    requested_pricing_mode: updated.pricingMode || "total",
    requested_stage_prices: updated.stagePrices || {},
    requested_operational_expenses: Number(updated.operationalExpenses || 0)
  });
  if (error?.code === "PGRST202") {
    throw new Error("دالة حفظ الطلبات المحدّثة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
  }
  if (error) throw error;
  return data;
}

function bindCuttingActions(session) {
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
        if (externalInput) externalInput.required = true;
        if (select.required) select.required = false;
        if (hint) hint.textContent = "الخامة الخارجية لا تخصم من مخزون القماش.";
      } else {
        externalFields.forEach((field) => { field.hidden = true; });
        if (externalInput) externalInput.required = false;
        if (!select.required) select.required = true;
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
  const readCuttingInputs = (form, requireFinal = false, notifyOnInvalid = true) => {
    const cuttingData = updateCuttingCalculation(form);
    const selectedFabricId = form.elements.fabricId.value;
    const isExternal = selectedFabricId === "external";
    const fabricUnit = form.elements.fabricUnit.value;
    const fabricId = isExternal ? null : selectedFabricId;
    const fabricQuantity = Number(form.elements.fabricQuantity.value);
    const boltCount = fabricUnit === "توب" ? fabricQuantity : 0;
    const externalFabricSource = isExternal ? String(form.elements.externalFabricSource.value).trim() : "";
    const fabric = isExternal ? externalFabricSource : form.elements.fabricId.selectedOptions[0]?.dataset.name || "";
    const { sizeData, total } = cuttingData;
    if ((!isExternal && !fabricId) || !fabric || !Number.isFinite(fabricQuantity) || fabricQuantity <= 0
      || !["متر", "توب"].includes(fabricUnit)
      || (!isExternal && fabricUnit !== form.elements.fabricId.selectedOptions[0]?.dataset.unit)
      || (fabricUnit === "توب" && !Number.isSafeInteger(boltCount))
      || !Number.isSafeInteger(boltCount)
      || (requireFinal && (!sizeData.type || !Object.keys(sizeData.counts).length || !Number.isSafeInteger(total) || total <= 0
        || cuttingData.colorPlyData.colors.length === 0
        || cuttingData.colorPlyData.colors.some((entry) => !entry.name || !Number.isSafeInteger(entry.plys) || entry.plys < 1)
        || new Set(cuttingData.colorPlyData.colors.map((entry) => entry.color)).size !== cuttingData.colorPlyData.colors.length))) {
      if (notifyOnInvalid) {
        window.factoryUI.toast(requireFinal
          ? "أكمل المقاسات والألوان وعدد الراقات لكل لون قبل إنهاء القص."
          : "اختر القماش وأدخل كمية سحب صحيحة تطابق وحدة الصنف المسجلة.", "error");
      }
      return null;
    }
    return {
      ...cuttingData,
      fabric,
      fabricId,
      fabricQuantity,
      fabricUnit,
      externalFabricUnit: isExternal ? fabricUnit : "",
      boltCount,
      externalFabricSource,
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
    try {
      const file = form.elements.modelImage.files[0];
      const imageUrl = await uploadModelImage(form.dataset.finishCutting, file);
      imageUploaded = Boolean(imageUrl);
      const { data, error } = await supabaseClient.rpc("finish_factory_cutting", {
        requested_order_id: form.dataset.finishCutting,
        requested_size_data: sizeData,
        requested_color_ply_data: cuttingData.colorPlyData,
        requested_model_image_url: imageUrl,
        requested_fabric: cuttingData.fabric,
        requested_bolt_count: cuttingData.boltCount,
        requested_technical_notes: cuttingData.technicalNotes,
        requested_fabric_id: cuttingData.fabricId,
        requested_fabric_quantity: cuttingData.fabricQuantity,
        requested_external_fabric_unit: cuttingData.externalFabricUnit
      });
      if (error?.code === "PGRST202") throw new Error("دالة إنهاء القص غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      await refreshDashboard(session);
      window.factoryUI.toast(`تم تسجيل ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(data)} قطعة واعتماد حالة «تم القص».`);
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, imageUploaded ? "تم رفع الصورة لكن لم يُسجل إنهاء القص" : "تعذر إنهاء القص", error);
    }
  }));
  const submitForm = document.querySelector("#cutting-submit-form");
  if (submitForm) {
    const setSelectedCustomer = (source) => {
      const customerId = submitForm.elements[source].value;
      submitForm.elements.customerId.value = customerId || "";
      const other = source === "customerSelection" ? "brandSelection" : "customerSelection";
      if (customerId) submitForm.elements[other].value = "";
      const fabricSelect = submitForm.elements.fabricId;
      [...fabricSelect.options].forEach((option) => {
        if (!option.value || option.value === "external") return;
        option.disabled = Boolean(option.dataset.customer && option.dataset.customer !== customerId);
        option.hidden = Boolean(customerId && option.dataset.customer && option.dataset.customer !== customerId);
      });
      if (fabricSelect.value && fabricSelect.selectedOptions[0]?.disabled) {
        fabricSelect.value = "";
        fabricSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    submitForm.elements.customerSelection.addEventListener("change", () => setSelectedCustomer("customerSelection"));
    submitForm.elements.brandSelection.addEventListener("change", () => setSelectedCustomer("brandSelection"));
    submitForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const modelName = String(submitForm.elements.modelName.value).trim();
    const modelNumber = String(submitForm.elements.modelNumber.value).trim();
    const customerId = submitForm.elements.customerId.value;
    if (!modelName && !modelNumber) {
      window.factoryUI.toast("أدخل اسم الموديل أو رقمه على الأقل.", "error");
      return;
    }
    if (!customerId) {
      window.factoryUI.toast("اختر العميل الذي ستُسجل القصة على حسابه.", "error");
      return;
    }
    const cuttingData = readCuttingInputs(submitForm, true);
    if (!cuttingData) return;
    const button = submitForm.querySelector('[type="submit"]');
    button.disabled = true;
    let imageUploaded = false;
    let storySaved = false;
    try {
      const orderId = crypto.randomUUID();
      const imageUrl = await uploadModelImage(orderId, submitForm.elements.modelImage.files[0]);
      imageUploaded = Boolean(imageUrl);
      const { data, error } = await supabaseClient.rpc("submit_factory_cutting", {
        requested_order_id: orderId,
        requested_customer_id: customerId,
        requested_model_name: modelName,
        requested_model_number: modelNumber,
        requested_size_data: cuttingData.sizeData,
        requested_color_ply_data: cuttingData.colorPlyData,
        requested_model_image_url: imageUrl,
        requested_fabric: cuttingData.fabric,
        requested_bolt_count: cuttingData.boltCount,
        requested_technical_notes: cuttingData.technicalNotes,
        requested_fabric_id: cuttingData.fabricId,
        requested_fabric_quantity: cuttingData.fabricQuantity,
        requested_external_fabric_unit: cuttingData.externalFabricUnit
      });
      if (error?.code === "PGRST202") throw new Error("دالة تسجيل القصة بالدفعة الواحدة غير موجودة. شغّل supabase/schema.sql كاملًا في SQL Editor.");
      if (error) throw error;
      storySaved = true;
      await refreshDashboard(session);
      activateDashboardView("admin-requests");
      const activeSession = document.querySelector(`[data-finish-cutting="${orderId}"]`);
      activeSession?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.factoryUI.toast(`تم تسجيل ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(data)} قطعة وأصبحت القصة جاهزة للقص.`);
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, imageUploaded && !storySaved ? "رُفعت الصورة لكن لم تُسجل القصة" : "تعذر حفظ القصة", error);
    }
    });
  }
}

function bindClientDetailActions(session) {
  document.querySelectorAll("#client-details [data-quick-client-payment]").forEach((button) => {
    button.addEventListener("click", () => openClientPayment(button.dataset.quickClientPayment));
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
      form.querySelectorAll('[name="colorHex"]').forEach((input) => { input.value = "#ffffff"; });
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

function bindActions(session) {
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
  if (session.role === "cutting") {
    bindPickers(document.querySelector("#app"));
    bindCuttingActions(session);
    return;
  }
  if (session.role === "sewing") {
    bindSewingStageActions(session);
    return;
  }
  if (session.role !== "admin") return;
  bindFabricAdminActions(session);
  bindSewingStageActions(session);
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
    button.disabled = true;
    try {
      await persistFactoryOrder(order, { status: select.value });
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
    models: { form: "model-form", collection: "models", fields: ["customerId", "name", "modelNumber", "colors", "sizes", "quantity", "productionType", "pricingMode", "expectedDeliveryDate", "pricePerPiece", "paidAmount", "operationalExpenses", "status", "priority"] },
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
    orderForm.querySelector("[data-initial-delivery-field]").hidden = !isDelivered || isEditing;
    orderForm.querySelector("[data-expected-delivery-field]").hidden = isDelivered;
    orderForm.querySelector("[data-model-priority-field]").hidden = isDelivered;
    if (!isEditing && !isDelivered) orderForm.elements.deliveredPieces.value = "";
  };
  bindPickers(orderForm);
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
    }
  });
  orderForm.addEventListener("input", (event) => {
    if (event.target.matches("[data-stage-price]")) {
      syncStagePriceInputs(orderForm);
      updateOrderTotals();
    }
  });
  let modelPreviewObjectUrl = "";
  orderForm.elements.modelImage.addEventListener("change", () => {
    const file = orderForm.elements.modelImage.files[0];
    if (modelPreviewObjectUrl) URL.revokeObjectURL(modelPreviewObjectUrl);
    modelPreviewObjectUrl = file ? URL.createObjectURL(file) : "";
    orderForm.querySelector("[data-model-image-preview]").innerHTML = file
      ? `<img class="model-thumbnail" src="${modelPreviewObjectUrl}" alt="معاينة صورة الموديل">`
      : "";
  });
  const removeWorkflowStatusOptions = () => {
    orderForm.elements.status.querySelectorAll("[data-workflow-status-option]").forEach((option) => option.remove());
  };
  const closeOrderModal = () => {
    orderModal.hidden = true;
    removeWorkflowStatusOptions();
    orderForm.reset();
    orderForm.elements.editIndex.value = "";
    orderForm.elements.status.disabled = false;
    orderForm.querySelector("[data-original-quantity-field]").hidden = true;
    updateOrderConditionalFields();
    updateStagePricing(orderForm);
    orderForm.querySelector("#model-price-history-note").hidden = true;
    if (modelPreviewObjectUrl) URL.revokeObjectURL(modelPreviewObjectUrl);
    modelPreviewObjectUrl = "";
    orderForm.querySelector("[data-model-image-preview]").innerHTML = "";
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
    if (modelPreviewObjectUrl) URL.revokeObjectURL(modelPreviewObjectUrl);
    modelPreviewObjectUrl = "";
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
    orderForm.querySelector("[data-original-quantity-field]").hidden = !closedOrder;
    orderForm.elements.originalQuantity.value = String(currentOrder.originalQuantity);
    orderForm.elements.status.disabled = closedOrder;
    for (const field of ["customerId", "name", "modelNumber", "pricePerPiece", "paidAmount", "operationalExpenses", "status", "priority", "productionType", "pricingMode", "expectedDeliveryDate"]) {
      orderForm.elements[field].value = currentOrder[field] ?? "";
    }
    syncOrderCustomerSelection(orderForm, currentOrder.customerId);
    orderForm.elements.stagePrices.value = JSON.stringify(currentOrder.stagePrices || {});
    orderForm.querySelectorAll('[name="workStage"]').forEach((input) => {
      input.checked = (currentOrder.workStages || []).includes(input.value);
    });
    updateStagePricing(orderForm);
    orderForm.elements.quantity.value = currentOrder.quantity || "";
    orderForm.elements.deliveredPieces.value = currentOrder.deliveredPieces;
    updateOrderConditionalFields();
    setSizePicker(orderForm.querySelector("[data-size-picker]"), currentOrder.sizes);
    setColorPicker(orderForm.querySelector("[data-color-picker]"), currentOrder.colors, currentOrder.colorNames);
    renderModelAllocation(orderForm, currentOrder.colorSizeDistribution);
    orderForm.querySelector("[data-model-image-preview]").innerHTML = modelImageMarkup(currentOrder.modelImageUrl);
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
  });
  for (const modal of [modelDetailsModal, clientAccountModal]) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  }
  document.querySelector("[data-open-order-modal]").addEventListener("click", () => {
    closeOrderModal();
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
    deliveryForm.elements.quantity.min = hasEarlierDeliveries ? "0" : "1";
    deliveryForm.elements.quantity.max = hasEarlierDeliveries ? String(order.remainingPieces) : String(order.quantity);
    deliveryModalTitle.textContent = "تسوية وإغلاق الطلب";
    settlementChoiceFields.forEach((field) => { field.hidden = false; });
    if (hasEarlierDeliveries) {
      settlementChoice.innerHTML = `<option value="close-current">إغلاق على ${order.deliveredPieces} قطعة مسلّمة</option>${order.remainingPieces > 0 ? `<option value="deliver-remainder">تسليم المتبقي (${order.remainingPieces} قطعة) ثم الإغلاق</option>` : ""}`;
      settlementChoice.value = "close-current";
      deliveryModalDescription.textContent = `سبق تسجيل ${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.deliveredPieces)} قطعة. اختر إغلاق الطلب على الكمية المسلّمة أو تسليم جميع القطع المتبقية ثم الإغلاق.`;
      deliveryQuantityLabel.textContent = "كمية الدفعة الأخيرة";
      deliverySubmitButton.textContent = "تسوية وإغلاق الطلب";
    } else {
      settlementChoice.innerHTML = `<option value="full">تسليم كامل العدد (${order.quantity} قطعة)</option>${order.quantity > 1 ? '<option value="partial">تسجيل دفعة أولى جزئية</option>' : ""}`;
      settlementChoice.value = "full";
      deliveryModalDescription.textContent = `لم تُسجل دفعات سابقة. يمكنك تسليم العدد كاملاً (${new Intl.NumberFormat("ar-EG-u-nu-latn").format(order.quantity)} قطعة) أو إدخال كمية أول دفعة جزئية. سيُغلق الطلب بعد التسوية.`;
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
        ? quantity === 0 || quantity === order.remainingPieces
        : quantity > 0 && quantity <= order.quantity;
      if (!validFinalQuantity
          || (!hasEarlierDeliveries && settlementChoice.value === "full" && quantity !== order.quantity)
          || (!hasEarlierDeliveries && settlementChoice.value === "partial" && quantity >= order.quantity)) {
        window.factoryUI.toast(hasEarlierDeliveries
          ? "اختر إغلاق الكمية المسلّمة أو تسليم جميع القطع المتبقية."
          : "اختر التسليم الكامل أو أدخل كمية أقل من العدد الكلي كدفعة جزئية.", "error");
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
        ? subtractMoney(existingOrder.totalAmount, existingOrder.paidAmount)
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
      orderForm.elements.editIndex.value = "";
      updateOrderConditionalFields();
      syncOrderCustomerSelection(orderForm, newOrderButton.dataset.openOrderForClient);
      updateStagePricing(orderForm);
      orderForm.querySelector("#model-price-history-note").hidden = true;
      orderForm.querySelector("[data-model-image-preview]").innerHTML = "";
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
    const formData = new FormData(form);
    const submitButton = form.querySelector('[type="submit"]');
    const editIndex = String(formData.get("editIndex") || "");
    const existingOrder = editIndex ? dashboardData.models[Number(editIndex)] : null;
    const quantityValue = String(formData.get("quantity")).trim();
    const sizeQuantity = sizePickerTotal(form);
    const quantity = quantityValue ? Number(quantityValue) : sizeQuantity;
    const deliveredPieces = Number(formData.get("deliveredPieces"));
    const requestedStatus = String(formData.get("status"));
    const pricePerPiece = Number(formData.get("pricePerPiece"));
    const paidAmount = Number(formData.get("paidAmount"));
    const operationalExpenses = Number(formData.get("operationalExpenses") || 0);
    const modelName = String(formData.get("name")).trim();
    const modelNumber = String(formData.get("modelNumber")).trim();
    const customerId = String(formData.get("customerId"));
    const workStages = [...form.querySelectorAll('[name="workStage"]:checked')].map((input) => input.value);
    const pricingMode = String(formData.get("pricingMode"));
    const stagePrices = JSON.parse(String(formData.get("stagePrices") || "{}"));
    const colors = String(formData.get("colors") || "").trim();
    const colorNames = parseColorNames(formData.get("colorNames"));
    const colorSizeDistribution = JSON.parse(String(formData.get("colorSizeDistribution") || '{"colors":[]}'));
    if (!modelName && !modelNumber) {
      window.factoryUI.toast("أدخل اسم الموديل أو رقمه على الأقل.", "error");
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
        modelNumber,
        quantity,
        originalQuantity: requestedOriginalQuantity,
        deliveredPieces,
        pricePerPiece,
        paidAmount,
        operationalExpenses,
        status: existingOrder && LOCKED_FACTORY_ORDER_STATUSES.includes(existingOrder.status)
          ? existingOrder.status
          : requestedStatus,
        priority: String(formData.get("priority")),
        productionType: String(formData.get("productionType") || existingOrder?.productionType || "full_cutting"),
        workStages,
        pricingMode,
        stagePrices: pricingMode === "stages" ? stagePrices : {},
        fabric: String(formData.get("fabric") || "").trim(),
        line: String(formData.get("line") || "").trim(),
        colors,
        colorNames,
        colorSizeDistribution,
        sizes: String(formData.get("sizes") || "").trim(),
        modelImageUrl: existingOrder?.modelImageUrl || "",
        expectedDeliveryDate: String(formData.get("expectedDeliveryDate") || "")
      };
      savedOrderId = await persistFactoryOrder(orderToSave);
      form.elements.savedOrderId.value = savedOrderId;
      const imageUrl = await uploadModelImage(savedOrderId, form.elements.modelImage.files[0]);
      if (imageUrl) await persistFactoryOrder({ ...orderToSave, id: savedOrderId, modelImageUrl: imageUrl });
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
      message: `سيتم حذف دفعة ${money(payment.amount)} الخاصة بـ${payment.clientName || payment.client || "العميل"} نهائياً، وسيُعاد احتساب رصيده. لا يمكن حذف دفعات فترة تمت تصفيتها.`,
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
      window.factoryUI.toast("تم حذف الدفعة وإعادة احتساب رصيد العميل.");
    } catch (error) {
      button.disabled = false;
      reportDashboardFailure(session, "تعذر حذف الدفعة", error);
    }
  }));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.action === "delete-order") {
      const order = dashboardData.models.find((item) => item.id === button.dataset.orderId);
      if (!order) {
        window.factoryUI.toast("تعذر العثور على الموديل. حدّث الصفحة وحاول مجددًا.", "error");
        return;
      }
      if (!await window.factoryUI.confirmAction({
        title: "حذف الموديل",
        message: `سيتم حذف الموديل ${order.name || order.modelNumber || "المحدد"} وتسليماته ومصاريف تشغيله المرتبطة، وإزالة أثره من حساب العميل والخزينة وإعادة القماش المستخدم للمخزون. لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف موديل مؤرشف ضمن تصفية مالية.`,
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
        await refreshDashboard(session);
        window.factoryUI.toast("تم حذف الموديل.");
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
  document.querySelector("#app").innerHTML = `<main class="main-content"><div class="notice">${message}</div></main>`;
  window.factoryUI.toast(adminError ? `تعذر تحميل لوحة الإدارة: ${error.message}` : "تعذر تحميل البيانات الآن. أعد المحاولة لاحقًا.", "error");
});
