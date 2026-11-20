import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { fmtDate } from '../lib/format';
import { ROLE_LABELS } from '../lib/labels';
import type { Department, Role, UserRow } from '../lib/types';
import { useAuth } from '../store/auth';

const DEPT_ROLES: Role[] = ['INSTITUTE_DIRECTOR', 'RESPONSIBLE_PERSON'];

const userSchema = (isNew: boolean) =>
  z
    .object({
      email: z.string().trim().email('Некоректний email'),
      fullName: z.string().trim().min(3, 'Вкажіть ПІБ').max(200),
      role: z.enum(['ADMIN', 'COMPLIANCE_OFFICER', 'RECTORATE', 'INSTITUTE_DIRECTOR', 'RESPONSIBLE_PERSON']),
      departmentId: z.string().nullable().optional(),
      password: isNew
        ? z.string().min(10, 'Щонайменше 10 символів')
        : z.union([z.literal(''), z.string().min(10, 'Щонайменше 10 символів')]).optional(),
    })
    .refine((v) => !DEPT_ROLES.includes(v.role) || Boolean(v.departmentId), { path: ['departmentId'], message: 'Для цієї ролі потрібен підрозділ' });
type UserValues = z.infer<ReturnType<typeof userSchema>>;

function UserModal({ open, item, departments, onClose }: { open: boolean; item: UserRow | null; departments: Department[]; onClose: () => void }) {
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<UserValues>({ resolver: zodResolver(userSchema(!item)) });
  const role = useWatch({ control, name: 'role' });
  useEffect(() => {
    if (open) reset(item ? { email: item.email, fullName: item.fullName, role: item.role, departmentId: item.departmentId, password: '' } : { email: '', fullName: '', role: 'RESPONSIBLE_PERSON', departmentId: null, password: '' });
  }, [open, item, reset]);
  const save = useMutation({
    mutationFn: (v: UserValues) => {
      const departmentId = DEPT_ROLES.includes(v.role) ? v.departmentId : (v.departmentId ?? null);
      if (item) return api.patch<unknown>(`/users/${item.id}`, { fullName: v.fullName, role: v.role, departmentId, ...(v.password ? { password: v.password } : {}) } as object);
      return api.post<unknown>(`/users`, { ...v, departmentId } as object);
    },
    onSuccess: () => { message.success('Збережено'); qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const roles = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== 'ADMIN' || me.role === 'ADMIN');

  return (
    <Modal open={open} title={item ? 'Редагування користувача' : 'Новий користувач'} okText="Зберегти" cancelText="Скасувати" onCancel={onClose}
      onOk={handleSubmit((v) => save.mutate(v))} confirmLoading={save.isPending} destroyOnHidden>
      <Form layout="vertical">
        <Field control={control} name="fullName" label="ПІБ" required render={(f) => <Input {...f} />} />
        <Field control={control} name="email" label="Email" required render={(f) => <Input {...f} disabled={Boolean(item)} />} />
        <Field control={control} name="role" label="Роль" required render={(f) => <Select {...f} options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />} />
        <Field control={control} name="departmentId" label="Підрозділ" required={DEPT_ROLES.includes(role)} render={(f) => (
          <Select {...f} allowClear showSearch optionFilterProp="label" placeholder="Не обрано" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        )} />
        <Field control={control} name="password" label={item ? 'Новий пароль' : 'Пароль'} required={!item}
          extra={item ? 'Залиште порожнім, щоб не змінювати. Зміна пароля завершить сесії користувача.' : 'Щонайменше 10 символів. Передайте користувачу безпечним каналом.'}
          render={(f) => <Input.Password {...f} autoComplete="new-password" />} />
      </Form>
    </Modal>
  );
}

function Departments() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const list = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get<Department[]>('/departments')).data });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['departments'] });
  const create = useMutation({ mutationFn: () => api.post('/departments', { name }), onSuccess: () => { setName(''); invalidate(); }, onError: (e) => message.error(errorMessage(e)) });
  const rename = useMutation({ mutationFn: () => api.patch(`/departments/${editing!.id}`, { name: editing!.name }), onSuccess: () => { setEditing(null); invalidate(); }, onError: (e) => message.error(errorMessage(e)) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/departments/${id}`), onSuccess: invalidate, onError: (e) => message.error(errorMessage(e)) });
  return (
    <>
      <Space.Compact style={{ marginBottom: 12, width: 480, maxWidth: '100%' }}>
        <Input placeholder="Назва нового підрозділу" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={() => name.trim().length > 1 && create.mutate()} />
        <Button type="primary" disabled={name.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>Додати</Button>
      </Space.Compact>
      <Table<Department>
            scroll={{ x: 600 }}
        rowKey="id" loading={list.isLoading} dataSource={list.data} pagination={false}
        columns={[
          { title: 'Підрозділ', dataIndex: 'name', render: (v: string, r) => (editing?.id === r.id ? (
            <Space.Compact><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /><Button type="primary" onClick={() => rename.mutate()}>Зберегти</Button><Button onClick={() => setEditing(null)}>Скасувати</Button></Space.Compact>
          ) : v) },
          { title: 'Користувачів', width: 130, align: 'right', render: (_: unknown, r) => <span className="num">{r._count?.users ?? 0}</span> },
          { title: 'Пунктів АНП', width: 130, align: 'right', render: (_: unknown, r) => <span className="num">{r._count?.anpItems ?? 0}</span> },
          { title: '', width: 180, align: 'right', render: (_: unknown, r) => (
            <Space>
              <Button size="small" onClick={() => setEditing({ id: r.id, name: r.name })}>Перейменувати</Button>
              <Popconfirm title="Видалити підрозділ?" okText="Так" cancelText="Ні" onConfirm={() => remove.mutate(r.id)}><Button size="small" danger>Видалити</Button></Popconfirm>
            </Space>
          ) },
        ]}
      />
    </>
  );
}

export function UsersPage() {
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [role, setRole] = useState<Role | undefined>();
  const [editing, setEditing] = useState<{ open: boolean; item: UserRow | null }>({ open: false, item: null });
  const users = useQuery({ queryKey: ['users', role], queryFn: async () => (await api.get<UserRow[]>('/users', { params: { role } })).data });
  const departments = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get<Department[]>('/departments')).data });
  const toggle = useMutation({
    mutationFn: (u: UserRow) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Користувачі та підрозділи" description="Облікові записи створюються вручну. Самостійної реєстрації немає."
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ open: true, item: null })}>Новий користувач</Button>} />
      <div className="panel" style={{ padding: '4px 20px 20px' }}>
        <Tabs items={[
          {
            key: 'users', label: 'Користувачі', children: (
              <>
                <Select allowClear placeholder="Усі ролі" style={{ width: 240, marginBottom: 12 }} value={role} onChange={setRole}
                  options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
                <Table<UserRow>
            scroll={{ x: 820 }}
                  rowKey="id" loading={users.isLoading} dataSource={users.data} pagination={{ pageSize: 25, hideOnSinglePage: true }}
                  columns={[
                    { title: 'ПІБ', dataIndex: 'fullName', render: (v: string, r) => <><div style={{ fontWeight: 500, opacity: r.isActive ? 1 : 0.5 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{r.email}</div></> },
                    { title: 'Роль', dataIndex: 'role', width: 200, render: (r: Role) => <Tag>{ROLE_LABELS[r]}</Tag> },
                    { title: 'Підрозділ', width: 260, render: (_: unknown, r) => r.department?.name ?? <span className="muted">не призначено</span> },
                    { title: 'Створено', dataIndex: 'createdAt', width: 110, render: (v: string) => <span className="num muted">{fmtDate(v)}</span> },
                    { title: 'Активний', width: 100, render: (_: unknown, r) => (
                      <Switch size="small" checked={r.isActive} disabled={r.id === me.id || (r.role === 'ADMIN' && me.role !== 'ADMIN')} onChange={() => toggle.mutate(r)} />
                    ) },
                    { title: '', width: 56, render: (_: unknown, r) => (
                      <Button size="small" icon={<EditOutlined />} aria-label="Змінити" disabled={r.role === 'ADMIN' && me.role !== 'ADMIN'} onClick={() => setEditing({ open: true, item: r })} />
                    ) },
                  ]}
                />
              </>
            ),
          },
          { key: 'departments', label: 'Підрозділи', children: <Departments /> },
        ]} />
      </div>
      <UserModal open={editing.open} item={editing.item} departments={departments.data ?? []} onClose={() => setEditing({ open: false, item: null })} />
    </>
  );
}
