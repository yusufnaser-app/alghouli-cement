require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function main() {
  console.log('🌱 إضافة منتجات وأسعار...');

  const productsData = [
    // عمران - OPC كيس 50
    { source: 'AMR', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت عمران بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5500, min_qty: 10 },
    // عمران - OPC سائب
    { source: 'AMR', category: 'OPC', grade: '42.5', packaging: 'bulk', bag_weight: null, name: 'أسمنت عمران بورتلاندي 42.5 - سائب', price_ton: 105000, min_qty: 5 },
    // باجل - OPC كيس 50
    { source: 'BAJ', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت باجل بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5400, min_qty: 10 },
    // باجل - OPC 32.5 كيس 50
    { source: 'BAJ', category: 'OPC', grade: '32.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت باجل بورتلاندي 32.5 - كيس 50 كجم', price_bag: 5200, min_qty: 10 },
    // البرح - OPC كيس 50
    { source: 'BAR', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت البرح بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5450, min_qty: 10 },
    // الوطنية - OPC كيس 50
    { source: 'WAT', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت الوطنية بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5600, min_qty: 10 },
    // الوطنية - SRC كيس 50
    { source: 'WAT', category: 'SRC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت الوطنية مقاوم 42.5 - كيس 50 كجم', price_bag: 5800, min_qty: 10 },
    // الوطنية - SRC سائب
    { source: 'WAT', category: 'SRC', grade: '42.5', packaging: 'bulk', bag_weight: null, name: 'أسمنت الوطنية مقاوم 42.5 - سائب', price_ton: 112000, min_qty: 5 },
    // الوطنية - WPC كيس 50
    { source: 'WAT', category: 'WPC', grade: null, packaging: 'bagged', bag_weight: 50, name: 'أسمنت الوطنية أبيض - كيس 50 كجم', price_bag: 8500, min_qty: 10 },
    // حضرموت - OPC كيس 50
    { source: 'HAD', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت حضرموت بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5550, min_qty: 10 },
    // حضرموت - SRC كيس 50
    { source: 'HAD', category: 'SRC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت حضرموت مقاوم 42.5 - كيس 50 كجم', price_bag: 5750, min_qty: 10 },
    // حضرموت - WPC كيس 50
    { source: 'HAD', category: 'WPC', grade: null, packaging: 'bagged', bag_weight: 50, name: 'أسمنت حضرموت أبيض - كيس 50 كجم', price_bag: 8400, min_qty: 10 },
    // النهضة - OPC كيس 50
    { source: 'NAH', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت النهضة بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5480, min_qty: 10 },
    // الوحدة - OPC كيس 50
    { source: 'WAH', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت الوحدة بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5500, min_qty: 10 },
    // إعمار اليمن - OPC كيس 50
    { source: 'EMA', category: 'OPC', grade: '42.5', packaging: 'bagged', bag_weight: 50, name: 'أسمنت إعمار اليمن بورتلاندي 42.5 - كيس 50 كجم', price_bag: 5500, min_qty: 10 },
    // إعمار اليمن - WPC كيس 50
    { source: 'EMA', category: 'WPC', grade: null, packaging: 'bagged', bag_weight: 50, name: 'أسمنت إعمار اليمن أبيض - كيس 50 كجم', price_bag: 8500, min_qty: 10 },
  ];

  const priceMap = {
    individual: 1.00,
    trader: 0.98,
    distributor: 0.96,
    contractor: 0.97,
  };

  for (const p of productsData) {
    const srcRes = await query(`SELECT id FROM product_sources WHERE code = $1`, [p.source]);
    const catRes = await query(`SELECT id FROM product_categories WHERE code = $1`, [p.category]);
    if (srcRes.rows.length === 0 || catRes.rows.length === 0) continue;

    const sourceId = srcRes.rows[0].id;
    const categoryId = catRes.rows[0].id;

    const prodRes = await query(
      `INSERT INTO products (name_ar, source_id, category_id, grade, packaging_type, bag_weight_kg, status, min_order_qty)
       VALUES ($1, $2, $3, $4, $5, $6, 'available', $7)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [p.name, sourceId, categoryId, p.grade, p.packaging, p.bag_weight, p.min_qty]
    );

    let productId;
    if (prodRes.rows.length > 0) {
      productId = prodRes.rows[0].id;
    } else {
      const existing = await query(`SELECT id FROM products WHERE name_ar = $1`, [p.name]);
      if (existing.rows.length === 0) continue;
      productId = existing.rows[0].id;
    }

    // أضف المخزون
    const unit = p.packaging === 'bagged' ? 'bag' : 'ton';
    await query(
      `INSERT INTO inventory (product_id, available_qty, unit)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id) DO NOTHING`,
      [productId, p.packaging === 'bagged' ? 5000 : 200, unit]
    );

    // أضف الأسعار لكل فئة عملاء
    const priceLists = await query(`SELECT id, customer_type FROM price_lists`);
    for (const pl of priceLists.rows) {
      const factor = priceMap[pl.customer_type] || 1;
      const basePrice = p.packaging === 'bagged' ? p.price_bag : p.price_ton;
      const finalPrice = Math.round(basePrice * factor);

      await query(
        `INSERT INTO product_prices (product_id, price_list_id, pricing_unit, price, min_qty)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [productId, pl.id, p.packaging === 'bagged' ? 'bag' : 'ton', finalPrice, p.min_qty]
      );
    }
  }

  console.log('🎉 تم إضافة المنتجات والأسعار بنجاح');
  await pool.end();
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
