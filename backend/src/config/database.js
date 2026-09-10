/**
 * Database Configuration
 * MySQL2 connection pool with prepared statements.
 * All queries MUST use parameterized statements — never string concatenation.
 */

const mysql = require('mysql2/promise');
const env = require('./environment');

// TODO(security): Use mTLS for database connection in production.
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Enable prepared statements by default for security
  namedPlaceholders: false,
});

/**
 * Execute a parameterized query.
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<Array>} Query results
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Get a single connection from the pool (for transactions).
 * @returns {Promise<mysql.PoolConnection>}
 */
async function getConnection() {
  return pool.getConnection();
}

/**
 * Test database connectivity.
 */
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('[DB] Connected to MySQL successfully');
    conn.release();
    return true;
  } catch (error) {
    console.error('[DB] Connection failed:', error.message);
    return false;
  }
}

module.exports = { pool, query, getConnection, testConnection };
