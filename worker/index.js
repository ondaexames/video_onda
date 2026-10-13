const INDEX_HTML = __HTML_CONTENT__;
const APP_JS = __APP_JS_CONTENT__;
const PET_IMAGE_BASE64 = __PET_IMAGE_BASE64__;
const encoder = new TextEncoder();

function responseJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(size = 24) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function signStaffToken(secret, email) {
  const payload = `${Math.floor(Date.now() / 1000) + 43200}.${bytesToBase64Url(encoder.encode(email))}.${randomToken(12)}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${bytesToBase64Url(encoder.encode(payload))}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyStaffToken(token, secret) {
  if (!token || !secret) return false;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return false;
  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    const expiresAt = Number(payload.split(".")[0]);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("HMAC", key, base64UrlToBytes(signaturePart), encoder.encode(payload));
  } catch {
    return false;
  }
}

function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function requireStaff(request, env) {
  return verifyStaffToken(bearerToken(request), env.TOKEN_SECRET);
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function cleanName(value, fallback = "") {
  const text = String(value || "").trim().slice(0, 100);
  return text || fallback;
}

function cleanText(value, max = 12000) {
  return String(value || "").trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 20);
}

function parseSaoPauloDateTime(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return NaN;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}:00-03:00`;
  return Math.floor(new Date(normalized).getTime() / 1000);
}

function getDatabase(env) {
  if (!env.DB) throw new Error("Banco de dados indisponível");
  return env.DB;
}

function publicOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function banrisulReady(env) {
  return Boolean(env.BANRISUL_PIX_GATEWAY_URL && env.BANRISUL_PIX_GATEWAY_TOKEN && env.BANRISUL_PIX_KEY);
}

function paymentTestMode(env) {
  return String(env.PAYMENT_TEST_MODE || "").toLowerCase() === "true";
}

async function banrisulRequest(env, path, options = {}) {
  if (!banrisulReady(env)) throw new Error("Integração Pix Banrisul ainda não configurada");
  const response = await fetch(`${env.BANRISUL_PIX_GATEWAY_URL.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${env.BANRISUL_PIX_GATEWAY_TOKEN}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.errors?.map((item) => item.description).filter(Boolean).join(" ") || data.message || "Falha na comunicação com o Banrisul";
    throw new Error(message);
  }
  return data;
}

async function createBanrisulPix(env, appointmentId, value, patientName, payer) {
  const charge = await banrisulRequest(env, "/charges", {
    method: "POST",
    headers: { "idempotency-key": `teleconsulta-${appointmentId}` },
    body: JSON.stringify({
      txid: appointmentId.replace(/[^a-zA-Z0-9]/g, "").padEnd(26, "0").slice(0, 35),
      amount: Number(value).toFixed(2),
      pixKey: env.BANRISUL_PIX_KEY,
      description: `Consulta veterinária por vídeo • ${patientName}`,
      externalReference: appointmentId,
      payer,
    }),
  });
  return {
    id: cleanName(charge.id || charge.txid || appointmentId),
    pixPayload: cleanText(charge.pixPayload || charge.payload || charge.pixCopiaECola, 1000),
    pixImage: cleanText(charge.pixImage || charge.encodedImage || charge.qrCodeBase64, 100000),
    invoiceUrl: cleanText(charge.invoiceUrl || charge.location || "", 500),
  };
}

function whatsappLink(phone, message) {
  const digits = onlyDigits(phone);
  return digits ? `https://wa.me/55${digits.replace(/^55/, "")}?text=${encodeURIComponent(message)}` : "";
}

const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 0, enabled: false, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
  { day: 1, enabled: true, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
  { day: 2, enabled: true, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
  { day: 3, enabled: true, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
  { day: 4, enabled: true, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
  { day: 5, enabled: true, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
  { day: 6, enabled: false, periods: [["09:00", "12:00"], ["13:30", "18:00"]] },
];

function safeWeeklySchedule(value) {
  const source = Array.isArray(value) ? value : DEFAULT_WEEKLY_SCHEDULE;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  return Array.from({ length: 7 }, (_, day) => {
    const item = source.find((entry) => Number(entry?.day) === day) || DEFAULT_WEEKLY_SCHEDULE[day];
    const periods = (Array.isArray(item.periods) ? item.periods : []).slice(0, 2).filter((period) =>
      Array.isArray(period) && timePattern.test(period[0]) && timePattern.test(period[1]) && period[0] < period[1]
    );
    return { day, enabled: Boolean(item.enabled) && periods.length > 0, periods: periods.length ? periods : DEFAULT_WEEKLY_SCHEDULE[day].periods };
  });
}

function saoPauloDate(daysAhead = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function regenerateScheduleSlots(db, settings) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE availability_slots SET status = 'blocked', block_reason = '', updated_at = ? WHERE source = 'settings' AND status = 'open' AND starts_at > ?").bind(now, now).run();
  const existing = await db.prepare("SELECT id, starts_at, status, source, block_reason FROM availability_slots WHERE starts_at > ?").bind(now).all();
  const byStart = new Map((existing.results || []).map((row) => [Number(row.starts_at), row]));
  const statements = [];
  let generated = 0;
  for (let offset = 0; offset < settings.horizonDays; offset += 1) {
    const date = saoPauloDate(offset);
    const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
    const day = settings.weekly.find((entry) => entry.day === weekday);
    if (!day?.enabled) continue;
    for (const [start, end] of day.periods) {
      let cursor = Math.floor(new Date(`${date}T${start}:00-03:00`).getTime() / 1000);
      const limit = Math.floor(new Date(`${date}T${end}:00-03:00`).getTime() / 1000);
      while (cursor + settings.durationMinutes * 60 <= limit) {
        if (cursor > now) {
          const current = byStart.get(cursor);
          if (!current) {
            statements.push(db.prepare("INSERT INTO availability_slots (id, starts_at, ends_at, professional_name, professional_crmv, unit_name, price_cents, status, source, block_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'settings', '', ?, ?)")
              .bind(randomToken(12), cursor, cursor + settings.durationMinutes * 60, settings.professionalName, settings.professionalCrmv, settings.unitName, settings.priceCents, now, now));
            byStart.set(cursor, { status: "open" });
            generated += 1;
          } else if (current.status !== "booked" && !(current.status === "blocked" && current.block_reason)) {
            statements.push(db.prepare("UPDATE availability_slots SET ends_at = ?, professional_name = ?, professional_crmv = ?, unit_name = ?, price_cents = ?, status = 'open', source = 'settings', block_reason = '', updated_at = ? WHERE id = ? AND status != 'booked'")
              .bind(cursor + settings.durationMinutes * 60, settings.professionalName, settings.professionalCrmv, settings.unitName, settings.priceCents, now, current.id));
            generated += 1;
          }
        }
        cursor += settings.durationMinutes * 60;
      }
    }
  }
  for (let index = 0; index < statements.length; index += 75) await db.batch(statements.slice(index, index + 75));
  return generated;
}

async function getValidRoom(db, roomId, token, role) {
  if (!roomId || !token || !["host", "client"].includes(role)) return null;
  const room = await db.prepare(`SELECT r.id, r.host_token_hash, r.guest_token_hash, r.patient_name, r.tutor_name,
    r.professional_name, r.status, r.expires_at, a.id AS appointment_id, a.payment_status
    FROM rooms r LEFT JOIN appointments a ON a.room_id = r.id WHERE r.id = ?`).bind(roomId).first();
  if (!room || room.expires_at < Math.floor(Date.now() / 1000)) return null;
  if (room.appointment_id && room.payment_status !== "paid") return null;
  const suppliedHash = await sha256(token);
  const expectedHash = role === "host" ? room.host_token_hash : room.guest_token_hash;
  return suppliedHash === expectedHash ? room : null;
}

async function getPublicAppointment(db, appointmentId, token) {
  if (!appointmentId || !token) return null;
  const appointment = await db.prepare(
    `SELECT a.*, c.name AS tutor_name, c.phone, c.email, c.cpf AS tutor_document, c.address AS tutor_address,
      p.name AS patient_name, p.species, p.sex, p.breed, p.coat, p.age, p.weight,
      s.starts_at, s.ends_at, s.professional_name, s.professional_crmv, s.unit_name, s.price_cents
     FROM appointments a JOIN clients c ON c.id = a.client_id JOIN pets p ON p.id = a.pet_id
     JOIN availability_slots s ON s.id = a.slot_id WHERE a.id = ?`
  ).bind(appointmentId).first();
  if (!appointment || await sha256(token) !== appointment.public_token_hash) return null;
  return appointment;
}

function appointmentPayload(appointment, testMode = false) {
  const paid = appointment.payment_status === "paid";
  const roomReady = paid && Boolean(appointment.room_id && appointment.guest_token);
  return {
    id: appointment.id, status: appointment.status, paymentStatus: appointment.payment_status,
    patientName: appointment.patient_name, tutorName: appointment.tutor_name,
    professionalName: appointment.professional_name, professionalCrmv: appointment.professional_crmv,
    unitName: appointment.unit_name, startsAt: appointment.starts_at, priceCents: appointment.price_cents,
    pixPayload: paid ? "" : appointment.pix_payload, pixImage: paid ? "" : appointment.pix_image,
    invoiceUrl: paid ? "" : appointment.invoice_url, roomReady, testMode,
    paymentNotificationStatus: appointment.payment_notification_status || "pending",
    cancellationRequestedAt: appointment.cancellation_requested_at || null,
    cancellationRequestReason: appointment.cancellation_request_reason || "",
    cancellationReason: appointment.cancellation_reason || "",
    refundStatus: appointment.refund_status || "not_required",
    room: roomReady ? { roomId: appointment.room_id, token: appointment.guest_token, role: "client" } : null,
  };
}

async function handlePublicApi(request, env, url, db) {
  if (request.method === "GET" && url.pathname === "/api/config") {
    return responseJson({ paymentsReady: banrisulReady(env) || paymentTestMode(env), paymentTestMode: paymentTestMode(env), whatsappMode: "click_to_send", paymentProvider: "banrisul" });
  }

  if (request.method === "GET" && url.pathname === "/api/availability") {
    const now = Math.floor(Date.now() / 1000) - 900;
    const result = await db.prepare("SELECT id, starts_at, ends_at, professional_name, unit_name, price_cents FROM availability_slots WHERE status = 'open' AND starts_at > ? ORDER BY starts_at ASC LIMIT 80").bind(now).all();
    return responseJson({ slots: result.results || [], paymentsReady: banrisulReady(env) || paymentTestMode(env), paymentTestMode: paymentTestMode(env), paymentProvider: "banrisul" });
  }

  if (request.method === "POST" && url.pathname === "/api/bookings") {
    const body = await readJson(request) || {};
    const tutorName = cleanName(body.tutorName);
    const phone = onlyDigits(body.phone);
    const email = cleanName(body.email);
    const tutorDocument = onlyDigits(body.tutorDocument);
    const patientName = cleanName(body.patientName);
    const species = cleanName(body.species);
    const sex = cleanName(body.sex);
    const breed = cleanName(body.breed);
    const coat = cleanName(body.coat);
    const age = cleanName(body.age);
    const weight = cleanName(body.weight);
    const chiefComplaint = cleanText(body.chiefComplaint, 3000);
    const postalCode = onlyDigits(body.postalCode);
    const streetAddress = cleanText(body.tutorAddress, 260);
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!tutorName || phone.length < 10 || !emailValid || tutorDocument.length !== 11 || !patientName || !species || !sex || !breed || !coat || !age || !weight || !body.slotId || !chiefComplaint || postalCode.length !== 8 || !streetAddress) return responseJson({ error: "Preencha todos os dados obrigatórios do tutor, do animal, do endereço e da consulta" }, 400);
    const fullAddress = `${streetAddress} • CEP ${postalCode.replace(/(\d{5})(\d{3})/, "$1-$2")}`;
    if (!banrisulReady(env) && !paymentTestMode(env)) return responseJson({ error: "O Pix Banrisul ainda está sendo configurado. Tente novamente em breve." }, 503);
    const slot = await db.prepare("SELECT * FROM availability_slots WHERE id = ? AND status = 'open'").bind(String(body.slotId)).first();
    if (!slot) return responseJson({ error: "Este horário não está mais disponível" }, 409);

    const now = Math.floor(Date.now() / 1000);
    const clientId = randomToken(12);
    const petId = randomToken(12);
    const appointmentId = randomToken(12);
    const publicToken = randomToken(24);
    const existingClient = await db.prepare("SELECT * FROM clients WHERE phone = ?").bind(phone).first();
    const resolvedClientId = existingClient?.id || clientId;
    const claim = await db.prepare("UPDATE availability_slots SET status = 'booked' WHERE id = ? AND status = 'open'").bind(slot.id).run();
    if (!claim.meta?.changes) return responseJson({ error: "Este horário acabou de ser reservado" }, 409);
    try {
      if (existingClient) {
        await db.prepare("UPDATE clients SET name = ?, cpf = ?, email = ?, address = ?, updated_at = ? WHERE id = ?")
          .bind(tutorName, tutorDocument, email, fullAddress, now, existingClient.id).run();
      } else {
        await db.prepare("INSERT INTO clients (id, name, cpf, email, phone, address, asaas_customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)")
          .bind(clientId, tutorName, tutorDocument, email, phone, fullAddress, now, now).run();
      }
      await db.batch([
        db.prepare("INSERT INTO pets (id, client_id, name, species, sex, breed, coat, age, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(petId, resolvedClientId, patientName, species, sex, breed, coat, age, weight, now, now),
        db.prepare("INSERT INTO appointments (id, public_token, public_token_hash, client_id, pet_id, slot_id, chief_complaint, rpvar_valid, status, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'pending', ?, ?)")
          .bind(appointmentId, publicToken, await sha256(publicToken), resolvedClientId, petId, slot.id, chiefComplaint, body.rpvarValid ? 1 : 0, now, now),
      ]);
      if (paymentTestMode(env)) {
        const fakePaymentId = `test_${appointmentId}`;
        const fakePix = `00020126360014BR.GOV.BCB.PIX0114ONDA-TESTE-${appointmentId.slice(0, 8)}5204000053039865406${(Number(slot.price_cents) / 100).toFixed(2)}5802BR5911ONDA ANIMAL6008GRAVATAI62070503***6304TEST`;
        await db.prepare("UPDATE appointments SET payment_provider = 'banrisul', provider_payment_id = ?, pix_payload = ?, invoice_url = '', updated_at = ? WHERE id = ?")
          .bind(fakePaymentId, fakePix, now, appointmentId).run();
        return responseJson({ ok: true, appointmentId, token: publicToken, appointmentUrl: `${publicOrigin(request)}/consulta?appointment=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(publicToken)}`, paymentStatus: "pending", testMode: true }, 201);
      }
      const payment = await createBanrisulPix(env, appointmentId, Number(slot.price_cents) / 100, patientName, { name: tutorName, cpf: tutorDocument, email, phone });
      await db.prepare("UPDATE appointments SET payment_provider = 'banrisul', provider_payment_id = ?, pix_payload = ?, pix_image = ?, invoice_url = ?, updated_at = ? WHERE id = ?")
        .bind(payment.id, payment.pixPayload, payment.pixImage, payment.invoiceUrl, now, appointmentId).run();
      return responseJson({ ok: true, appointmentId, token: publicToken, appointmentUrl: `${publicOrigin(request)}/consulta?appointment=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(publicToken)}`, paymentStatus: "pending" }, 201);
    } catch (error) {
      await db.batch([
        db.prepare("UPDATE availability_slots SET status = 'open' WHERE id = ?").bind(slot.id),
        db.prepare("DELETE FROM appointments WHERE id = ?").bind(appointmentId),
        db.prepare("DELETE FROM pets WHERE id = ?").bind(petId),
      ]).catch(() => {});
      return responseJson({ error: error.message || "Não foi possível concluir o agendamento" }, 502);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/appointment") {
    const appointment = await getPublicAppointment(db, url.searchParams.get("id"), url.searchParams.get("token"));
    if (!appointment) return responseJson({ error: "Agendamento inválido ou indisponível" }, 404);
    return responseJson({ appointment: appointmentPayload(appointment, paymentTestMode(env)) });
  }

  if (request.method === "POST" && url.pathname === "/api/appointment/cancel-request") {
    const body = await readJson(request) || {};
    const appointment = await getPublicAppointment(db, cleanName(body.appointmentId), cleanText(body.token, 200));
    if (!appointment) return responseJson({ error: "Agendamento inválido" }, 404);
    if (appointment.status === "cancelled") return responseJson({ error: "Esta consulta já foi cancelada" }, 409);
    if (["completed", "waiting", "active"].includes(appointment.status) || appointment.room_id) return responseJson({ error: "A consulta já foi iniciada. Fale com a clínica." }, 409);
    const reason = cleanText(body.reason, 500);
    if (!reason) return responseJson({ error: "Informe o motivo do cancelamento" }, 400);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE appointments SET cancellation_requested_at = ?, cancellation_request_reason = ?, updated_at = ? WHERE id = ?")
      .bind(now, reason, now, appointment.id).run();
    return responseJson({ ok: true, cancellationRequestedAt: now });
  }

  if (request.method === "POST" && url.pathname === "/api/payments/simulate") {
    if (!paymentTestMode(env)) return responseJson({ error: "Simulação de pagamento desativada" }, 403);
    const body = await readJson(request) || {};
    const appointment = await getPublicAppointment(db, cleanName(body.appointmentId), cleanText(body.token, 200));
    if (!appointment) return responseJson({ error: "Agendamento inválido" }, 404);
    if (appointment.payment_status === "paid") return responseJson({ ok: true, paymentStatus: "paid" });
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE appointments SET payment_status = 'paid', status = CASE WHEN status = 'scheduled' THEN 'ready' ELSE status END, payment_notification_status = 'test_sent', payment_notification_sent_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, appointment.id).run();
    return responseJson({ ok: true, paymentStatus: "paid" });
  }

  if (request.method === "POST" && url.pathname === "/api/webhooks/banrisul") {
    const expected = env.BANRISUL_WEBHOOK_TOKEN || "";
    const supplied = request.headers.get("x-banrisul-webhook-token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!expected || supplied !== expected) return responseJson({ error: "Webhook não autorizado" }, 401);
    const event = await readJson(request);
    const pixEvent = Array.isArray(event?.pix) ? event.pix[0] : null;
    const eventId = cleanName(event?.id || event?.eventId || pixEvent?.endToEndId);
    const paymentId = cleanName(event?.charge?.id || event?.txid || pixEvent?.txid);
    const eventType = cleanName(event?.event || event?.status || (pixEvent ? "PIX_RECEIVED" : ""));
    if (!eventId || !paymentId || !eventType) return responseJson({ error: "Evento inválido" }, 400);
    const existing = await db.prepare("SELECT event_id FROM payment_events WHERE event_id = ?").bind(eventId).first();
    if (existing) return responseJson({ received: true, duplicate: true });
    const now = Math.floor(Date.now() / 1000);
    let paymentStatus = null;
    if (["PIX_RECEIVED", "CONCLUIDA", "CONCLUIDO", "RECEIVED", "LIQUIDATED"].includes(eventType.toUpperCase())) paymentStatus = "paid";
    if (["REFUNDED", "DEVOLVIDO", "DEVOLVIDA"].includes(eventType.toUpperCase())) paymentStatus = "refunded";
    const statements = [db.prepare("INSERT INTO payment_events (event_id, payment_id, event_type, created_at) VALUES (?, ?, ?, ?)").bind(eventId, paymentId, eventType, now)];
    if (paymentStatus) statements.push(db.prepare("UPDATE appointments SET payment_status = ?, status = CASE WHEN ? = 'paid' AND status = 'scheduled' THEN 'ready' ELSE status END, refund_status = CASE WHEN ? = 'refunded' THEN 'refunded' ELSE refund_status END, refunded_at = CASE WHEN ? = 'refunded' THEN ? ELSE refunded_at END, updated_at = ? WHERE provider_payment_id = ?").bind(paymentStatus, paymentStatus, paymentStatus, paymentStatus, now, now, paymentId));
    await db.batch(statements);
    if (paymentStatus === "paid") {
      const appointment = await db.prepare(`SELECT a.id, a.payment_notification_status, c.name AS tutor_name, c.phone, p.name AS patient_name, s.starts_at
        FROM appointments a JOIN clients c ON c.id = a.client_id JOIN pets p ON p.id = a.pet_id
        JOIN availability_slots s ON s.id = a.slot_id WHERE a.provider_payment_id = ?`).bind(paymentId).first();
      if (appointment) {
        const dateText = new Date(Number(appointment.starts_at) * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        await db.prepare("UPDATE appointments SET payment_notification_status = 'manual', payment_notification_sent_at = NULL, updated_at = ? WHERE id = ?")
          .bind(now, appointment.id).run();
      }
    }
    return responseJson({ received: true, notificationMode: "manual" });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/documents/")) {
    if (!env.DOCUMENTS) return responseJson({ error: "Documentos indisponíveis" }, 503);
    const id = decodeURIComponent(url.pathname.slice("/api/documents/".length));
    const token = url.searchParams.get("token") || "";
    const document = await db.prepare("SELECT * FROM prescription_documents WHERE id = ?").bind(id).first();
    if (!document || await sha256(token) !== document.public_token_hash) return responseJson({ error: "Documento não encontrado" }, 404);
    const object = await env.DOCUMENTS.get(document.object_key);
    if (!object) return responseJson({ error: "Arquivo não encontrado" }, 404);
    return new Response(object.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename=\"${document.filename.replace(/[\"\r\n]/g, "")}\"`, "cache-control": "private, no-store" } });
  }

  return null;
}

async function handleStaffApi(request, env, url, db) {
  if (request.method === "POST" && url.pathname === "/api/staff-login") {
    const body = await readJson(request);
    const expectedEmail = String(env.VET_EMAIL || "veterinaria@onda-animal.com.br").trim().toLowerCase();
    const expectedPassword = String(env.VET_PASSWORD || env.HOST_PIN || "");
    const suppliedEmail = String(body?.email || expectedEmail).trim().toLowerCase();
    const suppliedPassword = String(body?.password || body?.pin || "");
    if (!expectedPassword || suppliedEmail !== expectedEmail || suppliedPassword !== expectedPassword) return responseJson({ error: "E-mail ou senha incorretos" }, 401);
    return responseJson({ token: await signStaffToken(env.TOKEN_SECRET, expectedEmail), professional: { name: env.VET_NAME || "Dra. Bruna", crmv: env.VET_CRMV || "", email: expectedEmail, unitName: env.VET_UNIT || "Gravataí" } });
  }

  if (!await requireStaff(request, env)) return responseJson({ error: "Acesso da veterinária expirado" }, 401);

  if (request.method === "GET" && url.pathname === "/api/schedule-settings") {
    const saved = await db.prepare("SELECT * FROM schedule_settings WHERE id = 'default'").first();
    return responseJson({ settings: saved ? {
      professionalName: saved.professional_name,
      professionalCrmv: saved.professional_crmv,
      unitName: saved.unit_name,
      price: Number(saved.price_cents) / 100,
      durationMinutes: Number(saved.duration_minutes),
      horizonDays: Number(saved.horizon_days),
      weekly: safeWeeklySchedule(JSON.parse(saved.weekly_json || "[]")),
    } : {
      professionalName: env.VET_NAME || "Dra. Bruna",
      professionalCrmv: env.VET_CRMV || "",
      unitName: env.VET_UNIT || "Gravataí",
      price: 120,
      durationMinutes: 30,
      horizonDays: 30,
      weekly: DEFAULT_WEEKLY_SCHEDULE,
    } });
  }

  if (request.method === "POST" && url.pathname === "/api/schedule-settings") {
    const body = await readJson(request) || {};
    const durationMinutes = [20, 30, 45, 60].includes(Number(body.durationMinutes)) ? Number(body.durationMinutes) : 30;
    const horizonDays = Math.min(60, Math.max(7, Number(body.horizonDays) || 30));
    const priceCents = Math.round(Number(body.price) * 100);
    const weekly = safeWeeklySchedule(body.weekly);
    const professionalName = cleanName(body.professionalName, env.VET_NAME || "Dra. Bruna");
    const professionalCrmv = cleanName(body.professionalCrmv, env.VET_CRMV || "");
    const unitName = cleanName(body.unitName, env.VET_UNIT || "Gravataí");
    if (priceCents < 100 || !weekly.some((day) => day.enabled)) return responseJson({ error: "Informe o valor e ative pelo menos um dia de atendimento" }, 400);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`INSERT INTO schedule_settings (id, professional_name, professional_crmv, unit_name, price_cents, duration_minutes, horizon_days, weekly_json, created_at, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET professional_name = excluded.professional_name, professional_crmv = excluded.professional_crmv,
      unit_name = excluded.unit_name, price_cents = excluded.price_cents, duration_minutes = excluded.duration_minutes,
      horizon_days = excluded.horizon_days, weekly_json = excluded.weekly_json, updated_at = excluded.updated_at`)
      .bind(professionalName, professionalCrmv, unitName, priceCents, durationMinutes, horizonDays, JSON.stringify(weekly), now, now).run();
    const generated = await regenerateScheduleSlots(db, { professionalName, professionalCrmv, unitName, priceCents, durationMinutes, horizonDays, weekly });
    return responseJson({ ok: true, generated });
  }

  if (request.method === "GET" && url.pathname === "/api/clients") {
    const search = cleanText(url.searchParams.get("search"), 80).toLowerCase();
    const like = `%${search}%`;
    const result = await db.prepare(
      `SELECT c.id, c.name, c.cpf, c.email, c.phone, c.address, c.created_at,
        COUNT(p.id) AS pet_count, COALESCE(GROUP_CONCAT(p.name, ', '), '') AS pet_names
       FROM clients c LEFT JOIN pets p ON p.client_id = c.id
       WHERE ? = '' OR LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(p.name) LIKE ?
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE ASC LIMIT 200`
    ).bind(search, like, like, like).all();
    return responseJson({ clients: result.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/clients") {
    const body = await readJson(request) || {};
    const name = cleanName(body.name);
    const phone = onlyDigits(body.phone);
    const email = cleanName(body.email);
    const cpf = onlyDigits(body.cpf);
    const postalCode = onlyDigits(body.postalCode);
    const address = cleanText(body.address, 260);
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (name.length < 2 || phone.length < 10 || !emailValid || cpf.length !== 11 || postalCode.length !== 8 || !address) {
      return responseJson({ error: "Preencha nome, WhatsApp, e-mail válido, CPF, CEP e endereço completo" }, 400);
    }
    const existing = await db.prepare("SELECT id FROM clients WHERE phone = ?").bind(phone).first();
    if (existing) return responseJson({ error: "Já existe um tutor com este WhatsApp", clientId: existing.id }, 409);
    const id = randomToken(12);
    const now = Math.floor(Date.now() / 1000);
    const fullAddress = `${address} • CEP ${postalCode.replace(/(\d{5})(\d{3})/, "$1-$2")}`;
    await db.prepare("INSERT INTO clients (id, name, cpf, email, phone, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, cpf, email, phone, fullAddress, now, now).run();
    return responseJson({ ok: true, id }, 201);
  }

  if (request.method === "GET" && /^\/api\/clients\/[^/]+\/pets$/.test(url.pathname)) {
    const clientId = decodeURIComponent(url.pathname.split("/")[3]);
    const client = await db.prepare("SELECT id, name, cpf, email, phone, address, created_at FROM clients WHERE id = ?").bind(clientId).first();
    if (!client) return responseJson({ error: "Tutor não encontrado" }, 404);
    const pets = await db.prepare("SELECT id, name, species, sex, breed, coat, age, weight, created_at FROM pets WHERE client_id = ? ORDER BY name COLLATE NOCASE ASC").bind(clientId).all();
    const records = await db.prepare(`SELECT r.id, r.room_id, r.appointment_id, COALESCE(r.pet_id, a.pet_id) AS pet_id,
      r.patient_name, r.professional_name, r.professional_crmv, r.unit_name, r.service_name, r.status,
      r.chief_complaint, r.anamnesis, r.clinical_findings, r.diagnosis, r.treatment_plan,
      r.prescription, r.exam_requests, r.referral, r.notes, r.started_at, r.ended_at, r.created_at, r.updated_at
      FROM consultation_records r LEFT JOIN appointments a ON a.room_id = r.room_id
      WHERE r.client_id = ? OR a.client_id = ? ORDER BY COALESCE(r.started_at, r.created_at) DESC LIMIT 100`).bind(clientId, clientId).all();
    return responseJson({ client, pets: pets.results || [], records: records.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/pets") {
    const body = await readJson(request) || {};
    const clientId = cleanName(body.clientId);
    const name = cleanName(body.name);
    const species = cleanName(body.species);
    if (!clientId || name.length < 1 || !species) return responseJson({ error: "Selecione o tutor e informe o animal" }, 400);
    const client = await db.prepare("SELECT id FROM clients WHERE id = ?").bind(clientId).first();
    if (!client) return responseJson({ error: "Tutor não encontrado" }, 404);
    const id = randomToken(12);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO pets (id, client_id, name, species, sex, breed, coat, age, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, clientId, name, species, cleanName(body.sex), cleanName(body.breed), cleanName(body.coat), cleanName(body.age), cleanName(body.weight), now, now).run();
    return responseJson({ ok: true, id }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/appointments/internal") {
    const body = await readJson(request) || {};
    const slotId = cleanName(body.slotId);
    const clientId = cleanName(body.clientId);
    const petId = cleanName(body.petId);
    const bookingSource = body.bookingSource === "whatsapp" ? "whatsapp" : "reception";
    const allowedServices = ["Consulta por vídeo", "Retorno por vídeo", "Teleorientação"];
    const serviceType = allowedServices.includes(body.serviceType) ? body.serviceType : "Consulta por vídeo";
    if (!slotId || !clientId || !petId) return responseJson({ error: "Selecione horário, tutor e animal" }, 400);
    if (!banrisulReady(env) && !paymentTestMode(env)) return responseJson({ error: "Configure o Pix Banrisul antes de criar um agendamento pela recepção" }, 503);
    const slot = await db.prepare("SELECT * FROM availability_slots WHERE id = ? AND status = 'open'").bind(slotId).first();
    if (!slot) return responseJson({ error: "Este horário não está mais disponível" }, 409);
    const client = await db.prepare("SELECT * FROM clients WHERE id = ?").bind(clientId).first();
    const pet = await db.prepare("SELECT * FROM pets WHERE id = ? AND client_id = ?").bind(petId, clientId).first();
    if (!client || !pet) return responseJson({ error: "Tutor ou animal não encontrado" }, 404);

    const claim = await db.prepare("UPDATE availability_slots SET status = 'booked' WHERE id = ? AND status = 'open'").bind(slotId).run();
    if (!claim.meta?.changes) return responseJson({ error: "Este horário acabou de ser reservado" }, 409);
    const appointmentId = randomToken(12);
    const publicToken = randomToken(24);
    const now = Math.floor(Date.now() / 1000);
    try {
      await db.prepare("INSERT INTO appointments (id, public_token, public_token_hash, client_id, pet_id, slot_id, chief_complaint, booking_source, service_type, rpvar_valid, status, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'pending', ?, ?)")
        .bind(appointmentId, publicToken, await sha256(publicToken), clientId, petId, slotId, cleanText(body.chiefComplaint, 3000), bookingSource, serviceType, body.rpvarValid ? 1 : 0, now, now).run();

      let paymentCreated = true;
      if (paymentTestMode(env)) {
        const fakePaymentId = `test_${appointmentId}`;
        const fakePix = `00020126360014BR.GOV.BCB.PIX0114ONDA-TESTE-${appointmentId.slice(0, 8)}5204000053039865406${(Number(slot.price_cents) / 100).toFixed(2)}5802BR5911ONDA ANIMAL6008GRAVATAI62070503***6304TEST`;
        await db.prepare("UPDATE appointments SET payment_provider = 'banrisul', provider_payment_id = ?, pix_payload = ?, invoice_url = '', updated_at = ? WHERE id = ?")
          .bind(fakePaymentId, fakePix, now, appointmentId).run();
      } else {
        const payment = await createBanrisulPix(env, appointmentId, Number(slot.price_cents) / 100, pet.name, { name: client.name, cpf: client.cpf, email: client.email, phone: client.phone });
        await db.prepare("UPDATE appointments SET payment_provider = 'banrisul', provider_payment_id = ?, pix_payload = ?, pix_image = ?, invoice_url = ?, updated_at = ? WHERE id = ?")
          .bind(payment.id, payment.pixPayload, payment.pixImage, payment.invoiceUrl, now, appointmentId).run();
      }
      const appointmentUrl = `${publicOrigin(request)}/consulta?appointment=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(publicToken)}`;
      const dateText = new Date(Number(slot.starts_at) * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
      const whatsappUrl = whatsappLink(client.phone, `Olá, ${client.name}! A consulta por vídeo de ${pet.name} foi agendada para ${dateText}. Para confirmar o atendimento, faça o pagamento Pix neste link seguro: ${appointmentUrl}`);
      return responseJson({ ok: true, appointmentId, paymentCreated, appointmentUrl, whatsappUrl, paymentStatus: "pending", testMode: paymentTestMode(env) }, 201);
    } catch (error) {
      await db.batch([
        db.prepare("UPDATE availability_slots SET status = 'open' WHERE id = ?").bind(slotId),
        db.prepare("DELETE FROM appointments WHERE id = ?").bind(appointmentId),
      ]).catch(() => {});
      return responseJson({ error: error.message || "Não foi possível concluir o agendamento" }, 502);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/appointments") {
    const result = await db.prepare(
      `SELECT a.id, a.slot_id, a.room_id, a.status, a.payment_status, a.payment_notification_status, a.call_notification_status, a.booking_source, a.service_type, a.created_at, a.updated_at, a.public_token,
        a.cancellation_requested_at, a.cancellation_request_reason, a.cancelled_at, a.cancelled_by, a.cancellation_reason, a.slot_reopened, a.refund_status, a.refunded_at, a.refund_reference,
        c.name AS tutor_name, c.phone, p.name AS patient_name, p.species,
        s.starts_at, s.ends_at, s.professional_name, s.unit_name, s.price_cents
       FROM appointments a JOIN clients c ON c.id = a.client_id JOIN pets p ON p.id = a.pet_id
       JOIN availability_slots s ON s.id = a.slot_id ORDER BY s.starts_at ASC LIMIT 100`
    ).all();
    return responseJson({ appointments: result.results || [] });
  }

  if (request.method === "GET" && url.pathname === "/api/availability/manage") {
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : saoPauloDate().slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const from = Math.floor(new Date(`${month}-01T00:00:00-03:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-03:00`).getTime() / 1000);
    const slots = await db.prepare(`SELECT id, starts_at, ends_at, professional_name, professional_crmv, unit_name, price_cents, status, source, block_reason, created_at, updated_at
      FROM availability_slots WHERE starts_at >= ? AND starts_at < ? AND source != 'cancellation_archive' ORDER BY starts_at ASC`).bind(from, to).all();
    const audit = await db.prepare(`SELECT id, slot_id, action, reason, actor, starts_at, ends_at, created_at
      FROM schedule_audit WHERE starts_at >= ? AND starts_at < ? ORDER BY created_at DESC LIMIT 80`).bind(from, to).all();
    return responseJson({ month, slots: slots.results || [], audit: audit.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/availability/block") {
    const body = await readJson(request) || {};
    const mode = ["slot", "range", "day"].includes(body.mode) ? body.mode : "slot";
    const reason = cleanText(body.reason, 240);
    const actor = cleanName(env.VET_NAME, env.VET_EMAIL || "Equipe Onda Animal");
    const now = Math.floor(Date.now() / 1000);
    if (!reason) return responseJson({ error: "Informe o motivo do bloqueio" }, 400);

    if (mode === "slot") {
      const slot = await db.prepare("SELECT * FROM availability_slots WHERE id = ?").bind(cleanName(body.slotId)).first();
      if (!slot) return responseJson({ error: "Horário não encontrado" }, 404);
      if (slot.status === "booked") return responseJson({ error: "Este horário possui uma consulta e não pode ser fechado" }, 409);
      if (slot.status !== "open") return responseJson({ error: "Este horário já está fechado" }, 409);
      await db.batch([
        db.prepare("UPDATE availability_slots SET status = 'blocked', block_reason = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(reason, now, slot.id),
        db.prepare("INSERT INTO schedule_audit (id, slot_id, action, reason, actor, starts_at, ends_at, created_at) VALUES (?, ?, 'block_slot', ?, ?, ?, ?, ?)").bind(randomToken(12), slot.id, reason, actor, slot.starts_at, slot.ends_at, now),
      ]);
      return responseJson({ ok: true, blocked: 1 });
    }

    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : "";
    if (!date) return responseJson({ error: "Selecione uma data válida" }, 400);
    const startTime = mode === "day" ? "00:00" : cleanName(body.startTime);
    const endTime = mode === "day" ? "23:59" : cleanName(body.endTime);
    const from = parseSaoPauloDateTime(`${date}T${startTime}`);
    const to = mode === "day" ? Math.floor(new Date(`${date}T23:59:59-03:00`).getTime() / 1000) + 1 : parseSaoPauloDateTime(`${date}T${endTime}`);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return responseJson({ error: "Informe um período válido" }, 400);
    const matches = await db.prepare("SELECT id, starts_at, ends_at FROM availability_slots WHERE starts_at >= ? AND starts_at < ? AND status = 'open' ORDER BY starts_at ASC").bind(from, to).all();
    const booked = await db.prepare("SELECT COUNT(*) AS total FROM availability_slots WHERE starts_at >= ? AND starts_at < ? AND status = 'booked'").bind(from, to).first();
    if (!matches.results?.length) return responseJson({ error: "Não há horários livres neste período" }, 409);
    const updates = matches.results.map((slot) => db.prepare("UPDATE availability_slots SET status = 'blocked', block_reason = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(reason, now, slot.id));
    updates.push(db.prepare("INSERT INTO schedule_audit (id, slot_id, action, reason, actor, starts_at, ends_at, created_at) VALUES (?, '', ?, ?, ?, ?, ?, ?)")
      .bind(randomToken(12), mode === "day" ? "block_day" : "block_range", reason, actor, from, to, now));
    for (let index = 0; index < updates.length; index += 75) await db.batch(updates.slice(index, index + 75));
    return responseJson({ ok: true, blocked: matches.results.length, protectedAppointments: Number(booked?.total || 0) });
  }

  if (request.method === "POST" && url.pathname === "/api/availability/reopen") {
    const body = await readJson(request) || {};
    const slot = await db.prepare("SELECT * FROM availability_slots WHERE id = ?").bind(cleanName(body.slotId)).first();
    if (!slot) return responseJson({ error: "Horário não encontrado" }, 404);
    if (slot.status !== "blocked") return responseJson({ error: "Somente horários fechados podem ser reabertos" }, 409);
    if (Number(slot.starts_at) <= Math.floor(Date.now() / 1000)) return responseJson({ error: "Não é possível reabrir um horário passado" }, 409);
    const now = Math.floor(Date.now() / 1000);
    const actor = cleanName(env.VET_NAME, env.VET_EMAIL || "Equipe Onda Animal");
    await db.batch([
      db.prepare("UPDATE availability_slots SET status = 'open', block_reason = '', updated_at = ? WHERE id = ? AND status = 'blocked'").bind(now, slot.id),
      db.prepare("INSERT INTO schedule_audit (id, slot_id, action, reason, actor, starts_at, ends_at, created_at) VALUES (?, ?, 'reopen_slot', ?, ?, ?, ?, ?)").bind(randomToken(12), slot.id, cleanText(body.reason, 240) || "Horário reaberto", actor, slot.starts_at, slot.ends_at, now),
    ]);
    return responseJson({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/availability") {
    const body = await readJson(request) || {};
    const startsAt = parseSaoPauloDateTime(body.startsAt);
    const durationMinutes = Math.min(180, Math.max(10, Number(body.durationMinutes) || 30));
    const priceCents = Math.round(Number(body.price) * 100);
    if (!Number.isFinite(startsAt) || startsAt < Math.floor(Date.now() / 1000) || priceCents < 100) return responseJson({ error: "Informe uma data futura e um valor válido" }, 400);
    const professionalName = cleanName(body.professionalName, env.VET_NAME || "Dra. Bruna");
    const existing = await db.prepare("SELECT * FROM availability_slots WHERE starts_at = ? AND professional_name = ?").bind(startsAt, professionalName).first();
    if (existing?.status === "booked") return responseJson({ error: "Já existe uma consulta neste horário" }, 409);
    const id = existing?.id || randomToken(12);
    const now = Math.floor(Date.now() / 1000);
    if (existing) {
      await db.prepare("UPDATE availability_slots SET ends_at = ?, professional_crmv = ?, unit_name = ?, price_cents = ?, status = 'open', source = 'manual', block_reason = '', updated_at = ? WHERE id = ?")
        .bind(startsAt + durationMinutes * 60, cleanName(body.professionalCrmv, env.VET_CRMV || ""), cleanName(body.unitName, env.VET_UNIT || "Gravataí"), priceCents, now, id).run();
    } else {
      await db.prepare("INSERT INTO availability_slots (id, starts_at, ends_at, professional_name, professional_crmv, unit_name, price_cents, status, source, block_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'manual', '', ?, ?)")
        .bind(id, startsAt, startsAt + durationMinutes * 60, professionalName, cleanName(body.professionalCrmv, env.VET_CRMV || ""), cleanName(body.unitName, env.VET_UNIT || "Gravataí"), priceCents, now, now).run();
    }
    await db.prepare("INSERT INTO schedule_audit (id, slot_id, action, reason, actor, starts_at, ends_at, created_at) VALUES (?, ?, 'open_slot', ?, ?, ?, ?, ?)")
      .bind(randomToken(12), id, cleanText(body.reason, 240) || "Horário aberto manualmente", cleanName(env.VET_NAME, env.VET_EMAIL || "Equipe Onda Animal"), startsAt, startsAt + durationMinutes * 60, now).run();
    return responseJson({ ok: true, id }, 201);
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/availability/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/availability/".length));
    const result = await db.prepare("UPDATE availability_slots SET status = 'blocked', block_reason = 'Fechado manualmente', updated_at = ? WHERE id = ? AND status = 'open'").bind(Math.floor(Date.now() / 1000), id).run();
    if (!result.meta?.changes) return responseJson({ error: "Horário não pode ser removido" }, 409);
    return responseJson({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/appointments/cancel") {
    const body = await readJson(request) || {};
    const appointment = await db.prepare(
      `SELECT a.*, c.name AS tutor_name, c.phone, p.name AS patient_name, s.starts_at, s.ends_at,
        s.professional_name AS slot_professional_name, s.professional_crmv AS slot_professional_crmv,
        s.unit_name AS slot_unit_name, s.price_cents AS slot_price_cents
       FROM appointments a JOIN clients c ON c.id = a.client_id JOIN pets p ON p.id = a.pet_id
       JOIN availability_slots s ON s.id = a.slot_id WHERE a.id = ?`
    ).bind(cleanName(body.appointmentId)).first();
    if (!appointment) return responseJson({ error: "Agendamento não encontrado" }, 404);
    if (appointment.status === "cancelled") return responseJson({ error: "Esta consulta já foi cancelada" }, 409);
    if (appointment.room_id || ["completed", "waiting", "active"].includes(appointment.status)) return responseJson({ error: "Não é possível cancelar uma consulta já iniciada" }, 409);
    const reason = cleanText(body.reason, 500);
    if (!reason) return responseJson({ error: "Informe o motivo do cancelamento" }, 400);
    const now = Math.floor(Date.now() / 1000);
    const reopenSlot = Boolean(body.reopenSlot) && Number(appointment.starts_at) > now;
    const refundStatus = appointment.payment_status === "paid" ? "pending" : "not_required";
    const actor = cleanName(env.VET_NAME, env.VET_EMAIL || "Equipe Onda Animal");
    const blockReason = `Consulta cancelada • ${reason}`.slice(0, 240);
    const statements = [];
    if (reopenSlot) {
      const archiveSlotId = randomToken(12);
      statements.push(
        db.prepare("INSERT INTO availability_slots (id, starts_at, ends_at, professional_name, professional_crmv, unit_name, price_cents, status, source, block_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'blocked', 'cancellation_archive', ?, ?, ?)")
          .bind(archiveSlotId, appointment.starts_at, appointment.ends_at, appointment.slot_professional_name, appointment.slot_professional_crmv, appointment.slot_unit_name, appointment.slot_price_cents, blockReason, now, now),
        db.prepare("UPDATE appointments SET slot_id = ?, status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancellation_reason = ?, slot_reopened = 1, refund_status = ?, updated_at = ? WHERE id = ?")
          .bind(archiveSlotId, now, actor, reason, refundStatus, now, appointment.id),
        db.prepare("UPDATE availability_slots SET status = 'open', block_reason = '', updated_at = ? WHERE id = ? AND status = 'booked'")
          .bind(now, appointment.slot_id),
      );
    } else {
      statements.push(
        db.prepare("UPDATE appointments SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancellation_reason = ?, slot_reopened = 0, refund_status = ?, updated_at = ? WHERE id = ?")
          .bind(now, actor, reason, refundStatus, now, appointment.id),
        db.prepare("UPDATE availability_slots SET status = 'blocked', block_reason = ?, updated_at = ? WHERE id = ? AND status = 'booked'")
          .bind(blockReason, now, appointment.slot_id),
      );
    }
    statements.push(db.prepare("INSERT INTO schedule_audit (id, slot_id, action, reason, actor, starts_at, ends_at, created_at) VALUES (?, ?, 'cancel_appointment', ?, ?, ?, ?, ?)")
      .bind(randomToken(12), appointment.slot_id, `${reason}${reopenSlot ? " • horário liberado" : " • horário mantido fechado"}`, actor, appointment.starts_at, appointment.ends_at, now));
    await db.batch(statements);
    const dateText = new Date(Number(appointment.starts_at) * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    const refundText = refundStatus === "pending" ? " O pagamento já foi identificado e a clínica fará a devolução do Pix." : "";
    const whatsappUrl = whatsappLink(appointment.phone, `Olá, ${appointment.tutor_name}. A consulta de ${appointment.patient_name}, marcada para ${dateText}, foi cancelada. Motivo: ${reason}.${refundText}`);
    return responseJson({ ok: true, refundStatus, slotReopened: reopenSlot, whatsappUrl, notificationMode: "click_to_send" });
  }

  if (request.method === "POST" && url.pathname === "/api/appointments/refund") {
    const body = await readJson(request) || {};
    const appointment = await db.prepare(`SELECT a.*, c.name AS tutor_name, c.phone, p.name AS patient_name
      FROM appointments a JOIN clients c ON c.id = a.client_id JOIN pets p ON p.id = a.pet_id WHERE a.id = ?`)
      .bind(cleanName(body.appointmentId)).first();
    if (!appointment) return responseJson({ error: "Agendamento não encontrado" }, 404);
    if (appointment.status !== "cancelled" || appointment.refund_status !== "pending") return responseJson({ error: "Este agendamento não possui reembolso pendente" }, 409);
    const reference = cleanText(body.reference, 240);
    if (!reference) return responseJson({ error: "Informe o comprovante ou referência da devolução" }, 400);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE appointments SET payment_status = 'refunded', refund_status = 'refunded', refunded_at = ?, refund_reference = ?, updated_at = ? WHERE id = ?")
      .bind(now, reference, now, appointment.id).run();
    const whatsappUrl = whatsappLink(appointment.phone, `Olá, ${appointment.tutor_name}. A devolução do pagamento da consulta de ${appointment.patient_name} foi realizada. Referência: ${reference}.`);
    return responseJson({ ok: true, refundStatus: "refunded", whatsappUrl, notificationMode: "click_to_send" });
  }

  if (request.method === "POST" && url.pathname === "/api/appointments/start") {
    const body = await readJson(request) || {};
    const appointment = await db.prepare(
      `SELECT a.*, c.name AS tutor_name, c.phone, c.cpf AS tutor_document, c.email AS tutor_email,
        c.address AS tutor_address,
        p.name AS patient_name, p.species, p.sex, p.breed, p.coat, p.age, p.weight,
        s.starts_at, s.price_cents, s.professional_name, s.professional_crmv, s.unit_name
       FROM appointments a JOIN clients c ON c.id = a.client_id JOIN pets p ON p.id = a.pet_id
       JOIN availability_slots s ON s.id = a.slot_id WHERE a.id = ?`
    ).bind(String(body.appointmentId || "")).first();
    if (!appointment) return responseJson({ error: "Agendamento não encontrado" }, 404);
    if (appointment.status === "cancelled") return responseJson({ error: "Esta consulta foi cancelada" }, 409);
    if (appointment.room_id) return responseJson({ error: "Este atendimento já foi iniciado" }, 409);
    if (appointment.payment_status !== "paid") return responseJson({ error: "Pagamento Pix ainda não confirmado. A sala permanece bloqueada." }, 402);
    const roomId = randomToken(9);
    const hostToken = randomToken();
    const guestToken = randomToken();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 14400;
    const recordId = randomToken(12);
    await db.batch([
      db.prepare("INSERT INTO rooms (id, host_token_hash, guest_token_hash, patient_name, tutor_name, professional_name, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?)")
        .bind(roomId, await sha256(hostToken), await sha256(guestToken), appointment.patient_name, appointment.tutor_name, appointment.professional_name, now, expiresAt),
      db.prepare("INSERT INTO consultation_records (id, room_id, appointment_id, client_id, pet_id, patient_name, tutor_name, tutor_document, tutor_address, professional_name, professional_crmv, unit_name, service_name, species, sex, breed, coat, age, weight, rpvar_valid, chief_complaint, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Consulta por vídeo', ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
        .bind(recordId, roomId, appointment.id, appointment.client_id, appointment.pet_id, appointment.patient_name, appointment.tutor_name, appointment.tutor_document, appointment.tutor_address, appointment.professional_name, appointment.professional_crmv, appointment.unit_name, appointment.species, appointment.sex, appointment.breed, appointment.coat, appointment.age, appointment.weight, appointment.rpvar_valid, appointment.chief_complaint, now, now),
      db.prepare("UPDATE appointments SET room_id = ?, guest_token = ?, status = 'waiting', started_at = ?, updated_at = ? WHERE id = ?").bind(roomId, guestToken, now, now, appointment.id),
    ]);
    const appointmentUrl = `${publicOrigin(request)}/consulta?appointment=${encodeURIComponent(appointment.id)}&token=${encodeURIComponent(appointment.public_token)}`;
    const dateText = new Date(Number(appointment.starts_at) * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    const whatsappUrl = whatsappLink(appointment.phone, `Olá, ${appointment.tutor_name}! A consulta por vídeo de ${appointment.patient_name}, marcada para ${dateText}, foi iniciada. Entre pelo link seguro: ${appointmentUrl}`);
    await db.prepare("UPDATE appointments SET call_notification_status = 'ready', call_notification_sent_at = NULL, updated_at = ? WHERE id = ?").bind(now, appointment.id).run();
    return responseJson({ roomId, hostToken, guestToken, expiresAt, appointmentUrl, whatsappUrl, notificationMode: "click_to_send",
      patientName: appointment.patient_name, tutorName: appointment.tutor_name, tutorDocument: appointment.tutor_document,
      tutorAddress: appointment.tutor_address, professionalName: appointment.professional_name, professionalCrmv: appointment.professional_crmv,
      unitName: appointment.unit_name, serviceName: appointment.service_type || "Consulta por vídeo", species: appointment.species, sex: appointment.sex,
      breed: appointment.breed, coat: appointment.coat, age: appointment.age, weight: appointment.weight,
      rpvarValid: Boolean(appointment.rpvar_valid), chiefComplaint: appointment.chief_complaint }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/appointments/whatsapp-opened") {
    const body = await readJson(request) || {};
    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare("UPDATE appointments SET call_notification_status = 'opened', call_notification_sent_at = ?, updated_at = ? WHERE id = ? AND room_id IS NOT NULL")
      .bind(now, now, cleanName(body.appointmentId)).run();
    if (!result.meta?.changes) return responseJson({ error: "Atendimento não encontrado" }, 404);
    return responseJson({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/prescriptions/signed") {
    if (!env.DOCUMENTS) return responseJson({ error: "Armazenamento de documentos não configurado" }, 503);
    const form = await request.formData();
    const roomId = cleanName(form.get("roomId"));
    const file = form.get("file");
    if (!roomId || !(file instanceof File)) return responseJson({ error: "Selecione o PDF assinado" }, 400);
    if (file.type !== "application/pdf" || file.size > 4 * 1024 * 1024) return responseJson({ error: "Envie um PDF de até 4 MB" }, 400);
    const room = await db.prepare("SELECT id FROM rooms WHERE id = ?").bind(roomId).first();
    if (!room) return responseJson({ error: "Atendimento não encontrado" }, 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") return responseJson({ error: "O arquivo não é um PDF válido" }, 400);
    const id = randomToken(12);
    const publicToken = randomToken(24);
    const objectKey = `prescriptions/${roomId}/${id}.pdf`;
    const now = Math.floor(Date.now() / 1000);
    await env.DOCUMENTS.put(objectKey, bytes, { httpMetadata: { contentType: "application/pdf" } });
    await db.prepare("INSERT INTO prescription_documents (id, room_id, object_key, filename, status, public_token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, 'signed', ?, ?, ?)")
      .bind(id, roomId, objectKey, cleanName(file.name, "receita-assinada.pdf"), await sha256(publicToken), now, now).run();
    return responseJson({ ok: true, documentId: id, shareUrl: `${publicOrigin(request)}/api/documents/${encodeURIComponent(id)}?token=${encodeURIComponent(publicToken)}` }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/prescriptions/send") {
    const body = await readJson(request) || {};
    const document = await db.prepare(
      `SELECT d.*, c.phone, c.name AS tutor_name, p.name AS patient_name FROM prescription_documents d
       LEFT JOIN appointments a ON a.room_id = d.room_id LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN pets p ON p.id = a.pet_id WHERE d.id = ?`
    ).bind(String(body.documentId || "")).first();
    if (!document) return responseJson({ error: "Receita assinada não encontrada" }, 404);
    const shareUrl = cleanText(body.shareUrl, 1000);
    if (!shareUrl) return responseJson({ error: "Link seguro da receita ausente" }, 400);
    const whatsappUrl = whatsappLink(document.phone, `Olá, ${document.tutor_name || "tutor(a)"}! A receita assinada de ${document.patient_name || "seu animal"} está disponível neste link seguro: ${shareUrl}`);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE prescription_documents SET status = 'ready', sent_at = NULL, updated_at = ? WHERE id = ?").bind(now, document.id).run();
    return responseJson({ ok: true, whatsappUrl, shareUrl });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    return responseJson({ error: "Agende a consulta e confirme o pagamento antes de abrir a sala" }, 409);
    /* Fluxo legado mantido abaixo apenas para referência de dados já existentes. */
    const body = await readJson(request) || {};
    const roomId = randomToken(9);
    const hostToken = randomToken();
    const guestToken = randomToken();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 14400;
    const patientName = cleanName(body.patientName, "Paciente");
    const tutorName = cleanName(body.tutorName, "Responsável");
    const tutorDocument = cleanName(body.tutorDocument);
    const tutorAddress = cleanText(body.tutorAddress, 300);
    const professionalName = cleanName(body.professionalName, "Veterinário(a)");
    const professionalCrmv = cleanName(body.professionalCrmv);
    const unitName = cleanName(body.unitName, "Gravataí");
    const serviceName = cleanName(body.serviceName, "Consulta por vídeo");
    const species = cleanName(body.species, "Canino");
    const sex = cleanName(body.sex);
    const breed = cleanName(body.breed);
    const coat = cleanName(body.coat);
    const age = cleanName(body.age);
    const weight = cleanName(body.weight);
    const chiefComplaint = cleanText(body.chiefComplaint, 3000);
    const recordId = randomToken(12);
    await db.batch([
      db.prepare("DELETE FROM signals WHERE room_id IN (SELECT id FROM rooms WHERE expires_at < ?)").bind(now),
      db.prepare("UPDATE rooms SET status = 'expired' WHERE expires_at < ? AND status NOT IN ('ended', 'expired')").bind(now),
      db.prepare("INSERT INTO rooms (id, host_token_hash, guest_token_hash, patient_name, tutor_name, professional_name, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?)").bind(roomId, await sha256(hostToken), await sha256(guestToken), patientName, tutorName, professionalName, now, expiresAt),
      db.prepare("INSERT INTO consultation_records (id, room_id, patient_name, tutor_name, tutor_document, tutor_address, professional_name, professional_crmv, unit_name, service_name, species, sex, breed, coat, age, weight, rpvar_valid, chief_complaint, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(recordId, roomId, patientName, tutorName, tutorDocument, tutorAddress, professionalName, professionalCrmv, unitName, serviceName, species, sex, breed, coat, age, weight, body.rpvarValid === false ? 0 : 1, chiefComplaint, now, now),
    ]);
    return responseJson({ roomId, hostToken, guestToken, expiresAt, patientName, tutorName, tutorDocument, tutorAddress, professionalName, professionalCrmv, unitName, serviceName, species, sex, breed, coat, age, weight, rpvarValid: body.rpvarValid !== false, chiefComplaint }, 201);
  }

  if (request.method === "GET" && url.pathname === "/api/consultations") {
    const result = await db.prepare("SELECT room_id, patient_name, tutor_name, professional_name, unit_name, service_name, species, status, updated_at, ended_at FROM consultation_records ORDER BY updated_at DESC LIMIT 30").all();
    return responseJson({ consultations: result.results || [] });
  }

  if (request.method === "GET" && url.pathname === "/api/record") {
    const record = await db.prepare("SELECT * FROM consultation_records WHERE room_id = ?").bind(url.searchParams.get("room") || "").first();
    if (!record) return responseJson({ error: "Prontuário não encontrado" }, 404);
    return responseJson({ record });
  }

  if (request.method === "POST" && url.pathname === "/api/record") {
    const body = await readJson(request);
    if (!body || !body.roomId) return responseJson({ error: "Atendimento inválido" }, 400);
    const status = body.status === "completed" ? "completed" : "draft";
    const now = Math.floor(Date.now() / 1000);
    const startedAt = Number(body.startedAt) || now;
    const endedAt = status === "completed" ? (Number(body.endedAt) || now) : null;
    const result = await db.prepare("UPDATE consultation_records SET patient_name = ?, tutor_name = ?, tutor_document = ?, tutor_address = ?, professional_name = ?, professional_crmv = ?, unit_name = ?, service_name = ?, species = ?, sex = ?, breed = ?, coat = ?, age = ?, weight = ?, rpvar_valid = ?, chief_complaint = ?, anamnesis = ?, clinical_findings = ?, diagnosis = ?, treatment_plan = ?, prescription = ?, exam_requests = ?, referral = ?, notes = ?, status = ?, started_at = COALESCE(started_at, ?), ended_at = ?, updated_at = ? WHERE room_id = ?")
      .bind(cleanName(body.patientName, "Paciente"), cleanName(body.tutorName, "Responsável"), cleanName(body.tutorDocument), cleanText(body.tutorAddress, 300), cleanName(body.professionalName, "Veterinário(a)"), cleanName(body.professionalCrmv), cleanName(body.unitName, "Gravataí"), cleanName(body.serviceName, "Consulta por vídeo"), cleanName(body.species, "Não informado"), cleanName(body.sex), cleanName(body.breed), cleanName(body.coat), cleanName(body.age), cleanName(body.weight), body.rpvarValid === false ? 0 : 1, cleanText(body.chiefComplaint), cleanText(body.anamnesis), cleanText(body.clinicalFindings), cleanText(body.diagnosis), cleanText(body.treatmentPlan), cleanText(body.prescription), cleanText(body.examRequests), cleanText(body.referral), cleanText(body.notes), status, startedAt, endedAt, now, String(body.roomId)).run();
    if (!result.meta?.changes) return responseJson({ error: "Prontuário não encontrado" }, 404);
    if (status === "completed") await db.prepare("UPDATE appointments SET status = 'completed', completed_at = ?, updated_at = ? WHERE room_id = ?").bind(now, now, String(body.roomId)).run();
    return responseJson({ ok: true, status, updatedAt: now });
  }

  return null;
}

async function handleSignalingApi(request, env, url, db) {
  if (request.method === "GET" && url.pathname === "/api/room") {
    const roomId = url.searchParams.get("room") || "";
    const token = url.searchParams.get("token") || "";
    const role = url.searchParams.get("role") || "client";
    const room = await getValidRoom(db, roomId, token, role);
    if (!room) return responseJson({ error: "Link inválido ou expirado" }, 404);
    return responseJson({ roomId: room.id, patientName: room.patient_name, tutorName: room.tutor_name, professionalName: room.professional_name, status: room.status, expiresAt: room.expires_at });
  }
  if (request.method === "POST" && url.pathname === "/api/signals") {
    const body = await readJson(request);
    if (!body) return responseJson({ error: "Dados inválidos" }, 400);
    const room = await getValidRoom(db, body.roomId, body.token, body.role);
    if (!room) return responseJson({ error: "Sala inválida ou expirada" }, 403);
    const senderId = String(body.senderId || "").slice(0, 80);
    const kind = String(body.kind || "");
    const payload = JSON.stringify(body.payload ?? null);
    if (!senderId || !["ready", "offer", "answer", "candidate", "hangup", "chat"].includes(kind) || payload.length > 60000) return responseJson({ error: "Sinal inválido" }, 400);
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare("INSERT INTO signals (room_id, sender_id, role, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(body.roomId, senderId, body.role, kind, payload, now),
      db.prepare("UPDATE rooms SET status = ? WHERE id = ?").bind(kind === "hangup" ? "ended" : (kind === "answer" ? "connected" : room.status), body.roomId),
    ]);
    return responseJson({ ok: true }, 201);
  }
  if (request.method === "GET" && url.pathname === "/api/signals") {
    const roomId = url.searchParams.get("room") || "";
    const token = url.searchParams.get("token") || "";
    const role = url.searchParams.get("role") || "client";
    const senderId = (url.searchParams.get("sender") || "").slice(0, 80);
    const after = Math.max(0, Number(url.searchParams.get("after") || 0));
    const room = await getValidRoom(db, roomId, token, role);
    if (!room) return responseJson({ error: "Sala inválida ou expirada" }, 403);
    const result = await db.prepare("SELECT id, sender_id, role, kind, payload FROM signals WHERE room_id = ? AND id > ? AND sender_id != ? ORDER BY id ASC LIMIT 100").bind(roomId, after, senderId).all();
    const signals = (result.results || []).map((row) => ({ id: row.id, senderId: row.sender_id, role: row.role, kind: row.kind, payload: JSON.parse(row.payload) }));
    return responseJson({ signals, status: room.status });
  }
  return null;
}

async function handleApi(request, env, url) {
  const db = getDatabase(env);
  const publicResponse = await handlePublicApi(request, env, url, db);
  if (publicResponse) return publicResponse;
  const signalingResponse = await handleSignalingApi(request, env, url, db);
  if (signalingResponse) return signalingResponse;
  const staffResponse = await handleStaffApi(request, env, url, db);
  if (staffResponse) return staffResponse;
  return responseJson({ error: "Rota não encontrada" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Método não permitido", { status: 405 });
      if (url.pathname === "/app.js") return new Response(request.method === "HEAD" ? null : APP_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
      if (url.pathname === "/mascotes-onda.png") {
        const bytes = Uint8Array.from(atob(PET_IMAGE_BASE64), (char) => char.charCodeAt(0));
        return new Response(request.method === "HEAD" ? null : bytes, { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
      }
      return new Response(request.method === "HEAD" ? null : INDEX_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });
    } catch (error) {
      console.error(error);
      return responseJson({ error: "Não foi possível concluir esta ação agora" }, 500);
    }
  },
};
