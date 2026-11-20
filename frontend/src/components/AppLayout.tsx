import {
  AuditOutlined, BankOutlined, BarChartOutlined, BellOutlined, BookOutlined, CalendarOutlined, DashboardOutlined,
  InboxOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, SafetyCertificateOutlined, TeamOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Drawer, Dropdown, Empty, Grid, Layout, List, Menu, Popover, Space, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { fromNow } from '../lib/format';
import { ROLE_LABELS } from '../lib/labels';
import type { NotificationItem, Role } from '../lib/types';
import { ROUTE_ROLES } from '../routes/config';
import { useAuth } from '../store/auth';

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  { key: '/dashboard', label: 'Головна', icon: <DashboardOutlined />, roles: ROUTE_ROLES.dashboard },
  { key: '/anp', label: 'Контроль АНП', icon: <SafetyCertificateOutlined />, roles: ROUTE_ROLES.anp },
  { key: '/integrity-index', label: 'Integrity Index', icon: <BarChartOutlined />, roles: ROUTE_ROLES.integrity },
  { key: '/risks', label: 'Реєстр ризиків', icon: <WarningOutlined />, roles: ROUTE_ROLES.risks },
  { key: '/knowledge-base', label: 'База знань', icon: <BookOutlined />, roles: ROUTE_ROLES.knowledge },
  { key: '/calendar', label: 'Календар', icon: <CalendarOutlined />, roles: ROUTE_ROLES.calendar },
  { key: '/trust-box', label: 'Довіра і консультації', icon: <MessageOutlined />, roles: ROUTE_ROLES.trustBox },
  { key: '/trust-box/inbox', label: 'Вхідні звернення', icon: <InboxOutlined />, roles: ROUTE_ROLES.inbox },
  { key: '/users', label: 'Користувачі', icon: <TeamOutlined />, roles: ROUTE_ROLES.users },
  { key: '/audit-log', label: 'Журнал дій', icon: <AuditOutlined />, roles: ROUTE_ROLES.audit },
];

function Notifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ items: NotificationItem[]; unread: number }>('/notifications')).data,
    refetchInterval: 60_000,
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const open = async (n: NotificationItem) => {
    if (!n.isRead) await api.patch(`/notifications/${n.id}/read`);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    if (n.link) navigate(n.link);
  };

  const content = (
    <div style={{ width: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>Нагадування</Typography.Text>
        {Boolean(data?.unread) && (
          <Button size="small" type="link" onClick={() => readAll.mutate()}>
            Позначити всі прочитаними
          </Button>
        )}
      </div>
      {data?.items.length ? (
        <List
          size="small"
          style={{ maxHeight: 380, overflow: 'auto' }}
          dataSource={data.items}
          renderItem={(n) => (
            <List.Item style={{ cursor: 'pointer', paddingInline: 4, opacity: n.isRead ? 0.6 : 1 }} onClick={() => open(n)}>
              <List.Item.Meta
                title={<span style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13 }}>{n.title}</span>}
                description={
                  <span style={{ fontSize: 12 }}>
                    {n.body ? `${n.body} · ` : ''}
                    {fromNow(n.createdAt)}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нагадувань немає" />
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Badge count={data?.unread ?? 0} size="small" offset={[-2, 4]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Нагадування" />
      </Badge>
    </Popover>
  );
}

export function AppLayout() {
  const { user, clear } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.lg === false;
  const [menuOpen, setMenuOpen] = useState(false);
  // Після переходу на іншу сторінку мобільне меню закривається
  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return null;

  const items = NAV.filter((n) => n.roles.includes(user.role)).map((n) => ({
    key: n.key,
    icon: n.icon,
    label: <Link to={n.key}>{n.label}</Link>,
  }));
  const selected =
    NAV.map((n) => n.key)
      .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0] ?? '/dashboard';

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    clear();
    qc.clear();
    navigate('/login');
  };

  const brand = (
    <div className="brand">
      <BankOutlined style={{ fontSize: 22, color: '#e8b04a' }} />
      <div>
        <div className="brand-title">Антикорупційний портал</div>
        <div className="brand-sub">Університет</div>
      </div>
    </div>
  );
  const menu = <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={items} style={{ padding: '8px 6px', borderInlineEnd: 0 }} />;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Layout.Sider width={244} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
          {brand}
          {menu}
        </Layout.Sider>
      )}
      {isMobile && (
        <Drawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          placement="left"
          width={264}
          closable={false}
          styles={{ body: { padding: 0, background: '#14263d' } }}
        >
          {brand}
          {menu}
        </Drawer>
      )}
      <Layout style={{ minWidth: 0 }}>
        <Layout.Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            borderBottom: '1px solid #e2dfd8',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: isMobile ? '0 8px' : undefined,
          }}
        >
          <div>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined style={{ fontSize: 18 }} />} aria-label="Меню" onClick={() => setMenuOpen(true)} />
            )}
          </div>
          <Space size={isMobile ? 4 : 16} style={{ minWidth: 0 }}>
            <Notifications />
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'profile', icon: <UserOutlined />, label: <Link to="/profile">Профіль</Link> },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'Вийти', onClick: logout },
                ],
              }}
            >
              <Button type="text" style={{ height: 'auto', textAlign: 'right', lineHeight: 1.25, padding: '4px 8px', maxWidth: isMobile ? 220 : 420 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.fullName}</div>
                <div style={{ fontSize: 12, color: '#6b6760', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ROLE_LABELS[user.role]}
                  {user.department && !isMobile ? `, ${user.department.name}` : ''}
                </div>
              </Button>
            </Dropdown>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: isMobile ? 16 : 24, maxWidth: 1360, width: '100%', margin: '0 auto', minWidth: 0 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
