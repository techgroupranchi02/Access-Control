/**
 * Initial Database Schema Migration
 * Creates all tables in dependency order.
 * 
 * Run: node migrations/001_initial_schema.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  console.log('[Migration] Connected to MySQL');

  // Create database if not exists
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${process.env.DB_DATABASE}\``);

  console.log('[Migration] Creating tables...');

  // 1. Users
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ users');

  // 2. Festivals
  await connection.query(`
    CREATE TABLE IF NOT EXISTS festivals (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ festivals');

  // 3. Features (core + custom registry)
  await connection.query(`
    CREATE TABLE IF NOT EXISTS features (
      id INT PRIMARY KEY AUTO_INCREMENT,
      feature_key VARCHAR(100) NOT NULL UNIQUE,
      feature_type ENUM('core', 'custom') NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      route VARCHAR(255),
      icon VARCHAR(100),
      component_name VARCHAR(255),
      plugin_dir VARCHAR(255),
      config JSON,
      display_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ features');

  // 4. Festival-Feature mapping
  await connection.query(`
    CREATE TABLE IF NOT EXISTS festival_features (
      id INT PRIMARY KEY AUTO_INCREMENT,
      festival_id INT NOT NULL,
      feature_id INT NOT NULL,
      is_enabled BOOLEAN DEFAULT FALSE,
      config JSON,
      UNIQUE KEY unique_festival_feature (festival_id, feature_id),
      FOREIGN KEY (festival_id) REFERENCES festivals(id) ON DELETE CASCADE,
      FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ festival_features');

  // 5. Permissions
  await connection.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      permission_key VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      resource VARCHAR(100) NOT NULL,
      action VARCHAR(50) NOT NULL,
      scope ENUM('page', 'section', 'element') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ permissions');

  // 6. Permission Groups
  await connection.query(`
    CREATE TABLE IF NOT EXISTS permission_groups (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ permission_groups');

  // 7. Permission Group Items
  await connection.query(`
    CREATE TABLE IF NOT EXISTS permission_group_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      permission_group_id INT NOT NULL,
      permission_id INT NOT NULL,
      UNIQUE KEY unique_group_permission (permission_group_id, permission_id),
      FOREIGN KEY (permission_group_id) REFERENCES permission_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ permission_group_items');

  // 8. Roles
  await connection.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      is_system BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ roles');

  // 9. Role Permissions
  await connection.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      role_id INT NOT NULL,
      permission_id INT NOT NULL,
      UNIQUE KEY unique_role_permission (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ role_permissions');

  // 10. User Festival Roles
  await connection.query(`
    CREATE TABLE IF NOT EXISTS user_festival_roles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      festival_id INT NOT NULL,
      role_id INT NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_festival_role (user_id, festival_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (festival_id) REFERENCES festivals(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ user_festival_roles');

  // 11. Feature Permission Groups
  await connection.query(`
    CREATE TABLE IF NOT EXISTS feature_permission_groups (
      id INT PRIMARY KEY AUTO_INCREMENT,
      feature_id INT NOT NULL,
      permission_group_id INT NOT NULL,
      UNIQUE KEY unique_feature_group (feature_id, permission_group_id),
      FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_group_id) REFERENCES permission_groups(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] ✓ feature_permission_groups');

  console.log('[Migration] All tables created successfully!');

  await connection.end();
}

migrate().catch((err) => {
  console.error('[Migration] Failed:', err.message);
  process.exit(1);
});
