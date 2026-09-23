const { query } = require('../../config/db');

const list = async () => {
  const result = await query(
    `SELECT id, full_name, phone, license_number, id_number, status, notes, created_at
     FROM drivers ORDER BY created_at DESC`
  );
  return result.rows;
};

const create = async (data) => {
  const result = await query(
    `INSERT INTO drivers (full_name, phone, license_number, id_number, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.fullName, data.phone, data.licenseNumber || null, data.idNumber || null, data.notes || null]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  if (data.fullName) { params.push(data.fullName); fields.push(`full_name = $${params.length}`); }
  if (data.phone) { params.push(data.phone); fields.push(`phone = $${params.length}`); }
  if (data.licenseNumber !== undefined) { params.push(data.licenseNumber); fields.push(`license_number = $${params.length}`); }
  if (data.status) { params.push(data.status); fields.push(`status = $${params.length}`); }
  if (data.notes !== undefined) { params.push(data.notes); fields.push(`notes = $${params.length}`); }
  if (fields.length === 0) return null;
  params.push(id);
  const result = await query(
    `UPDATE drivers SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0];
};

const getById = async (id) => {
  const result = await query(`SELECT * FROM drivers WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

module.exports = { list, create, update, getById };

// قاطرات السائق الحالي
const getMyVehicles = async (userId) => {
  const { query } = require('../../config/db');
  const r = await query(
    `SELECT v.*
     FROM vehicles v
     WHERE v.current_driver_id = (SELECT id FROM drivers WHERE user_id = $1)
        OR v.owner_trader_id = (
          SELECT owner_trader_id FROM drivers WHERE user_id = $1
        )
     ORDER BY v.created_at DESC`,
    [userId]
  );
  return r.rows;
};

module.exports.getMyVehicles = getMyVehicles;
