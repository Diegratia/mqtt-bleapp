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
      request
        .input("id", sql.UniqueIdentifier, uuidv4())
        .input("beacon_id", pos.beaconId)
        .input("floorplan_id", pos.floorplanId)
        .input("pos_x", pos.point.x)
        .input("pos_y", pos.point.y)
        .input("is_in_restricted_area", pos.inRestrictedArea)
        .input("first_gateway_id", pos.first)
        .input("second_gateway_id", pos.second)
        .input("first_distance", pos.firstDist)
        .input("second_distance", pos.secondDist)
        .input("trigger_time", new Date(pos.time))
        .query(query);

      await request.query(`
     INSERT INTO AlarmTrigger (id, beacon_id, floorplan_id, pos_x, pos_y, is_in_restricted_area, first_gateway_id, second_gateway_id, first_distance, second_distance, trigger_time)
      VALUES (@id, @beacon_id, @floorplan_id, @pos_x, @pos_y, @is_in_restricted_area @first_gateway_id, @second_gateway_id, @first_distance, @second_distance, @trigger_time)
            )
      `);
    }

    // console.log(`Saved ${positions.length} positions to beacon_positions`);
  } catch (error) {
    console.error(`Failed to save positions to database: ${error.message}`);
    throw error;
  }
}

module.exports = { saveBeaconPositions };
