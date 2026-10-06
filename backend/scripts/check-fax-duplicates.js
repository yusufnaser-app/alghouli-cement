'use strict';
// فحص تكرار fax_number في loading_faxes — قراءة فقط. الاستخدام: node scripts/check-fax-duplicates.js
const { run } = require('./_check-duplicates-lib');
run({ title: 'أرقام الفاكسات', table: 'loading_faxes', col: 'fax_number', prefix: 'FX' });
