# Al-Ghooli V24 — Termux

هذه الحزمة تجمع تغييرات V22 + m26 + V24، ولا تعدّل GitHub تلقائيًا.

## نسخة احتياطية
```bash
cd ~/alghouli-cement
cp -a backend backend.backup-v24
cp -a mobile mobile.backup-v24
cp -a admin admin.backup-v24
```

## فك الحزمة
```bash
cd ~/alghouli-cement
unzip -o alghouli-cement-trader-flow-v24.zip
```

## قاعدة البيانات
إذا لم تكن نفذت V22/V23:
```bash
cd backend
node migrations/m25.js
node migrations/m26.js
node migrations/m27.js
```
إذا نفذت m25 وm26 سابقًا، نفذ:
```bash
node migrations/m27.js
```

## فحص Backend
```bash
node --check src/modules/accounting/order-fulfillment.service.js
node --check src/modules/accounting/order-fulfillment.controller.js
node --check src/modules/accounting/order-fulfillment.routes.js
node --check src/modules/accounting/accounting.routes.js
node --check src/modules/faxes/fax.service.js
node --check src/modules/orders/orders.service.js
node --check src/modules/deliveries/deliveries.service.js
```
ثم:
```bash
npm test
```

## Flutter
```bash
cd ../mobile
flutter pub get
flutter analyze
flutter build apk --debug
```

## Admin
```bash
cd ../admin
npm install
npm run build
```

## شاشة الترحيل
بعد تشغيل Admin افتح:
```text
/accounting-fulfillment
```

## النتيجة
التحميل الفعلي يؤدي إلى تثبيت الكمية الفعلية، وترحيل كشف التاجر، وأجور السائق عند كونه مستفيد النقل، وكمية المصنع بدون سعر، وتحديث المخزون، ومنع الترحيل المكرر.
