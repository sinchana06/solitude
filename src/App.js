import React, { useState } from 'react';
import './App.css';
import MotorTestView from './components/MotorTestView.js';
import PayloadView from './components/PayloadView.js';

function App() {
  const [activeModule, setActiveModule] = useState(null);

  const openModule = (moduleName) => {
    setActiveModule(moduleName);
  };

  const goBack = () => setActiveModule(null);

  return (
    <div className="container">
      <h1 className="heading">Solitude Christopher</h1>

      {/* Back Button visible only when in full view */}
      {activeModule && (
        <button className="back-button" onClick={goBack}>
          ← Back
        </button>
      )}

      <div className={`module-container ${activeModule ? 'expanded' : ''}`}>
        {/* Motor Test View */}
        <div
          className={`sub-container ${
            activeModule === 'motor' ? 'full-view' : activeModule ? 'hidden' : ''
          }`}
          onClick={() => openModule('motor')}
        >
          <MotorTestView />
        </div>

        {/* Payload View */}
        <div
          className={`sub-container ${
            activeModule === 'payload' ? 'full-view' : activeModule ? 'hidden' : ''
          }`}
          onClick={() => openModule('payload')}
        >
          <PayloadView />
        </div>
      </div>
    </div>
  );
}

export default App;
