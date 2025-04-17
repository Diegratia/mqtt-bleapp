var mqtt = require("mqtt");
const { KalmanFilter } = require("kalman-filter");
var Topic = "test/topic";
var Broker_URL = "mqtt://localhost:1884";

var options = {
  clientId: "KlienGweh",
  username: "test1",
  password: "test1",
};

let rssiBuffer = [];

function startMqttClient(messageCallback) {
  var client = mqtt.connect(Broker_URL, options);
  client.on("connect", mqtt_connect);
  client.on("error", mqtt_error);
  client.on("message", mqtt_messageReceived);

  function mqtt_connect() {
    client.subscribe(Topic, mqtt_subscribe);
  }

  function mqtt_subscribe(err, granted) {
    console.log("Subscribed to " + Topic);
    if (err) {
      console.log(err);
    }
  }

  function mqtt_error(err) {
    console.log("MQTT error:", err);
  }

  function mqtt_messageReceived(topic, message, packet) {
    try {
      var message_str = message.toString();
      var data = JSON.parse(message_str);

      if (data.obj) {
        data.obj.forEach((beacon) => {
          if (beacon.rssi !== undefined && !isNaN(beacon.rssi)) {
            console.log(`Received RSSI: ${beacon.rssi}`);

            //array push
            console.time("Processing Time");
            rssiBuffer.push(beacon.rssi);

            if (rssiBuffer.length >= 20) {
              console.log("20 rssi sudah ada, proses data");

              const kFilter = new KalmanFilter();
              const filteredRSSI = kFilter.filterAll(rssiBuffer);

              console.log("hasil filter:");
              console.log(filteredRSSI);

              rssiBuffer = [];
            }
            console.timeEnd("Processing Time");
          } else {
            console.log(`Invalid RSSI value: ${beacon.rssi}`);
          }
        });
      }

      // messageCallback(data);
    } catch (error) {
      console.error("Error parsing message:", error.message);
    }
  }

  return client;
}

module.exports = { startMqttClient };
