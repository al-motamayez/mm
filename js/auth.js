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

const form = document.querySelector("#login-form");
const roleInput = document.querySelector("#role");
const usernameInput = document.querySelector("#username");
const accountHint = document.querySelector("#account-hint");

const hints = {
  admin: "للتجربة: اكتب أي اسم.",
  cutting: "للتجربة: اكتب أي اسم.",
  sewing: "للتجربة: اكتب أي اسم.",
  worker: "لرؤية المهام التجريبية، اكتب: أحمد محمد أو مريم علي.",
  client: "لعرض بيانات عميل تجريبية، اكتب: شركة النور أو متجر الأمل."
};

roleInput.addEventListener("change", () => {
  accountHint.textContent = hints[roleInput.value];
  usernameInput.placeholder = roleInput.value === "client" ? "مثال: شركة النور" : "مثال: أحمد محمد";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const role = roleInput.value;
  const username = usernameInput.value.trim();
  if (!roleDestinations[role] || !username) return;

  localStorage.setItem("factory-session", JSON.stringify({ role, username, roleName: roleNames[role] }));
  window.location.href = roleDestinations[role];
});
