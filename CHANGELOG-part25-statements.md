# Part 25 — Statements and account views

## Backend
- Added `accounting-statements.service.js` for customer, driver and factory statements.
- Added `accounting-statements.controller.js`.
- `/accounting/my-statement` is available to customer/trader/contractor roles and only returns the authenticated user's customer account.
- Added admin/accountant endpoints for customer, driver and factory statements.
- Existing fulfillment and YemenSoft queue endpoints remain unchanged.

## Flutter
- Added `StatementService`.
- Added `MyStatementScreen` showing current balance and ledger movements.
- Added a link from order details to the authenticated user's statement.

## Important
This patch does not replace the existing individual/cart flow. It only exposes the accounting statement created by the fulfillment posting engine.
