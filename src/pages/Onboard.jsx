import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import AvatarUpload from "../components/AvatarUpload.jsx";

function Onboard() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [response, setResponse] = useState(null);

  // Load existing avatar from localStorage on mount
  useEffect(() => {
    const savedAvatar = localStorage.getItem('userAvatar');
    if (savedAvatar) {
      setAvatar(savedAvatar);
    }
  }, []);

  const handleAvatarChange = (newAvatar) => {
    setAvatar(newAvatar);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await apiPost("onboard.php", { 
        name,
        avatar, // Include avatar in submission
      });
      setResponse(data);
    } catch (err) {
      console.error(err);
      setResponse({ error: err.message || "Request failed" });
    }
  };

  return (
    <div className="onboard-container">
      <h2 className="onboard-heading">Onboard</h2>
      <form onSubmit={handleSubmit} className="onboard-form">
        {/* Avatar Upload */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '12px' }}>
            Profile Picture
          </label>
          <AvatarUpload 
            currentAvatar={avatar}
            onAvatarChange={handleAvatarChange}
            size="xl"
          />
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px', textAlign: 'center' }}>
            Click to upload your profile picture
          </p>
        </div>

        <input
          type="text"
          placeholder="Enter name"
          className="onboard-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary">Submit</button>
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
