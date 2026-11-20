import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AnpPage } from '../pages/AnpPage';
import { AuditLogPage } from '../pages/AuditLogPage';
import { CalendarPage } from '../pages/CalendarPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ForbiddenPage, NotFoundPage } from '../pages/ErrorPages';
import { InboxPage } from '../pages/InboxPage';
import { IntegrityIndexPage } from '../pages/IntegrityIndexPage';
import { KnowledgePage } from '../pages/KnowledgePage';
import { LoginPage } from '../pages/LoginPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RisksPage } from '../pages/RisksPage';
import { TrustBoxPage } from '../pages/TrustBoxPage';
import { UsersPage } from '../pages/UsersPage';
import { ROUTE_ROLES } from './config';
import { PrivateRoute } from './PrivateRoute';

const P = PrivateRoute;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<P allowedRoles={ROUTE_ROLES.dashboard}><AppLayout /></P>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<P allowedRoles={ROUTE_ROLES.dashboard}><DashboardPage /></P>} />
        <Route path="/anp" element={<P allowedRoles={ROUTE_ROLES.anp}><AnpPage /></P>} />
        <Route path="/integrity-index" element={<P allowedRoles={ROUTE_ROLES.integrity}><IntegrityIndexPage /></P>} />
        <Route path="/knowledge-base" element={<P allowedRoles={ROUTE_ROLES.knowledge}><KnowledgePage /></P>} />
        <Route path="/risks" element={<P allowedRoles={ROUTE_ROLES.risks}><RisksPage /></P>} />
        <Route path="/calendar" element={<P allowedRoles={ROUTE_ROLES.calendar}><CalendarPage /></P>} />
        <Route path="/trust-box" element={<P allowedRoles={ROUTE_ROLES.trustBox}><TrustBoxPage /></P>} />
        <Route path="/trust-box/inbox" element={<P allowedRoles={ROUTE_ROLES.inbox}><InboxPage /></P>} />
        <Route path="/users" element={<P allowedRoles={ROUTE_ROLES.users}><UsersPage /></P>} />
        <Route path="/audit-log" element={<P allowedRoles={ROUTE_ROLES.audit}><AuditLogPage /></P>} />
        <Route path="/profile" element={<P allowedRoles={ROUTE_ROLES.profile}><ProfilePage /></P>} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
