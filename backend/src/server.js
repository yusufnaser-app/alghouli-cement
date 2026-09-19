require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/db');

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ تم الاتصال بقاعدة البيانات');

    app.listen(PORT, () => {
      console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
      console.log(`🌐 http://localhost:${PORT}`);
      console.log(`🔧 البيئة: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    console.error('❌ فشل بدء الخادم:', err.message);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  console.log('\n👋 إيقاف الخادم...');
  await pool.end();
  process.exit(0);
});

start();
