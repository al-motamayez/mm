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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const role = roleInput.value;
  const username = usernameInput.value.trim();
  if (!roleDestinations[role] || !username) return;

  localStorage.setItem("factory-session", JSON.stringify({ role, username, roleName: roleNames[role] }));
  window.location.href = roleDestinations[role];
});
