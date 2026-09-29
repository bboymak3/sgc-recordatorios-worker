// Emulación mínima de la API de Cloudflare D1 sobre node:sqlite, para tests.
// Igual que D1: bind(undefined) lanza error y batch() es transaccional.
import { DatabaseSync } from "node:sqlite";

function toSqlite(v) {
  if (v === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params.map(toSqlite));
  }
  _stmt() {
    this.db.queries.push(this.sql);
    return this.db.raw.prepare(this.sql);
  }
  async first(col) {
    const row = this._stmt().get(...this.params);
    if (!row) return null;
    const plain = { ...row };
    return col ? plain[col] : plain;
  }
  async all() {
    const rows = this._stmt().all(...this.params).map((r) => ({ ...r }));
    return { results: rows, success: true, meta: {} };
  }
  async run() {
    const info = this._stmt().run(...this.params);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
  _runSync() {
    const s = this._stmt();
    if (/^\s*(select|with)/i.test(this.sql)) return { results: s.all(...this.params).map((r) => ({ ...r })), success: true, meta: {} };
    const info = s.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export class FakeD1 {
  constructor() {
    this.raw = new DatabaseSync(":memory:");
    this.raw.exec("PRAGMA foreign_keys = ON;");
    this.queries = [];
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  async batch(stmts) {
    this.raw.exec("BEGIN");
    try {
      const out = stmts.map((s) => s._runSync());
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(sql) {
    this.raw.exec(sql);
    return { count: 1 };
  }
  exec_(sql) {
    this.raw.exec(sql);
  }
  rows(sql, ...params) {
    return this.raw.prepare(sql).all(...params.map(toSqlite)).map((r) => ({ ...r }));
  }
  row(sql, ...params) {
    const r = this.raw.prepare(sql).get(...params.map(toSqlite));
    return r ? { ...r } : null;
  }
}
