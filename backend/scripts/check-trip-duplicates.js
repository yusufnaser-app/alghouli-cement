'use strict';
// فحص تكرار trip_number في deliveries — قراءة فقط. الاستخدام: node scripts/check-trip-duplicates.js
const { run } = require('./_check-duplicates-lib');
run({ title: 'أرقام الرحلات', table: 'deliveries', col: 'trip_number', prefix: 'TRP' });
