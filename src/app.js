(() => {
  const $ = (id) => document.getElementById(id);
  const roleButtons = document.querySelectorAll("[data-view]");
  const professionalView = $("professionalView");
  const clientView = $("clientView");
  const bookingView = $("bookingView");
  const vetPortalView = $("vetPortalView");
  const loginModal = $("loginModal");
  const loginForm = $("loginForm");
  const loginError = $("loginError");
  const toast = $("toast");
  const localVideo = $("localVideo");
  const remoteVideo = $("remoteVideo");
  const clientVideo = $("clientVideo");
  const clientRemoteVideo = $("clientRemoteVideo");
  const localWrap = $("localWrap");
  const cameraEmpty = $("cameraEmpty");
  const startCallBtn = $("startCallBtn");
  const cameraBtn = $("cameraBtn");
  const micBtn = $("micBtn");
  const inviteLink = $("inviteLink");
  const copyLinkBtn = $("copyLinkBtn");
  const enterRoomBtn = $("enterRoomBtn");
  const testDeviceBtn = $("testDeviceBtn");
  const finishModal = $("finishModal");
  const timer = $("timer");
  const appointmentModal = $("appointmentModal");
  const appointmentForm = $("appointmentForm");
  const endCallBtn = $("endCallBtn");
  const saveRecordBtn = $("saveRecordBtn");
  const saveState = $("saveState");
  const consultationList = $("consultationList");
  const prescriptionModal = $("prescriptionModal");
  const prescriptionForm = $("prescriptionForm");
  const medicinePreview = $("medicinePreview");
  const bookingModal = $("bookingModal");
  const paymentModal = $("paymentModal");
  const availabilityModal = $("availabilityModal");
  const internalBookingModal = $("internalBookingModal");
  const scheduleBlockModal = $("scheduleBlockModal");
  const signedPrescriptionModal = $("signedPrescriptionModal");
  const cancelScheduledModal = $("cancelScheduledModal");
  const cancelRequestModal = $("cancelRequestModal");

  const params = new URLSearchParams(location.search);
  const isLegacyClient = params.get("role") === "client" && params.get("room");
  const isAppointmentClient = location.pathname === "/consulta" && params.get("appointment") && params.get("token");
  const isClient = Boolean(isLegacyClient || isAppointmentClient);
  const isProfessional = location.pathname === "/vet" || location.pathname.startsWith("/vet/");
  const senderId = crypto.randomUUID();
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 6,
  };

  let room = null;
  let peer = null;
  let localStream = null;
  let lastSignalId = 0;
  let pollTimer = null;
  let elapsedTimer = null;
  let elapsedSeconds = 0;
  let offerSent = false;
  let pendingCandidates = [];
  let toastTimeout = null;
  let isEnding = false;
  let currentAppointment = null;
  let activeRecordRoomId = null;
  let recordDirty = false;
  let autoSaveTimer = null;
  let consultationStartedAt = null;
  let pendingAction = "dashboard";
  let recordStatus = "draft";
  let selectedAppointmentId = null;
  let appointmentPollTimer = null;
  let portalRefreshTimer = null;
  let publicAppointment = null;
  let lastSignedDocument = null;
  let portalAppointments = [];
  let portalOpenSlots = [];
  let portalManagedSlots = [];
  let scheduleAudit = [];
  let portalClients = [];
  let selectedClientId = null;
  let reminderTimer = null;
  let remindedAppointmentId = null;
  let publicSlots = [];
  let selectedPublicDate = "";
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedCalendarDate = "";
  const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  function showView(client) {
    bookingView.classList.remove("active");
    vetPortalView.classList.remove("active");
    professionalView.classList.toggle("active", !client);
    clientView.classList.toggle("active", client);
    roleButtons.forEach((button) => button.classList.toggle("active", (button.dataset.view === "client") === client));
  }

  function showBookingView() {
    bookingView.classList.add("active");
    vetPortalView.classList.remove("active");
    professionalView.classList.remove("active");
    clientView.classList.remove("active");
  }

  function sameLocalDay(timestamp, date = new Date()) {
    const value = new Date(Number(timestamp) * 1000);
    return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth() && value.getDate() === date.getDate();
  }

  function portalStatus(item) {
    if (item.status === "cancelled" && item.refund_status === "pending") return { label: "Cancelada • devolver Pix", paid: false, cancelled: true };
    if (item.status === "cancelled" && item.refund_status === "refunded") return { label: "Cancelada • devolvido", paid: false, cancelled: true };
    if (item.status === "cancelled") return { label: "Cancelada", paid: false, cancelled: true };
    if (item.cancellation_requested_at) return { label: "Cancelamento solicitado", paid: false, requested: true };
    if (item.status === "completed") return { label: "Finalizada", paid: true };
    if (item.room_id && ["ready", "manual", "failed"].includes(item.call_notification_status)) return { label: "Sala criada • enviar link", paid: false };
    if (item.room_id) return { label: "Em atendimento", paid: true };
    if (item.payment_status === "paid" && ["manual", "failed"].includes(item.payment_notification_status)) return { label: "Pago • avisar no WhatsApp", paid: false };
    if (item.payment_status === "paid") return { label: "Confirmada", paid: true };
    return { label: "Aguardando pagamento", paid: false };
  }

  function bookingSourceLabel(value) {
    return value === "whatsapp" ? "WhatsApp" : value === "reception" ? "Clínica" : "Site";
  }

  function appointmentRow(item, compact = false) {
    const when = dateParts(item.starts_at);
    const status = portalStatus(item);
    const button = document.createElement("button");
    button.className = compact ? "week-event" : "agenda-row";
    button.classList.add("booked");
    button.classList.toggle("cancelled", Boolean(status.cancelled));
    button.classList.toggle("paid", status.paid);
    button.type = "button";
    if (compact) {
      button.innerHTML = "<strong></strong><span></span>";
      button.querySelector("strong").textContent = `${when.time} • ${item.patient_name}`;
      button.querySelector("span").textContent = `${item.tutor_name} • ${bookingSourceLabel(item.booking_source)} • ${status.label}`;
    } else {
      button.innerHTML = '<span class="agenda-time"></span><span><strong></strong><small></small></span><span class="agenda-status"></span>';
      button.querySelector(".agenda-time").textContent = when.time;
      button.querySelector("strong").textContent = item.patient_name;
      button.querySelector("small").textContent = `${item.tutor_name} • ${item.species} • ${bookingSourceLabel(item.booking_source)}`;
      const badge = button.querySelector(".agenda-status");
      badge.textContent = status.label;
      badge.classList.toggle("paid", status.paid);
      badge.classList.toggle("cancelled", Boolean(status.cancelled));
      badge.classList.toggle("requested", Boolean(status.requested));
    }
    button.addEventListener("click", () => openAppointmentFromPortal(item));
    return button;
  }

  function availableSlotRow(slot, compact = false) {
    const when = dateParts(slot.starts_at);
    const button = document.createElement("button");
    button.className = compact ? "week-event available" : "agenda-row available";
    button.type = "button";
    if (compact) {
      button.innerHTML = "<strong></strong><span></span>";
      button.querySelector("strong").textContent = `${when.time} • Horário livre`;
      button.querySelector("span").textContent = `${slot.unit_name} • Clique para agendar`;
    } else {
      button.innerHTML = '<span class="agenda-time"></span><span><strong>Horário livre</strong><small></small></span><span class="agenda-status">Agendar</span>';
      button.querySelector(".agenda-time").textContent = when.time;
      button.querySelector("small").textContent = `${slot.professional_name} • ${money(slot.price_cents)}`;
    }
    button.addEventListener("click", () => openInternalBooking(slot));
    return button;
  }

  function renderPortalSchedule() {
    const now = new Date();
    const today = portalAppointments.filter((item) => sameLocalDay(item.starts_at, now));
    const activeToday = today.filter((item) => item.status !== "cancelled");
    const todaySlots = portalOpenSlots.filter((item) => sameLocalDay(item.starts_at, now));
    const upcoming = portalAppointments.filter((item) => Number(item.starts_at) * 1000 > now.getTime() && !sameLocalDay(item.starts_at, now));
    $("dashboardDate").textContent = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    $("todayCount").textContent = String(activeToday.length);
    $("todayCountText").textContent = activeToday.length === 1 ? "1 atendimento marcado" : `${activeToday.length} atendimentos marcados`;
    $("paidCount").textContent = String(activeToday.filter((item) => item.payment_status === "paid").length);
    const next = portalAppointments.find((item) => Number(item.starts_at) * 1000 >= now.getTime() && !["completed", "cancelled"].includes(item.status));
    $("nextTime").textContent = next ? dateParts(next.starts_at).time : "—";
    $("nextPatient").textContent = next ? `${next.patient_name} • ${next.tutor_name}` : "Agenda livre";

    const todayTarget = $("todayAgenda");
    todayTarget.replaceChildren();
    const todayEntries = [
      ...today.map((item) => ({ type: "appointment", starts_at: item.starts_at, item })),
      ...todaySlots.map((item) => ({ type: "slot", starts_at: item.starts_at, item })),
    ].sort((a, b) => Number(a.starts_at) - Number(b.starts_at));
    if (!todayEntries.length) todayTarget.innerHTML = '<div class="portal-empty">Nenhuma consulta ou disponibilidade para hoje.<br>Use “+ Horário” para abrir a agenda.</div>';
    else todayEntries.forEach((entry) => todayTarget.append(entry.type === "appointment" ? appointmentRow(entry.item) : availableSlotRow(entry.item)));

    const nextTarget = $("nextAppointments");
    nextTarget.replaceChildren();
    if (!upcoming.length) nextTarget.innerHTML = '<div class="portal-empty">Nenhum atendimento futuro.</div>';
    else upcoming.slice(0, 5).forEach((item) => {
      const when = dateParts(item.starts_at);
      const block = document.createElement("div");
      block.className = "next-item";
      block.innerHTML = "<strong></strong><span></span>";
      block.querySelector("strong").textContent = `${item.patient_name} • ${when.time}`;
      block.querySelector("span").textContent = `${when.day} • ${item.tutor_name}`;
      nextTarget.append(block);
    });

    const weekTarget = $("weekBoard");
    weekTarget.replaceChildren();
    const end = new Date(now); end.setDate(end.getDate() + 6);
    $("weekRange").textContent = `${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + index);
      const column = document.createElement("div");
      column.className = `week-day${index === 0 ? " today" : ""}`;
      column.innerHTML = "<h3></h3>";
      column.querySelector("h3").innerHTML = `${day.toLocaleDateString("pt-BR", { weekday: "short" })}<span>${day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`;
      const items = portalAppointments.filter((item) => sameLocalDay(item.starts_at, day));
      const slots = portalOpenSlots.filter((item) => sameLocalDay(item.starts_at, day));
      const entries = [
        ...items.map((item) => ({ type: "appointment", starts_at: item.starts_at, item })),
        ...slots.map((item) => ({ type: "slot", starts_at: item.starts_at, item })),
      ].sort((a, b) => Number(a.starts_at) - Number(b.starts_at));
      if (!entries.length) {
        const empty = document.createElement("div"); empty.className = "portal-empty"; empty.style.padding = "28px 4px"; empty.textContent = "Livre"; column.append(empty);
      } else entries.forEach((entry) => column.append(entry.type === "appointment" ? appointmentRow(entry.item, true) : availableSlotRow(entry.item, true)));
      weekTarget.append(column);
    }
    scheduleReminderCheck();
  }

  function calendarActionLabel(action) {
    return ({ open_slot: "Horário aberto", block_slot: "Horário fechado", block_range: "Período fechado", block_day: "Dia fechado", reopen_slot: "Horário reaberto", cancel_appointment: "Consulta cancelada" })[action] || "Agenda alterada";
  }

  function renderScheduleHistory() {
    const target = $("scheduleHistory");
    target.replaceChildren();
    if (!scheduleAudit.length) {
      target.innerHTML = '<div class="portal-empty">Nenhuma alteração registrada neste mês.</div>';
      return;
    }
    scheduleAudit.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const changed = new Date(Number(entry.created_at) * 1000);
      const scheduled = dateParts(entry.starts_at);
      row.innerHTML = "<time></time><div><strong></strong><span></span></div><small></small>";
      row.querySelector("time").textContent = changed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      row.querySelector("strong").textContent = calendarActionLabel(entry.action);
      row.querySelector("span").textContent = `${scheduled.short} às ${scheduled.time}${entry.reason ? ` • ${entry.reason}` : ""}`;
      row.querySelector("small").textContent = entry.actor || "Equipe Onda Animal";
      target.append(row);
    });
  }

  function appointmentForSlot(slotId) {
    return portalAppointments.find((item) => item.slot_id === slotId && item.status !== "cancelled");
  }

  function syncAppointmentActions(item) {
    const cancellable = Boolean(item && !item.room_id && !["cancelled", "completed", "waiting", "active"].includes(item.status));
    $("cancelScheduledBtn").hidden = !cancellable;
    $("markRefundedBtn").hidden = !(item?.status === "cancelled" && item?.refund_status === "pending");
  }

  function renderManagedDay() {
    const title = $("selectedDayTitle");
    const summary = $("selectedDaySummary");
    const target = $("managedDayList");
    const date = selectedDateObject();
    title.textContent = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    const slots = portalManagedSlots.filter((slot) => localDateKey(slot.starts_at) === selectedCalendarDate);
    const openCount = slots.filter((slot) => slot.status === "open").length;
    const bookedCount = slots.filter((slot) => slot.status === "booked").length;
    const blockedCount = slots.filter((slot) => slot.status === "blocked").length;
    summary.textContent = `${openCount} livres • ${bookedCount} agendados • ${blockedCount} fechados`;
    const isPast = selectedCalendarDate < localDateKey(new Date());
    $("calendarOpenSlot").disabled = isPast;
    $("calendarBlockRange").disabled = isPast || openCount === 0;
    $("calendarBlockDay").disabled = isPast || openCount === 0;
    target.replaceChildren();
    if (!slots.length) {
      target.innerHTML = `<div class="portal-empty">Nenhum horário neste dia.${isPast ? "" : "<br>Use “Abrir horário” para adicionar."}</div>`;
      return;
    }
    slots.forEach((slot) => {
      const when = dateParts(slot.starts_at);
      const row = document.createElement("div");
      row.className = `managed-slot ${slot.status}`;
      row.innerHTML = '<span class="managed-slot-time"></span><div><strong></strong><small></small></div><button type="button"></button>';
      row.querySelector(".managed-slot-time").textContent = when.time;
      const appointment = appointmentForSlot(slot.id);
      const label = slot.status === "open" ? "Horário livre" : slot.status === "booked" ? (appointment ? `${appointment.patient_name} • ${appointment.tutor_name}` : "Consulta agendada") : "Horário fechado";
      row.querySelector("strong").textContent = label;
      row.querySelector("small").textContent = slot.status === "blocked" ? (slot.block_reason || "Bloqueado pela equipe") : `${slot.professional_name} • ${money(slot.price_cents)}`;
      const action = row.querySelector("button");
      if (slot.status === "open") {
        action.textContent = "Fechar";
        action.addEventListener("click", () => openScheduleBlock("slot", slot));
      } else if (slot.status === "blocked") {
        action.textContent = "Reabrir";
        action.disabled = isPast;
        action.addEventListener("click", () => reopenScheduleSlot(slot));
      } else {
        action.textContent = appointment ? "Abrir" : "Protegido";
        action.disabled = !appointment;
        if (appointment) action.addEventListener("click", () => openAppointmentFromPortal(appointment));
      }
      target.append(row);
    });
  }

  function renderMonthCalendar() {
    const target = $("monthCalendar");
    target.replaceChildren();
    $("calendarMonthTitle").textContent = calendarCursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].forEach((label) => {
      const header = document.createElement("div"); header.className = "calendar-weekday"; header.textContent = label; target.append(header);
    });
    const first = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
    const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
    const todayKey = localDateKey(new Date());
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart); date.setDate(gridStart.getDate() + index);
      const key = localDateKey(date);
      const slots = portalManagedSlots.filter((slot) => localDateKey(slot.starts_at) === key);
      const open = slots.filter((slot) => slot.status === "open").length;
      const booked = slots.filter((slot) => slot.status === "booked").length;
      const blocked = slots.filter((slot) => slot.status === "blocked").length;
      const button = document.createElement("button");
      button.type = "button";
      const activeStatuses = [open && "open", booked && "booked", blocked && "blocked"].filter(Boolean);
      const statusClass = activeStatuses.length > 1 ? " mixed" : activeStatuses.length ? ` has-${activeStatuses[0]}` : "";
      button.className = `calendar-day${statusClass}${date.getMonth() !== calendarCursor.getMonth() ? " outside" : ""}${key === todayKey ? " today" : ""}${key === selectedCalendarDate ? " selected" : ""}`;
      button.innerHTML = '<span class="calendar-day-number"></span><span class="calendar-day-counts"></span>';
      button.querySelector(".calendar-day-number").textContent = String(date.getDate());
      const counts = button.querySelector(".calendar-day-counts");
      const appendCount = (kind, count, label) => {
        if (!count) return;
        const marker = document.createElement("span");
        marker.className = `${kind}-count`;
        marker.textContent = `${count} ${label}${count === 1 ? "" : "s"}`;
        counts.append(marker);
      };
      appendCount("open", open, "livre");
      appendCount("booked", booked, "agendado");
      appendCount("blocked", blocked, "fechado");
      button.addEventListener("click", async () => {
        selectedCalendarDate = key;
        if (date.getMonth() !== calendarCursor.getMonth()) {
          calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
          await loadManagedAvailability();
        } else {
          renderMonthCalendar(); renderManagedDay();
        }
      });
      target.append(button);
    }
    renderManagedDay();
    renderScheduleHistory();
  }

  async function loadManagedAvailability() {
    if (!sessionStorage.getItem("ondaStaffToken")) return;
    try {
      const data = await api(`/api/availability/manage?month=${calendarMonthKey()}`, { headers: staffHeaders() });
      portalManagedSlots = data.slots || [];
      scheduleAudit = data.audit || [];
      if (!selectedCalendarDate || !selectedCalendarDate.startsWith(calendarMonthKey())) {
        const today = localDateKey(new Date());
        selectedCalendarDate = today.startsWith(calendarMonthKey()) ? today : `${calendarMonthKey()}-01`;
      }
      renderMonthCalendar();
    } catch (error) { showToast(error.message); }
  }

  function openScheduleBlock(mode, slot = null) {
    $("scheduleBlockForm").reset();
    $("scheduleBlockMode").value = mode;
    $("scheduleBlockSlotId").value = slot?.id || "";
    $("scheduleBlockDate").value = selectedCalendarDate;
    const range = mode === "range";
    $("scheduleBlockStartWrap").hidden = !range;
    $("scheduleBlockEndWrap").hidden = !range;
    $("scheduleBlockStart").required = range;
    $("scheduleBlockEnd").required = range;
    $("scheduleBlockTitle").textContent = mode === "slot" ? `Fechar ${dateParts(slot.starts_at).time}` : mode === "day" ? "Fechar o dia inteiro" : "Fechar um período";
    $("scheduleBlockSummary").textContent = mode === "day" ? "Todos os horários livres serão fechados. Consultas marcadas serão preservadas." : "Informe o motivo do bloqueio. Consultas marcadas nunca serão alteradas.";
    scheduleBlockModal.classList.add("open");
    (range ? $("scheduleBlockStart") : $("scheduleBlockReason")).focus();
  }

  async function reopenScheduleSlot(slot) {
    try {
      await api("/api/availability/reopen", { method: "POST", headers: staffHeaders(), body: JSON.stringify({ slotId: slot.id }) });
      await loadConsultations(true);
      showToast("Horário reaberto e publicado no site.");
    } catch (error) { showToast(error.message); }
  }

  function setPortalRoute(route, updateHistory = true) {
    if (!sessionStorage.getItem("ondaStaffToken")) return;
    document.body.classList.add("vet-mode");
    bookingView.classList.remove("active");
    professionalView.classList.remove("active");
    clientView.classList.remove("active");
    vetPortalView.classList.add("active");
    const pages = { dashboard: "dashboardPage", agenda: "agendaPage", cadastros: "cadastrosPage", configuracoes: "configuracoesPage" };
    Object.entries(pages).forEach(([key, id]) => $(id).classList.toggle("active", key === route));
    document.querySelectorAll("[data-vet-route]").forEach((button) => button.classList.toggle("active", button.dataset.vetRoute === route));
    const copy = {
      dashboard: ["Agenda de hoje", "Acompanhe os atendimentos e inicie a próxima consulta."],
      agenda: ["Calendário da agenda", "Abra, feche e acompanhe os horários de cada dia."],
      cadastros: ["Cadastros", "Tutores e animais centralizados para seus atendimentos."],
      configuracoes: ["Configurações", "Defina quando os tutores poderão agendar pelo site."],
    }[route] || ["Agenda de hoje", "Acompanhe os atendimentos."];
    $("vetPageTitle").textContent = copy[0]; $("vetPageSubtitle").textContent = copy[1];
    $("cadastroSubnav").classList.toggle("open", route === "cadastros");
    if (route === "cadastros") loadClients();
    if (route === "agenda") loadManagedAvailability();
    if (route === "configuracoes") loadScheduleSettings();
    if (updateHistory) history.pushState({ vetRoute: route }, "", route === "dashboard" ? "/vet" : `/vet/${route}`);
  }

  function renderWeeklySettings(weekly) {
    const target = $("weeklySettings");
    target.replaceChildren();
    weekly.forEach((day) => {
      const row = document.createElement("div");
      row.className = `weekday-row${day.enabled ? "" : " disabled"}`;
      row.dataset.day = day.day;
      const periods = day.periods?.length ? day.periods : [["09:00", "12:00"], ["13:30", "18:00"]];
      row.innerHTML = `
        <label class="weekday-toggle"><input class="weekday-enabled" type="checkbox" ${day.enabled ? "checked" : ""} /> <span>${weekdayNames[day.day]}</span></label>
        <label>Início 1<input class="period-start-1" type="time" value="${periods[0]?.[0] || "09:00"}" /></label>
        <label>Fim 1<input class="period-end-1" type="time" value="${periods[0]?.[1] || "12:00"}" /></label>
        <label>Início 2<input class="period-start-2" type="time" value="${periods[1]?.[0] || "13:30"}" /></label>
        <label>Fim 2<input class="period-end-2" type="time" value="${periods[1]?.[1] || "18:00"}" /></label>`;
      row.querySelector(".weekday-enabled").addEventListener("change", (event) => row.classList.toggle("disabled", !event.target.checked));
      target.append(row);
    });
  }

  async function loadScheduleSettings() {
    try {
      const data = await api("/api/schedule-settings", { headers: staffHeaders() });
      const settings = data.settings;
      $("settingsProfessional").value = settings.professionalName || "";
      $("settingsCrmv").value = settings.professionalCrmv || "";
      $("settingsUnit").value = settings.unitName || "";
      $("settingsPrice").value = Number(settings.price || 0).toFixed(2);
      $("settingsDuration").value = String(settings.durationMinutes || 30);
      $("settingsHorizon").value = String(settings.horizonDays || 30);
      renderWeeklySettings(settings.weekly || []);
      $("settingsStatus").textContent = "Os horários ocupados serão preservados.";
    } catch (error) {
      $("settingsStatus").textContent = error.message;
    }
  }

  function scheduleSettingsPayload() {
    const weekly = [...document.querySelectorAll(".weekday-row")].map((row) => ({
      day: Number(row.dataset.day),
      enabled: row.querySelector(".weekday-enabled").checked,
      periods: [
        [row.querySelector(".period-start-1").value, row.querySelector(".period-end-1").value],
        [row.querySelector(".period-start-2").value, row.querySelector(".period-end-2").value],
      ],
    }));
    return {
      professionalName: $("settingsProfessional").value,
      professionalCrmv: $("settingsCrmv").value,
      unitName: $("settingsUnit").value,
      price: $("settingsPrice").value,
      durationMinutes: Number($("settingsDuration").value),
      horizonDays: Number($("settingsHorizon").value),
      weekly,
    };
  }

  function openAppointmentFromPortal(item) {
    selectedAppointmentId = item.id;
    syncAppointmentActions(item);
    if (item.status === "cancelled") {
      showConsultationWorkspace();
      const when = dateParts(item.starts_at);
      $("headerPatient").textContent = `${item.patient_name} • consulta cancelada`;
      $("headerTutor").textContent = `${item.tutor_name} • ${when.day}, ${when.time}`;
      $("proStatus").textContent = item.refund_status === "pending" ? "Devolução do Pix pendente" : item.refund_status === "refunded" ? "Pagamento devolvido" : "Cancelada sem pagamento";
      startCallBtn.disabled = true;
      startCallBtn.textContent = "Consulta cancelada";
      return;
    }
    if (item.room_id) {
      showConsultationWorkspace();
      startCallBtn.disabled = true;
      startCallBtn.textContent = item.status === "completed" ? "Consulta finalizada" : "Atendimento já iniciado";
      loadSavedRecord(item.room_id);
      return;
    }
    showConsultationWorkspace();
    const when = dateParts(item.starts_at);
    $("headerPatient").textContent = `${item.patient_name} • ${item.species}`;
    $("headerTutor").textContent = `${item.tutor_name} • ${when.day}, ${when.time}`;
    $("proStatus").textContent = item.payment_status === "paid" ? "Pagamento confirmado" : "Pagamento pendente";
    startCallBtn.disabled = false;
    startCallBtn.textContent = "Iniciar e avisar no WhatsApp";
  }

  function showConsultationWorkspace(updateHistory = true) {
    document.body.classList.add("vet-mode");
    vetPortalView.classList.remove("active");
    bookingView.classList.remove("active");
    clientView.classList.remove("active");
    professionalView.classList.add("active");
    if (updateHistory) history.pushState({ vetRoute: "consulta" }, "", "/vet/consulta");
  }

  function openAvailabilityModal(dateKey = selectedCalendarDate) {
    if (!sessionStorage.getItem("ondaStaffToken")) return loginModal.classList.add("open");
    const profile = JSON.parse(localStorage.getItem("ondaVetProfile") || "null");
    $("slotProfessional").value = profile?.professionalName || "Dra. Bruna";
    $("slotCrmv").value = profile?.professionalCrmv || "";
    $("slotUnit").value = profile?.unitName || "Gravataí";
    if ($("settingsPrice")?.value) $("slotPrice").value = $("settingsPrice").value;
    if ($("settingsDuration")?.value) $("slotDuration").value = $("settingsDuration").value;
    const today = localDateKey(new Date());
    let time = "09:00";
    if (dateKey === today) {
      const next = new Date(Date.now() + 30 * 60 * 1000);
      if (next.getMinutes() < 30) next.setMinutes(30, 0, 0);
      else { next.setHours(next.getHours() + 1); next.setMinutes(0, 0, 0); }
      time = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
    }
    if (dateKey) $("slotStartsAt").value = `${dateKey}T${time}`;
    availabilityModal.classList.add("open");
    $("slotStartsAt").focus();
  }

  async function loadInternalBookingPets() {
    const clientId = $("internalBookingClient").value;
    const petSelect = $("internalBookingPet");
    petSelect.replaceChildren();
    $("confirmInternalBooking").disabled = true;
    if (!clientId) return;
    try {
      const data = await api(`/api/clients/${encodeURIComponent(clientId)}/pets`, { headers: staffHeaders() });
      if (!data.pets?.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Nenhum animal cadastrado";
        petSelect.append(option);
        $("internalBookingHelp").textContent = "Cadastre um animal para este tutor antes de confirmar.";
        return;
      }
      data.pets.forEach((pet) => {
        const option = document.createElement("option");
        option.value = pet.id;
        option.textContent = `${pet.name} • ${pet.species}`;
        petSelect.append(option);
      });
      $("internalBookingHelp").textContent = "Ao confirmar, este horário será removido imediatamente do site público.";
      $("confirmInternalBooking").disabled = false;
    } catch (error) {
      $("internalBookingHelp").textContent = error.message;
    }
  }

  async function openInternalBooking(slot) {
    $("internalBookingForm").reset();
    $("internalBookingSlotId").value = slot.id;
    const when = dateParts(slot.starts_at);
    $("internalBookingSummary").textContent = `${when.day}, às ${when.time} • ${slot.professional_name} • ${slot.unit_name} • ${money(slot.price_cents)}`;
    await loadClients();
    const clientSelect = $("internalBookingClient");
    clientSelect.replaceChildren();
    if (!portalClients.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Cadastre um tutor primeiro";
      clientSelect.append(option);
      $("internalBookingHelp").textContent = "Use “+ Tutor” para cadastrar o responsável antes de reservar.";
      $("confirmInternalBooking").disabled = true;
    } else {
      portalClients.forEach((client) => {
        const option = document.createElement("option");
        option.value = client.id;
        option.textContent = `${client.name} • ${client.phone}`;
        clientSelect.append(option);
      });
      await loadInternalBookingPets();
    }
    internalBookingModal.classList.add("open");
    clientSelect.focus();
  }

  async function refreshInternalBookingClients(selectedId = "") {
    await loadClients();
    const clientSelect = $("internalBookingClient");
    clientSelect.replaceChildren();
    portalClients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.id;
      option.textContent = `${client.name} • ${client.phone}`;
      clientSelect.append(option);
    });
    if (selectedId && portalClients.some((client) => client.id === selectedId)) clientSelect.value = selectedId;
    await loadInternalBookingPets();
  }

  async function loadClients(search = "") {
    if (!sessionStorage.getItem("ondaStaffToken")) return;
    try {
      const data = await api(`/api/clients?search=${encodeURIComponent(search)}`, { headers: staffHeaders() });
      portalClients = data.clients || [];
      renderClients();
    } catch (error) { showToast(error.message); }
  }

  function renderClients() {
    const body = $("registryBody"); body.replaceChildren();
    $("registryCount").textContent = `${portalClients.length} ${portalClients.length === 1 ? "tutor" : "tutores"}`;
    $("registryEmpty").style.display = portalClients.length ? "none" : "block";
    portalClients.forEach((client) => {
      const row = document.createElement("tr"); row.dataset.clientId = client.id;
      row.innerHTML = "<td><strong></strong><br><small></small></td><td></td><td></td><td></td>";
      row.querySelector("strong").textContent = client.name;
      row.querySelector("small").textContent = client.cpf || "CPF não informado";
      row.children[1].textContent = `${client.phone}${client.email ? ` • ${client.email}` : ""}`;
      row.children[2].textContent = client.pet_names || "Nenhum animal";
      row.children[3].textContent = new Date(Number(client.created_at) * 1000).toLocaleDateString("pt-BR");
      row.addEventListener("click", () => openClientDetails(client.id));
      body.append(row);
    });
    const select = $("petRegistryClient"); select.replaceChildren();
    portalClients.forEach((client) => { const option = document.createElement("option"); option.value = client.id; option.textContent = client.name; select.append(option); });
  }

  function openClientForm() {
    $("clientRegistryForm").reset(); $("clientRegistryModal").classList.add("open"); $("registryClientName").focus();
  }

  function openPetForm(clientId = "") {
    if (!portalClients.length) return showToast("Cadastre um tutor antes de adicionar o animal.");
    $("petRegistryForm").reset();
    if (clientId) $("petRegistryClient").value = clientId;
    $("petRegistryModal").classList.add("open"); $("petRegistryName").focus();
  }

  async function openClientDetails(clientId) {
    try {
      const data = await api(`/api/clients/${encodeURIComponent(clientId)}/pets`, { headers: staffHeaders() });
      selectedClientId = clientId;
      $("clientDetailsTitle").textContent = data.client.name;
      $("clientDetailsContact").textContent = `${data.client.phone}${data.client.email ? ` • ${data.client.email}` : ""}${data.client.address ? ` • ${data.client.address}` : ""}`;
      const target = $("clientPetsList"); target.replaceChildren();
      if (!data.pets.length) target.innerHTML = '<div class="portal-empty">Nenhum animal vinculado a este tutor.</div>';
      else data.pets.forEach((pet) => { const item = document.createElement("div"); item.className = "next-item"; item.innerHTML = "<strong></strong><span></span>"; item.querySelector("strong").textContent = pet.name; item.querySelector("span").textContent = [pet.species, pet.sex, pet.breed, pet.age, pet.weight].filter(Boolean).join(" • "); target.append(item); });
      renderClientClinicalHistory(data.records || [], data.pets || []);
      $("clientDetailsModal").classList.add("open");
    } catch (error) { showToast(error.message); }
  }

  function renderClientClinicalHistory(records, pets) {
    const target = $("clientClinicalHistory");
    target.replaceChildren();
    if (!records.length) {
      target.innerHTML = '<div class="portal-empty">Nenhum prontuário salvo para os animais deste tutor.</div>';
      return;
    }
    const categoryLabels = [
      ["chief_complaint", "Motivo da consulta"], ["anamnesis", "Anamnese"], ["clinical_findings", "Avaliação visual"],
      ["diagnosis", "Diagnóstico"], ["treatment_plan", "Tratamento e orientações"], ["prescription", "Receita"],
      ["exam_requests", "Exames solicitados"], ["referral", "Encaminhamento"], ["notes", "Observações internas"],
    ];
    records.forEach((record, index) => {
      const pet = pets.find((item) => item.id === record.pet_id);
      const date = new Date(Number(record.started_at || record.created_at) * 1000);
      const details = document.createElement("details");
      details.className = "clinical-history-record";
      if (index === 0) details.open = true;
      details.innerHTML = '<summary><span><strong></strong><small></small></span><b></b></summary><div class="clinical-categories"></div><button class="soft-btn full" type="button">Abrir prontuário completo</button>';
      details.querySelector("summary strong").textContent = `${record.patient_name || pet?.name || "Paciente"} • ${record.service_name || "Consulta"}`;
      details.querySelector("summary small").textContent = `${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • ${record.professional_name || "Veterinário(a)"}`;
      details.querySelector("summary b").textContent = record.status === "completed" ? "Finalizado" : "Em andamento";
      const categories = details.querySelector(".clinical-categories");
      categoryLabels.forEach(([key, label]) => {
        if (!record[key]) return;
        const item = document.createElement("section");
        item.innerHTML = "<strong></strong><p></p>";
        item.querySelector("strong").textContent = label;
        item.querySelector("p").textContent = record[key];
        categories.append(item);
      });
      if (!categories.children.length) categories.innerHTML = '<div class="portal-empty">Prontuário ainda sem informações clínicas.</div>';
      const openButton = details.querySelector("button");
      openButton.disabled = !record.room_id;
      openButton.addEventListener("click", async () => {
        if (!record.room_id) return;
        const originalText = openButton.textContent;
        openButton.disabled = true;
        openButton.textContent = "Abrindo prontuário…";
        const opened = await loadSavedRecord(record.room_id);
        if (opened) $("clientDetailsModal").classList.remove("open");
        else {
          openButton.disabled = false;
          openButton.textContent = originalText;
        }
      });
      target.append(details);
    });
  }

  function scheduleReminderCheck() {
    clearInterval(reminderTimer);
    const check = () => {
      if (!vetPortalView.classList.contains("active") || $("appointmentReminderModal").classList.contains("open")) return;
      const now = Date.now();
      const next = portalAppointments.find((item) => {
        const diff = Number(item.starts_at) * 1000 - now;
        return diff > 0 && diff <= 10 * 60 * 1000 && !["completed", "cancelled"].includes(item.status) && item.id !== remindedAppointmentId;
      });
      if (!next) return;
      remindedAppointmentId = next.id; selectedAppointmentId = next.id;
      const minutes = Math.max(1, Math.ceil((Number(next.starts_at) * 1000 - now) / 60000));
      $("reminderCountdown").textContent = `${minutes} min`;
      $("reminderPatient").textContent = next.patient_name;
      $("reminderTutor").textContent = `${next.tutor_name} • ${next.species}`;
      $("reminderSchedule").textContent = `Marcado para ${dateParts(next.starts_at).time}`;
      $("appointmentReminderModal").classList.add("open");
    };
    check(); reminderTimer = setInterval(check, 30000);
  }

  roleButtons.forEach((button) => button.addEventListener("click", () => {
    if (isClient) return;
    showView(button.dataset.view === "client");
  }));

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível completar a ação");
    return data;
  }

  function staffHeaders() {
    const token = sessionStorage.getItem("ondaStaffToken");
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
  }

  function dateParts(timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    return {
      date,
      day: date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
      short: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(Number(value) * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function calendarMonthKey() {
    return `${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, "0")}`;
  }

  function selectedDateObject() {
    return selectedCalendarDate ? new Date(`${selectedCalendarDate}T12:00:00`) : new Date();
  }

  function openBooking(slot) {
    $("bookingSlotId").value = slot.id;
    const when = dateParts(slot.starts_at);
    $("bookingSlotSummary").textContent = `${when.day}, às ${when.time} • ${slot.professional_name} • ${money(slot.price_cents)}`;
    try {
      const saved = JSON.parse(localStorage.getItem("ondaTutorQuickData") || "null");
      if (saved?.name && !$("bookingTutor").value) $("bookingTutor").value = saved.name;
      if (saved?.phone && !$("bookingPhone").value) $("bookingPhone").value = saved.phone;
    } catch (_) {
      localStorage.removeItem("ondaTutorQuickData");
    }
    bookingModal.classList.add("open");
    ($("bookingTutor").value ? $("bookingPatient") : $("bookingTutor")).focus();
  }

  async function loadPublicAvailability() {
    const dateTarget = $("publicDateList");
    const target = $("publicSlotList");
    try {
      const data = await api("/api/availability");
      publicSlots = data.slots || [];
      dateTarget.replaceChildren();
      target.replaceChildren();
      if (!publicSlots.length) {
        dateTarget.innerHTML = '<div class="empty-schedule">Ainda não há novos horários publicados.</div>';
        target.innerHTML = '<div class="empty-schedule">Volte em breve ou fale com a unidade.</div>';
        return;
      }
      const dates = [...new Set(publicSlots.map((slot) => dateParts(slot.starts_at).short))];
      if (!dates.includes(selectedPublicDate)) selectedPublicDate = dates[0];
      dates.forEach((dateKey) => {
        const first = publicSlots.find((slot) => dateParts(slot.starts_at).short === dateKey);
        const when = dateParts(first.starts_at);
        const count = publicSlots.filter((slot) => dateParts(slot.starts_at).short === dateKey).length;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `date-choice${dateKey === selectedPublicDate ? " active" : ""}`;
        button.innerHTML = "<strong></strong><span></span>";
        button.querySelector("strong").textContent = when.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
        button.querySelector("span").textContent = `${count} ${count === 1 ? "horário" : "horários"}`;
        button.addEventListener("click", () => { selectedPublicDate = dateKey; renderPublicTimes(); loadPublicAvailability(); });
        dateTarget.append(button);
      });
      renderPublicTimes();
    } catch (error) {
      dateTarget.innerHTML = '<div class="empty-schedule">Não foi possível carregar as datas agora.</div>';
      target.innerHTML = '<div class="empty-schedule">Tente novamente em instantes.</div>';
    }
  }

  function renderPublicTimes() {
    const target = $("publicSlotList");
    target.replaceChildren();
    const slots = publicSlots.filter((slot) => dateParts(slot.starts_at).short === selectedPublicDate);
    slots.forEach((slot) => {
        const when = dateParts(slot.starts_at);
        const button = document.createElement("button");
        button.className = "slot-button";
        button.type = "button";
        button.innerHTML = '<span class="slot-time"></span><span class="slot-meta"><strong></strong><span></span></span><span class="slot-price"></span>';
        button.querySelector(".slot-time").textContent = when.time;
        button.querySelector(".slot-meta strong").textContent = slot.professional_name;
        button.querySelector(".slot-meta span").textContent = `${slot.unit_name} • Toque para agendar`;
        button.querySelector(".slot-price").textContent = money(slot.price_cents);
        button.addEventListener("click", () => openBooking(slot));
        target.append(button);
      });
  }

  async function submitBooking() {
    const payload = {
      slotId: $("bookingSlotId").value,
      tutorName: $("bookingTutor").value.trim(),
      phone: $("bookingPhone").value,
      email: $("bookingEmail").value.trim(),
      tutorDocument: $("bookingDocument").value,
      tutorAddress: $("bookingAddress").value.trim(),
      postalCode: $("bookingPostalCode").value,
      patientName: $("bookingPatient").value.trim(),
      species: $("bookingSpecies").value,
      sex: $("bookingSex").value,
      breed: $("bookingBreed").value.trim(),
      coat: $("bookingCoat").value.trim(),
      age: $("bookingAge").value.trim(),
      weight: $("bookingWeight").value.trim(),
      chiefComplaint: $("bookingComplaint").value.trim(),
      rpvarValid: $("bookingRpvar").checked,
    };
    $("confirmBooking").disabled = true;
    $("confirmBooking").textContent = "Criando cobrança segura…";
    try {
      const data = await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
      try {
        localStorage.setItem("ondaTutorQuickData", JSON.stringify({ name: payload.tutorName, phone: payload.phone }));
      } catch (_) {}
      if (data.testMode && data.appointmentUrl) {
        location.href = data.appointmentUrl;
        return;
      }
      const summary = $("bookingSlotSummary").textContent;
      $("bookingForm").replaceChildren();
      const icon = document.createElement("div");
      icon.className = "modal-icon";
      icon.textContent = "✓";
      const title = document.createElement("h2");
      title.textContent = "Consulta agendada";
      const message = document.createElement("p");
      message.textContent = `${summary}. No horário, a veterinária iniciará o atendimento e você receberá o link pelo WhatsApp. O pagamento Pix aparecerá somente dentro desse link.`;
      const close = document.createElement("button");
      close.className = "primary-wide";
      close.type = "button";
      close.textContent = "Entendi";
      close.addEventListener("click", () => location.reload());
      $("bookingForm").append(icon, title, message, close);
    } catch (error) {
      showToast(error.message);
      $("confirmBooking").disabled = false;
      $("confirmBooking").textContent = "Agendar consulta";
    }
  }

  function setSaveState(text, saved = false) {
    saveState.textContent = text;
    saveState.classList.toggle("saved", saved);
  }

  function appointmentFromForm() {
    return {
      patientName: $("formPatient").value.trim(),
      tutorName: $("formTutor").value.trim(),
      tutorDocument: $("formTutorDocument").value.trim(),
      tutorAddress: $("formTutorAddress").value.trim(),
      professionalName: $("formProfessional").value.trim(),
      professionalCrmv: $("formCrmv").value.trim(),
      unitName: $("formUnit").value,
      serviceName: $("formService").value,
      species: $("formSpecies").value,
      sex: $("formSex").value,
      breed: $("formBreed").value.trim(),
      coat: $("formCoat").value.trim(),
      age: $("formAge").value.trim(),
      weight: $("formWeight").value.trim(),
      chiefComplaint: $("formComplaint").value.trim(),
      rpvarValid: $("formRpvar").checked,
    };
  }

  function applyAppointment(data) {
    currentAppointment = {
      patientName: data.patientName || data.patient_name || "Paciente",
      tutorName: data.tutorName || data.tutor_name || "Responsável",
      tutorDocument: data.tutorDocument || data.tutor_document || "",
      tutorAddress: data.tutorAddress || data.tutor_address || "",
      professionalName: data.professionalName || data.professional_name || "Veterinário(a)",
      professionalCrmv: data.professionalCrmv || data.professional_crmv || "",
      unitName: data.unitName || data.unit_name || "Gravataí",
      serviceName: data.serviceName || data.service_name || "Consulta por vídeo",
      species: data.species || "Não informado",
      sex: data.sex || "",
      breed: data.breed || "",
      coat: data.coat || "",
      age: data.age || "",
      weight: data.weight || "",
      rpvarValid: data.rpvarValid ?? Boolean(data.rpvar_valid ?? true),
      chiefComplaint: data.chiefComplaint || data.chief_complaint || "",
    };
    $("headerPatient").textContent = `${currentAppointment.patientName} • ${currentAppointment.species}`;
    $("headerTutor").textContent = `${currentAppointment.tutorName} • ${currentAppointment.serviceName}`;
    $("recordPatient").textContent = currentAppointment.patientName;
    $("recordAge").textContent = currentAppointment.age || "Não informado";
    $("recordSpecies").textContent = currentAppointment.species;
    $("recordWeight").textContent = currentAppointment.weight || "Não informado";
    $("recordSex").textContent = currentAppointment.sex || "Não informado";
    $("recordBreed").textContent = currentAppointment.breed || "Não informado";
    $("rpvarBadge").textContent = currentAppointment.rpvarValid ? "RPVAR válida" : "Sem RPVAR";
    $("legalNote").textContent = currentAppointment.rpvarValid
      ? "Atendimento presencial anterior confirmado. Registre no prontuário as limitações observadas durante a teleconsulta."
      : "Teleorientação/teletriagem: sem RPVAR presencial, não finalize diagnóstico, prescrição ou solicitação de exames.";
  }

  function collectRecord(status = "draft") {
    return {
      roomId: activeRecordRoomId,
      ...currentAppointment,
      chiefComplaint: $("complaint").value,
      anamnesis: $("anamnesis").value,
      clinicalFindings: $("clinicalFindings").value,
      diagnosis: $("diagnosis").value,
      treatmentPlan: $("treatmentPlan").value,
      prescription: $("prescription").value,
      examRequests: $("examRequests").value,
      referral: $("referral").value,
      notes: $("notes").value,
      status,
      startedAt: consultationStartedAt,
      endedAt: status === "completed" ? Math.floor(Date.now() / 1000) : null,
    };
  }

  async function saveRecord(status = "draft", quiet = false) {
    if (!activeRecordRoomId || !currentAppointment) return false;
    saveRecordBtn.disabled = true;
    setSaveState(status === "completed" ? "Finalizando e salvando…" : "Salvando…");
    try {
      await api("/api/record", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify(collectRecord(status)),
      });
      recordDirty = false;
      recordStatus = status;
      const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setSaveState(status === "completed" ? `Prontuário finalizado às ${time}` : `Salvo às ${time}`, true);
      if (!quiet) showToast(status === "completed" ? "Prontuário finalizado e salvo." : "Prontuário salvo com sucesso.");
      await loadConsultations(true);
      return true;
    } catch (error) {
      setSaveState("Falha ao salvar. Tente novamente.");
      if (!quiet) showToast(error.message);
      return false;
    } finally {
      saveRecordBtn.disabled = false;
    }
  }

  function fillRecord(record) {
    applyAppointment(record);
    activeRecordRoomId = record.room_id;
    recordStatus = record.status || "draft";
    consultationStartedAt = record.started_at || record.created_at || Math.floor(Date.now() / 1000);
    $("complaint").value = record.chief_complaint || "";
    $("anamnesis").value = record.anamnesis || "";
    $("clinicalFindings").value = record.clinical_findings || "";
    $("diagnosis").value = record.diagnosis || "";
    $("treatmentPlan").value = record.treatment_plan || "";
    $("prescription").value = record.prescription || "";
    $("examRequests").value = record.exam_requests || "";
    $("referral").value = record.referral || "";
    $("notes").value = record.notes || "";
    saveRecordBtn.disabled = false;
    recordDirty = false;
    setSaveState(record.status === "completed" ? "Prontuário finalizado" : "Prontuário em andamento", true);
  }

  async function loadSavedRecord(roomId) {
    if (room && !isEnding) return showToast("Encerre a chamada atual antes de abrir outro prontuário.");
    try {
      const data = await api(`/api/record?room=${encodeURIComponent(roomId)}`, { headers: staffHeaders() });
      fillRecord(data.record);
      const linkedAppointment = portalAppointments.find((item) => item.id === data.record.appointment_id || item.room_id === roomId);
      selectedAppointmentId = linkedAppointment?.id || null;
      syncAppointmentActions(null);
      showConsultationWorkspace();
      startCallBtn.disabled = true;
      startCallBtn.textContent = data.record.status === "completed" ? "Prontuário finalizado" : "Prontuário salvo • em andamento";
      endCallBtn.hidden = true;
      $("proStatus").textContent = data.record.status === "completed" ? "Histórico clínico finalizado" : "Histórico clínico em andamento";
      requestAnimationFrame(() => {
        document.querySelector(".record-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        $("complaint")?.focus({ preventScroll: true });
      });
      showToast(`Prontuário de ${data.record.patient_name} aberto.`);
      return true;
    } catch (error) {
      showToast(error.message);
      return false;
    }
  }

  function renderConsultations(appointments, records, openSlots = []) {
    consultationList.replaceChildren();
    if (!appointments.length && !records.length && !openSlots.length) {
      consultationList.innerHTML = '<div class="queue-empty">Nenhum atendimento agendado.<br>Publique horários para receber agendamentos.</div>';
      return;
    }
    appointments.forEach((item) => {
      const button = document.createElement("button");
      button.className = `queue-item${item.id === selectedAppointmentId || item.room_id === activeRecordRoomId ? " active" : ""}`;
      button.type = "button";
      const when = dateParts(item.starts_at);
      const paid = item.payment_status === "paid";
      const statusLabel = item.status === "cancelled" ? (item.refund_status === "pending" ? "Cancelado • devolver Pix" : item.refund_status === "refunded" ? "Cancelado • devolvido" : "Cancelado") : item.cancellation_requested_at ? "Cancelamento solicitado" : item.status === "completed" ? "Finalizado" : item.room_id ? "Sala iniciada" : paid ? "Pago • pronto" : "Pagamento pendente";
      button.classList.toggle("cancelled", item.status === "cancelled");
      button.innerHTML = `<span class="queue-time">${when.time}</span><span><strong></strong><small></small><span class="status ${paid ? "online" : ""}">● ${statusLabel}</span></span>`;
      button.querySelector("strong").textContent = item.patient_name;
      button.querySelector("small").textContent = `${item.tutor_name} • ${item.species} • ${when.short}`;
      button.addEventListener("click", async () => {
        selectedAppointmentId = item.id;
        syncAppointmentActions(item);
        if (item.status === "cancelled") {
          openAppointmentFromPortal(item);
          renderConsultations(appointments, records, openSlots);
          return;
        }
        if (item.room_id) {
          startCallBtn.disabled = true;
          startCallBtn.textContent = item.status === "completed" ? "Consulta finalizada" : "Atendimento já iniciado";
          await loadSavedRecord(item.room_id);
        } else {
          $("headerPatient").textContent = `${item.patient_name} • ${item.species}`;
          $("headerTutor").textContent = `${item.tutor_name} • ${when.day}, ${when.time}`;
          $("proStatus").textContent = paid ? "Pagamento confirmado" : "Pagamento pendente";
          startCallBtn.disabled = false;
          startCallBtn.textContent = "Iniciar e avisar no WhatsApp";
          showToast(`Atendimento de ${item.patient_name} selecionado.`);
        }
        renderConsultations(appointments, records, openSlots);
      });
      consultationList.append(button);
    });
    openSlots.forEach((slot) => {
      const button = document.createElement("button");
      button.className = "queue-item";
      button.type = "button";
      const when = dateParts(slot.starts_at);
      button.innerHTML = '<span class="queue-time"></span><span><strong>Horário disponível</strong><small></small><span class="status online">● Publicado</span></span>';
      button.querySelector(".queue-time").textContent = when.time;
      button.querySelector("small").textContent = `${when.short} • ${slot.professional_name} • ${money(slot.price_cents)}`;
      button.addEventListener("click", () => openInternalBooking(slot));
      consultationList.append(button);
    });
    const appointmentRooms = new Set(appointments.map((item) => item.room_id).filter(Boolean));
    records.filter((item) => !appointmentRooms.has(item.room_id)).forEach((item) => {
      const button = document.createElement("button");
      button.className = `queue-item${item.room_id === activeRecordRoomId ? " active" : ""}`;
      button.type = "button";
      const date = new Date(Number(item.updated_at) * 1000);
      const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const complete = item.status === "completed";
      button.innerHTML = `<span class="queue-time">${time}</span><span><strong></strong><small></small><span class="status ${complete ? "online" : ""}">● ${complete ? "Finalizado" : "Manual"}</span></span>`;
      button.querySelector("strong").textContent = item.patient_name;
      button.querySelector("small").textContent = `${item.tutor_name} • ${item.service_name}`;
      button.addEventListener("click", () => loadSavedRecord(item.room_id));
      consultationList.append(button);
    });
  }

  async function loadConsultations(quiet = false) {
    const token = sessionStorage.getItem("ondaStaffToken");
    if (!token) return;
    try {
      const [schedule, history, availability, managed] = await Promise.all([
        api("/api/appointments", { headers: staffHeaders() }),
        api("/api/consultations", { headers: staffHeaders() }),
        api("/api/availability"),
        api(`/api/availability/manage?month=${calendarMonthKey()}`, { headers: staffHeaders() }),
      ]);
      portalAppointments = schedule.appointments || [];
      portalOpenSlots = availability.slots || [];
      portalManagedSlots = managed.slots || [];
      scheduleAudit = managed.audit || [];
      renderPortalSchedule();
      if (!selectedCalendarDate || !selectedCalendarDate.startsWith(calendarMonthKey())) selectedCalendarDate = localDateKey(new Date()).startsWith(calendarMonthKey()) ? localDateKey(new Date()) : `${calendarMonthKey()}-01`;
      renderMonthCalendar();
      renderConsultations(schedule.appointments || [], history.consultations || [], availability.slots || []);
    } catch (error) {
      if (/expirado/i.test(error.message)) sessionStorage.removeItem("ondaStaffToken");
      if (!quiet) showToast(error.message);
    }
  }

  function startPortalAutoRefresh() {
    clearInterval(portalRefreshTimer);
    portalRefreshTimer = setInterval(() => {
      if (document.visibilityState !== "visible" || !vetPortalView.classList.contains("active") || !sessionStorage.getItem("ondaStaffToken")) return;
      loadConsultations(true);
    }, 8000);
  }

  async function startScheduledAppointment() {
    if (!selectedAppointmentId) return showToast("Selecione um atendimento agendado na coluna da esquerda.");
    const appointmentId = selectedAppointmentId;
    const whatsappWindow = window.open("about:blank", "ondaWhatsApp");
    startCallBtn.disabled = true;
    startCallBtn.textContent = "Criando sala e preparando WhatsApp…";
    try {
      const data = await api("/api/appointments/start", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({ appointmentId: selectedAppointmentId }),
      });
      room = { roomId: data.roomId, token: data.hostToken, role: "host" };
      activeRecordRoomId = data.roomId;
      recordStatus = "draft";
      consultationStartedAt = Math.floor(Date.now() / 1000);
      applyAppointment(data);
      $("complaint").value = data.chiefComplaint || "";
      ["anamnesis", "clinicalFindings", "diagnosis", "treatmentPlan", "prescription", "examRequests", "referral", "notes"].forEach((id) => { $(id).value = ""; });
      saveRecordBtn.disabled = false;
      setSaveState("Prontuário criado • salvamento automático ativo", true);
      sessionStorage.setItem("ondaHostRoom", JSON.stringify(room));
      inviteLink.value = data.appointmentUrl;
      copyLinkBtn.disabled = false;
      let mediaWarning = "";
      try {
        await acquireMedia(localVideo);
        localWrap.classList.add("active");
      } catch (error) {
        mediaWarning = mediaErrorMessage(error);
        cameraBtn.classList.add("off");
      }
      createPeer(remoteVideo);
      setStatus("Aguardando pagamento e entrada do tutor");
      $("remoteText").textContent = "O WhatsApp foi preparado com a mensagem e o link. Confirme o envio para o tutor.";
      if (data.whatsappUrl && whatsappWindow) {
        whatsappWindow.location.href = data.whatsappUrl;
        await api("/api/appointments/whatsapp-opened", { method: "POST", headers: staffHeaders(), body: JSON.stringify({ appointmentId }) }).catch(() => {});
      } else {
        whatsappWindow?.close();
        await navigator.clipboard.writeText(data.appointmentUrl).catch(() => {});
      }
      startCallBtn.textContent = "Sala criada • aguardando tutor";
      endCallBtn.hidden = false;
      startPolling();
      await loadConsultations(true);
      showToast(mediaWarning || (data.whatsappUrl ? "WhatsApp aberto. Confirme o envio da mensagem." : "Sala criada e link copiado."));
    } catch (error) {
      whatsappWindow?.close();
      showToast(error.message);
      startCallBtn.disabled = false;
      startCallBtn.textContent = "Iniciar e avisar no WhatsApp";
    }
  }

  function openCancelScheduled() {
    const item = portalAppointments.find((appointment) => appointment.id === selectedAppointmentId);
    if (!item || item.room_id || ["cancelled", "completed"].includes(item.status)) return showToast("Selecione uma consulta que ainda não foi iniciada.");
    const when = dateParts(item.starts_at);
    $("cancelScheduledSummary").textContent = `${item.patient_name} • ${item.tutor_name} • ${when.short}, ${when.time}`;
    $("cancelScheduledReason").value = item.cancellation_request_reason || "";
    $("cancelScheduledReopen").checked = Number(item.starts_at) * 1000 > Date.now();
    $("cancelScheduledReopen").disabled = Number(item.starts_at) * 1000 <= Date.now();
    $("cancelScheduledPaymentNote").textContent = item.payment_status === "paid"
      ? "O Pix já foi pago. Ao cancelar, ficará uma pendência de devolução para a recepção."
      : "Ainda não há pagamento confirmado; nenhuma devolução será necessária.";
    cancelScheduledModal.classList.add("open");
    $("cancelScheduledReason").focus();
  }

  async function markAppointmentRefunded() {
    const item = portalAppointments.find((appointment) => appointment.id === selectedAppointmentId);
    if (!item || item.refund_status !== "pending") return showToast("Não há devolução pendente neste agendamento.");
    const reference = window.prompt("Informe a referência, protocolo ou identificação do comprovante da devolução Pix:");
    if (!reference?.trim()) return;
    const whatsappWindow = window.open("about:blank", "ondaWhatsApp");
    try {
      const data = await api("/api/appointments/refund", { method: "POST", headers: staffHeaders(), body: JSON.stringify({ appointmentId: item.id, reference: reference.trim() }) });
      if (data.whatsappUrl && whatsappWindow) whatsappWindow.location.href = data.whatsappUrl; else whatsappWindow?.close();
      await loadConsultations(true);
      const updated = portalAppointments.find((appointment) => appointment.id === item.id);
      if (updated) openAppointmentFromPortal(updated);
      showToast(data.whatsappUrl ? "Devolução registrada. WhatsApp aberto para avisar o tutor." : "Devolução registrada.");
    } catch (error) {
      whatsappWindow?.close();
      showToast(error.message);
    }
  }

  function openAppointment() {
    if (room && !isEnding) return showToast("Encerre a chamada atual antes de iniciar outra.");
    if (room && isEnding) {
      room = null;
      peer = null;
      localStream = null;
      lastSignalId = 0;
      offerSent = false;
      pendingCandidates = [];
      isEnding = false;
      elapsedSeconds = 0;
      timer.textContent = "00:00";
      startCallBtn.disabled = false;
      startCallBtn.textContent = "Criar atendimento e sala";
    }
    if (!sessionStorage.getItem("ondaStaffToken")) {
      pendingAction = "new";
      loginModal.classList.add("open");
      $("pinInput").focus();
      return;
    }
    appointmentForm.reset();
    const savedProfile = JSON.parse(localStorage.getItem("ondaVetProfile") || "null");
    $("formProfessional").value = savedProfile?.professionalName || "Dra. Bruna";
    $("formCrmv").value = savedProfile?.professionalCrmv || "";
    $("formUnit").value = savedProfile?.unitName || "Gravataí";
    $("formRpvar").checked = true;
    appointmentModal.classList.add("open");
    $("formPatient").focus();
  }

  async function acquireMedia(preview) {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este aparelho não permite acesso à câmera");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    preview.srcObject = localStream;
    await preview.play().catch(() => {});
    return localStream;
  }

  function mediaErrorMessage(error) {
    if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name) || /device not found|requested device/i.test(error?.message || "")) {
      return "Nenhuma câmera ou microfone foi encontrado. Conecte o dispositivo e tente novamente.";
    }
    if (["NotAllowedError", "PermissionDeniedError"].includes(error?.name)) {
      return "O acesso à câmera e ao microfone foi bloqueado. Libere a permissão no navegador.";
    }
    if (["NotReadableError", "TrackStartError"].includes(error?.name)) {
      return "A câmera ou o microfone está sendo usado por outro programa.";
    }
    return error?.message || "Não foi possível ativar a câmera e o microfone.";
  }

  const medicineFieldIds = ["rxMedicine", "rxPresentation", "rxQuantity", "rxDose", "rxRoute", "rxFrequency", "rxDuration", "rxInstructions"];

  function medicineText() {
    const medicine = $("rxMedicine").value.trim();
    const presentation = $("rxPresentation").value.trim();
    const quantity = $("rxQuantity").value.trim();
    const dose = $("rxDose").value.trim();
    const route = $("rxRoute").value;
    const frequency = $("rxFrequency").value.trim();
    const duration = $("rxDuration").value.trim();
    const instructions = $("rxInstructions").value.trim();
    if (!medicine || !presentation || !quantity || !dose || !frequency || !duration) return "";
    const number = (($("prescription").value.match(/^\d+\./gm) || []).length + 1);
    return `${number}. ${medicine.toUpperCase()} — ${presentation}\nQuantidade: ${quantity}\nAdministrar ${dose}, ${route.toLowerCase()}, ${frequency}, ${duration}.${instructions ? `\nOrientações: ${instructions}` : ""}`;
  }

  function refreshMedicinePreview() {
    medicinePreview.textContent = medicineText() || "Preencha os campos para visualizar o medicamento formatado.";
  }

  function openPrescriptionBuilder() {
    if (!activeRecordRoomId || !currentAppointment) return showToast("Abra ou crie um atendimento antes de montar a receita.");
    if (!currentAppointment.rpvarValid) return showToast("Sem RPVAR válida, este atendimento não pode emitir prescrição por teleconsulta.");
    const fields = {
      rxProfessional: currentAppointment.professionalName,
      rxCrmv: currentAppointment.professionalCrmv,
      rxPatient: currentAppointment.patientName,
      rxTutor: currentAppointment.tutorName,
      rxTutorDocument: currentAppointment.tutorDocument,
      rxTutorAddress: currentAppointment.tutorAddress,
      rxSpecies: currentAppointment.species,
      rxSex: currentAppointment.sex,
      rxBreed: currentAppointment.breed,
      rxCoat: currentAppointment.coat,
      rxWeight: currentAppointment.weight,
      rxAge: currentAppointment.age,
    };
    Object.entries(fields).forEach(([id, value]) => { $(id).value = value || ""; });
    medicineFieldIds.forEach((id) => {
      if (id !== "rxRoute") $(id).value = "";
    });
    $("rxRoute").value = "Via oral";
    refreshMedicinePreview();
    prescriptionModal.classList.add("open");
    $("rxMedicine").focus();
  }

  function syncPrescriptionIdentity() {
    currentAppointment = {
      ...currentAppointment,
      professionalName: $("rxProfessional").value.trim(),
      professionalCrmv: $("rxCrmv").value.trim(),
      patientName: $("rxPatient").value.trim(),
      tutorName: $("rxTutor").value.trim(),
      tutorDocument: $("rxTutorDocument").value.trim(),
      tutorAddress: $("rxTutorAddress").value.trim(),
      species: $("rxSpecies").value.trim(),
      sex: $("rxSex").value,
      breed: $("rxBreed").value.trim(),
      coat: $("rxCoat").value.trim(),
      weight: $("rxWeight").value.trim(),
      age: $("rxAge").value.trim(),
    };
    applyAppointment(currentAppointment);
    recordDirty = true;
    setSaveState("Dados da receita ainda não salvos");
  }

  function pdfAscii(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[—–]/g, "-")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[^\x20-\x7E\n]/g, " ");
  }

  function pdfEscape(value) {
    return pdfAscii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function wrapPdfText(value, limit = 88) {
    const lines = [];
    pdfAscii(value).split(/\r?\n/).forEach((paragraph) => {
      if (!paragraph.trim()) {
        lines.push("");
        return;
      }
      let line = "";
      paragraph.trim().split(/\s+/).forEach((word) => {
        if (!line) line = word;
        else if (`${line} ${word}`.length <= limit) line += ` ${word}`;
        else {
          lines.push(line);
          line = word;
        }
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  function buildPdf(title, record, sections, options = {}) {
    const clinic = record.unitName === "Cachoeirinha"
      ? { address: "Rua Iracema, 185 - Cachoeirinha/RS", phone: "(51) 3041-5081 / (51) 99933-7122" }
      : { address: "Rua Francisco Tafas, 67 - Salgado Filho - Gravatai/RS - CEP 94020-020", phone: "(51) 3112-5091 / (51) 3041-5081" };
    const pages = [];
    let commands = [];
    let y = 744;

    function textLine(value, x, currentY, size = 10, bold = false, color = ".16 .19 .21") {
      commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${currentY} Td (${pdfEscape(value)}) Tj ET`);
    }

    function startPage() {
      if (commands.length) pages.push(commands);
      commands = [
        ".20 .25 .27 rg 0 770 595 72 re f",
        "1 1 1 rg 34 786 527 1 re f",
      ];
      textLine("CLINICA VETERINARIA ONDA ANIMAL", 34, 814, 15, true, "1 1 1");
      textLine(`${record.unitName || "Gravatai"} | ${clinic.address}`, 34, 799, 8, false, ".92 .94 .95");
      textLine(`${clinic.phone} | onda-animal.com.br`, 34, 775, 8, false, ".92 .94 .95");
      y = 744;
    }

    function ensureSpace(height) {
      if (y - height < 66) startPage();
    }

    function addHeading(value) {
      ensureSpace(28);
      y -= 8;
      commands.push(`.93 .94 .95 rg 34 ${y - 6} 527 22 re f`);
      textLine(value, 42, y, 10, true, ".18 .22 .24");
      y -= 28;
    }

    function addBody(value, bold = false) {
      const wrapped = wrapPdfText(value, 92);
      wrapped.forEach((line) => {
        ensureSpace(14);
        if (line) textLine(line, 42, y, 9.5, bold);
        y -= line ? 14 : 8;
      });
    }

    startPage();
    textLine(title, 34, 736, 17, true);
    textLine(`Emitido em ${new Date().toLocaleDateString("pt-BR")} - Atendimento ${record.status === "completed" ? "finalizado" : "em andamento"}`, 34, 719, 9, false, ".35 .40 .42");
    y = 692;

    addHeading("IDENTIFICACAO DO PACIENTE E RESPONSAVEL");
    addBody(`Paciente: ${record.patientName || "Nao informado"} | Especie: ${record.species || "Nao informado"} | Sexo: ${record.sex || "Nao informado"}`);
    addBody(`Raca: ${record.breed || "Nao informado"} | Pelagem: ${record.coat || "Nao informado"} | Peso: ${record.weight || "Nao informado"} | Idade: ${record.age || "Nao informado"}`);
    addBody(`Responsavel: ${record.tutorName || "Nao informado"}${record.tutorDocument ? ` | CPF: ${record.tutorDocument}` : ""}`);
    addBody(`Endereco: ${record.tutorAddress || "Nao informado"}`);

    sections.forEach((section) => {
      addHeading(section.title);
      addBody(section.text || "Nao informado");
    });

    if (options.signature) {
      ensureSpace(92);
      y -= 28;
      commands.push(`.35 .38 .40 RG .7 w 160 ${y} 275 0 l S`);
      textLine(record.professionalName || "Medico-veterinario", 190, y - 18, 10, true);
      textLine(record.professionalCrmv || "CRMV nao informado", 215, y - 34, 9);
      textLine("Assinatura do medico-veterinario", 208, y - 50, 8, false, ".42 .46 .48");
      y -= 70;
    }

    if (options.warning) {
      ensureSpace(42);
      addBody(options.warning);
    }
    pages.push(commands);

    pages.forEach((page, index) => {
      page.push(`BT /F1 8 Tf .42 .46 .48 rg 34 35 Td (Documento gerado pelo Onda Animal Teleatendimento) Tj ET`);
      page.push(`BT /F1 8 Tf .42 .46 .48 rg 520 35 Td (${index + 1}/${pages.length}) Tj ET`);
    });

    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    const pageIds = [];
    let nextId = 5;
    pages.forEach((page) => {
      const content = page.join("\n");
      const contentId = nextId++;
      const pageId = nextId++;
      objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      pageIds.push(pageId);
    });
    objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = new Array(objects.length).fill(0);
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  function safeFilename(value) {
    return pdfAscii(value || "Paciente").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function validatePrescription(record) {
    const required = [
      ["professionalCrmv", "CRMV"], ["tutorAddress", "endereço do tutor"], ["species", "espécie"],
      ["sex", "sexo"], ["breed", "raça"], ["coat", "pelagem"], ["weight", "peso"],
    ];
    return required.filter(([key]) => !record[key]).map(([, label]) => label);
  }

  async function downloadPrescriptionPdf() {
    if (!activeRecordRoomId || !currentAppointment) return showToast("Abra um atendimento antes de baixar a receita.");
    if (!currentAppointment.rpvarValid) return showToast("Sem RPVAR válida, este atendimento não pode emitir prescrição por teleconsulta.");
    const record = collectRecord(recordStatus);
    if (!record.prescription.trim()) return showToast("Monte ou preencha a receita antes de baixar o PDF.");
    const missing = validatePrescription(record);
    if (missing.length) {
      showToast(`Complete os dados da receita: ${missing.join(", ")}.`);
      openPrescriptionBuilder();
      return;
    }
    if (recordDirty && !await saveRecord(recordStatus, true)) return showToast("Salve o prontuário antes de baixar a receita.");
    const blob = buildPdf("RECEITA VETERINARIA SIMPLES", record, [
      { title: "PRESCRICAO", text: record.prescription },
      { title: "ORIENTACOES GERAIS", text: record.treatmentPlan || "Seguir as orientacoes do medico-veterinario e nao interromper o tratamento sem avaliacao." },
    ], {
      signature: true,
      warning: "Receita simples. Medicamentos sujeitos a controle especial devem ser emitidos pelos fluxos oficiais do SimplesVet/SIPEAGRO. O documento deve ser assinado pelo medico-veterinario.",
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `Receita_${safeFilename(record.patientName)}_${date}.pdf`);
    showToast("Receita em PDF baixada.");
  }

  async function downloadRecordPdf() {
    if (!activeRecordRoomId || !currentAppointment) return showToast("Abra um atendimento antes de baixar o prontuário.");
    if (recordDirty && !await saveRecord(recordStatus, true)) return showToast("Não foi possível salvar antes do download.");
    const record = collectRecord(recordStatus);
    const blob = buildPdf("PRONTUARIO DE TELEATENDIMENTO", record, [
      { title: "PROFISSIONAL RESPONSAVEL", text: `${record.professionalName || "Nao informado"} | ${record.professionalCrmv || "CRMV nao informado"}` },
      { title: "QUEIXA PRINCIPAL", text: record.chiefComplaint },
      { title: "ANAMNESE", text: record.anamnesis },
      { title: "EXAME VISUAL E ACHADOS CLINICOS", text: record.clinicalFindings },
      { title: "HIPOTESE DIAGNOSTICA / DIAGNOSTICO", text: record.diagnosis },
      { title: "CONDUTA E ORIENTACOES", text: record.treatmentPlan },
      { title: "PRESCRICAO", text: record.prescription },
      { title: "EXAMES SOLICITADOS", text: record.examRequests },
      { title: "ENCAMINHAMENTO PRESENCIAL", text: record.referral },
      { title: "OBSERVACOES INTERNAS", text: record.notes },
    ], { signature: true });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `Prontuario_${safeFilename(record.patientName)}_${date}.pdf`);
    showToast("Prontuário em PDF baixado.");
  }

  function openSignedPrescriptionFlow() {
    if (!activeRecordRoomId || !currentAppointment) return showToast("Abra um atendimento antes de assinar a receita.");
    if (!currentAppointment.rpvarValid) return showToast("Sem RPVAR válida, este atendimento não pode emitir prescrição por teleconsulta.");
    if (!$("prescription").value.trim()) return showToast("Monte e salve a receita antes de assinar.");
    $("signedPrescriptionFile").value = "";
    $("signedPrescriptionStatus").classList.remove("paid");
    $("signedPrescriptionStatus").textContent = "Nenhum arquivo enviado.";
    signedPrescriptionModal.classList.add("open");
  }

  async function uploadSignedPrescription() {
    const file = $("signedPrescriptionFile").files?.[0];
    if (!file) return showToast("Selecione a receita assinada em PDF.");
    const whatsappWindow = window.open("about:blank", "ondaPrescriptionWhatsApp");
    $("uploadSignedPrescription").disabled = true;
    $("uploadSignedPrescription").textContent = "Enviando com segurança…";
    $("signedPrescriptionStatus").textContent = "Armazenando o documento assinado…";
    try {
      const form = new FormData();
      form.append("roomId", activeRecordRoomId);
      form.append("file", file);
      const uploadResponse = await fetch("/api/prescriptions/signed", { method: "POST", headers: staffHeaders(), body: form });
      const uploaded = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploaded.error || "Não foi possível enviar a receita assinada");
      lastSignedDocument = uploaded;
      const sent = await api("/api/prescriptions/send", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({ documentId: uploaded.documentId, shareUrl: uploaded.shareUrl }),
      });
      $("signedPrescriptionStatus").classList.add("paid");
      if (sent.whatsappUrl && whatsappWindow) {
        whatsappWindow.location.href = sent.whatsappUrl;
        $("signedPrescriptionStatus").textContent = "WhatsApp aberto com o link da receita. Confirme o envio.";
        showToast("Confirme o envio da receita no WhatsApp.");
      } else {
        whatsappWindow?.close();
        await navigator.clipboard.writeText(uploaded.shareUrl).catch(() => {});
        $("signedPrescriptionStatus").textContent = "Receita salva. O link seguro foi copiado para você enviar ao tutor.";
        showToast("Link seguro da receita copiado.");
      }
    } catch (error) {
      whatsappWindow?.close();
      $("signedPrescriptionStatus").textContent = error.message;
      showToast(error.message);
    } finally {
      $("uploadSignedPrescription").disabled = false;
      $("uploadSignedPrescription").textContent = "Enviar receita assinada";
    }
  }

  function createPeer(remoteTarget) {
    if (peer) return peer;
    peer = new RTCPeerConnection(rtcConfig);
    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal("candidate", candidate.toJSON()).catch(() => {});
    };
    peer.ontrack = ({ streams }) => {
      const [stream] = streams;
      if (!stream) return;
      remoteTarget.srcObject = stream;
      remoteTarget.classList.add("active");
      remoteTarget.play().catch(() => {});
      if (isClient) {
        clientVideo.classList.add("client-self");
        $("clientHeading").textContent = "Consulta em andamento";
        $("clientIntro").textContent = "Você está conectado com a equipe da Onda Animal.";
      } else {
        $("remotePlaceholder").style.display = "none";
        $("proStatus").textContent = "Cliente conectado";
        startCallBtn.textContent = "Consulta em andamento";
        endCallBtn.hidden = false;
        startTimer();
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        showToast("Chamada conectada com áudio e vídeo.");
      } else if (["failed", "disconnected"].includes(state)) {
        setStatus("Conexão interrompida. Tentando reconectar…");
      } else if (state === "closed") {
        setStatus("Consulta encerrada");
      }
    };
    return peer;
  }

  function setStatus(text) {
    if (isClient) {
      $("clientHeading").textContent = text;
    } else {
      $("proStatus").textContent = text;
      $("remoteTitle").textContent = text;
    }
  }

  async function sendSignal(kind, payload) {
    if (!room) return;
    await api("/api/signals", {
      method: "POST",
      body: JSON.stringify({
        roomId: room.roomId,
        token: room.token,
        role: room.role,
        senderId,
        kind,
        payload,
      }),
    });
  }

  async function processSignal(signal) {
    if (signal.kind === "ready" && room.role === "host" && !offerSent) {
      setStatus("Cliente entrou. Conectando…");
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peer.setLocalDescription(offer);
      offerSent = true;
      await sendSignal("offer", peer.localDescription.toJSON());
      return;
    }
    if (signal.kind === "offer" && room.role === "client") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", peer.localDescription.toJSON());
      return;
    }
    if (signal.kind === "answer" && room.role === "host") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushCandidates();
      return;
    }
    if (signal.kind === "candidate") {
      if (!peer.remoteDescription) pendingCandidates.push(signal.payload);
      else await peer.addIceCandidate(new RTCIceCandidate(signal.payload)).catch(() => {});
      return;
    }
    if (signal.kind === "hangup") endLocally("A outra pessoa encerrou a consulta.");
    if (signal.kind === "chat" && signal.payload?.message) showToast(`Mensagem: ${signal.payload.message}`);
  }

  async function flushCandidates() {
    const queued = pendingCandidates;
    pendingCandidates = [];
    for (const candidate of queued) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  async function pollSignals() {
    if (!room || isEnding) return;
    try {
      const query = new URLSearchParams({
        room: room.roomId,
        token: room.token,
        role: room.role,
        sender: senderId,
        after: String(lastSignalId),
      });
      const data = await api(`/api/signals?${query}`);
      for (const signal of data.signals || []) {
        lastSignalId = Math.max(lastSignalId, signal.id);
        await processSignal(signal);
      }
    } catch (error) {
      if (!isEnding) setStatus(error.message);
    } finally {
      if (!isEnding) pollTimer = setTimeout(pollSignals, 900);
    }
  }

  function startPolling() {
    clearTimeout(pollTimer);
    pollSignals();
  }

  function startTimer() {
    if (elapsedTimer) return;
    elapsedTimer = setInterval(() => {
      elapsedSeconds += 1;
      const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
      const seconds = String(elapsedSeconds % 60).padStart(2, "0");
      timer.textContent = `${minutes}:${seconds}`;
    }, 1000);
  }

  async function createRoom() {
    const staffToken = sessionStorage.getItem("ondaStaffToken");
    if (!staffToken) {
      loginModal.classList.add("open");
      $("pinInput").focus();
      return;
    }
    startCallBtn.disabled = true;
    startCallBtn.textContent = "Salvando atendimento…";
    try {
      const data = await api("/api/rooms", {
        method: "POST",
        headers: { authorization: `Bearer ${staffToken}` },
        body: JSON.stringify(currentAppointment),
      });
      room = { roomId: data.roomId, token: data.hostToken, role: "host" };
      activeRecordRoomId = data.roomId;
      recordStatus = "draft";
      consultationStartedAt = Math.floor(Date.now() / 1000);
      applyAppointment(data);
      $("complaint").value = currentAppointment.chiefComplaint || $("formComplaint").value || "";
      ["anamnesis", "clinicalFindings", "diagnosis", "treatmentPlan", "prescription", "examRequests", "referral", "notes"].forEach((id) => { $(id).value = ""; });
      saveRecordBtn.disabled = false;
      setSaveState("Prontuário criado • salvamento automático ativo", true);
      sessionStorage.setItem("ondaHostRoom", JSON.stringify(room));
      const clientUrl = new URL(location.origin);
      clientUrl.searchParams.set("room", data.roomId);
      clientUrl.searchParams.set("token", data.guestToken);
      clientUrl.searchParams.set("role", "client");
      inviteLink.value = clientUrl.toString();
      copyLinkBtn.disabled = false;

      let mediaWarning = "";
      try {
        await acquireMedia(localVideo);
        localWrap.classList.add("active");
      } catch (error) {
        mediaWarning = mediaErrorMessage(error);
        cameraBtn.classList.add("off");
      }

      createPeer(remoteVideo);
      setStatus("Aguardando o cliente abrir o link");
      $("remoteText").textContent = "Copie o link abaixo e envie pelo WhatsApp.";
      startCallBtn.textContent = "Sala criada • aguardando cliente";
      endCallBtn.hidden = false;
      startPolling();
      await loadConsultations(true);
      showToast(mediaWarning
        ? `Atendimento salvo e sala criada. ${mediaWarning}`
        : "Atendimento salvo e sala criada. Agora envie o link ao cliente.");
    } catch (error) {
      if (/expirado|Acesso/.test(error.message)) {
        sessionStorage.removeItem("ondaStaffToken");
        loginModal.classList.add("open");
      }
      showToast(error.message);
      startCallBtn.disabled = false;
      startCallBtn.textContent = "Criar atendimento e sala";
    }
  }

  async function loadClientRoom() {
    const roomId = params.get("room");
    const token = params.get("token") || sessionStorage.getItem(`ondaGuestToken:${roomId}`);
    if (!roomId || !token) throw new Error("Este link de consulta está incompleto");
    sessionStorage.setItem(`ondaGuestToken:${roomId}`, token);
    room = { roomId, token, role: "client" };
    const query = new URLSearchParams({ room: roomId, token, role: "client" });
    const data = await api(`/api/room?${query}`);
    $("clientPatient").textContent = data.patientName;
    $("clientProfessional").textContent = data.professionalName;
    $("clientSchedule").textContent = "Atendimento iniciado";
    $("clientUnit").textContent = "Onda Animal";
    $("clientIntro").textContent = `Olá, ${data.tutorName}. Confira os dados e permita o uso da câmera para entrar.`;
  }

  async function loadAppointmentClient() {
    const appointmentId = params.get("appointment");
    const token = params.get("token");
    if (!appointmentId || !token) throw new Error("Este link de consulta está incompleto");
    const query = new URLSearchParams({ id: appointmentId, token });
    const data = await api(`/api/appointment?${query}`);
    publicAppointment = data.appointment;
    const when = dateParts(publicAppointment.startsAt);
    $("clientPatient").textContent = publicAppointment.patientName;
    $("clientProfessional").textContent = publicAppointment.professionalName;
    $("clientSchedule").textContent = `${when.short}, ${when.time}`;
    $("clientUnit").textContent = publicAppointment.unitName;
    $("paymentPrice").textContent = money(publicAppointment.priceCents);
    $("clientIntro").textContent = `Olá, ${publicAppointment.tutorName}. O acesso à sala é liberado automaticamente após o pagamento.`;

    const paid = publicAppointment.paymentStatus === "paid";
    $("simulatePaymentBtn").hidden = !publicAppointment.testMode || paid;
    $("paymentTestNote").classList.toggle("show", Boolean(publicAppointment.testMode));
    $("paymentNextSteps").hidden = true;
    $("closePaidPage").hidden = true;
    $("requestCancellationBtn").hidden = false;
    $("requestCancellationBtn").disabled = Boolean(publicAppointment.cancellationRequestedAt);
    $("requestCancellationBtn").textContent = publicAppointment.cancellationRequestedAt ? "Cancelamento solicitado" : "Solicitar cancelamento";
    if (publicAppointment.testMode) $("paymentIntro").textContent = "Use o botão abaixo para simular a aprovação do Pix. Nenhum valor será cobrado.";
    if (publicAppointment.status === "cancelled") {
      paymentModal.classList.add("open");
      $("pixQrImage").hidden = true;
      $("copyPixBtn").hidden = true;
      $("openInvoiceBtn").hidden = true;
      $("simulatePaymentBtn").hidden = true;
      $("closePaidPage").hidden = false;
      $("requestCancellationBtn").hidden = true;
      $("paymentStatus").classList.remove("paid");
      $("paymentStatus").textContent = publicAppointment.refundStatus === "pending" ? "Consulta cancelada • devolução do Pix pendente" : publicAppointment.refundStatus === "refunded" ? "Consulta cancelada • pagamento devolvido" : "Consulta cancelada";
      $("paymentIntro").textContent = publicAppointment.cancellationReason || "O cancelamento foi confirmado pela clínica.";
      enterRoomBtn.disabled = true;
      testDeviceBtn.disabled = true;
    } else if (!paid) {
      paymentModal.classList.add("open");
      $("paymentStatus").classList.remove("paid");
      $("paymentStatus").textContent = publicAppointment.paymentStatus === "refunded" ? "Pagamento estornado. Fale com a clínica." : "Aguardando confirmação do pagamento…";
      if (publicAppointment.pixImage) {
        $("pixQrImage").src = `data:image/png;base64,${publicAppointment.pixImage}`;
        $("pixQrImage").hidden = false;
      }
      $("copyPixBtn").hidden = false;
      $("copyPixBtn").disabled = !publicAppointment.pixPayload;
      $("openInvoiceBtn").hidden = !publicAppointment.invoiceUrl;
      $("openInvoiceBtn").href = publicAppointment.invoiceUrl || "#";
      enterRoomBtn.disabled = true;
      testDeviceBtn.disabled = true;
    } else if (!publicAppointment.roomReady) {
      paymentModal.classList.add("open");
      $("pixQrImage").hidden = true;
      $("copyPixBtn").hidden = true;
      $("openInvoiceBtn").hidden = true;
      $("paymentStatus").classList.add("paid");
      $("paymentStatus").textContent = "Pagamento confirmado pelo Pix Banrisul.";
      $("paymentIntro").textContent = "Tudo certo com o pagamento da consulta.";
      $("paymentNextSteps").hidden = false;
      $("closePaidPage").hidden = false;
      enterRoomBtn.disabled = true;
      testDeviceBtn.disabled = true;
    } else {
      paymentModal.classList.remove("open");
      room = publicAppointment.room;
      sessionStorage.setItem(`ondaGuestToken:${room.roomId}`, room.token);
      enterRoomBtn.disabled = false;
      testDeviceBtn.disabled = false;
      $("clientHeading").textContent = "Sua consulta está pronta";
      $("clientIntro").textContent = "Pagamento confirmado. Teste sua câmera e entre na sala.";
    }
    clearTimeout(appointmentPollTimer);
    if (!publicAppointment.roomReady && publicAppointment.paymentStatus !== "refunded" && publicAppointment.status !== "cancelled") {
      appointmentPollTimer = setTimeout(() => loadAppointmentClient().catch(() => {}), 2800);
    }
  }

  $("closePaidPage").addEventListener("click", () => {
    window.close();
    paymentModal.classList.remove("open");
    $("clientHeading").textContent = "Agendamento confirmado";
    $("clientIntro").textContent = "Você pode fechar esta aba. O acesso à consulta será enviado pelo WhatsApp quando a veterinária iniciar o atendimento.";
    enterRoomBtn.hidden = true;
    testDeviceBtn.hidden = true;
    showToast("Tudo certo. Agora é só aguardar o WhatsApp.");
  });

  async function enterClientRoom() {
    enterRoomBtn.disabled = true;
    enterRoomBtn.textContent = "Ativando câmera…";
    try {
      await acquireMedia(clientVideo);
      clientVideo.hidden = false;
      cameraEmpty.hidden = true;
      $("cameraCheck").textContent = "✓";
      $("cameraCheckText").textContent = "Câmera e microfone funcionando";
      createPeer(clientRemoteVideo);
      await sendSignal("ready", { joinedAt: Date.now() });
      startPolling();
      enterRoomBtn.textContent = "Na sala • aguardando veterinária";
      $("clientHeading").textContent = "Você está na sala de espera";
      $("clientIntro").textContent = "A veterinária foi avisada e entrará em instantes.";
    } catch (error) {
      showToast(mediaErrorMessage(error));
      enterRoomBtn.disabled = false;
      enterRoomBtn.textContent = "Permitir câmera e entrar";
    }
  }

  function endLocally(message) {
    isEnding = true;
    clearTimeout(pollTimer);
    clearInterval(elapsedTimer);
    peer?.close();
    localStream?.getTracks().forEach((track) => track.stop());
    if (isClient) {
      clientRemoteVideo.classList.remove("active");
      clientVideo.hidden = true;
      $("clientHeading").textContent = "Consulta encerrada";
      $("clientIntro").textContent = message || "Obrigado por utilizar o atendimento da Onda Animal.";
      enterRoomBtn.textContent = "Atendimento finalizado";
    } else {
      remoteVideo.classList.remove("active");
      $("remotePlaceholder").style.display = "block";
      $("remoteTitle").textContent = "Atendimento concluído";
      $("remoteText").textContent = message || "O prontuário está pronto para ser salvo.";
      $("proStatus").textContent = "Consulta encerrada";
      endCallBtn.hidden = true;
      startCallBtn.textContent = "Chamada encerrada";
    }
    if (message) showToast(message);
  }

  async function hangup() {
    const saved = await saveRecord("completed", true);
    if (!saved) throw new Error("Não foi possível salvar o prontuário. A chamada continua aberta.");
    await sendSignal("hangup", { endedAt: Date.now() }).catch(() => {});
    endLocally("Consulta finalizada com sucesso.");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    $("loginBtn").disabled = true;
    try {
      const data = await api("/api/staff-login", { method: "POST", body: JSON.stringify({ email: $("loginEmail").value, password: $("pinInput").value }) });
      sessionStorage.setItem("ondaStaffToken", data.token);
      localStorage.setItem("ondaVetProfile", JSON.stringify({
        professionalName: data.professional.name,
        professionalCrmv: data.professional.crmv,
        unitName: data.professional.unitName,
      }));
      document.querySelector(".user-copy strong").textContent = data.professional.name;
      document.querySelector(".user-copy span").textContent = `${data.professional.crmv || "CRMV pendente"} • ${data.professional.unitName}`;
      $("sidebarVetName").textContent = data.professional.name;
      $("sidebarVetCrmv").textContent = data.professional.crmv || "CRMV pendente";
      loginModal.classList.remove("open");
      $("pinInput").value = "";
      await loadConsultations(true);
      startPortalAutoRefresh();
      if (pendingAction === "new") openAppointment();
      else setPortalRoute("dashboard", false);
      pendingAction = "dashboard";
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      $("loginBtn").disabled = false;
    }
  });

  startCallBtn.addEventListener("click", () => {
    if (room) return showToast("A sala já está aberta.");
    if (selectedAppointmentId) return startScheduledAppointment();
    openAppointment();
  });
  $("cancelScheduledBtn").addEventListener("click", openCancelScheduled);
  $("markRefundedBtn").addEventListener("click", markAppointmentRefunded);
  $("closeCancelScheduled").addEventListener("click", () => cancelScheduledModal.classList.remove("open"));
  $("cancelScheduledForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const item = portalAppointments.find((appointment) => appointment.id === selectedAppointmentId);
    if (!item) return showToast("Agendamento não encontrado.");
    const button = $("confirmCancelScheduled");
    const whatsappWindow = window.open("about:blank", "ondaWhatsApp");
    button.disabled = true;
    button.textContent = "Cancelando…";
    try {
      const data = await api("/api/appointments/cancel", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({ appointmentId: item.id, reason: $("cancelScheduledReason").value, reopenSlot: $("cancelScheduledReopen").checked }),
      });
      cancelScheduledModal.classList.remove("open");
      if (data.whatsappUrl && whatsappWindow) whatsappWindow.location.href = data.whatsappUrl; else whatsappWindow?.close();
      await loadConsultations(true);
      const updated = portalAppointments.find((appointment) => appointment.id === item.id);
      if (updated) openAppointmentFromPortal(updated);
      const refundText = data.refundStatus === "pending" ? " Devolução do Pix marcada como pendente." : "";
      showToast(`Consulta cancelada.${data.slotReopened ? " Horário liberado novamente." : " Horário mantido fechado."}${refundText}`);
    } catch (error) {
      whatsappWindow?.close();
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Confirmar cancelamento";
    }
  });
  $("manageAvailabilityBtn").addEventListener("click", () => setPortalRoute("configuracoes"));
  $("portalAddSlot").addEventListener("click", () => setPortalRoute("configuracoes"));
  $("weekAddSlot").addEventListener("click", () => openAvailabilityModal());
  $("calendarOpenSlot").addEventListener("click", () => openAvailabilityModal(selectedCalendarDate));
  $("calendarBlockRange").addEventListener("click", () => openScheduleBlock("range"));
  $("calendarBlockDay").addEventListener("click", () => openScheduleBlock("day"));
  $("calendarPrevious").addEventListener("click", async () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    selectedCalendarDate = `${calendarMonthKey()}-01`;
    await loadManagedAvailability();
  });
  $("calendarNext").addEventListener("click", async () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    selectedCalendarDate = `${calendarMonthKey()}-01`;
    await loadManagedAvailability();
  });
  $("calendarToday").addEventListener("click", async () => {
    const today = new Date();
    calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedCalendarDate = localDateKey(today);
    await loadManagedAvailability();
  });
  $("scheduleSettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("saveScheduleSettings");
    button.disabled = true;
    button.textContent = "Gerando horários…";
    $("settingsStatus").textContent = "Atualizando a disponibilidade do site…";
    try {
      const data = await api("/api/schedule-settings", { method: "POST", headers: staffHeaders(), body: JSON.stringify(scheduleSettingsPayload()) });
      $("settingsStatus").textContent = `${data.generated} horários livres publicados para os tutores.`;
      await loadConsultations(true);
      showToast("Agenda configurada e horários publicados no site.");
    } catch (error) {
      $("settingsStatus").textContent = error.message;
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Salvar e publicar horários";
    }
  });
  $("cancelAvailability").addEventListener("click", () => availabilityModal.classList.remove("open"));
  $("availabilityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/availability", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({
          startsAt: $("slotStartsAt").value,
          durationMinutes: $("slotDuration").value,
          price: $("slotPrice").value,
          professionalName: $("slotProfessional").value,
          professionalCrmv: $("slotCrmv").value,
          unitName: $("slotUnit").value,
        }),
      });
      availabilityModal.classList.remove("open");
      $("availabilityForm").reset();
      await loadConsultations(true);
      showToast("Horário publicado na agenda.");
    } catch (error) { showToast(error.message); }
  });
  $("cancelScheduleBlock").addEventListener("click", () => scheduleBlockModal.classList.remove("open"));
  $("scheduleBlockForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("confirmScheduleBlock");
    button.disabled = true;
    button.textContent = "Fechando horários…";
    try {
      const payload = {
        mode: $("scheduleBlockMode").value,
        slotId: $("scheduleBlockSlotId").value,
        date: $("scheduleBlockDate").value,
        startTime: $("scheduleBlockStart").value,
        endTime: $("scheduleBlockEnd").value,
        reason: $("scheduleBlockReason").value,
      };
      const data = await api("/api/availability/block", { method: "POST", headers: staffHeaders(), body: JSON.stringify(payload) });
      scheduleBlockModal.classList.remove("open");
      await loadConsultations(true);
      const protectedText = data.protectedAppointments ? ` ${data.protectedAppointments} consulta(s) já marcada(s) foram preservadas.` : "";
      showToast(`${data.blocked} horário(s) fechado(s).${protectedText}`);
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; button.textContent = "Confirmar fechamento"; }
  });
  $("cancelInternalBooking").addEventListener("click", () => internalBookingModal.classList.remove("open"));
  $("quickNewClient").addEventListener("click", () => openClientForm());
  $("quickNewPet").addEventListener("click", () => {
    const clientId = $("internalBookingClient").value;
    if (!clientId) return showToast("Selecione ou cadastre um tutor primeiro.");
    openPetForm(clientId);
  });
  $("internalBookingClient").addEventListener("change", loadInternalBookingPets);
  $("internalBookingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("confirmInternalBooking").disabled = true;
    $("confirmInternalBooking").textContent = "Agendando…";
    try {
      const data = await api("/api/appointments/internal", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({
          slotId: $("internalBookingSlotId").value,
          clientId: $("internalBookingClient").value,
          petId: $("internalBookingPet").value,
          bookingSource: $("internalBookingSource").value,
          serviceType: $("internalBookingService").value,
          chiefComplaint: $("internalBookingComplaint").value,
          rpvarValid: $("internalBookingRpvar").checked,
        }),
      });
      internalBookingModal.classList.remove("open");
      await loadConsultations(true);
      showToast(data.paymentCreated
        ? "Agendamento confirmado e cobrança Pix preparada."
        : "Agendamento confirmado. Pagamento manual liberado enquanto o Pix Banrisul não estiver ativo.");
    } catch (error) {
      showToast(error.message);
      await loadConsultations(true);
    } finally {
      $("confirmInternalBooking").disabled = false;
      $("confirmInternalBooking").textContent = "Confirmar agendamento";
    }
  });
  $("bookingForm").addEventListener("submit", async (event) => { event.preventDefault(); await submitBooking(); });
  $("cancelBooking").addEventListener("click", () => bookingModal.classList.remove("open"));
  $("bookingPhone").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    event.target.value = digits.length > 10
      ? digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3")
      : digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  });
  $("bookingDocument").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    event.target.value = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4").replace(/-$/, "");
  });
  $("bookingPostalCode").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    event.target.value = digits.replace(/(\d{5})(\d{0,3})/, "$1-$2").replace(/-$/, "");
  });
  $("copyPixBtn").addEventListener("click", async () => {
    if (!publicAppointment?.pixPayload) return;
    await navigator.clipboard.writeText(publicAppointment.pixPayload).catch(() => {});
    showToast("Código Pix copiado.");
  });
  $("simulatePaymentBtn").addEventListener("click", async () => {
    const button = $("simulatePaymentBtn");
    button.disabled = true;
    button.textContent = "Confirmando pagamento…";
    try {
      await api("/api/payments/simulate", {
        method: "POST",
        body: JSON.stringify({ appointmentId: params.get("appointment"), token: params.get("token") }),
      });
      showToast("Pagamento de teste aprovado.");
      await loadAppointmentClient();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
      button.textContent = "Simular pagamento aprovado";
    }
  });
  $("requestCancellationBtn").addEventListener("click", () => {
    if (publicAppointment?.cancellationRequestedAt) return showToast("A solicitação já foi enviada para a clínica.");
    $("cancelRequestReason").value = "";
    cancelRequestModal.classList.add("open");
    $("cancelRequestReason").focus();
  });
  $("closeCancelRequest").addEventListener("click", () => cancelRequestModal.classList.remove("open"));
  $("cancelRequestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("confirmCancelRequest");
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
      await api("/api/appointment/cancel-request", {
        method: "POST",
        body: JSON.stringify({ appointmentId: params.get("appointment"), token: params.get("token"), reason: $("cancelRequestReason").value }),
      });
      cancelRequestModal.classList.remove("open");
      await loadAppointmentClient();
      showToast("Solicitação enviada. A clínica fará a confirmação.");
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; button.textContent = "Enviar solicitação"; }
  });
  $("cancelAppointment").addEventListener("click", () => appointmentModal.classList.remove("open"));
  appointmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    currentAppointment = appointmentFromForm();
    localStorage.setItem("ondaVetProfile", JSON.stringify({
      professionalName: currentAppointment.professionalName,
      professionalCrmv: currentAppointment.professionalCrmv,
      unitName: currentAppointment.unitName,
    }));
    appointmentModal.classList.remove("open");
    applyAppointment(currentAppointment);
    await createRoom();
  });
  $("openPrescriptionBuilder").addEventListener("click", openPrescriptionBuilder);
  $("closePrescription").addEventListener("click", () => prescriptionModal.classList.remove("open"));
  medicineFieldIds.forEach((id) => $(id).addEventListener("input", refreshMedicinePreview));
  $("addMedicine").addEventListener("click", () => {
    const formatted = medicineText();
    if (!formatted) return showToast("Preencha medicamento, apresentação, quantidade, dose, frequência e duração.");
    const prescription = $("prescription");
    prescription.value = [prescription.value.trim(), formatted].filter(Boolean).join("\n\n");
    prescription.dispatchEvent(new Event("input", { bubbles: true }));
    medicineFieldIds.forEach((id) => {
      if (id !== "rxRoute") $(id).value = "";
    });
    $("rxRoute").value = "Via oral";
    refreshMedicinePreview();
    $("rxMedicine").focus();
    showToast("Medicamento adicionado à receita.");
  });
  prescriptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncPrescriptionIdentity();
    if (!$("prescription").value.trim()) return showToast("Adicione ao menos um medicamento à receita.");
    localStorage.setItem("ondaVetProfile", JSON.stringify({
      professionalName: currentAppointment.professionalName,
      professionalCrmv: currentAppointment.professionalCrmv,
      unitName: currentAppointment.unitName,
    }));
    const saved = await saveRecord(recordStatus);
    if (saved) prescriptionModal.classList.remove("open");
  });
  $("downloadPrescription").addEventListener("click", downloadPrescriptionPdf);
  $("downloadRecord").addEventListener("click", downloadRecordPdf);
  $("openSignedPrescription").addEventListener("click", openSignedPrescriptionFlow);
  $("closeSignedPrescription").addEventListener("click", () => signedPrescriptionModal.classList.remove("open"));
  $("downloadForSignature").addEventListener("click", downloadPrescriptionPdf);
  $("uploadSignedPrescription").addEventListener("click", uploadSignedPrescription);
  endCallBtn.addEventListener("click", () => finishModal.classList.add("open"));
  saveRecordBtn.addEventListener("click", () => saveRecord(recordStatus));

  enterRoomBtn.addEventListener("click", enterClientRoom);
  testDeviceBtn.addEventListener("click", async () => {
    try {
      await acquireMedia(clientVideo);
      clientVideo.hidden = false;
      cameraEmpty.hidden = true;
      $("cameraCheck").textContent = "✓";
      $("cameraCheckText").textContent = "Câmera e microfone funcionando";
      showToast("Seu aparelho está pronto.");
    } catch (error) { showToast(mediaErrorMessage(error)); }
  });

  cameraBtn.addEventListener("click", async () => {
    try {
      const hadStream = Boolean(localStream);
      await acquireMedia(localVideo);
      localWrap.classList.add("active");
      if (!hadStream) {
        showToast("Câmera e microfone ativados.");
        return;
      }
      const track = localStream.getVideoTracks()[0];
      track.enabled = !track.enabled;
      cameraBtn.classList.toggle("off", !track.enabled);
      cameraBtn.textContent = track.enabled ? "📷" : "🚫";
    } catch (error) { showToast(mediaErrorMessage(error)); }
  });

  micBtn.addEventListener("click", async () => {
    try {
      const hadStream = Boolean(localStream);
      await acquireMedia(localVideo);
      localWrap.classList.add("active");
      if (!hadStream) {
        showToast("Câmera e microfone ativados.");
        return;
      }
      const track = localStream.getAudioTracks()[0];
      track.enabled = !track.enabled;
      micBtn.classList.toggle("off", !track.enabled);
      micBtn.textContent = track.enabled ? "🎙️" : "🔇";
    } catch (error) { showToast(mediaErrorMessage(error)); }
  });

  copyLinkBtn.addEventListener("click", async () => {
    if (!inviteLink.value) return;
    try {
      await navigator.clipboard.writeText(inviteLink.value);
      showToast("Link do cliente copiado.");
    } catch {
      inviteLink.select();
      document.execCommand("copy");
      showToast("Link copiado.");
    }
  });

  $("screenBtn").addEventListener("click", async () => {
    if (!peer || !navigator.mediaDevices?.getDisplayMedia) return showToast("Inicie a sala antes de compartilhar a tela.");
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = display.getVideoTracks()[0];
      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      await sender?.replaceTrack(screenTrack);
      screenTrack.addEventListener("ended", async () => {
        const cameraTrack = localStream?.getVideoTracks()[0];
        if (cameraTrack) await sender?.replaceTrack(cameraTrack);
      });
      showToast("Sua tela está sendo compartilhada.");
    } catch { showToast("Compartilhamento cancelado."); }
  });

  $("chatBtn").addEventListener("click", async () => {
    if (!room) return showToast("Crie uma sala antes de enviar mensagens.");
    const message = window.prompt("Mensagem rápida para o cliente:");
    if (!message?.trim()) return;
    await sendSignal("chat", { message: message.trim().slice(0, 300) }).catch(() => {});
    showToast("Mensagem enviada ao cliente.");
  });
  $("cancelFinish").addEventListener("click", () => finishModal.classList.remove("open"));
  $("confirmFinish").addEventListener("click", async () => {
    $("confirmFinish").disabled = true;
    try {
      await hangup();
      finishModal.classList.remove("open");
      startCallBtn.textContent = "Consulta finalizada";
      startCallBtn.disabled = true;
    } catch (error) {
      showToast(error.message);
    } finally {
      $("confirmFinish").disabled = false;
    }
  });

  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const targets = { receita: "prescription", exame: "examRequests", presencial: "referral" };
    const target = $(targets[button.dataset.action]);
    if (button.dataset.action === "presencial" && !target.value) target.value = `Encaminhado para atendimento presencial na unidade ${currentAppointment?.unitName || "selecionada"}.`;
    target.focus();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }));

  document.querySelectorAll("[data-record]").forEach((field) => field.addEventListener("input", () => {
    if (!activeRecordRoomId) return;
    recordDirty = true;
    setSaveState("Alterações ainda não salvas");
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      if (recordDirty && activeRecordRoomId) saveRecord(recordStatus, true);
    }, 12000);
  }));

  window.addEventListener("beforeunload", () => {
    clearTimeout(appointmentPollTimer);
    clearInterval(portalRefreshTimer);
    localStream?.getTracks().forEach((track) => track.stop());
  });

  document.querySelectorAll("[data-vet-route]").forEach((button) => button.addEventListener("click", () => setPortalRoute(button.dataset.vetRoute)));
  document.querySelectorAll("[data-registry-target]").forEach((button) => button.addEventListener("click", async () => {
    setPortalRoute("cadastros");
    if (!portalClients.length) await loadClients();
    if (button.dataset.registryTarget === "pets") openPetForm();
  }));
  $("registrySearch").addEventListener("input", (event) => {
    clearTimeout($("registrySearch")._timer);
    $("registrySearch")._timer = setTimeout(() => loadClients(event.target.value), 250);
  });
  ["portalNewClient", "newClientButton"].forEach((id) => $(id).addEventListener("click", openClientForm));
  $("newPetButton").addEventListener("click", () => openPetForm());
  $("cancelClientRegistry").addEventListener("click", () => $("clientRegistryModal").classList.remove("open"));
  $("cancelPetRegistry").addEventListener("click", () => $("petRegistryModal").classList.remove("open"));
  $("closeClientDetails").addEventListener("click", () => $("clientDetailsModal").classList.remove("open"));
  $("addPetForClient").addEventListener("click", () => { $("clientDetailsModal").classList.remove("open"); openPetForm(selectedClientId); });
  $("clientRegistryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/clients", { method: "POST", headers: staffHeaders(), body: JSON.stringify({ name: $("registryClientName").value, phone: $("registryClientPhone").value, email: $("registryClientEmail").value, cpf: $("registryClientCpf").value, address: $("registryClientAddress").value }) });
      $("clientRegistryModal").classList.remove("open");
      await loadClients();
      showToast("Tutor cadastrado com sucesso.");
      selectedClientId = data.id;
      if (internalBookingModal.classList.contains("open")) await refreshInternalBookingClients(data.id);
    } catch (error) { showToast(error.message); }
  });
  $("petRegistryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const clientId = $("petRegistryClient").value;
      const data = await api("/api/pets", { method: "POST", headers: staffHeaders(), body: JSON.stringify({ clientId, name: $("petRegistryName").value, species: $("petRegistrySpecies").value, sex: $("petRegistrySex").value, breed: $("petRegistryBreed").value, coat: $("petRegistryCoat").value, age: $("petRegistryAge").value, weight: $("petRegistryWeight").value }) });
      $("petRegistryModal").classList.remove("open");
      await loadClients();
      showToast("Animal cadastrado com sucesso.");
      if (internalBookingModal.classList.contains("open")) {
        await refreshInternalBookingClients(clientId);
        $("internalBookingPet").value = data.id;
        $("confirmInternalBooking").disabled = false;
      }
    } catch (error) { showToast(error.message); }
  });
  $("registryClientPhone").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    event.target.value = digits.length > 10 ? digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3") : digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  });
  $("backToDashboard").addEventListener("click", () => {
    if (room && !isEnding && !window.confirm("A chamada está aberta. Deseja voltar para a agenda sem encerrá-la?")) return;
    setPortalRoute("dashboard");
  });
  $("dismissReminder").addEventListener("click", () => {
    $("appointmentReminderModal").classList.remove("open");
    const dismissed = remindedAppointmentId;
    setTimeout(() => { if (remindedAppointmentId === dismissed) remindedAppointmentId = null; }, 120000);
  });
  $("startReminderAppointment").addEventListener("click", () => {
    const item = portalAppointments.find((appointment) => appointment.id === selectedAppointmentId);
    $("appointmentReminderModal").classList.remove("open");
    if (item) openAppointmentFromPortal(item);
  });
  $("logoutButton").addEventListener("click", () => {
    sessionStorage.removeItem("ondaStaffToken");
    clearInterval(reminderTimer);
    clearInterval(portalRefreshTimer);
    vetPortalView.classList.remove("active");
    loginModal.classList.add("open");
    history.replaceState({}, "", "/vet");
    $("pinInput").focus();
  });
  window.addEventListener("popstate", () => {
    if (!isProfessional || !sessionStorage.getItem("ondaStaffToken")) return;
    const route = location.pathname.endsWith("/agenda") ? "agenda" : location.pathname.endsWith("/cadastros") ? "cadastros" : location.pathname.endsWith("/configuracoes") ? "configuracoes" : location.pathname.endsWith("/consulta") ? "consulta" : "dashboard";
    if (route === "consulta") showConsultationWorkspace(false); else setPortalRoute(route, false);
  });

  document.querySelector(".role-switch").style.display = "none";
  $("todayLabel").textContent = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  if (isClient) {
    $("userPill").style.display = "none";
    $("staffAccessLink").style.display = "none";
    showView(true);
    const loader = isAppointmentClient ? loadAppointmentClient : loadClientRoom;
    loader().catch((error) => {
      $("clientHeading").textContent = "Link indisponível";
      $("clientIntro").textContent = error.message;
      enterRoomBtn.disabled = true;
      testDeviceBtn.disabled = true;
    });
  } else if (isProfessional) {
    $("staffAccessLink").style.display = "none";
    document.body.classList.add("vet-mode");
    professionalView.classList.remove("active");
    if (sessionStorage.getItem("ondaStaffToken")) {
      const profile = JSON.parse(localStorage.getItem("ondaVetProfile") || "null");
      if (profile) { $("sidebarVetName").textContent = profile.professionalName || "Dra. Bruna"; $("sidebarVetCrmv").textContent = profile.professionalCrmv || "CRMV pendente"; }
      loadConsultations();
      startPortalAutoRefresh();
      const initialRoute = location.pathname.endsWith("/agenda") ? "agenda" : location.pathname.endsWith("/cadastros") ? "cadastros" : location.pathname.endsWith("/configuracoes") ? "configuracoes" : "dashboard";
      setPortalRoute(initialRoute, false);
    }
    else {
      pendingAction = "dashboard";
      vetPortalView.classList.remove("active");
      loginModal.classList.add("open");
      setTimeout(() => $("pinInput").focus(), 50);
    }
  } else {
    $("userPill").style.display = "none";
    showBookingView();
    loadPublicAvailability();
  }
})();
