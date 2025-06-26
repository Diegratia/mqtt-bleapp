const { getDbPool } = require("./database");
const { v4: uuidv4 } = require("uuid");
const sql = require("mssql");

async function saveBeaconPositions(positions) {
  if (!positions || positions.length === 0) {
    return;
  }

  try {
    const { db } = getDbPool();

    for (const pos of positions) {
      const request = db.request();

      request.input("id", sql.UniqueIdentifier, uuidv4());
      request.input("beacon_id", sql.VarChar(12), pos.beaconId);
      request.input("floorplan_id", sql.UniqueIdentifier, pos.floorplanId);
      request.input("pos_x", sql.BigInt, pos.point.x);
      request.input("pos_y", sql.BigInt, pos.point.y);
      request.input("first_gateway_id", sql.VarChar(12), pos.first);
      request.input("second_gateway_id", sql.VarChar(12), pos.second);
      request.input("first_distance", sql.Float, pos.firstDist);
      request.input("second_distance", sql.Float, pos.secondDist);
      request.input("timestamp", sql.DateTime, new Date(pos.time));

      await request.query(`
        INSERT INTO beacon_positions (
          id, beacon_id, floorplan_id, pos_x, pos_y,
          first_gateway_id, second_gateway_id, first_distance, second_distance,
          timestamp, created_at
        ) VALUES (
          @id, @beacon_id, @floorplan_id, @pos_x, @pos_y,
          @first_gateway_id, @second_gateway_id, @first_distance, @second_distance,
          @timestamp, GETDATE()
        )
      `);
    }

    console.log(`Saved ${positions.length} positions to beacon_positions`);
  } catch (error) {
    console.error(`Failed to save positions to database: ${error.message}`);
    throw error;
  }
}

module.exports = { saveBeaconPositions };
