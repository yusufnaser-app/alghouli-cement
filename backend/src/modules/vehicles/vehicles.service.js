const { query } = require('../../config/db');

const list = async (filters = {}) => {
  let sql = `SELECT * FROM vehicles WHERE 1=1`;
  const params = [];
  if (filters.supportsBagged === 'true') sql += ` AND supports_bagged = true`;
  if (filters.supportsBulk === 'true') sql += ` AND supports_bulk = true`;
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC`;
  const result = await query(sql, params);
  return result.rows;
};

const create = async (data) => {
  const result = await query(
    `INSERT INTO vehicles
     (plate_number, vehicle_type, supports_bagged, supports_bulk,
      capacity_tons, capacity_bags, owner_name, owner_type, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      data.plateNumber, data.vehicleType,
      data.supportsBagged ?? true, data.supportsBulk ?? false,
      data.capacityTons, data.capacityBags || null,
      data.ownerName || null, data.ownerType || 'company',
      data.notes || null,
    ]
  );
  return result.rows[0];
};

const getById = async (id) => {
  const result = await query(`SELECT * FROM vehicles WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  const map = {
    plateNumber: 'plate_number',
    vehicleType: 'vehicle_type',
    supportsBagged: 'supports_bagged',
    supportsBulk: 'supports_bulk',
    capacityTons: 'capacity_tons',
    capacityBags: 'capacity_bags',
    ownerName: 'owner_name',
    ownerType: 'owner_type',
    status: 'status',
    notes: 'notes',
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      fields.push(`${col} = $${params.length}`);
    }
  }
  if (fields.length === 0) return null;
  params.push(id);
  const result = await query(
    `UPDATE vehicles SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0];
};

module.exports = { list, create, getById, update };
