const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';
const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

const pool = new Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
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
