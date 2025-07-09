const sql = require("mssql");

const globalpooldb = {
  db: null,
};

const dbConfig = {
  user: "sa",
  password: "Password_123#",
  server: "192.168.1.116",
  database: "mqttble_app",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function initializeDatabase() {
  try {
    const pool = await sql.connect({
      user: dbConfig.user,
      password: dbConfig.password,
      server: dbConfig.server,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    await pool.request()
      .query(`IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'mqttble_app')
      BEGIN
        CREATE DATABASE mqttble_app;
      END
    `);

    await pool.close();

    const db = await sql.connect(dbConfig);

    // gateways
    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='gateways' AND xtype='U')
      CREATE TABLE gateways (
        id INT IDENTITY(1,1) PRIMARY KEY,
        gmac VARCHAR(12) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT GETDATE()
      );
    `);

    // beacons
    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='beacons' AND xtype='U')
      CREATE TABLE beacons (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        gateway_id INT NOT NULL,
        type TINYINT NOT NULL,
        dmac VARCHAR(12) NOT NULL,
        refpower SMALLINT,
        rssi FLOAT,
        vbatt INT,
        temp FLOAT,
        time DATETIME NOT NULL,
        FOREIGN KEY (gateway_id) REFERENCES gateways(id)
      );
    `);

    globalpooldb.db = db;
    console.log("Database dan tabel berhasil diinisialisasi (MSSQL)");
  } catch (error) {
    console.error("Inisialisasi database MSSQL gagal:", error);
    throw error;
  }
}

function getDbPool() {
  if (!globalpooldb.db) {
    throw new Error("Database pool not initialized");
  }
  return globalpooldb.db;
}

module.exports = { initializeDatabase, getDbPool };
