
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useNav } from '../../App';
import { Role, Section } from '../../types';
import { hasPermission } from '../../lib/permissions';

interface RoleGateProps {
  children: React.ReactNode;
  section?: Section;
  path?: string;
  fallback?: React.ReactNode;
}

const RoleGate: React.FC<RoleGateProps> = ({ children, section, path, fallback }) => {
  const { userRole } = useNav();

  const allowed = hasPermission(userRole as Role, section, path);

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
          Your current role ({userRole}) does not have permission to access this area. 
          Please contact an administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGate;
