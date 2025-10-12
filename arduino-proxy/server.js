import express from "express";
import mqtt from "mqtt";

const app = express();
app.use(express.json());

// ---- MQTT CONFIG ----
const MQTT_BROKER = "ws://broker.hivemq.com:8000/mqtt";
const WEIGHT_TOPIC = "arduino/sensor/weight";
const FIRE_TOPIC = "arduino/relay/fire";
const PAYLOAD_TOPIC = "app/payload/images";

const client = mqtt.connect(MQTT_BROKER);

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker");
  client.subscribe([WEIGHT_TOPIC, FIRE_TOPIC, PAYLOAD_TOPIC], () => {
    console.log("📡 Subscribed to topics");
  });

  // -------- Simulate weight messages --------
  setInterval(() => {
    const weight = (Math.random() * 1000).toFixed(2);
    client.publish(WEIGHT_TOPIC, weight);
    console.log(`⚖️ Published weight: ${weight}`);
  }, 2000);

  // -------- Simulate fire relay --------
  setInterval(() => {
    client.publish(FIRE_TOPIC, "ON");
    console.log("🔥 Published fire: ON");
    setTimeout(() => {
      client.publish(FIRE_TOPIC, "OFF");
      console.log("🧯 Published fire: OFF");
    }, 1000);
  }, 5000);

  // -------- Simulate image payload publishing --------
  const imageSets = [
    [
      "https://placekitten.com/200/300",
      "https://placekitten.com/250/350",
      "https://placekitten.com/300/300"
    ],
    [
      "https://picsum.photos/200/300",
      "https://picsum.photos/250/350",
      "https://picsum.photos/300/300"
    ],
    [
      "https://placebear.com/200/300",
      "https://placebear.com/250/350",
      "https://placebear.com/300/300"
    ]
  ];

  let setIndex = 0;
  setInterval(() => {
    const payload = {
      images: imageSets[setIndex],
      timestamp: new Date().toISOString()
    };
    client.publish(PAYLOAD_TOPIC, JSON.stringify(payload));
    console.log("📦 Published image payload:", payload);

    setIndex = (setIndex + 1) % imageSets.length;
  }, 10000); // every 10 seconds
});

// ---- Listen for messages ----
client.on("message", (topic, message) => {
  console.log(`📨 Received on ${topic}: ${message.toString()}`);
});

// ---- Start Express (optional, you may not need it for now) ----
const PORT = 4000;
app.listen(PORT, () => console.log(`🚀 Server running at ${PORT}`));
