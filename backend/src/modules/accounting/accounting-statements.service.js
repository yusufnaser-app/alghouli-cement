const { query } = require('../../config/db');

const getCustomerStatementByUserId = async (userId, { limit = 100, offset = 0 } = {}) => {
  const customer = await query(`
    SELECT c.id, c.current_balance, u.full_name, u.phone
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id = $1
    LIMIT 1`, [userId]);
  if (!customer.rows.length) return null;

  const rows = await query(`
    SELECT cl.id, cl.order_id, cl.transaction_type, cl.debit, cl.credit,
           cl.balance_after, cl.description, cl.reference_code,
           cl.created_at, cl.source_type, cl.source_id,
           o.order_number
    FROM customer_ledger cl
    LEFT JOIN orders o ON o.id = cl.order_id
    WHERE cl.customer_id = $1
    ORDER BY cl.created_at DESC
    LIMIT $2 OFFSET $3`, [customer.rows[0].id, limit, offset]);

  return {
    account_type: 'customer',
    customer: customer.rows[0],
    rows: rows.rows,
  };
};

const getCustomerStatement = async (customerId, { limit = 200, offset = 0 } = {}) => {
  const customer = await query(`
    SELECT c.id, c.current_balance, u.full_name, u.phone
    FROM customers c JOIN users u ON u.id=c.user_id
    WHERE c.id=$1`, [customerId]);
  if (!customer.rows.length) return null;
  const rows = await query(`
    SELECT cl.*, o.order_number
    FROM customer_ledger cl
    LEFT JOIN orders o ON o.id=cl.order_id
    WHERE cl.customer_id=$1
    ORDER BY cl.created_at DESC LIMIT $2 OFFSET $3`, [customerId, limit, offset]);
  return { account_type:'customer', customer:customer.rows[0], rows:rows.rows };
};

const getDriverStatement = async (driverId, { limit = 200, offset = 0 } = {}) => {
  const driver = await query(`
    SELECT id, full_name, phone, current_balance
    FROM drivers WHERE id=$1`, [driverId]);
  if (!driver.rows.length) return null;
  const rows = await query(`
    SELECT dl.*, o.order_number
    FROM driver_ledger dl
    LEFT JOIN orders o ON o.id=dl.order_id
    WHERE dl.driver_id=$1
    ORDER BY dl.created_at DESC LIMIT $2 OFFSET $3`, [driverId, limit, offset]);
  return { account_type:'driver', driver:driver.rows[0], rows:rows.rows };
};

const getFactoryStatement = async (factoryId, { limit = 200, offset = 0 } = {}) => {
  const factory = await query(`SELECT id, name_ar FROM product_sources WHERE id=$1`, [factoryId]);
  if (!factory.rows.length) return null;
  const rows = await query(`
    SELECT fl.*, o.order_number, f.fax_number
    FROM factory_ledger fl
    LEFT JOIN orders o ON o.id=fl.order_id
    LEFT JOIN loading_faxes f ON f.id=fl.fax_id
    WHERE fl.factory_id=$1
    ORDER BY fl.created_at DESC LIMIT $2 OFFSET $3`, [factoryId, limit, offset]);
  const total = await query(`
    SELECT COALESCE(SUM(quantity),0) AS total_quantity
    FROM factory_ledger WHERE factory_id=$1`, [factoryId]);
  return { account_type:'factory', factory:factory.rows[0], total_quantity:total.rows[0].total_quantity, rows:rows.rows };
};

module.exports = {
  getCustomerStatementByUserId,
  getCustomerStatement,
  getDriverStatement,
  getFactoryStatement,
};
