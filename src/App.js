import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";
import "./App.css";
import mqtt from "mqtt";

function App() {
  const [loadCellOn, setLoadCellOn] = useState("PENDING");
  const [checkedItems, setCheckedItems] = useState([false, false, false]);
  const [weight, setWeight] = useState(0);
  const [weightHistory, setWeightHistory] = useState([]);
  const [graphRunning, setGraphRunning] = useState(false);
  const [testDisabled, setTestDisabled] = useState(true);

  const [client, setClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // ---------------- MQTT SETTINGS ----------------
  const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt"; // SSL WebSocket
  const WEIGHT_TOPIC = "arduino/sensor/weight";
  const FIRE_TOPIC = "arduino/relay/fire";

  // ---------------- MQTT SETUP ----------------
  useEffect(() => {
    const mqttClient = mqtt.connect(MQTT_BROKER, {
      reconnectPeriod: 5000, // reconnect every 5 seconds if disconnected
    });

    mqttClient.on("connect", () => {
      console.log("✅ Connected to MQTT broker");
      setIsConnected(true);
      mqttClient.subscribe(WEIGHT_TOPIC, (err) => {
        if (!err) console.log(`Subscribed to ${WEIGHT_TOPIC}`);
        else console.log("❌ Subscribe error:", err);
      });
    });

    mqttClient.on("reconnect", () => console.log("🔄 Reconnecting to MQTT..."));
    mqttClient.on("error", (err) => console.log("❌ MQTT Error:", err));
    mqttClient.on("close", () => {
      console.log("⚠️ MQTT connection closed");
      setIsConnected(false);
    });

    mqttClient.on("message", (topic, message) => {
      if (topic === WEIGHT_TOPIC) {
        const msgStr = message.toString();
        const value = parseFloat(msgStr.replace("Weight: ", "")) || 0;
        const timestamp = new Date().toLocaleTimeString();

        setWeight(value);
        setWeightHistory((prev) => [
          ...prev.slice(-49),
          { time: timestamp, weight: value },
        ]);
        setLoadCellOn(value ? "ON" : "OFF");
      }
    });

    setClient(mqttClient);

    return () => {
      mqttClient.end();
    };
  }, []);

  // ---------------- CHECKLIST LOGIC ----------------
  const toggleCheck = (index) => {
    const newChecked = [...checkedItems];
    newChecked[index] = !newChecked[index];
    setCheckedItems(newChecked);
  };

  const allChecked = checkedItems.every(Boolean);
  useEffect(() => {
    setTestDisabled(!(allChecked && loadCellOn === "ON"));
  }, [allChecked, loadCellOn]);

  const handleTestClick = () => {
    if (allChecked && loadCellOn === "ON") {
      setGraphRunning(true);
      setWeightHistory([]);
    }
  };

  const handleAbort = () => {
    setTestDisabled(true);
  };

  // ---------------- FIRE BUTTON USING MQTT ----------------
  const handleIgnition = () => {
    if (!client || !isConnected) {
      console.log("⚠️ MQTT not connected yet");
      return;
    }

    client.publish(FIRE_TOPIC, "ON", (err) => {
      if (err) console.log("❌ Publish error:", err);
      else console.log("🔥 Fire command sent via MQTT");
    });
  };

  // ---------------- JSX ----------------
  return (
    <div className="container">
      <h1 className="heading">Solitude Christopher</h1>

      <div className="load-cell-indicator">
        Load Cell:{" "}
        <span className={loadCellOn === "ON" ? "on" : "off"}>{loadCellOn}</span>
      </div>

      <ul className="checklist">
        {["Distance", "Stopper", "final"].map((item, index) => (
          <li key={index}>
            <label>
              <input
                type="checkbox"
                checked={checkedItems[index]}
                onChange={() => toggleCheck(index)}
              />
              {item}
            </label>
          </li>
        ))}
      </ul>

      <div className="buttons">
        <button className="circle-btn" onClick={handleAbort}>
          Abort
        </button>
        <button
          className="circle-btn"
          disabled={testDisabled}
          onClick={handleTestClick}
        >
          Arm
        </button>
        <button
          className="circle-btn"
          disabled={testDisabled || !isConnected}
          onClick={handleIgnition}
        >
          Fire
        </button>
      </div>

      {graphRunning && (
        <>
          <h2>Weight Graph</h2>
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={weightHistory}>
              <CartesianGrid stroke="#ccc" />
              <XAxis dataKey="time" />
              <YAxis
                domain={[-1000, 1000]}
                interval={0}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#00ff00"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

export default App;
