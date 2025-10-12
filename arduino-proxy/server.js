import mqtt from 'mqtt';

const MQTT_BROKER = 'ws://broker.hivemq.com:8000/mqtt';
const WEIGHT_TOPIC = 'arduino/sensor/weight';
const FIRE_TOPIC = 'arduino/relay/fire';

const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe([WEIGHT_TOPIC, FIRE_TOPIC], () => {
    // Simulate publishing weight and fire messages
    setInterval(() => {
      const weight = (Math.random() * 1000).toFixed(2);
      client.publish(WEIGHT_TOPIC, weight);
      console.log(`Published weight: ${weight}`);
    }, 2000);

    setInterval(() => {
      client.publish(FIRE_TOPIC, 'ON');
      console.log('Published fire: ON');
      setTimeout(() => {
        client.publish(FIRE_TOPIC, 'OFF');
        console.log('Published fire: OFF');
      }, 1000);
    }, 5000);
  });
});

client.on('message', (topic, message) => {
  console.log(`Received on ${topic}: ${message.toString()}`);
});