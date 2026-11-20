import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { useAuth } from '../store/auth';

const schema = z.object({
  email: z.string().trim().min(1, 'Вкажіть email').email('Некоректний email'),
  password: z.string().min(1, 'Вкажіть пароль'),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/login', v);
      setSession(data.accessToken, data.user);
      navigate((location.state as { from?: string })?.from ?? '/dashboard', { replace: true });
    } catch (e) {
      setError(errorMessage(e, 'Не вдалося увійти'));
    }
  };

  return (
    <div className="login-wrap">
      <aside className="login-side">
        <div>
          <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden>
            <path d="M16 4l10 3.5v7c0 6.2-4.2 11.4-10 13.5C10.2 25.9 6 20.7 6 14.5v-7z" fill="none" stroke="#e8b04a" strokeWidth="1.8" />
            <path d="M11.5 15.5l3.2 3.2 5.8-6.7" fill="none" stroke="#fff" strokeWidth="1.8" />
          </svg>
          <h2>Антикорупційний портал університету</h2>
          <p style={{ lineHeight: 1.6, maxWidth: 380 }}>
            Виконання Антикорупційної програми, результати опитувань, реєстр ризиків і захищений канал для повідомлень.
          </p>
        </div>
        <div style={{ fontSize: 12.5, color: '#93a1b3', lineHeight: 1.6 }}>
          Повідомити про порушення можна анонімно: після входу відкрийте розділ "Довіра і консультації".
        </div>
      </aside>
      <main className="login-main">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>Вхід</Typography.Title>
          <Typography.Paragraph type="secondary">Обліковий запис видає уповноважений або адміністратор.</Typography.Paragraph>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
          <Form layout="vertical" onFinish={handleSubmit(onSubmit)} requiredMark={false}>
            <Field control={control} name="email" label="Email" render={(f) => <Input {...f} autoComplete="username" size="large" autoFocus />} />
            <Field control={control} name="password" label="Пароль" render={(f) => <Input.Password {...f} autoComplete="current-password" size="large" />} />
            <Button type="primary" htmlType="submit" block size="large" loading={formState.isSubmitting}>
              Увійти
            </Button>
          </Form>
        </div>
      </main>
    </div>
  );
}
