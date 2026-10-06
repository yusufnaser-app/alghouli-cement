'use strict';
// فحص تكرار order_number في orders — قراءة فقط. الاستخدام: node scripts/check-order-duplicates.js
const { run } = require('./_check-duplicates-lib');
run({ title: 'أرقام الطلبات', table: 'orders', col: 'order_number', prefix: 'GHO' });
