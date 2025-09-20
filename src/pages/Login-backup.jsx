import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [mode, setMode] = useState('login');  // 'login' or 'create'
  const [memberId, setMemberId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false); // <-- added
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const endpoint = mode === 'login' ? 'login.php' : 'create-account.php';

    try {
      const res = await fetch(
        `http://localhost/stockloyal-pwa/api/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: memberId, password }),
        }
      );

      const data = await res.json();

      if (res.status === 401 || res.status === 409) {
        setError(data.error);
      } else if (res.ok && data.success) {
        navigate(mode === 'login' ? '/wallet' : '/select-broker');
      } else {
        setError(data.error || 'Unexpected error occurred');
      }
    } catch {
      setError('Network error');
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full sm:w-80 bg-white rounded-lg p-8 space-y-6 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            StockLoyal {mode === 'login' ? 'Login' : 'Create Account'}
          </h1>
          <button
            type="button"
            className="text-blue-500 mt-2 underline"
            onClick={() => {
              setError(null);
              setMode(mode === 'login' ? 'create' : 'login');
            }}
          >
            {mode === 'login' ? 'Create Account' : 'Back to Login'}
          </button>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium">Member ID</label>
            <input
              type="text"
              className="mt-1 w-full px-3 py-2 border rounded focus:ring focus:ring-blue-300"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className="mt-1 w-full px-3 py-2 border rounded pr-20 focus:ring focus:ring-blue-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-2 text-xs px-2 py-1 border rounded bg-gray-100"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
