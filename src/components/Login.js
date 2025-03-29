// e.g. in App.js or a dedicated Login component
import React from 'react';

function GoogleSignInButton() {
  const handleSignIn = () => {
    window.location.href = 'http://localhost:3001/auth/google';
  };

  return (
    <button onClick={handleSignIn}>
      Sign in with Google
    </button>
  );
}

export default GoogleSignInButton;
