'use strict';
const { toMinor } = require('../accounting/accounting.engine');

// الكيس = 50 كغ، الطن = 20 كيسًا — مصدر واحد للصيغة (auto-assign و available-trips)
const BAGS_PER_TON = 20;

/** حالات الفاكس التي تقبل وجهات جديدة — مصدر واحد لـ auto-assign و available-trips. */
const ELIGIBLE_STATUSES = ['REQUESTED', 'APPROVED', 'ISSUED', 'USED', 'READY_FOR_TRANSIT'];
const eligibleStatusesSql = () => ELIGIBLE_STATUSES.map((x) => `'${x}'`).join(',');

/** سعة الفاكس بالأكياس: المحمَّل ثم المعتمد ثم المطلوب. */
const capacitySql = (a = 'f') =>
  `COALESCE(${a}.loaded_quantity, ${a}.approved_quantity, ${a}.requested_quantity, 0)`;

/** مجموع وجهات الفاكس بالأكياس (الطن ×20) دون الوجهات الملغاة. */
const usedBagsSql = (a = 'f') =>
  `COALESCE((SELECT SUM(dd.quantity * CASE WHEN dd.unit = 'ton' THEN ${BAGS_PER_TON} ELSE 1 END)
             FROM delivery_destinations dd
             WHERE dd.fax_id = ${a}.id AND dd.status <> 'CANCELLED'), 0)`;

/** كمية بالأكياس × 100 (عدد صحيح، بلا أخطاء عائمة). */
const bagsH = (qty, unit) => toMinor(qty) * (unit === 'ton' ? BAGS_PER_TON : 1);

module.exports = { BAGS_PER_TON, ELIGIBLE_STATUSES, eligibleStatusesSql, capacitySql, usedBagsSql, bagsH };
