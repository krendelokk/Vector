import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Descriptions, Form, Input, Row, Space, Typography } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { ROLE_LABELS } from '../lib/labels';
import { useAuth } from '../store/auth';

const pwdSchema = z
  .object({
    currentPassword: z.string().min(1, 'Вкажіть поточний пароль'),
    newPassword: z.string().min(10, 'Щонайменше 10 символів'),
    repeat: z.string(),
  })
  .refine((v) => v.newPassword === v.repeat, { path: ['repeat'], message: 'Паролі не збігаються' });
type PwdValues = z.infer<typeof pwdSchema>;

function TelegramLink() {
  const { user, setUser } = useAuth();
  const { message } = App.useApp();
  const [code, setCode] = useState<{ code: string; botUsername: string | null; botEnabled: boolean } | null>(null);
  const gen = useMutation({ mutationFn: () => api.post('/telegram/link-code'), onSuccess: (r) => setCode(r.data), onError: (e) => message.error(errorMessage(e)) });
  const unlink = useMutation({
    mutationFn: () => api.delete('/telegram/link'),
    onSuccess: () => { setUser({ ...user!, telegramLinked: false }); message.success('Telegram відв\'язано'); },
  });
  return (
    <Card title="Telegram-бот для файлів опитувань">
      <Typography.Paragraph type="secondary">
        Бот приймає CSV або XLSX з Google Forms і одразу імпортує їх від вашого імені. Сповіщень бот не надсилає.
      </Typography.Paragraph>
      {user!.telegramLinked && <Alert type="success" showIcon message="Чат Telegram прив'язано" style={{ marginBottom: 12 }} />}
      {code && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={<>Надішліть боту {code.botUsername ? <strong>@{code.botUsername}</strong> : ''} команду <code>/link {code.code}</code></>}
          description={code.botEnabled ? 'Код дійсний 10 хвилин.' : 'Бот зараз вимкнено на сервері (не задано TELEGRAM_BOT_TOKEN).'} />
      )}
      <Space>
        <Button onClick={() => gen.mutate()} loading={gen.isPending}>Отримати код прив'язки</Button>
        {user!.telegramLinked && <Button danger onClick={() => unlink.mutate()}>Відв'язати</Button>}
      </Space>
    </Card>
  );
}

export function ProfilePage() {
  const user = useAuth((s) => s.user)!;
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<PwdValues>({ resolver: zodResolver(pwdSchema), defaultValues: { currentPassword: '', newPassword: '', repeat: '' } });
  const change = useMutation({
    mutationFn: (v: PwdValues) => api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => { message.success('Пароль змінено'); reset(); },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Профіль" />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Обліковий запис">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="ПІБ">{user.fullName}</Descriptions.Item>
              <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
              <Descriptions.Item label="Роль">{ROLE_LABELS[user.role]}</Descriptions.Item>
              {user.department && <Descriptions.Item label="Підрозділ">{user.department.name}</Descriptions.Item>}
            </Descriptions>
          </Card>
          {user.role === 'COMPLIANCE_OFFICER' && <div style={{ marginTop: 16 }}><TelegramLink /></div>}
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Зміна пароля">
            <Form layout="vertical" style={{ maxWidth: 380 }}>
              <Field control={control} name="currentPassword" label="Поточний пароль" render={(f) => <Input.Password {...f} autoComplete="current-password" />} />
              <Field control={control} name="newPassword" label="Новий пароль" render={(f) => <Input.Password {...f} autoComplete="new-password" />} />
              <Field control={control} name="repeat" label="Повторіть новий пароль" render={(f) => <Input.Password {...f} autoComplete="new-password" />} />
              <Button type="primary" loading={change.isPending} onClick={handleSubmit((v) => change.mutate(v))}>Змінити пароль</Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </>
  );
}
