import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import "./App.css";

function App() {
  const [loadCellOn, setLoadCellOn] = useState(true);
  const [checkedItems, setCheckedItems] = useState([false, false, false]);
  const [weight, setWeight] = useState(0);
  const [weightHistory, setWeightHistory] = useState([]); // store weight over time

  const ARDUINO_IP = "http://10.119.132.172"; 

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/weights.json');
        const data = await res.json();
        const timestamp = new Date().toLocaleTimeString();

        setWeight(data.weight);

        // Add new reading to history
        setWeightHistory(prev => [
          ...prev.slice(-49), // keep last 50 points
          { time: timestamp, weight: data.weight }
        ]);
      } catch (err) {
        console.error("Failed to fetch weight:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleCheck = (index) => {
    const newChecked = [...checkedItems];
    newChecked[index] = !newChecked[index];
    setCheckedItems(newChecked);
  };

  return (
    <div className="container">
      <h1 className="heading">Solitude Christopher</h1>

      <div className="load-cell-indicator">
        Load Cell: <span className={loadCellOn ? "on" : "off"}>{loadCellOn ? "ON" : "OFF"}</span>
      </div>

      <ul className="checklist">
        {["Distance", "Stopper", "Kissing sinchana"].map((item, index) => (
          <li key={index}>
            <label>
              <input type="checkbox" checked={checkedItems[index]} onChange={() => toggleCheck(index)} />
              {item}
            </label>
          </li>
        ))}
      </ul>

      <div className="buttons">
        <button className="circle-btn">Test</button>
        <button className="circle-btn">Run</button>
      </div>

      <h2>Weight Graph</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={weightHistory}>
          <CartesianGrid stroke="#ccc" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="weight" stroke="#00ff00" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default App;
