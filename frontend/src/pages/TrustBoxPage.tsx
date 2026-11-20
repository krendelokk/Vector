import { DeleteOutlined, EditOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Col, Collapse, Empty, Form, Input, InputNumber, List, Modal, Popconfirm, Result, Row, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { anonymousApi, api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { FilePicker } from '../components/FilePicker';
import { PageHeader } from '../components/PageHeader';
import { fmtDateTime } from '../lib/format';
import { ROLE_LABELS } from '../lib/labels';
import type { Consultation, FaqItem } from '../lib/types';
import { useAuth } from '../store/auth';

const trustSchema = z
  .object({
    isAnonymous: z.boolean(),
    contactInfo: z.string().max(300).optional(),
    message: z.string().trim().min(10, 'Опишіть ситуацію детальніше').max(20000),
    file: z.any().optional(),
  })
  .refine((v) => v.isAnonymous || (v.contactInfo ?? '').trim().length >= 3, {
    path: ['contactInfo'],
    message: 'Вкажіть, як з вами зв\'язатися',
  });
type TrustValues = z.infer<typeof trustSchema>;

function TrustBoxForm() {
  const user = useAuth((s) => s.user)!;
  const { message } = App.useApp();
  const [sent, setSent] = useState(false);
  const { control, handleSubmit, reset, setValue } = useForm<TrustValues>({
    resolver: zodResolver(trustSchema),
    defaultValues: { isAnonymous: true, contactInfo: '', message: '', file: null },
  });
  const anonymous = useWatch({ control, name: 'isAnonymous' });

  const send = useMutation({
    mutationFn: (v: TrustValues) => {
      const fd = new FormData();
      fd.append('isAnonymous', String(v.isAnonymous));
      if (!v.isAnonymous && v.contactInfo) fd.append('contactInfo', v.contactInfo);
      fd.append('message', v.message);
      if (v.file) fd.append('file', v.file);
      // Анонімне звернення надсилається клієнтом без токена й cookies
      return (v.isAnonymous ? anonymousApi : api).post('/trust-box/message', fd);
    },
    onSuccess: () => {
      setSent(true);
      reset({ isAnonymous: true, contactInfo: '', message: '', file: null });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (sent) {
    return (
      <Result status="success" title="Звернення надіслано" subTitle="Його отримає лише антикорупційний уповноважений."
        extra={<Button onClick={() => setSent(false)}>Надіслати ще одне</Button>} />
    );
  }

  return (
    <Row gutter={[24, 16]}>
      <Col xs={24} lg={14}>
        <Form layout="vertical">
          <Field control={control} name="isAnonymous" render={(f) => (
            <Checkbox checked={f.value} onChange={(e) => {
              f.onChange(e.target.checked);
              if (!e.target.checked) setValue('contactInfo', `${user.fullName}, ${user.email}`);
            }}>
              <strong>Анонімне звернення</strong>
            </Checkbox>
          )} />
          {!anonymous && (
            <Field control={control} name="contactInfo" label="Контакт для відповіді" required
              render={(f) => <Input {...f} />} />
          )}
          <Field control={control} name="message" label="Опис ситуації" required
            render={(f) => <Input.TextArea {...f} rows={8} placeholder="Що сталося, де, коли, хто причетний. Не вказуйте відомостей, за якими можна встановити вашу особу, якщо хочете залишитися анонімним." />} />
          <Field control={control} name="file" label="Документ або фото" extra="До 20 МБ. Фото й документи можуть містити ім'я автора та геолокацію в метаданих."
            render={(f) => <FilePicker value={f.value} onChange={f.onChange} onError={(m) => message.error(m)} />} />
          <Button type="primary" icon={<LockOutlined />} loading={send.isPending} onClick={handleSubmit((v) => send.mutate(v))}>
            Надіслати звернення
          </Button>
        </Form>
      </Col>
      <Col xs={24} lg={10}>
        <Alert
          type={anonymous ? 'success' : 'warning'}
          showIcon
          message={anonymous ? 'Як захищено вашу анонімність' : 'Звернення не анонімне'}
          description={
            anonymous ? (
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                <li>запит надсилається без вашого токена входу і без cookies;</li>
                <li>система не зберігає ім'я, IP-адресу чи дані браузера;</li>
                <li>подання звернення не записується в журнал дій;</li>
                <li>назва прикріпленого файлу замінюється на нейтральну;</li>
                <li>зміст бачить лише уповноважений.</li>
              </ul>
            ) : (
              'Уповноважений побачить вказаний вами контакт і зможе відповісти.'
            )
          }
        />
      </Col>
    </Row>
  );
}

const questionSchema = z.object({ question: z.string().trim().min(10, 'Сформулюйте запитання детальніше').max(10000) });

function Consultations() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { message } = App.useApp();
  const isOfficer = user.role === 'COMPLIANCE_OFFICER';
  const list = useQuery({ queryKey: ['consultations'], queryFn: async () => (await api.get<Consultation[]>('/consultations')).data });
  const { control, handleSubmit, reset } = useForm<{ question: string }>({ resolver: zodResolver(questionSchema), defaultValues: { question: '' } });
  const [answering, setAnswering] = useState<Consultation | null>(null);
  const [answer, setAnswer] = useState('');

  const ask = useMutation({
    mutationFn: (v: { question: string }) => api.post('/consultations', v),
    onSuccess: () => { message.success('Запитання надіслано'); reset(); qc.invalidateQueries({ queryKey: ['consultations'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const reply = useMutation({
    mutationFn: () => api.patch(`/consultations/${answering!.id}/answer`, { answer }),
    onSuccess: () => { setAnswering(null); qc.invalidateQueries({ queryKey: ['consultations'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Row gutter={[24, 16]}>
      {!isOfficer && (
        <Col xs={24} lg={9}>
          <Card title="Швидке запитання уповноваженому">
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              Запитання не анонімне: його бачите лише ви та уповноважений. Для повідомлень про порушення скористайтеся Скринькою довіри.
            </Typography.Paragraph>
            <Form layout="vertical">
              <Field control={control} name="question" render={(f) => <Input.TextArea {...f} rows={5} placeholder="Наприклад: чи можна прийняти подарунок від здобувача після захисту?" />} />
              <Button type="primary" loading={ask.isPending} onClick={handleSubmit((v) => ask.mutate(v))}>Надіслати</Button>
            </Form>
          </Card>
        </Col>
      )}
      <Col xs={24} lg={isOfficer ? 24 : 15}>
        <div className="panel" style={{ padding: '4px 20px' }}>
          <List
            loading={list.isLoading}
            dataSource={list.data}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Запитань ще немає" /> }}
            renderItem={(c) => (
              <List.Item
                actions={isOfficer ? [<Button key="a" size="small" type={c.status === 'OPEN' ? 'primary' : 'default'} onClick={() => { setAnswering(c); setAnswer(c.answer ?? ''); }}>{c.status === 'OPEN' ? 'Відповісти' : 'Змінити відповідь'}</Button>] : undefined}
              >
                <List.Item.Meta
                  title={<Space wrap><span className="pre" style={{ fontWeight: 500 }}>{c.question}</span>{c.status === 'OPEN' ? <Tag color="gold">Очікує відповіді</Tag> : <Tag color="success">Є відповідь</Tag>}</Space>}
                  description={
                    <>
                      <div style={{ fontSize: 12 }}>
                        {isOfficer && `${c.user.fullName}, ${ROLE_LABELS[c.user.role]}${c.user.department ? `, ${c.user.department.name}` : ''}. `}
                        {fmtDateTime(c.createdAt)}
                      </div>
                      {c.answer && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f5f4f0', borderLeft: '3px solid #1f4f7a', color: '#1d1b18' }} className="pre">
                          {c.answer}
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{c.answeredBy?.fullName}, {fmtDateTime(c.answeredAt)}</div>
                        </div>
                      )}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      </Col>
      <Modal open={Boolean(answering)} title="Відповідь на запитання" okText="Надіслати відповідь" cancelText="Скасувати" onCancel={() => setAnswering(null)}
        onOk={() => (answer.trim().length >= 2 ? reply.mutate() : message.error('Напишіть відповідь'))} confirmLoading={reply.isPending}>
        <Typography.Paragraph className="pre">{answering?.question}</Typography.Paragraph>
        <Input.TextArea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </Modal>
    </Row>
  );
}

const faqSchema = z.object({
  question: z.string().trim().min(5, 'Занадто коротко').max(500),
  answer: z.string().trim().min(5, 'Занадто коротко').max(10000),
  sortOrder: z.number().int().optional(),
});
type FaqValues = z.infer<typeof faqSchema>;

function Faq() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { message } = App.useApp();
  const isOfficer = user.role === 'COMPLIANCE_OFFICER';
  const faq = useQuery({ queryKey: ['faq'], queryFn: async () => (await api.get<FaqItem[]>('/faq')).data });
  const [editing, setEditing] = useState<{ open: boolean; item: FaqItem | null }>({ open: false, item: null });
  const { control, handleSubmit, reset } = useForm<FaqValues>({ resolver: zodResolver(faqSchema) });
  useEffect(() => {
    if (editing.open) reset(editing.item ? { question: editing.item.question, answer: editing.item.answer, sortOrder: editing.item.sortOrder } : { question: '', answer: '', sortOrder: (faq.data?.length ?? 0) + 1 });
  }, [editing, reset, faq.data?.length]);
  const save = useMutation({
    mutationFn: (v: FaqValues) => (editing.item ? api.patch(`/faq/${editing.item.id}`, v) : api.post('/faq', v)),
    onSuccess: () => { setEditing({ open: false, item: null }); qc.invalidateQueries({ queryKey: ['faq'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/faq/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['faq'] }) });

  return (
    <>
      {isOfficer && <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setEditing({ open: true, item: null })}>Додати запитання</Button>}
      {faq.data?.length ? (
        <Collapse
          accordion
          items={faq.data.map((f) => ({
            key: f.id,
            label: <span style={{ fontWeight: 500 }}>{f.question}</span>,
            children: <Typography.Paragraph className="pre" style={{ marginBottom: 0 }}>{f.answer}</Typography.Paragraph>,
            extra: isOfficer && (
              <Space size={4} onClick={(e) => e.stopPropagation()}>
                <Button size="small" type="text" icon={<EditOutlined />} aria-label="Змінити" onClick={() => setEditing({ open: true, item: f })} />
                <Popconfirm title="Видалити?" okText="Так" cancelText="Ні" onConfirm={() => remove.mutate(f.id)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Видалити" />
                </Popconfirm>
              </Space>
            ),
          }))}
        />
      ) : (
        <Empty description="Запитань поки немає" />
      )}
      <Modal open={editing.open} title={editing.item ? 'Редагування' : 'Нове запитання'} okText="Зберегти" cancelText="Скасувати" onCancel={() => setEditing({ open: false, item: null })}
        onOk={handleSubmit((v) => save.mutate(v))} confirmLoading={save.isPending} destroyOnHidden width={640}>
        <Form layout="vertical">
          <Field control={control} name="question" label="Запитання" required render={(f) => <Input {...f} />} />
          <Field control={control} name="answer" label="Відповідь" required render={(f) => <Input.TextArea {...f} rows={6} />} />
          <Field control={control} name="sortOrder" label="Порядок" render={(f) => <InputNumber {...f} />} />
        </Form>
      </Modal>
    </>
  );
}

export function TrustBoxPage() {
  const [params, setParams] = useSearchParams();
  return (
    <>
      <PageHeader title="Довіра і консультації" description="Повідомте про можливе порушення, поставте запитання уповноваженому або знайдіть відповідь серед поширених запитань." />
      <div className="panel" style={{ padding: '4px 20px 20px' }}>
        <Tabs
          activeKey={params.get('tab') ?? 'trust'}
          onChange={(k) => setParams({ tab: k }, { replace: true })}
          items={[
            { key: 'trust', label: 'Скринька довіри', children: <TrustBoxForm /> },
            { key: 'consultations', label: 'Консультації', children: <Consultations /> },
            { key: 'faq', label: 'Поширені запитання', children: <Faq /> },
          ]}
        />
      </div>
    </>
  );
}
