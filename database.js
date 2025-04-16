const mysql = require("mysql2/promise");

const globalpooldb = {
  db: null,
};

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "mqttble_app",
};

async function initializeDatabase() {
  try {
    //create db
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
    });
    await connection.query("CREATE DATABASE IF NOT EXISTS mqttble_app");
    await connection.end();

    const db = await mysql.createConnection(dbConfig);

    // gateways
    await db.query(`
      CREATE TABLE IF NOT EXISTS gateways (
        id INT AUTO_INCREMENT PRIMARY KEY,
        gmac VARCHAR(12) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // beacons
    await db.query(`
      CREATE TABLE IF NOT EXISTS beacons (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        gateway_id INT NOT NULL,
        type TINYINT NOT NULL,
        dmac VARCHAR(12) NOT NULL,
        refpower SMALLINT,
        rssi SMALLINT,
        ver TINYINT,
        vbatt INT,
        temp FLOAT,
        time DATETIME NOT NULL,
        FOREIGN KEY (gateway_id) REFERENCES gateways(id)
      )
    `);

    await db.end();
    globalpooldb.db = mysql.createPool(dbConfig);
    console.log("Database dan tabel berhasil diinisialisasi");
  } catch (error) {
    console.error("Inisialisasi database gagal:", error);
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
