const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./modules/auth/auth.routes');
const sourcesRoutes = require('./modules/sources/sources.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const productsRoutes = require('./modules/products/products.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const ledgerRoutes = require('./modules/customers/ledger.routes');
const ordersRoutes = require('./modules/orders/orders.routes');
const transportRoutes = require('./modules/orders/transport.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const invoicesRoutes = require('./modules/invoices/invoices.routes');
const driversRoutes = require('./modules/drivers/drivers.routes');
const driverLedgerRoutes = require('./modules/drivers/driver-ledger.routes');
const vehiclesRoutes = require('./modules/vehicles/vehicles.routes');
const deliveriesRoutes = require('./modules/deliveries/deliveries.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const offersRoutes = require('./modules/offers/offers.routes');
const filesRoutes = require('./modules/files/files.routes');
const posRoutes = require('./modules/pos/pos.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const faxRoutes = require('./modules/faxes/fax.routes');
const traderManagementRoutes = require('./modules/traders/driver-management.routes');
const errorHandler = require('./middlewares/errorHandler');
const response = require('./utils/response');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/sources', sourcesRoutes);
api.use('/categories', categoriesRoutes);
api.use('/products', productsRoutes);
api.use('/customers', ledgerRoutes);
api.use('/customers', customersRoutes);
api.use('/orders', ordersRoutes);
api.use('/transport', transportRoutes);
api.use('/payments', paymentsRoutes);
api.use('/invoices', invoicesRoutes);
api.use('/drivers', driverLedgerRoutes);
api.use('/drivers', driversRoutes);
api.use('/vehicles', vehiclesRoutes);
api.use('/deliveries', deliveriesRoutes);
api.use('/reports', reportsRoutes);
api.use('/settings', settingsRoutes);
api.use('/notifications', notificationsRoutes);
api.use('/offers', offersRoutes);
api.use('/files', filesRoutes);
api.use('/pos', posRoutes);
api.use('/admin', adminRoutes);
api.use('/faxes', faxRoutes);
api.use('/traders/me', traderManagementRoutes);

app.use('/api/v1', api);
app.use((req, res) => response.error(res, 'المسار غير موجود', 404, 'NOT_FOUND'));
app.use(errorHandler);

module.exports = app;
