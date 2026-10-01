# Al-Ghooli V25 — Termux installation

This is a patch over V24. Do not delete existing project files.

```bash
cd ~/alghouli-cement
unzip -o alghouli-cement-trader-flow-v25.zip
```

Backend checks:

```bash
cd backend
node --check src/modules/accounting/accounting-statements.service.js
node --check src/modules/accounting/accounting-statements.controller.js
node --check src/modules/accounting/accounting.routes.js
npm test
```

Flutter:

```bash
cd ../mobile
flutter pub get
flutter analyze
flutter build apk --debug
```

No database migration is required for V25; it uses the ledger tables created by V27/V24.

If the backend project was not updated with V24, install V24 first and then V25.
