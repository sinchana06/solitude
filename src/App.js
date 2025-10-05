import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import "./App.css";
import mqtt from 'mqtt';


function App() {
  const [loadCellOn, setLoadCellOn] = useState('PENDING');
   const [fetchInProgress, setFetchInProgress] = useState(false);
  const [checkedItems, setCheckedItems] = useState([false, false, false]);
  const [weight, setWeight] = useState(0);
  const [weightHistory, setWeightHistory] = useState([]); // store weight over time
  const [graphRunning, setGraphRunning] = useState(false); // start graph on test click
  const [testDisabled, setTestDisabled] = useState(true)
  const ARDUINO_IP = "https://50540093470d.ngrok-free.app"; 


  useEffect(() => {
    // Connect to HiveMQ public broker via WebSocket
    const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");

    client.on("connect", () => {
      console.log("Connected to MQTT broker");
      client.subscribe("arduino/sensor/weight"); // same topic your Arduino publishes to
    });

    client.on("message", (topic, message) => {
  if (topic === "arduino/sensor/weight") {
    const msgStr = message.toString();       // e.g., "Weight 123"
    const value = parseFloat(msgStr.replace(/\D/g, "")) || 0; // extract number

    const timestamp = new Date().toLocaleTimeString();

    // Update graph state
    setWeight(value);
    setWeightHistory(prev => [
      ...prev.slice(-49),                  // keep last 50 points
      { time: timestamp, weight: value }
    ]);
     setLoadCellOn(value ? "ON" : "OFF");
  }
});


    return () => {
      client.end(); // disconnect on component unmount
    };
  }, []);


  const toggleCheck = (index) => {
    const newChecked = [...checkedItems];
    newChecked[index] = !newChecked[index];
    setCheckedItems(newChecked);
  };

  const allChecked = checkedItems.every(Boolean); // enable test only if all checklist items are ticked
  useEffect(() => {
  setTestDisabled(!(allChecked && loadCellOn));
}, [allChecked, loadCellOn]);
  const handleTestClick = () => {
    if (allChecked && loadCellOn) {
      setGraphRunning(true); // start graph updates
      setWeightHistory([]);  // reset history if needed
    }
  };
  const handleAbort = () => {
    setTestDisabled(true)
  }
  const handleIgnition = async () => {
const res = await fetch(ARDUINO_IP+'/L')
if (!res.ok) throw new Error("No response from Arduino");
  }
  return (
    <div className="container">
      <h1 className="heading">Solitude Christopher</h1>

      <div className="load-cell-indicator">
        Load Cell: <span className={loadCellOn == 'ON'? "on" : "off"}>{loadCellOn}</span>
      </div>

      <ul className="checklist">
        {["Distance", "Stopper", "final"].map((item, index) => (
          <li key={index}>
            <label>
              <input type="checkbox" checked={checkedItems[index]} onChange={() => toggleCheck(index)} />
              {item}
            </label>
          </li>
        ))}
      </ul>

      <div className="buttons">
        <button className="circle-btn" onClick={handleAbort}>Abort</button>
        <button 
          className="circle-btn" 
          disabled={testDisabled} 
          onClick={handleTestClick}
        >
          Arm
        </button>
        <button className="circle-btn" disabled={testDisabled} onClick={handleIgnition} >Fire</button>
      </div>

      {graphRunning && (
        <>
          <h2>Weight Graph</h2>
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={weightHistory}>
              <CartesianGrid stroke="#ccc" />
              <XAxis dataKey="time" />
              <YAxis domain={[-1000, 1000]}
              interval={0} 
      tickFormatter={(value) => `${value}`} 
      // ticks={[-1000, -900, -800, -700, -600, -500, -400, -300, -200, -100, 0,100,200,300,400,500,600,700,800,900,1000]}/
      />
              <Tooltip />
              <Line type="monotone" dataKey="weight" stroke="#00ff00" dot={false} isAnimationActive={false}
/>
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

export default App;
