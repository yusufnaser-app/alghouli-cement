const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./modules/auth/auth.routes');
const sourcesRoutes = require('./modules/sources/sources.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const productsRoutes = require('./modules/products/products.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const errorHandler = require('./middlewares/errorHandler');
const response = require('./utils/response');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/sources', sourcesRoutes);
api.use('/categories', categoriesRoutes);
api.use('/products', productsRoutes);
api.use('/customers', customersRoutes);

app.use('/api/v1', api);

app.use((req, res) => {
  return response.error(res, 'المسار غير موجود', 404, 'NOT_FOUND');
});

app.use(errorHandler);

module.exports = app;
