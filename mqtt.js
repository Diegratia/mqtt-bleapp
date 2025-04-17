var mqtt = require("mqtt");
const { Kalman } = require("kalmanjs");
const { KalmanFilter } = require("kalman-filter");
var Topic = "test/topic";
var Broker_URL = "mqtt://localhost:1884";

var options = {
  clientId: "KlienGweh",
  username: "test1",
  password: "test1",
};

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
      console.log(data);

      if (data.obj) {
        data.obj.forEach((beacon) => {
          if (beacon.rssi !== undefined) {
            const kf = new KalmanFilter();
            const kalmanfilterrssi = kf.filter(beacon.rssi);

            console.log(
              `Raw RSSI: ${beacon.rssi}, Filtered RSSI: ${kalmanfilterrssi}`
            );
            beacon.filteredRssi = kalmanfilterrssi;
          }
        });
      }

      messageCallback(data);
    } catch (error) {
      console.error("Error parsing message:", error.message);
    }
  }
  return client;
}

module.exports = { startMqttClient };
