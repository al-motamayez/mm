(() => {
  const toastRegion = document.createElement("div");
  toastRegion.className = "toast-region";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-relevant", "additions");
  document.body.append(toastRegion);

  let activeDialog = null;

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast toast-${type}`;
    item.setAttribute("role", type === "error" ? "alert" : "status");
    const text = document.createElement("span");
    text.textContent = message;
    const close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "إغلاق التنبيه");
    close.textContent = "×";
    item.append(text, close);
    toastRegion.append(item);

    let timeoutId = window.setTimeout(() => item.remove(), 4500);
    close.addEventListener("click", () => {
      window.clearTimeout(timeoutId);
      item.remove();
    });
  }

  function confirmAction(options = {}) {
    if (activeDialog) activeDialog.finish(false);
    const {
      title = "تأكيد الإجراء",
      message = "هل تريد المتابعة؟",
      confirmLabel = "تأكيد",
      cancelLabel = "إلغاء",
      danger = false
    } = options;
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    const dialog = document.createElement("section");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = document.createElement("h2");
    heading.className = "confirm-title";
    heading.textContent = title;
    heading.id = "confirm-dialog-title";
    dialog.setAttribute("aria-labelledby", heading.id);
    const description = document.createElement("p");
    description.className = "confirm-message";
    description.textContent = message;
    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button confirm-cancel";
    cancel.textContent = cancelLabel;
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = `button ${danger ? "confirm-danger" : "button-primary"}`;
    accept.textContent = confirmLabel;
    actions.append(cancel, accept);
    dialog.append(heading, description, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);

    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const finish = (result) => {
        if (activeDialog?.backdrop === backdrop) activeDialog = null;
        backdrop.remove();
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        resolve(result);
      };
      activeDialog = { backdrop, finish };
      cancel.addEventListener("click", () => finish(false));
      accept.addEventListener("click", () => finish(true));
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) finish(false);
      });
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Tab") {
          event.preventDefault();
          (document.activeElement === accept ? cancel : accept).focus();
        }
      });
      accept.focus();
    });
  }

  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    const detail = error instanceof Error ? error.message : String(error);
    console.error("An unhandled application operation failed.", error);
    toast(`تعذر إتمام العملية: ${detail}`, "error");
  });

  window.factoryUI = { toast, confirmAction };
})();
