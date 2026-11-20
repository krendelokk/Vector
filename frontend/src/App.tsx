import { Spin } from 'antd';
import { useEffect } from 'react';
import { refreshSession } from './api/client';
import { AppRoutes } from './routes/AppRoutes';
import { useAuth } from './store/auth';

export function App() {
  const { initialized, markInitialized } = useAuth();

  // Відновлення сесії після перезавантаження сторінки через httpOnly refresh-cookie
  useEffect(() => {
    refreshSession().finally(markInitialized);
  }, [markInitialized]);

  if (!initialized) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  return <AppRoutes />;
}
