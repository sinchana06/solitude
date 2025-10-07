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
  const [relayStatus, setRelayStatus] = useState("OFF");
  const [relayCountdown, setRelayCountdown] = useState(0);

  const [client, setClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const MQTT_BROKER = "wss://broker.hivemq.com:8000/mqtt"; // HiveMQ WebSocket
  const WEIGHT_TOPIC = "arduino/sensor/weight";
  const FIRE_TOPIC = "arduino/relay/fire";

  // ---------------- MQTT SETUP ----------------
  useEffect(() => {
    const mqttClient = mqtt.connect(MQTT_BROKER);

    mqttClient.on("connect", () => {
      console.log("✅ Connected to MQTT broker");
      setIsConnected(true);
      mqttClient.subscribe(WEIGHT_TOPIC);
      mqttClient.subscribe(FIRE_TOPIC);
    });

    mqttClient.on("message", (topic, message) => {
      const msgStr = message.toString();

      if (topic === WEIGHT_TOPIC) {
        const value = parseFloat(msgStr) || 0;
        const timestamp = new Date().toLocaleTimeString();

        setWeight(value);
        setWeightHistory((prev) => [
          ...prev.slice(-49),
          { time: timestamp, weight: value }
        ]);
        setLoadCellOn(value ? "ON" : "OFF");
      }

      if (topic === FIRE_TOPIC) {
        if (msgStr === "ON") {
          setRelayStatus("ON");
          setRelayCountdown(5); // 5 seconds countdown
        } else {
          setRelayStatus("OFF");
          setRelayCountdown(0);
        }
      }
    });

    setClient(mqttClient);

    return () => {
      mqttClient.end();
    };
  }, []);

  // ---------------- RELAY COUNTDOWN ----------------
  useEffect(() => {
    if (relayCountdown > 0) {
      const timer = setInterval(() => {
        setRelayCountdown((prev) => {
          if (prev <= 1) {
            setRelayStatus("OFF");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [relayCountdown]);

  // ---------------- CHECKLIST LOGIC ----------------
  const toggleCheck = (index) => {
    const newChecked = [...checkedItems];
    newChecked[index] = !newChecked[index];
    setCheckedItems(newChecked);
  };

  const allChecked = checkedItems.every(Boolean);
  useEffect(() => {
    setTestDisabled(!(allChecked && loadCellOn));
  }, [allChecked, loadCellOn]);

  const handleTestClick = () => {
    if (allChecked && loadCellOn) {
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
      console.log("⚠️ MQTT not connected");
      return;
    }

    client.publish(FIRE_TOPIC, "ON"); // Send fire command to Arduino
    console.log("🔥 Fire command sent via MQTT");
  };

  // ---------------- JSX ----------------
  return (
    <div className="container">
      <h1 className="heading">Solitude Christopher</h1>

      <div className="load-cell-indicator">
        Load Cell:{" "}
        <span className={loadCellOn === "ON" ? "on" : "off"}>{loadCellOn}</span>
      </div>

      <div className="current-weight">
        Current Weight: <span className="weight">{weight.toFixed(2)} g</span>
      </div>

      <div className="relay-status">
        Relay Status:{" "}
        <span
          style={{
            color: relayStatus === "ON" ? "green" : "red",
            fontWeight: "bold"
          }}
        >
          {relayStatus}
        </span>
        {relayStatus === "ON" && relayCountdown > 0 && (
          <span> ({relayCountdown}s remaining)</span>
        )}
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
          style={{
            backgroundColor: relayStatus === "ON" ? "green" : "",
            color: relayStatus === "ON" ? "white" : ""
          }}
        >
          {relayStatus === "ON" && relayCountdown > 0
            ? `Fire (${relayCountdown}s)`
            : "Fire"}
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
git