/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import Dashboard from './pages/admin/Dashboard';
import SurveyBuilder from './pages/admin/SurveyBuilder';
import Analytics from './pages/admin/Analytics';
import PublicSurvey from './pages/public/PublicSurvey';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import { Loader2, ShieldAlert } from 'lucide-react';
import { ADMIN_EMAILS } from './constants';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#E4E3E0]">
        <Loader2 className="animate-spin text-[#141414]" size={48} />
      </div>
    );
  }

  const isAdmin = user && ADMIN_EMAILS.includes(user.email || '');

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Route for Surveys */}
        <Route path="/s/:surveyId" element={<PublicSurvey />} />
        
        {/* Auth Route */}
        <Route path="/login" element={user ? (isAdmin ? <Navigate to="/admin" /> : <Unauthorized />) : <Login />} />
        
        {/* Admin Protected Routes */}
        <Route path="/admin" element={isAdmin ? <AdminLayout /> : (user ? <Unauthorized /> : <Navigate to="/login" />)}>
          <Route index element={<Dashboard />} />
          <Route path="builder" element={<SurveyBuilder />} />
          <Route path="builder/:id" element={<SurveyBuilder />} />
          <Route path="analytics/:id" element={<Analytics />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/admin" />} />
      </Routes>
    </BrowserRouter>
  );
}

function Unauthorized() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#f1f5f9] p-6">
      <div className="max-w-md w-full bento-card p-12 flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 bg-[#f43f5e] text-white flex items-center justify-center rounded-2xl shadow-lg ring-8 ring-[#fff1f2]">
          <ShieldAlert size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] mb-2 tracking-tight">Access Denied</h1>
          <p className="text-sm font-bold text-[#64748b]">
            Your account ({auth.currentUser?.email}) is not authorized to access the admin panel.
          </p>
        </div>
        <button 
          onClick={() => auth.signOut()}
          className="btn-secondary w-full justify-center py-3"
        >
          Sign Out & Try Another Account
        </button>
      </div>
    </div>
  );
}

