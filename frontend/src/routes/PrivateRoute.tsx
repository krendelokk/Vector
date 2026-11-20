import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../lib/types';
import { useAuth } from '../store/auth';

export function PrivateRoute({ allowedRoles, children }: { allowedRoles: Role[]; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
