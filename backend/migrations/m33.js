'use strict';
/**
 * m33: default_product_id في product_sources
 *
 * عند إنشاء طلب تلقائي من تسليم فاكس، نحتاج معرفة المنتج الافتراضي
 * للمصنع (مثلاً مصنع عمران → "أسمنت عمران بورتلاندي 42.5 - كيس").
 * هذا يمنع بنود order_items بلا product_id.
 */
module.exports = {
  up: async (query) => {
    // 1) إضافة العمود
    await query(`
      ALTER TABLE product_sources
      ADD COLUMN IF NOT EXISTS default_product_id UUID
      REFERENCES products(id) ON DELETE SET NULL
    `);

    // 2) تعيين القيمة الافتراضية للمصانع الحالية
    await query(`
      UPDATE product_sources ps
      SET default_product_id = (
        SELECT p.id FROM products p
        WHERE p.source_id = ps.id
          AND (p.packaging_type IS NULL OR p.packaging_type = 'bagged')
          AND p.status IN ('available', 'active')
        ORDER BY p.min_order_qty ASC NULLS LAST, p.created_at ASC
        LIMIT 1
      )
      WHERE default_product_id IS NULL
    `);

    // 3) فهرس للبحث السريع
    await query(`
      CREATE INDEX IF NOT EXISTS idx_product_sources_default_product
      ON product_sources(default_product_id)
    `);

    console.log('✅ m33: default_product_id جاهز');
  },

  down: async (query) => {
    await query(`DROP INDEX IF EXISTS idx_product_sources_default_product`);
    await query(`ALTER TABLE product_sources DROP COLUMN IF EXISTS default_product_id`);
    console.log('✅ m33: تم التراجع');
  },
};
