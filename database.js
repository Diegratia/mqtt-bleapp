const sql = require("mssql");

const globalpooldb = {
  db: null,
  testTable: null,
};

const dbConfig = {
  user: "sa",
  password: "P@ssw0rd",
  // server: "10.0.74.189",
  // database: "test_gresik",
  server: "103.193.15.120",
  database: "testingble_gresik",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function initializeDatabase(testTableName = null) {
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
      .query(`IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'testingble_gresikz')
      BEGIN
        CREATE DATABASE testingble_gresikz;
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
        meter FLOAT,
        calc_dist FLOAT, 
        gmac VARCHAR(12) NOT NULL,
        measure FLOAT,
        FOREIGN KEY (gateway_id) REFERENCES gateways(id)
      );
    `);

    if (testTableName) {
      globalpooldb.testTable = testTableName;
      await db.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${testTableName}' AND xtype='U')
        CREATE TABLE ${testTableName} (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          gateway_id INT NOT NULL,
          type TINYINT NOT NULL,
          dmac VARCHAR(12) NOT NULL,
          refpower SMALLINT,
          rssi FLOAT,
          vbatt INT,
          temp FLOAT,
          time DATETIME NOT NULL,
          meter FLOAT,
          calc_dist FLOAT,
          gmac VARCHAR(12) NOT NULL,
          measure FLOAT,
          FOREIGN KEY (gateway_id) REFERENCES gateways(id)
        );
      `);
      console.log(
        `Test table '${testTableName}' initialized or already exists`
      );
    }

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
  return {
    db: globalpooldb.db,
    testTable: globalpooldb.testTable,
  };
}

module.exports = { initializeDatabase, getDbPool };
