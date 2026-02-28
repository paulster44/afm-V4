import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (isRegistering) {
        // Mock registration with a delay
        setTimeout(() => {
            setSuccess('Registration successful! You can now log in.');
            setIsRegistering(false);
            setPassword('');
            setIsLoading(false);
        }, 1000);
    } else {
        try {
            await login(email, password);
            // On successful login, the App component will automatically re-render and show the main app.
            // No need to set loading to false here, as the component will unmount.
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            setIsLoading(false);
        }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-md">
        <div>
          <h2 className="text-3xl font-bold text-center text-white">
            {isRegistering ? 'Create an Account' : 'AFM Smart Contract Generator ✨'}
          </h2>
          <p className="mt-2 text-sm text-center text-gray-400">
            {isRegistering ? 'And start creating contracts today' : 'Sign in to your account'}
          </p>
          <div className="mt-4 text-xs text-center text-gray-400 bg-gray-900/50 p-3 rounded-md border border-gray-700">
            <p className="font-bold uppercase tracking-wider mb-1">Demo Credentials</p>
            <p>Admin: <span className="font-mono text-indigo-300">admin@preview.dev</span></p>
            <p>User: <span className="font-mono text-indigo-300">user@preview.dev</span></p>
            <p>Password: <span className="font-mono text-indigo-300">password</span></p>
          </div>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm">
            <div className="mb-4">
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address" name="email" type="email" autoComplete="email" required
                className="relative block w-full px-3 py-2 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password" name="password" type="password" autoComplete="current-password" required
                className="relative block w-full px-3 py-2 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-center text-red-400">{error}</p>}
          {success && <p className="text-sm text-center text-green-400">{success}</p>}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="relative flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md group hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : (isRegistering ? 'Sign Up' : 'Sign In')}
            </button>
          </div>
        </form>
         <div className="text-sm text-center">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError('');
                setSuccess('');
              }}
              className="font-medium text-indigo-400 hover:text-indigo-300"
            >
              {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
        </div>

        <div className="text-center text-xs text-gray-500 mt-6 pt-4 border-t border-gray-700">
            <p>Version 8.0 (Standalone Preview)</p>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;
