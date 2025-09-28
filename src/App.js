import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import "./App.css";

function App() {
  const [loadCellOn, setLoadCellOn] = useState('PENDING');
   const [fetchInProgress, setFetchInProgress] = useState(false);
  const [checkedItems, setCheckedItems] = useState([false, false, false]);
  const [weight, setWeight] = useState(0);
  const [weightHistory, setWeightHistory] = useState([]); // store weight over time
  const [graphRunning, setGraphRunning] = useState(false); // start graph on test click
  const [testDisabled, setTestDisabled] = useState(true)
  const ARDUINO_IP = "http://10.119.132.172"; 

  // Poll Arduino to check if it's online and get current weight
useEffect(() => {
    let cancelled = false;

    const pollWeight = async () => {
      if (cancelled) return;

      try {
        const res = await fetch(ARDUINO_IP);
        if (!res.ok) throw new Error("No response");

        const data = await res.json();
        setWeight(data.weight);

        const timestamp = new Date().toLocaleTimeString();
        setWeightHistory(prev => [
          ...prev.slice(-49),
          { time: timestamp, weight: data.weight }
        ]);

        setLoadCellOn("ON");
      } catch (err) {
        console.error("Failed fetch:", err);
        setLoadCellOn('OFF')
      } finally {
        if (!cancelled) setTimeout(pollWeight, 1000); // next fetch after previous finishes
      }
    };
    pollWeight();
    return () => { cancelled = true; };
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
      ticks={[-1000, -900, -800, -700, -600, -500, -400, -300, -200, -100, 0,100,200,300,400,500,600,700,800,900,1000]}/>
              <Tooltip />
              <Line type="monotone" dataKey="weight" stroke="#00ff00" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

export default App;
