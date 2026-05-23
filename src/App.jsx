import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [updateMessage, setUpdateMessage] = useState("");
const version = "0.1.5";


  useEffect(() => {
    if (window.electronUpdater) {
      window.electronUpdater.onUpdateMessage((msg) => {
        setUpdateMessage(msg);
      });
    }
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        background: "#f5f6f8",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial"
      }}
    >
      <h1 style={{ fontSize: 48 }}>NAB Admin Dashboard</h1>

      <p style={{ fontSize: 22 }}>
        Running Version: {version}
      </p>

      {updateMessage && (
        <div
          style={{
            marginTop: 20,
            background: "#2563eb",
            padding: 20,
            borderRadius: 12
          }}
        >
          {updateMessage}
        </div>
      )}
    </div>
  );
}

export default App;