require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function main() {
  console.log('🚀 إنشاء جداول النقل...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_ar VARCHAR(100) NOT NULL,
        governorate VARCHAR(100) NOT NULL,
        area VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ shipping_zones');

    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        zone_id UUID REFERENCES shipping_zones(id) ON DELETE CASCADE,
        calc_method VARCHAR(20) NOT NULL DEFAULT 'flat',
        packaging_type VARCHAR(20),
        vehicle_type VARCHAR(50),
        base_price DECIMAL(14,2) NOT NULL,
        price_per_km DECIMAL(10,2),
        price_per_ton DECIMAL(10,2),
        price_per_bag DECIMAL(10,2),
        min_qty DECIMAL(14,2),
        max_qty DECIMAL(14,2),
        valid_from DATE,
        valid_to DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ shipping_rates');

    // أضف مناطق وأسعار افتراضية
    const zones = [
      ['صنعاء', 'صنعاء', 'السبعين', 50000],
      ['صنعاء', 'صنعاء', 'شعوب', 45000],
      ['صنعاء', 'صنعاء', 'معين', 45000],
      ['عمران', 'عمران', null, 70000],
      ['الحديدة', 'الحديدة', 'باجل', 120000],
      ['تعز', 'تعز', 'البرح', 130000],
      ['حضرموت', 'حضرموت', 'المكلا', 150000],
    ];

    for (const [name, gov, area, price] of zones) {
      const zoneResult = await client.query(
        `INSERT INTO shipping_zones (name_ar, governorate, area)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [name, gov, area]
      );
      const zoneId = zoneResult.rows[0].id;

      await client.query(
        `INSERT INTO shipping_rates (zone_id, calc_method, base_price)
         VALUES ($1, 'flat', $2)`,
        [zoneId, price]
      );
    }
    console.log('✅ المناطق والأسعار');

    await client.query('COMMIT');
    console.log('🎉 تم بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
