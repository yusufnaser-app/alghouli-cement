const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('✅ تم الاتصال بقاعدة البيانات');
});

pool.on('error', (err) => {
  console.error('❌ خطأ في قاعدة البيانات:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
