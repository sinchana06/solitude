import React, { useEffect, useState } from "react";
import mqtt from "mqtt";
import "./PayloadView.css";

const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";
const PAYLOAD_TOPIC = "app/payload/images";


function PayloadView() {
  const [images, setImages] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER);

    client.on("connect", () => {
      console.log("✅ Connected to MQTT broker (React)");
      setConnected(true);
      client.subscribe(PAYLOAD_TOPIC);
    });

    client.on("message", (topic, message) => {
        console.log('hii')
      if (topic === PAYLOAD_TOPIC) {
        try {
          const data = JSON.parse(message.toString());
          console.log("📥 Received payload:", data);
          if (data.images) {
            setImages(data.images);
          }
        } catch (err) {
          console.error("Error parsing payload:", err);
        }
      }
    });

    return () => {
      client.end();
    };
  }, []);

  return (
    <div className="payload-view">
      <h2>Payload Section</h2>
      {!connected ? <p>Connecting to broker...</p> : <p>✅ Connected</p>}
      {console.log(images)}
      {images.length > 0 ? (
        <div className="image-grid">
          {images.map((img, idx) => (
            <img key={idx} src={img} alt={`payload-${idx}`} className="payload-img" />
          ))}
        </div>
      ) : (
        <p>No payload yet...</p>
      )}
    </div>
  );
}

export default PayloadView;
