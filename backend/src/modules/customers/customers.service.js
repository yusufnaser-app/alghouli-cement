const { query } = require('../../config/db');

const getMyProfile = async (userId) => {
  const result = await query(
    `SELECT c.id, c.customer_type, c.governorate, c.area, c.default_address,
            u.full_name, u.phone, u.email
     FROM customers c
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
};

const updateMyProfile = async (userId, data) => {
  const fields = [];
  const params = [];

  if (data.customerType) {
    params.push(data.customerType);
    fields.push(`customer_type = $${params.length}`);
  }
  if (data.governorate) {
    params.push(data.governorate);
    fields.push(`governorate = $${params.length}`);
  }
  if (data.area !== undefined) {
    params.push(data.area);
    fields.push(`area = $${params.length}`);
  }
  if (data.defaultAddress !== undefined) {
    params.push(data.defaultAddress);
    fields.push(`default_address = $${params.length}`);
  }

  if (fields.length === 0) return getMyProfile(userId);

  params.push(userId);
  await query(
    `UPDATE customers SET ${fields.join(', ')} WHERE user_id = $${params.length}`,
    params
  );
  return getMyProfile(userId);
};

const listAddresses = async (userId) => {
  const result = await query(
    `SELECT a.id, a.label, a.governorate, a.area, a.address_text,
            a.latitude, a.longitude, a.alt_phone, a.is_default, a.created_at
     FROM customer_addresses a
     JOIN customers c ON c.id = a.customer_id
     WHERE c.user_id = $1
     ORDER BY a.is_default DESC, a.created_at DESC`,
    [userId]
  );
  return result.rows;
};

const addAddress = async (userId, data) => {
  const cust = await query(`SELECT id FROM customers WHERE user_id = $1`, [userId]);
  if (cust.rows.length === 0) {
    const err = new Error('العميل غير موجود');
    err.status = 404;
    throw err;
  }
  const customerId = cust.rows[0].id;

  if (data.isDefault) {
    await query(`UPDATE customer_addresses SET is_default = false WHERE customer_id = $1`, [customerId]);
  }

  const result = await query(
    `INSERT INTO customer_addresses
     (customer_id, label, governorate, area, address_text, latitude, longitude, alt_phone, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      customerId,
      data.label,
      data.governorate,
      data.area,
      data.addressText,
      data.latitude || null,
      data.longitude || null,
      data.altPhone || null,
      data.isDefault || false,
    ]
  );
  return result.rows[0];
};

const deleteAddress = async (userId, addressId) => {
  const result = await query(
    `DELETE FROM customer_addresses
     WHERE id = $1 AND customer_id IN (SELECT id FROM customers WHERE user_id = $2)
     RETURNING id`,
    [addressId, userId]
  );
  return result.rows.length > 0;
};

module.exports = { getMyProfile, updateMyProfile, listAddresses, addAddress, deleteAddress };
