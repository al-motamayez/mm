(() => {
  const CURRENT_VERSION = "2026.11.01.4";
  const CHECK_INTERVAL = 5 * 60 * 1000;
  const versionUrl = new URL("../version.json", document.currentScript.src);
  let lastCheck = 0;
  let checking = false;
  let dismissedVersion = "";

  function showUpdateNotice(version) {
    if (dismissedVersion === version || document.querySelector("#site-update-banner")) return;

    const banner = document.createElement("aside");
    banner.id = "site-update-banner";
    banner.className = "site-update-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    const message = document.createElement("span");
    message.textContent = "يتوفر تحديث للموقع. يمكنك التحديث عندما تنتهي من عملك.";

    const actions = document.createElement("div");
    actions.className = "site-update-actions";

    const updateButton = document.createElement("button");
    updateButton.className = "site-update-button";
    updateButton.type = "button";
    updateButton.textContent = "تحديث الآن";
    updateButton.addEventListener("click", () => {
      if (window.confirm("سيُعاد تحميل ملفات الموقع. احفظ أي تغييرات غير مرسلة قبل المتابعة.")) {
        window.location.reload();
      }
    });

    const laterButton = document.createElement("button");
    laterButton.className = "site-update-later";
    laterButton.type = "button";
    laterButton.textContent = "لاحقًا";
    laterButton.addEventListener("click", () => {
      dismissedVersion = version;
      banner.remove();
    });

    actions.append(updateButton, laterButton);
    banner.append(message, actions);
    document.body.prepend(banner);
  }

  async function checkForUpdate() {
    if (checking || document.visibilityState === "hidden") return;
    checking = true;
    lastCheck = Date.now();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const requestUrl = new URL(versionUrl);
      requestUrl.searchParams.set("check", String(lastCheck));
      const response = await window.fetch(requestUrl, {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) return;

      const result = await response.json();
      if (typeof result.version === "string"
        && result.version.length <= 64
        && result.version !== CURRENT_VERSION) {
        showUpdateNotice(result.version);
      }
    } catch {
      // An unavailable version check must not interrupt normal site use.
    } finally {
      window.clearTimeout(timeout);
      checking = false;
    }
  }

  window.setTimeout(checkForUpdate, 8000);
  window.setInterval(checkForUpdate, CHECK_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible"
      && Date.now() - lastCheck >= CHECK_INTERVAL) {
      checkForUpdate();
    }
  });
})();
