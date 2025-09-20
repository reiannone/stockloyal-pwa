import React, { useState } from "react";

function Onboard() {
  const [name, setName] = useState("");
  const [response, setResponse] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost/stockloyal/api/onboard.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      console.error(err);
      setResponse({ error: "Request failed" });
    }
  };

  return (
    <div className="onboard-container">
      <h2 className="onboard-heading">Onboard</h2>
      <form onSubmit={handleSubmit} className="onboard-form">
        <input
          type="text"
          placeholder="Enter name"
          className="onboard-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Submit
        </button>
      </form>
      {response && (
        <div className="onboard-response">
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default Onboard;
