import type { EventClickArg, EventInput } from '@fullcalendar/core';
import ukLocale from '@fullcalendar/core/locales/uk';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Descriptions, Form, Input, Modal, Select, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { dayjs, fmtDateTime } from '../lib/format';
import { ANP_STATUS, EVENT_TYPE } from '../lib/labels';
import type { CalendarItem, EventType } from '../lib/types';
import { useAuth } from '../store/auth';

const schema = z.object({
  title: z.string().trim().min(2, 'Вкажіть назву').max(300),
  description: z.string().max(3000).optional(),
  date: z.any().refine((v) => v && dayjs(v).isValid(), 'Вкажіть дату'),
  type: z.enum(['DEADLINE', 'TRAINING', 'DECLARATION']),
});
type Values = z.infer<typeof schema>;

function EventModal({ open, item, onClose }: { open: boolean; item: CalendarItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset(item ? { title: item.title, description: item.description ?? '', date: dayjs(item.date), type: item.type } : { title: '', description: '', date: dayjs().add(1, 'day').hour(10).minute(0), type: 'TRAINING' });
  }, [open, item, reset]);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['calendar'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = { ...v, date: dayjs(v.date).toISOString() };
      return item ? api.patch(`/calendar/events/${item.id}`, body) : api.post('/calendar/events', body);
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/calendar/events/${item!.id}`),
    onSuccess: () => { invalidate(); onClose(); },
  });
  return (
    <Modal open={open} title={item ? 'Подія' : 'Нова подія'} onCancel={onClose} destroyOnHidden
      footer={
        <Space>
          {item && <Button danger loading={remove.isPending} onClick={() => remove.mutate()}>Видалити</Button>}
          <Button onClick={onClose}>Скасувати</Button>
          <Button type="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>Зберегти</Button>
        </Space>
      }>
      <Form layout="vertical">
        <Field control={control} name="title" label="Назва" required render={(f) => <Input {...f} />} />
        <Space.Compact block>
          <Field control={control} name="date" label="Дата і час" required render={(f) => <DatePicker {...f} showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" />} />
        </Space.Compact>
        <Field control={control} name="type" label="Тип" render={(f) => (
          <Select {...f} options={(Object.keys(EVENT_TYPE) as EventType[]).map((k) => ({ value: k, label: EVENT_TYPE[k].label }))} />
        )} />
        <Field control={control} name="description" label="Опис" render={(f) => <Input.TextArea {...f} rows={3} />} />
      </Form>
    </Modal>
  );
}

export function CalendarPage() {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const isOfficer = user.role === 'COMPLIANCE_OFFICER';
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; item: CalendarItem | null }>({ open: false, item: null });
  const [viewing, setViewing] = useState<CalendarItem | null>(null);

  const events = useQuery({
    queryKey: ['calendar', range],
    enabled: Boolean(range),
    queryFn: async () => (await api.get<CalendarItem[]>('/calendar/events', { params: range })).data,
  });

  const fcEvents: EventInput[] = (events.data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    start: e.date,
    allDay: e.source === 'anp',
    color: e.source === 'anp' ? (e.status === 'OVERDUE' ? '#b42318' : '#6b6760') : EVENT_TYPE[e.type].color,
    extendedProps: e,
  }));

  const onClick = (arg: EventClickArg) => {
    const e = arg.event.extendedProps as CalendarItem;
    if (e.source === 'anp') return navigate(`/anp?item=${e.anpId}`);
    if (isOfficer) setEditing({ open: true, item: e });
    else setViewing(e);
  };

  return (
    <>
      <PageHeader title="Календар" description="Навчання, кампанії декларування, дедлайни. Дедлайни пунктів АНП у ваших межах доступу додаються автоматично."
        extra={isOfficer && <Button type="primary" onClick={() => setEditing({ open: true, item: null })}>Додати подію</Button>} />
      <Space wrap style={{ marginBottom: 12 }}>
        {(Object.keys(EVENT_TYPE) as EventType[]).map((k) => (
          <span key={k} className="muted"><span className="dot" style={{ background: EVENT_TYPE[k].color }} />{EVENT_TYPE[k].label}</span>
        ))}
        {user.role !== 'ADMIN' && <span className="muted"><span className="dot" style={{ background: '#6b6760' }} />Пункт АНП</span>}
      </Space>
      <div className="panel" style={{ padding: 16 }}>
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin]}
          locale={ukLocale}
          initialView="dayGridMonth"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }}
          buttonText={{ today: 'Сьогодні', month: 'Місяць', list: 'Список' }}
          height="auto"
          events={fcEvents}
          eventClick={onClick}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          datesSet={(arg) => setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() })}
        />
      </div>
      <EventModal open={editing.open} item={editing.item} onClose={() => setEditing({ open: false, item: null })} />
      <Modal open={Boolean(viewing)} title={viewing?.title} footer={null} onCancel={() => setViewing(null)}>
        {viewing && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Коли">{fmtDateTime(viewing.date)}</Descriptions.Item>
            <Descriptions.Item label="Тип"><Tag color={EVENT_TYPE[viewing.type].color}>{EVENT_TYPE[viewing.type].label}</Tag></Descriptions.Item>
            {viewing.status && <Descriptions.Item label="Статус">{ANP_STATUS[viewing.status].label}</Descriptions.Item>}
            {viewing.description && <Descriptions.Item label="Опис">{viewing.description}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>
    </>
  );
}
