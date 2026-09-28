// حقن نسخة وهمية من config/db قبل تحميل أي خدمة (لا حاجة لقاعدة بيانات حقيقية)
const path = require('path');
const dbPath = require.resolve(path.join(__dirname, '../src/config/db'));

const install = (fake) => {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fake };
};
const clearModules = (...relPaths) => {
  for (const p of relPaths) delete require.cache[require.resolve(path.join(__dirname, '..', p))];
};
module.exports = { install, clearModules };
