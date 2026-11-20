import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App, Button, Col, DatePicker, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Radio, Row, Select, Space, Table, Tag, Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, downloadFile, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { FilePicker } from '../components/FilePicker';
import { PageHeader, Stat } from '../components/PageHeader';
import { dayjs, fmtDate, fmtDateTime } from '../lib/format';
import { ANP_STATUS } from '../lib/labels';
import type { AnpItem, AnpStats, AnpStatus, Department, UserRow } from '../lib/types';
import { useAuth } from '../store/auth';

const itemSchema = z.object({
  title: z.string().trim().min(3, 'Щонайменше 3 символи').max(500),
  description: z.string().max(5000).optional(),
  deadline: z.any().refine((v) => v && dayjs(v).isValid(), 'Вкажіть дедлайн'),
  departmentId: z.string({ message: 'Оберіть підрозділ' }).min(1, 'Оберіть підрозділ'),
  responsibleId: z.string({ message: 'Оберіть відповідальну особу' }).min(1, 'Оберіть відповідальну особу'),
});
type ItemValues = z.infer<typeof itemSchema>;

const reportSchema = z.object({
  reportText: z.string().trim().min(10, 'Опишіть виконання хоча б кількома реченнями').max(20000),
  file: z.any().optional(),
});
type ReportValues = z.infer<typeof reportSchema>;

const reviewSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), comment: z.string().max(5000).optional() })
  .refine((v) => v.decision === 'APPROVE' || (v.comment ?? '').trim().length > 0, {
    path: ['comment'],
    message: 'Поясніть, що потрібно доопрацювати',
  });
type ReviewValues = z.infer<typeof reviewSchema>;

function ItemModal({ open, item, onClose }: { open: boolean; item: AnpItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const departments = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get<Department[]>('/departments')).data });
  const { control, handleSubmit, reset, setValue, formState } = useForm<ItemValues>({ resolver: zodResolver(itemSchema) });
  const departmentId = useWatch({ control, name: 'departmentId' });
  const people = useQuery({
    queryKey: ['users', 'dept', departmentId],
    enabled: Boolean(departmentId),
    queryFn: async () => (await api.get<UserRow[]>('/users', { params: { departmentId } })).data,
  });

  useEffect(() => {
    if (open)
      reset(
        item
          ? { title: item.title, description: item.description ?? '', deadline: dayjs(item.deadline), departmentId: item.departmentId, responsibleId: item.responsibleId }
          : { title: '', description: '', deadline: undefined, departmentId: undefined as any, responsibleId: undefined as any },
      );
  }, [open, item, reset]);

  const save = useMutation({
    mutationFn: (v: ItemValues) => {
      const body = { ...v, deadline: dayjs(v.deadline).endOf('day').toISOString() };
      return item ? api.patch(`/anp/items/${item.id}`, body) : api.post('/anp/items', body);
    },
    onSuccess: () => {
      message.success(item ? 'Пункт оновлено' : 'Пункт додано');
      qc.invalidateQueries({ queryKey: ['anp'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const eligible = (people.data ?? []).filter((u) => u.isActive && (u.role === 'RESPONSIBLE_PERSON' || u.role === 'INSTITUTE_DIRECTOR'));

  return (
    <Modal open={open} title={item ? 'Редагування пункту' : 'Новий пункт АНП'} onCancel={onClose} okText="Зберегти" cancelText="Скасувати"
      onOk={handleSubmit((v) => save.mutate(v))} confirmLoading={save.isPending || formState.isSubmitting} width={640} destroyOnHidden>
      <Form layout="vertical">
        <Field control={control} name="title" label="Назва заходу" required render={(f) => <Input {...f} />} />
        <Field control={control} name="description" label="Опис" render={(f) => <Input.TextArea {...f} rows={3} />} />
        <Row gutter={12}>
          <Col span={12}>
            <Field control={control} name="departmentId" label="Підрозділ" required render={(f) => (
              <Select {...f} showSearch optionFilterProp="label" placeholder="Оберіть"
                onChange={(v) => { f.onChange(v); setValue('responsibleId', undefined as any); }}
                options={departments.data?.map((d) => ({ value: d.id, label: d.name }))} />
            )} />
          </Col>
          <Col span={12}>
            <Field control={control} name="deadline" label="Дедлайн" required render={(f) => (
              <DatePicker {...f} format="DD.MM.YYYY" style={{ width: '100%' }} placeholder="Оберіть дату" />
            )} />
          </Col>
        </Row>
        <Field control={control} name="responsibleId" label="Відповідальна особа" required
          extra={departmentId && !people.isLoading && !eligible.length ? 'У підрозділі немає відповідальних осіб. Додайте їх у розділі "Користувачі".' : undefined}
          render={(f) => (
            <Select {...f} disabled={!departmentId} loading={people.isLoading} placeholder={departmentId ? 'Оберіть' : 'Спочатку оберіть підрозділ'}
              options={eligible.map((u) => ({ value: u.id, label: `${u.fullName}${u.role === 'INSTITUTE_DIRECTOR' ? ' (директор)' : ''}` }))} />
          )} />
      </Form>
    </Modal>
  );
}

function ReportModal({ item, onClose }: { item: AnpItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ReportValues>({ resolver: zodResolver(reportSchema) });
  useEffect(() => { if (item) reset({ reportText: item.reportText ?? '', file: null }); }, [item, reset]);

  const submit = useMutation({
    mutationFn: (v: ReportValues) => {
      const fd = new FormData();
      fd.append('reportText', v.reportText);
      if (v.file) fd.append('file', v.file);
      return api.patch(`/anp/items/${item!.id}/submit`, fd);
    },
    onSuccess: () => {
      message.success('Звіт надіслано на перевірку');
      qc.invalidateQueries({ queryKey: ['anp'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal open={Boolean(item)} title="Звіт про виконання" onCancel={onClose} okText="Надіслати на перевірку" cancelText="Скасувати"
      onOk={handleSubmit((v) => submit.mutate(v))} confirmLoading={submit.isPending} width={640} destroyOnHidden>
      {item && <Typography.Paragraph strong>{item.title}</Typography.Paragraph>}
      {item?.reviewComment && (
        <Typography.Paragraph type="warning">Коментар уповноваженого: {item.reviewComment}</Typography.Paragraph>
      )}
      <Form layout="vertical">
        <Field control={control} name="reportText" label="Що зроблено" required render={(f) => <Input.TextArea {...f} rows={6} placeholder="Опишіть виконані дії, дати, документи-підтвердження" />} />
        <Field control={control} name="file" label="Підтвердний документ" extra="PDF, DOCX, XLSX, CSV, JPG, PNG до 20 МБ"
          render={(f) => <FilePicker value={f.value} onChange={f.onChange} onError={(m) => message.error(m)} />} />
      </Form>
    </Modal>
  );
}

function ReviewModal({ item, onClose }: { item: AnpItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: { decision: 'APPROVE', comment: '' } });
  useEffect(() => { if (item) reset({ decision: 'APPROVE', comment: '' }); }, [item, reset]);
  const review = useMutation({
    mutationFn: (v: ReviewValues) => api.patch(`/anp/items/${item!.id}/review`, v),
    onSuccess: (_r, v) => {
      message.success(v.decision === 'APPROVE' ? 'Звіт затверджено' : 'Звіт повернуто на доопрацювання');
      qc.invalidateQueries({ queryKey: ['anp'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal open={Boolean(item)} title="Рішення щодо звіту" onCancel={onClose} okText="Зберегти рішення" cancelText="Скасувати"
      onOk={handleSubmit((v) => review.mutate(v))} confirmLoading={review.isPending} destroyOnHidden>
      <Form layout="vertical">
        <Field control={control} name="decision" render={(f) => (
          <Radio.Group {...f} onChange={(e) => f.onChange(e.target.value)} optionType="button" buttonStyle="solid"
            options={[{ value: 'APPROVE', label: 'Затвердити' }, { value: 'REJECT', label: 'Повернути на доопрацювання' }]} />
        )} />
        <Field control={control} name="comment" label="Коментар" render={(f) => <Input.TextArea {...f} rows={4} />} />
      </Form>
    </Modal>
  );
}

export function AnpPage() {
  const user = useAuth((s) => s.user)!;
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as AnpStatus | null) ?? undefined;
  const departmentId = params.get('department') ?? undefined;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ open: boolean; item: AnpItem | null }>({ open: false, item: null });
  const [reporting, setReporting] = useState<AnpItem | null>(null);
  const [reviewing, setReviewing] = useState<AnpItem | null>(null);

  const isOfficer = user.role === 'COMPLIANCE_OFFICER';
  const seesAll = isOfficer || user.role === 'RECTORATE';

  const items = useQuery({
    queryKey: ['anp', 'items', status, departmentId, search],
    queryFn: async () => (await api.get<AnpItem[]>('/anp/items', { params: { status, departmentId, search: search || undefined } })).data,
  });
  const stats = useQuery({ queryKey: ['anp', 'stats'], queryFn: async () => (await api.get<AnpStats>('/anp/stats')).data });
  const departments = useQuery({ queryKey: ['departments'], enabled: seesAll, queryFn: async () => (await api.get<Department[]>('/departments')).data });

  const openId = params.get('item');
  const opened = useMemo(() => items.data?.find((i) => i.id === openId) ?? null, [items.data, openId]);
  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/anp/items/${id}`),
    onSuccess: () => { message.success('Пункт видалено'); setParam('item'); qc.invalidateQueries({ queryKey: ['anp'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });

  const canReport = (i: AnpItem) => i.responsibleId === user.id && ['PENDING', 'REJECTED', 'OVERDUE'].includes(i.status);
  const now = dayjs();

  const t = stats.data?.total;
  return (
    <>
      <PageHeader
        title="Контроль виконання АНП"
        description={
          user.role === 'RESPONSIBLE_PERSON'
            ? 'Пункти Антикорупційної програми, закріплені за вами. Подайте звіт до дедлайну.'
            : user.role === 'INSTITUTE_DIRECTOR'
              ? 'Пункти Антикорупційної програми вашого підрозділу.'
              : 'Пункти Антикорупційної програми по всьому університету.'
        }
        extra={isOfficer && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ open: true, item: null })}>Додати пункт</Button>}
      />

      {t && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Stat label="Усього пунктів" value={t.total} /></Col>
          <Col xs={12} md={6}><Stat label="Виконано" value={`${t.completionRate}%`} note={`${t.APPROVED} затверджено`} /></Col>
          <Col xs={12} md={6}><Stat label="На перевірці" value={t.SUBMITTED} /></Col>
          <Col xs={12} md={6}><Stat label="Прострочено" value={t.OVERDUE} tone={t.OVERDUE ? 'danger' : undefined} /></Col>
        </Row>
      )}

      <div className="panel" style={{ padding: 16 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="Пошук за назвою" allowClear onSearch={setSearch} style={{ width: 260 }} />
          <Select allowClear placeholder="Усі статуси" value={status} style={{ width: 200 }} onChange={(v) => setParam('status', v)}
            options={Object.entries(ANP_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          {seesAll && (
            <Select allowClear showSearch optionFilterProp="label" placeholder="Усі підрозділи" value={departmentId} style={{ width: 280 }}
              onChange={(v) => setParam('department', v)} options={departments.data?.map((d) => ({ value: d.id, label: d.name }))} />
          )}
        </Space>

        <Table<AnpItem>
            scroll={{ x: 900 }}
          rowKey="id"
          loading={items.isLoading}
          dataSource={items.data}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => setParam('item', r.id), style: { cursor: 'pointer' } })}
          rowClassName={(r) => {
            if (r.status === 'APPROVED' || r.status === 'SUBMITTED') return '';
            if (r.status === 'OVERDUE' || dayjs(r.deadline).isBefore(now)) return 'row-overdue';
            return dayjs(r.deadline).diff(now, 'day') <= 7 ? 'row-soon' : '';
          }}
          columns={[
            { title: 'Захід', dataIndex: 'title', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
            ...(user.role !== 'RESPONSIBLE_PERSON' ? [{ title: 'Підрозділ', render: (_: unknown, r: AnpItem) => r.department.name, width: 230 }] : []),
            ...(user.role !== 'RESPONSIBLE_PERSON' ? [{ title: 'Відповідальна особа', render: (_: unknown, r: AnpItem) => r.responsible.fullName, width: 220 }] : []),
            { title: 'Дедлайн', dataIndex: 'deadline', width: 120, render: (v: string) => <span className="num">{fmtDate(v)}</span>, sorter: (a, b) => +new Date(a.deadline) - +new Date(b.deadline) },
            { title: 'Статус', dataIndex: 'status', width: 160, render: (s: AnpStatus) => <Tag color={ANP_STATUS[s].color}>{ANP_STATUS[s].label}</Tag> },
            {
              title: '', width: 150, align: 'right',
              render: (_: unknown, r: AnpItem) => (
                <Space onClick={(e) => e.stopPropagation()}>
                  {canReport(r) && <Button size="small" type="primary" onClick={() => setReporting(r)}>Подати звіт</Button>}
                  {isOfficer && r.status === 'SUBMITTED' && <Button size="small" type="primary" onClick={() => setReviewing(r)}>Перевірити</Button>}
                </Space>
              ),
            },
          ]}
        />
      </div>

      <Drawer open={Boolean(opened)} width={560} onClose={() => setParam('item')} title={opened?.title}
        extra={isOfficer && opened && (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => setEditing({ open: true, item: opened })}>Змінити</Button>
            <Popconfirm title="Видалити пункт?" okText="Видалити" cancelText="Ні" onConfirm={() => remove.mutate(opened.id)}>
              <Button danger icon={<DeleteOutlined />} aria-label="Видалити" />
            </Popconfirm>
          </Space>
        )}>
        {opened && (
          <>
            <Descriptions column={1} size="small" bordered styles={{ label: { width: 170 } }}>
              <Descriptions.Item label="Статус"><Tag color={ANP_STATUS[opened.status].color}>{ANP_STATUS[opened.status].label}</Tag></Descriptions.Item>
              <Descriptions.Item label="Дедлайн">{fmtDate(opened.deadline)}</Descriptions.Item>
              <Descriptions.Item label="Підрозділ">{opened.department.name}</Descriptions.Item>
              <Descriptions.Item label="Відповідальна особа">{opened.responsible.fullName}</Descriptions.Item>
              {opened.description && <Descriptions.Item label="Опис"><span className="pre">{opened.description}</span></Descriptions.Item>}
              {opened.submittedAt && <Descriptions.Item label="Звіт подано">{fmtDateTime(opened.submittedAt)}</Descriptions.Item>}
              {opened.reviewedBy && <Descriptions.Item label="Перевірив">{opened.reviewedBy.fullName}, {fmtDateTime(opened.reviewedAt)}</Descriptions.Item>}
            </Descriptions>
            {opened.reportText && (
              <>
                <Typography.Title level={5} style={{ marginTop: 20 }}>Звіт</Typography.Title>
                <Typography.Paragraph className="pre">{opened.reportText}</Typography.Paragraph>
              </>
            )}
            {opened.attachmentName && (
              <Button icon={<DownloadOutlined />} onClick={() => downloadFile(`/anp/items/${opened.id}/attachment`, opened.attachmentName!).catch((e) => message.error(errorMessage(e)))}>
                {opened.attachmentName}
              </Button>
            )}
            {opened.reviewComment && (
              <>
                <Typography.Title level={5} style={{ marginTop: 20 }}>Коментар уповноваженого</Typography.Title>
                <Typography.Paragraph className="pre">{opened.reviewComment}</Typography.Paragraph>
              </>
            )}
            <Space style={{ marginTop: 24 }}>
              {canReport(opened) && <Button type="primary" onClick={() => setReporting(opened)}>Подати звіт</Button>}
              {isOfficer && opened.status === 'SUBMITTED' && <Button type="primary" onClick={() => setReviewing(opened)}>Перевірити звіт</Button>}
            </Space>
          </>
        )}
      </Drawer>

      <ItemModal open={editing.open} item={editing.item} onClose={() => setEditing({ open: false, item: null })} />
      <ReportModal item={reporting} onClose={() => setReporting(null)} />
      <ReviewModal item={reviewing} onClose={() => setReviewing(null)} />
    </>
  );
}
