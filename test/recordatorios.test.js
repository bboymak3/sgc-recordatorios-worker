import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeD1 } from "./d1.js";
import worker, { processReminders, etapaParaHoy, proximaFechaRevision, calcularMesRevision, sanitizarPatente, hoyChile } from "../src/index.js";

function makeEnv(overrides = {}) {
  const db = new FakeD1();
  // Esquema de producción de la tabla
  db.exec_(`CREATE TABLE sgc_rec_recordatorios_revision (
    id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT NOT NULL, patente TEXT NOT NULL, ultimo_caracter TEXT DEFAULT '',
    mes_revision INTEGER NOT NULL, es_manual INTEGER DEFAULT 0, fecha_registro TEXT DEFAULT (datetime('now', '-4 hours')),
    ultimo_aviso_enviado TEXT DEFAULT '', activo INTEGER DEFAULT 1, tenant_id INTEGER DEFAULT 1)`);
  return { DB: db, EVOLUTION_API_URL: "https://evo.test", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE_NAME: "inst", CRON_SECRET: "cron-secreto", ...overrides };
}

function mockFetch(t) {
  const sent = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Response.json({}); };
  t.after(() => { globalThis.fetch = orig; });
  return sent;
}

const call = async (env, method, path, body, headers = {}) => {
  const res = await worker.fetch(new Request(`https://rec.test${path}`, {
    method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined
  }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test("save-lead usa la tabla correcta (antes 'recordatorios_revision' no existía → 500)", async (t) => {
  const env = makeEnv();
  const sent = mockFetch(t);
  const r = await call(env, "POST", "/api/save-lead", { telefono: "+56 9 1234 5678", patente: "ab-cd 12" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.patente, "ABCD12");
  assert.equal(r.data.mes_revision, 5, "termina en 2 → mayo");
  const row = env.DB.row("SELECT * FROM sgc_rec_recordatorios_revision");
  assert.equal(row.telefono, "56912345678");
  assert.equal(row.tenant_id, 1);
  assert.equal(sent.length, 1, "mensaje de bienvenida");
  assert.equal(sent[0].url, "https://evo.test/message/sendText/inst");
});

test("save-lead: validaciones, mes manual y actualización sin duplicar", async (t) => {
  const env = makeEnv();
  mockFetch(t);
  assert.equal((await call(env, "POST", "/api/save-lead", { telefono: "123", patente: "ABCD12" })).status, 400);
  assert.equal((await call(env, "POST", "/api/save-lead", { telefono: "56912345678", patente: "AB" })).status, 400);
  const sinDigito = await call(env, "POST", "/api/save-lead", { telefono: "56912345678", patente: "ABCDEF" });
  assert.equal(sinDigito.data.necesita_manual, true);
  const manual = await call(env, "POST", "/api/save-lead", { telefono: "56912345678", patente: "ABCDEF", mes_manual: 3 });
  assert.equal(manual.data.mes_revision, 3);
  const again = await call(env, "POST", "/api/save-lead", { telefono: "56912345678", patente: "ABCDEF", mes_manual: 4 });
  assert.equal(again.data.es_nuevo, false);
  assert.equal(env.DB.rows("SELECT * FROM sgc_rec_recordatorios_revision").length, 1);
});

test("check, stats y unsubscribe", async (t) => {
  const env = makeEnv();
  mockFetch(t);
  await call(env, "POST", "/api/save-lead", { telefono: "56912345678", patente: "ABCD12" });
  const c = await call(env, "GET", "/api/check?patente=abcd12");
  assert.equal(c.data.registrado, true);
  assert.equal(c.data.registro.telefono, "****5678", "teléfono enmascarado");
  assert.equal((await call(env, "GET", "/api/stats")).data.total_registrados, 1);
  await call(env, "POST", "/api/unsubscribe", { telefono: "+56912345678" });
  assert.equal((await call(env, "GET", "/api/stats")).data.total_registrados, 0);
});

test("trigger exige CRON_SECRET (header o query) y falla cerrado sin configurar", async (t) => {
  const env = makeEnv();
  mockFetch(t);
  assert.equal((await call(env, "POST", "/api/trigger")).status, 403);
  assert.equal((await call(env, "POST", "/api/trigger", null, { "X-Cron-Secret": "malo" })).status, 403);
  assert.equal((await call(env, "POST", "/api/trigger", null, { "X-Cron-Secret": "cron-secreto" })).status, 200);
  assert.equal((await call(makeEnv({ CRON_SECRET: undefined }), "GET", "/api/trigger?secret=")).status, 503);
});

test("etapas: 30d → 15d → 7d, sin repetir ni retroceder", () => {
  assert.equal(etapaParaHoy(31, "", 2027), null);
  assert.equal(etapaParaHoy(30, "", 2027).etiqueta, "30d");
  assert.equal(etapaParaHoy(20, "30d|2027", 2027), null, "ya se envió 30d");
  assert.equal(etapaParaHoy(14, "30d|2027", 2027).etiqueta, "15d");
  assert.equal(etapaParaHoy(5, "", 2027).etiqueta, "7d", "si se registró tarde, va directo al aviso urgente");
  assert.equal(etapaParaHoy(5, "30d|2027,15d|2027,7d|2027", 2027), null);
  assert.equal(etapaParaHoy(14, "30d|2026,15d|2026", 2027).etiqueta, "15d", "avisos del año anterior no cuentan");
});

test("processReminders envía la etapa que corresponde y la registra", async (t) => {
  const env = makeEnv();
  const sent = mockFetch(t);
  // Hoy fijo: 2026-09-10 → revisión de octubre (1 oct) en 21 días → 30d
  const now = new Date("2026-09-10T15:00:00Z");
  env.DB.exec_(`INSERT INTO sgc_rec_recordatorios_revision (telefono, patente, mes_revision, tenant_id) VALUES
    ('56911111111', 'AAAA17', 10, 1), ('56922222222', 'BBBB12', 5, 1), ('56933333333', 'CCCC17', 10, 2)`);
  const r = await processReminders(env, { now, delayMs: 0 });
  assert.equal(r.sent, 1, "solo el de octubre y solo del tenant 1");
  assert.match(sent[0].body.text, /revisión en Octubre 2026/);
  assert.equal(env.DB.row("SELECT ultimo_aviso_enviado FROM sgc_rec_recordatorios_revision WHERE patente = 'AAAA17'").ultimo_aviso_enviado, "30d|2026");
  const r2 = await processReminders(env, { now, delayMs: 0 });
  assert.equal(r2.sent, 0, "no reenvía el mismo día");
});

test("utilidades", () => {
  assert.equal(calcularMesRevision("9"), 1);
  assert.equal(calcularMesRevision("A"), null);
  assert.equal(sanitizarPatente("ab·cd-12 "), "ABCD12");
  const hoy = hoyChile(new Date("2026-12-31T02:00:00Z"));
  assert.equal(hoy.toISOString().slice(0, 10), "2026-12-30", "medianoche UTC aún es 30 en Chile");
  assert.equal(proximaFechaRevision(1, new Date(Date.UTC(2026, 11, 30))).year, 2027);
});

test("scheduled usa waitUntil", async (t) => {
  const env = makeEnv();
  mockFetch(t);
  const promises = [];
  await worker.scheduled({}, env, { waitUntil: (p) => promises.push(p) });
  assert.equal(promises.length, 1);
  await promises[0];
});
