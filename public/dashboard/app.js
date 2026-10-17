const state = { patients: [], calls: [], loading: false };
const elements = {
  rows: document.querySelector("#patientRows"),
  message: document.querySelector("#message"),
  patientCount: document.querySelector("#patientCount"),
  insuredCount: document.querySelector("#insuredCount"),
  callCount: document.querySelector("#callCount"),
  lastSync: document.querySelector("#lastSync"),
  filterForm: document.querySelector("#filterForm"),
  lastName: document.querySelector("#lastNameFilter"),
  dob: document.querySelector("#dobFilter"),
  phone: document.querySelector("#phoneFilter"),
  clearFilters: document.querySelector("#clearFilters"),
  refresh: document.querySelector("#refreshButton"),
  dialog: document.querySelector("#patientDialog"),
  closeDialog: document.querySelector("#closeDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  details: document.querySelector("#patientDetails"),
  callHistory: document.querySelector("#callHistory"),
  patientCallCount: document.querySelector("#patientCallCount"),
};

function textElement(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text ?? "-";
  if (className) node.className = className;
  return node;
}

function formatPhone(value) {
  if (!value || value.length !== 10) return value || "-";
  return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.className = `message${text ? " visible" : ""}${isError ? " error" : ""}`;
}

async function api(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || `Request failed with ${response.status}`);
  return body.data;
}

function currentQuery() {
  const params = new URLSearchParams({ limit: "200" });
  const filters = [
    ["last_name", elements.lastName.value],
    ["date_of_birth", elements.dob.value],
    ["phone_number", elements.phone.value],
  ];
  filters.forEach(([name, value]) => {
    if (value.trim()) params.set(name, value.trim());
  });
  return params;
}

function renderMetrics() {
  elements.patientCount.textContent = String(state.patients.length);
  elements.insuredCount.textContent = String(state.patients.filter((patient) => patient.insurance_provider).length);
  elements.callCount.textContent = String(state.calls.length);
  elements.lastSync.textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function cell(row, value, className) {
  const td = document.createElement("td");
  td.append(textElement("span", value, className));
  row.append(td);
}

function renderPatients() {
  elements.rows.replaceChildren();
  if (!state.patients.length) {
    setMessage("No patients match the current filters.");
    return;
  }
  setMessage("");
  state.patients.forEach((patient) => {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Open ${patient.first_name} ${patient.last_name}`);
    cell(row, `${patient.first_name} ${patient.last_name}`, "patient-name");
    cell(row, patient.date_of_birth);
    cell(row, patient.sex, "badge");
    cell(row, formatPhone(patient.phone_number));
    cell(row, `${patient.city}, ${patient.state}`);
    cell(row, patient.insurance_provider || "Not provided", patient.insurance_provider ? "" : "subtle");
    cell(row, formatDateTime(patient.created_at));
    row.addEventListener("click", () => openPatient(patient));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openPatient(patient);
    });
    elements.rows.append(row);
  });
}

function detail(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail";
  wrapper.append(textElement("span", label), textElement("strong", value || "Not provided"));
  elements.details.append(wrapper);
}

function renderCalls(calls) {
  elements.callHistory.replaceChildren();
  elements.patientCallCount.textContent = String(calls.length);
  if (!calls.length) {
    elements.callHistory.append(textElement("p", "No linked calls are available for this patient.", "subtle"));
    return;
  }
  calls.forEach((call) => {
    const card = document.createElement("article");
    card.className = "call-card";
    const header = document.createElement("header");
    header.append(
      textElement("h4", formatDateTime(call.created_at)),
      textElement("span", call.status, "badge call-status"),
    );
    card.append(header);
    card.append(textElement("p", call.summary || "No summary was provided."));
    if (call.transcript) card.append(textElement("p", call.transcript));
    elements.callHistory.append(card);
  });
}

async function openPatient(patient) {
  elements.dialogTitle.textContent = `${patient.first_name} ${patient.last_name}`;
  elements.details.replaceChildren();
  detail("Patient ID", patient.patient_id);
  detail("Date of birth", patient.date_of_birth);
  detail("Sex", patient.sex);
  detail("Phone", formatPhone(patient.phone_number));
  detail("Email", patient.email);
  detail("Address", [patient.address_line_1, patient.address_line_2, `${patient.city}, ${patient.state} ${patient.zip_code}`].filter(Boolean).join(", "));
  detail("Insurance", patient.insurance_provider);
  detail("Member ID", patient.insurance_member_id);
  detail("Preferred language", patient.preferred_language);
  detail("Emergency contact", patient.emergency_contact_name);
  detail("Emergency phone", formatPhone(patient.emergency_contact_phone));
  detail("Last updated", formatDateTime(patient.updated_at));
  renderCalls([]);
  elements.dialog.showModal();
  try {
    renderCalls(await api(`/patients/${encodeURIComponent(patient.patient_id)}/calls`));
  } catch (error) {
    elements.callHistory.replaceChildren(textElement("p", error.message, "subtle"));
  }
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  elements.refresh.disabled = true;
  setMessage("Loading patient data...");
  try {
    const [patients, calls] = await Promise.all([
      api(`/patients?${currentQuery().toString()}`),
      api("/calls?limit=100"),
    ]);
    state.patients = patients;
    state.calls = calls;
    renderPatients();
    renderMetrics();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    state.loading = false;
    elements.refresh.disabled = false;
  }
}

elements.filterForm.addEventListener("submit", (event) => { event.preventDefault(); loadData(); });
elements.clearFilters.addEventListener("click", () => { elements.filterForm.reset(); loadData(); });
elements.refresh.addEventListener("click", loadData);
elements.closeDialog.addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

loadData();
setInterval(() => { if (!document.hidden) loadData(); }, 10_000);
