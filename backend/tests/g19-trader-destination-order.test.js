'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('G19-1) m41: عمود auto_for_destination بـ IF NOT EXISTS وفهرس جزئي', () => {
  const m = read('migrations/m41.js');
  assert.match(m, /ADD COLUMN IF NOT EXISTS auto_for_destination BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(m, /CREATE INDEX IF NOT EXISTS idx_orders_auto_destination/);
});

test('G19-2) المخطط يقبل الصنف والمصنع والسعر (وإلا يُحذف الحقل صامتًا)', () => {
  const c = read('src/modules/faxes/destination.controller.js');
  assert.match(c, /productId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(c, /sourceId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(c, /unitPrice: z\.number\(\)\.positive\(\)\.optional\(\)/);
});

test('G19-3) وجهة تاجر بلا صنف/مصنع/سعر ⇒ 422 TRADER_DESTINATION_NEEDS_PRICE قبل أي إدراج', async () => {
  const log = [];
  const client = { query: async (sql) => { log.push(norm(sql)); return { rows: [] }; } };
  install({ pool: {}, query: async () => ({ rows: [] }) });
  clearModules('src/modules/faxes/destination.service.js');
  const svc = require('../src/modules/faxes/destination.service');
  // traderInfo يُجلب من customers؛ نحاكي ذلك بجواب للاستعلام المناسب
  client.query = async (sql) => {
    const s = norm(sql); log.push(s);
    if (/FROM customers c/.test(s) && /JOIN users/.test(s)) return { rows: [{ id: 'c1', full_name: 'تاجر', phone: '7', governorate: 'ذمار', area: 'a', default_address: 'x' }] };
    if (/SELECT id, status FROM loading_faxes|FROM loading_faxes WHERE id/.test(s)) return { rows: [{ id: 'f1', status: 'APPROVED' }] };
    return { rows: [] };
  };
  await assert.rejects(svc.replaceDestinations(client, 'f1', [{ destinationType: 'trader', traderId: '11111111-1111-1111-1111-111111111111', quantity: 10, unit: 'bag' }], 'u1'),
    (e) => e.code === 'TRADER_DESTINATION_NEEDS_PRICE' && e.status === 422);
  assert.ok(!log.some((s) => /INSERT INTO delivery_destinations/.test(s)), 'لا إدراج قبل رفض الوجهة');
});

test('G19-4) الحذف يلغي الطلبات التلقائية للوجهات المعلّقة فقط ولا يمس طلبات التجار الحقيقية', () => {
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /UPDATE orders SET status = 'CANCELLED'[\s\S]*auto_for_destination = TRUE AND status = 'PREPARING'/);
  assert.match(s, /DELETE FROM delivery_destinations WHERE fax_id = \$1 AND status = 'PENDING'[\s\S]*fulfills_order_id IS NULL OR fulfills_order_id IN \(SELECT id FROM orders WHERE auto_for_destination = TRUE\)/);
});

test('G19-5) الترحيل عند التسليم مقيَّد بالطلب التلقائي ومعرّف بـ idempotency', () => {
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /if \(ord\.rows\[0\] && ord\.rows\[0\]\.auto_for_destination\) \{\s*await postDestinationSale/);
  assert.match(s, /idempotencyKey: `dest-sale:\$\{dest\.id\}`/);
  assert.match(s, /transactionType: 'actual_sale'/);
});

test('G19-6) الطلب التلقائي يُسعَّر بسعر الوجهة لكل وحدتها (الطن يبقى طنًا)', () => {
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /engine\.toMinor\(p\.quantity\) \* engine\.toMinor\(p\.unitPrice\), 100/);
});
