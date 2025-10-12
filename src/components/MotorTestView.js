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
import "./MotorTestView.css";
import mqtt from "mqtt";
function MotorTestView(){
    const [loadCellOn, setLoadCellOn] = useState("PENDING");
  const [checkedItems, setCheckedItems] = useState([false, false, false]);
  const [weight, setWeight] = useState(0);
  const [weightHistory, setWeightHistory] = useState([]);
  const [graphRunning, setGraphRunning] = useState(false);
  const [testDisabled, setTestDisabled] = useState(true);
  const [relayStatus, setRelayStatus] = useState("OFF");
  const [relayCountdown, setRelayCountdown] = useState(0);
// Add this state to store all data points
const [allWeightData, setAllWeightData] = useState([]);

// Add this function to download all data as CSV
const handleDownloadAllCSV = () => {
  if (allWeightData.length === 0) {
    alert("No full weight data to download.");
    return;
  }
  const header = "Time,Weight";
  const rows = allWeightData.map(item => `${item.time},${item.weight}`);
  const csvContent = [header, ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "all_weight_data.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

  const [client, setClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt"; // HiveMQ WebSocket
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
          setAllWeightData((prev) => [
    ...prev,
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

  // Add this above your return statement
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          fontSize: "14px",
          color: "black",
          background: "white",
          border: "1px solid #ccc",
          padding: "10px"
        }}
      >
        <div>Weight: {payload[0].value}g</div>
      </div>
    );
  }
  return null;
};
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
        <div className="weight-title-container">
          <h3 style={{flex:0.8, textAlign:"left"}}>Weight Graph</h3>
          <span
        style={{ cursor: "pointer", alignContent: "flex-end", margin:"0px 10px" }}
        title="Download All Weight Data"
        onClick={handleDownloadAllCSV}
      >
        {/* Download SVG icon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 16V4M12 16L8 12M12 16L16 12M4 20H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      </div>
          <ResponsiveContainer width={480} height={480} className={"weight-graph"}>
            <LineChart data={weightHistory}>
              <CartesianGrid stroke="#ccc" />
              <XAxis dataKey="time" />
              <YAxis
                domain={[-1000, 1000]}
                ticks={[-1000, -800, -600, -400, -200, 0, 200, 400, 600, 800, 1000]}
                interval={0}
                tickFormatter={(value) => `${value}`}
              />
<Tooltip content={<CustomTooltip />} />
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

export default MotorTestView;