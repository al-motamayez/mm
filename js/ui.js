(() => {
  const toastRegion = document.createElement("div");
  toastRegion.className = "toast-region";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-relevant", "additions");
  document.body.append(toastRegion);

  let activeDialog = null;

  function toast(message, type = "success") {
    if (type === "error" && document.body.dataset.dashboardRole !== "admin"
      && /\b(?:postgres(?:ql)?|sqlstate|pgrst\d*|supabase|database|constraint|relation|column|permission denied|unauthorized|forbidden|failed to fetch|network error|http\s*\d{3}|status\s*\d{3}|api error)\b/i.test(message)) {
      message = "تعذر تنفيذ العملية الآن. حاول مرة أخرى لاحقًا.";
    }
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
    backdrop.style.zIndex = String(1400 + document.querySelectorAll(".confirm-backdrop").length);
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

  function formDialog(options = {}) {
    if (activeDialog) activeDialog.finish(null);
    const {
      title = "تعديل البيانات",
      fields = [],
      submitLabel = "حفظ",
      cancelLabel = "إلغاء"
    } = options;
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.style.zIndex = String(1400 + document.querySelectorAll(".confirm-backdrop").length);
    const dialog = document.createElement("section");
    dialog.className = "confirm-dialog form-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = document.createElement("h2");
    heading.className = "confirm-title";
    heading.textContent = title;
    dialog.append(heading);
    const form = document.createElement("form");
    form.className = "form-dialog-fields";
    for (const field of fields) {
      const label = document.createElement("label");
      label.className = "field";
      const caption = document.createElement("span");
      caption.textContent = field.label;
      label.append(caption);
      let control;
      if (field.type === "select") {
        control = document.createElement("select");
        for (const option of field.options || []) {
          const optionElement = document.createElement("option");
          optionElement.value = option.value;
          optionElement.textContent = option.label;
          control.append(optionElement);
        }
      } else if (field.type === "fabric-rows") {
        control = document.createElement("div");
        control.className = "fabric-request-rows";
        const renderRow = (initial = {}) => {
          const row = document.createElement("div");
          row.className = "fabric-request-row";
          const select = document.createElement("select");
          select.setAttribute("aria-label", "صنف القماش");
          select.innerHTML = '<option value="">اختر اللون أو القماش</option>';
          for (const option of field.options || []) {
            const optionElement = document.createElement("option");
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            optionElement.dataset.available = String(option.available);
            optionElement.dataset.unit = option.unit || "";
            select.append(optionElement);
          }
          select.value = initial.fabric_id || "";
          const quantity = document.createElement("input");
          quantity.type = "number";
          quantity.min = "0.001";
          quantity.step = "0.001";
          quantity.placeholder = "الكمية";
          quantity.setAttribute("aria-label", "الكمية المطلوبة");
          quantity.value = initial.quantity ?? "";
          const hint = document.createElement("small");
          hint.className = "fabric-request-stock-hint";
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "row-action";
          remove.textContent = "إزالة";
          remove.addEventListener("click", () => row.remove());
          const refreshHint = () => {
            const option = select.selectedOptions[0];
            const available = Number(option?.dataset.available);
            const unit = option?.dataset.unit || "";
            quantity.step = unit === "توب" ? "1" : "0.001";
            quantity.min = unit === "توب" ? "1" : "0.001";
            hint.textContent = select.value
              ? `المتاح للحجز: ${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 3 }).format(available)} ${unit}`
              : "";
          };
          select.addEventListener("change", refreshHint);
          row.append(select, quantity, hint, remove);
          refreshHint();
          control.append(row);
        };
        for (const row of field.value || []) renderRow(row);
        const add = document.createElement("button");
        add.type = "button";
        add.className = "row-action fabric-request-add";
        add.textContent = "+ إضافة لون / ثوب آخر";
        add.addEventListener("click", () => renderRow());
        control.append(add);
      } else if (field.type === "textarea") {
        control = document.createElement("textarea");
        control.rows = field.rows || 4;
      } else {
        control = document.createElement("input");
        control.type = field.type || "text";
        if (field.type === "file") {
          control.accept = field.accept || "image/*";
          control.hidden = true;
        }
        if (field.min !== undefined) control.min = String(field.min);
        if (field.max !== undefined) control.max = String(field.max);
        if (field.step !== undefined) control.step = String(field.step);
      }
      control.name = field.name;
      control.required = Boolean(field.required);
      if (field.type !== "fabric-rows") {
        control.value = field.type === "file" ? "" : String(field.value ?? "");
      }
      if (field.maxLength !== undefined) control.maxLength = field.maxLength;
      if (field.placeholder) control.placeholder = field.placeholder;
      label.append(control);
      if (field.type === "file") {
        const picker = document.createElement("button");
        picker.type = "button";
        picker.className = "button image-picker-button";
        picker.textContent = "📷 اختيار أو تبديل الصورة";
        const filename = document.createElement("small");
        filename.textContent = "لم يتم اختيار صورة جديدة";
        picker.addEventListener("click", () => control.click());
        control.addEventListener("change", () => {
          filename.textContent = control.files?.[0]?.name || "لم يتم اختيار صورة جديدة";
        });
        label.append(picker, filename);
      }
      if (field.helpText) {
        const help = document.createElement("small");
        help.textContent = field.helpText;
        label.append(help);
      }
      form.append(label);
    }
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "row-action";
    cancel.textContent = cancelLabel;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "button button-primary";
    submit.textContent = submitLabel;
    actions.append(submit, cancel);
    form.append(actions);
    dialog.append(form);
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
      cancel.addEventListener("click", () => finish(null));
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) finish(null);
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const values = Object.fromEntries([...new FormData(form).entries()].map(([name, value]) => [
          name,
          value instanceof File && !value.name ? null : value
        ]));
        const fabricRows = [...form.querySelectorAll(".fabric-request-row")];
        if (fabricRows.length) {
          values.fabricLines = [];
          const totals = new Map();
          for (const row of fabricRows) {
            const [select, quantity] = row.querySelectorAll("select, input");
            if (!select.value && !quantity.value) continue;
            if (!select.value || !quantity.value || Number(quantity.value) <= 0) {
              select.setCustomValidity("اختر صنف القماش وأدخل كمية صحيحة.");
              select.reportValidity();
              select.setCustomValidity("");
              return;
            }
            const selected = select.selectedOptions[0];
            const amount = Number(quantity.value);
            const available = Number(selected.dataset.available);
            const unit = selected.dataset.unit || "";
            if (amount > available || (unit === "توب" && !Number.isInteger(amount))) {
              quantity.setCustomValidity(amount > available
                ? "الكمية أكبر من الرصيد المتاح للحجز."
                : "الكمية يجب أن تكون عدداً صحيحاً عند القياس بالتوب.");
              quantity.reportValidity();
              quantity.setCustomValidity("");
              return;
            }
            values.fabricLines.push({
              fabric_id: select.value,
              quantity: amount
            });
            const existing = totals.get(select.value);
            totals.set(select.value, {
              quantity: (existing?.quantity || 0) + amount,
              available,
              unit
            });
          }
          for (const [fabricId, total] of totals) {
            if (total.quantity <= total.available
              && (total.unit !== "توب" || Number.isInteger(total.quantity))) continue;
            const row = fabricRows.find((entry) => entry.querySelector("select")?.value === fabricId);
            const quantity = row?.querySelector("input");
            if (quantity) {
              quantity.setCustomValidity(total.quantity > total.available
                ? "إجمالي الكمية لهذا الصنف أكبر من الرصيد المتاح للحجز."
                : "إجمالي الكمية يجب أن يكون عدداً صحيحاً عند القياس بالتوب.");
              quantity.reportValidity();
              quantity.setCustomValidity("");
            }
            return;
          }
        } else {
          values.fabricLines = [];
        }
        finish(values);
      });
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      });
      (form.elements[0] || submit).focus();
    });
  }

  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    console.error("An unhandled application operation failed.", error);
    toast("تعذر إتمام العملية الآن. حاول مرة أخرى لاحقًا.", "error");
  });

  window.factoryUI = { toast, confirmAction, formDialog };
})();
