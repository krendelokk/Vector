import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Empty, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Tooltip as AntTooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import { z } from 'zod';
import { api, downloadFile, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { FilePicker } from '../components/FilePicker';
import { PageHeader, Stat } from '../components/PageHeader';
import { fmtDateTime } from '../lib/format';
import type { QuestionResult, SurveyImportRow, SurveySummary } from '../lib/types';
import { useAuth } from '../store/auth';
import { colors } from '../theme';

const SERIES = ['#1f4f7a', '#c98a1b', '#3b6d3f', '#8a3b5c', '#4a6b8a', '#7a5c1f', '#2f7a72'];

const indexColor = (v: number) => (v < 50 ? colors.red : v < 70 ? colors.amber : colors.green);

function Charts({ data }: { data: SurveySummary[] }) {
  const [periodId, setPeriodId] = useState<string | undefined>(data[data.length - 1]?.id);
  const current = data.find((d) => d.id === periodId) ?? data[data.length - 1];
  const prevIdx = data.findIndex((d) => d.id === current.id) - 1;
  const previous = prevIdx >= 0 ? data[prevIdx] : null;

  const areaNames = useMemo(() => [...new Set(data.flatMap((d) => d.riskAreas.areas.map((a) => a.area)))], [data]);
  const radar = current.riskAreas.areas.map((a) => ({
    area: a.area,
    current: a.index,
    previous: previous?.riskAreas.areas.find((p) => p.area === a.area)?.index,
  }));
  const trend = data.map((d) => ({
    period: d.periodLabel,
    ...Object.fromEntries(d.riskAreas.areas.map((a) => [a.area, a.index])),
  }));
  const questions = [...current.riskAreas.questions].sort((a, b) => a.index - b.index);
  const delta = previous ? Math.round((current.integrityIndex - previous.integrityIndex) * 10) / 10 : null;

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Space wrap>
          <span className="muted">Період:</span>
          <Select value={current.id} onChange={setPeriodId} style={{ width: 220 }} options={data.map((d) => ({ value: d.id, label: d.periodLabel }))} />
        </Space>
      </Col>
      <Col xs={12} md={6}><Stat label="Integrity Index" value={<span style={{ color: indexColor(current.integrityIndex) }}>{current.integrityIndex}</span>} note="зі 100 можливих" tone="accent" /></Col>
      <Col xs={12} md={6}><Stat label="Зміна до попереднього" value={delta === null ? 'немає' : `${delta > 0 ? '+' : ''}${delta}`} note={previous ? previous.periodLabel : 'перше опитування'} /></Col>
      <Col xs={12} md={6}><Stat label="Респондентів" value={current.respondentsCount} /></Col>
      <Col xs={12} md={6}>
        <Stat label="Найслабша зона" value={<span style={{ fontSize: 20 }}>{[...current.riskAreas.areas].sort((a, b) => a.index - b.index)[0]?.area}</span>}
          note={`індекс ${[...current.riskAreas.areas].sort((a, b) => a.index - b.index)[0]?.index}`} />
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Integrity Index за періодами">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e4dd" />
              <XAxis dataKey="periodLabel" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [v, 'Індекс']} />
              <Bar dataKey="integrityIndex" radius={[2, 2, 0, 0]} maxBarSize={56}>
                {data.map((d) => <Cell key={d.id} fill={d.id === current.id ? colors.primary : '#9fb3c8'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title={`Зони ризику: ${current.periodLabel}`}>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radar} outerRadius="78%" margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
              <PolarGrid stroke="#ddd8ce" />
              <PolarAngleAxis dataKey="area" tick={{ fontSize: 12, fill: colors.text }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              {previous && <Radar name={previous.periodLabel} dataKey="previous" stroke="#9aa4b0" fill="#9aa4b0" fillOpacity={0.15} />}
              <Radar name={current.periodLabel} dataKey="current" stroke={colors.primary} fill={colors.primary} fillOpacity={0.25} />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </Col>
      {data.length > 1 && (
        <Col span={24}>
          <Card title="Динаміка за зонами ризику">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e4dd" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {areaNames.map((a, i) => (
                  <Line key={a} type="monotone" dataKey={a} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      )}
      <Col span={24}>
        <Card title="Питання: від найслабших до найсильніших">
          <Table<QuestionResult>
            scroll={{ x: 600 }}
            size="small"
            rowKey={(r) => r.area + r.question}
            dataSource={questions}
            pagination={false}
            columns={[
              { title: 'Зона', dataIndex: 'area', width: 200 },
              { title: 'Питання', dataIndex: 'question', render: (q: string, r) => <>{q}{r.reversed && <AntTooltip title="Зворотна шкала: нижча згода означає кращий результат"><Tag style={{ marginLeft: 8 }}>зворотне</Tag></AntTooltip>}</> },
              { title: 'Відповідей', dataIndex: 'answers', width: 110, align: 'right', render: (v: number) => <span className="num">{v}</span> },
              { title: 'Індекс', dataIndex: 'index', width: 100, align: 'right', render: (v: number) => <strong className="num" style={{ color: indexColor(v) }}>{v}</strong> },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
}

const importSchema = z
  .object({
    periodLabel: z.string().trim().min(2, 'Вкажіть період').max(100),
    scaleMin: z.number().int().min(0),
    scaleMax: z.number().int().max(100),
    file: z.any().refine((f) => f instanceof File, 'Оберіть файл CSV або XLSX'),
  })
  .refine((v) => v.scaleMax > v.scaleMin, { path: ['scaleMax'], message: 'Максимум має бути більшим за мінімум' });
type ImportValues = z.infer<typeof importSchema>;

function ImportTab() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const imports = useQuery({ queryKey: ['integrity', 'imports'], queryFn: async () => (await api.get<SurveyImportRow[]>('/integrity-index/imports')).data });
  const { control, handleSubmit, reset } = useForm<ImportValues>({
    resolver: zodResolver(importSchema),
    defaultValues: { periodLabel: '', scaleMin: 1, scaleMax: 5, file: null },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['integrity'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const upload = useMutation({
    mutationFn: (v: ImportValues) => {
      const fd = new FormData();
      fd.append('periodLabel', v.periodLabel);
      fd.append('scaleMin', String(v.scaleMin));
      fd.append('scaleMax', String(v.scaleMax));
      fd.append('file', v.file);
      return api.post<SurveyImportRow>('/integrity-index/import', fd);
    },
    onSuccess: (r) => {
      message.success(`Імпортовано: індекс ${r.data.integrityIndex}, респондентів ${r.data.respondentsCount}`);
      reset({ periodLabel: '', scaleMin: 1, scaleMax: 5, file: null });
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (r: SurveyImportRow) => api.post(`/integrity-index/${r.id}/${r.published ? 'unpublish' : 'publish'}`),
    onSuccess: refresh,
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/integrity-index/${id}`),
    onSuccess: refresh,
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={9}>
        <Card title="Імпорт файлу опитування">
          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Вивантажте відповіді з Google Forms у CSV або XLSX. Зону ризику вкажіть у заголовку питання в квадратних дужках,
            наприклад <code>[Закупівлі] Процедури відкриті</code>. Питання зі зворотною шкалою позначте <code>(R)</code> в кінці.
            Колонки з текстом і позначкою часу ігноруються.
          </Typography.Paragraph>
          <Form layout="vertical">
            <Field control={control} name="periodLabel" label="Період" required render={(f) => <Input {...f} placeholder="2026, весна" />} />
            <Row gutter={12}>
              <Col span={12}><Field control={control} name="scaleMin" label="Мінімум шкали" render={(f) => <InputNumber {...f} style={{ width: '100%' }} />} /></Col>
              <Col span={12}><Field control={control} name="scaleMax" label="Максимум шкали" render={(f) => <InputNumber {...f} style={{ width: '100%' }} />} /></Col>
            </Row>
            <Field control={control} name="file" label="Файл" required render={(f) => (
              <FilePicker value={f.value} onChange={f.onChange} accept=".csv,.xlsx" label="Обрати CSV або XLSX" onError={(m) => message.error(m)} />
            )} />
            <Button type="primary" icon={<UploadOutlined />} loading={upload.isPending} onClick={handleSubmit((v) => upload.mutate(v))}>
              Імпортувати
            </Button>
          </Form>
          <Alert style={{ marginTop: 16 }} type="info" showIcon message="Сирі файли бачите лише ви. Інші ролі отримують тільки агреговані показники після публікації." />
        </Card>
      </Col>
      <Col xs={24} lg={15}>
        <Card title="Імпортовані опитування">
          <Table<SurveyImportRow>
            scroll={{ x: 640 }}
            rowKey="id"
            size="small"
            loading={imports.isLoading}
            dataSource={[...(imports.data ?? [])].reverse()}
            pagination={false}
            expandable={{
              expandedRowRender: (r) => (
                <Space wrap>
                  {r.riskAreas.areas.map((a) => <Tag key={a.area}>{a.area}: <strong style={{ color: indexColor(a.index) }}>{a.index}</strong></Tag>)}
                </Space>
              ),
            }}
            columns={[
              { title: 'Період', dataIndex: 'periodLabel', render: (v: string, r) => <><div style={{ fontWeight: 500 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(r.createdAt)}{r.channel === 'TELEGRAM' ? ', через Telegram' : ''}</div></> },
              { title: 'Респ.', dataIndex: 'respondentsCount', align: 'right', width: 70, render: (v: number) => <span className="num">{v}</span> },
              { title: 'Індекс', dataIndex: 'integrityIndex', align: 'right', width: 80, render: (v: number) => <strong className="num" style={{ color: indexColor(v) }}>{v}</strong> },
              { title: 'Статус', dataIndex: 'published', width: 130, render: (p: boolean) => (p ? <Tag color="success">Опубліковано</Tag> : <Tag>Чернетка</Tag>) },
              {
                title: '', width: 210, align: 'right',
                render: (_: unknown, r) => (
                  <Space size={4}>
                    <Button size="small" type={r.published ? 'default' : 'primary'} loading={toggle.isPending && toggle.variables?.id === r.id} onClick={() => toggle.mutate(r)}>
                      {r.published ? 'Зняти' : 'Опублікувати'}
                    </Button>
                    <AntTooltip title={`Сирий файл: ${r.rawFileName}`}>
                      <Button size="small" icon={<DownloadOutlined />} aria-label="Завантажити сирий файл"
                        onClick={() => downloadFile(`/integrity-index/raw/${r.id}`, r.rawFileName).catch((e) => message.error(errorMessage(e)))} />
                    </AntTooltip>
                    <Popconfirm title="Видалити імпорт разом із сирим файлом?" okText="Видалити" cancelText="Ні" onConfirm={() => remove.mutate(r.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} aria-label="Видалити" />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
}

export function IntegrityIndexPage() {
  const user = useAuth((s) => s.user)!;
  const [params, setParams] = useSearchParams();
  const published = useQuery({ queryKey: ['integrity', 'published'], queryFn: async () => (await api.get<SurveySummary[]>('/integrity-index/published')).data });
  const isOfficer = user.role === 'COMPLIANCE_OFFICER';

  const analytics = published.data?.length ? (
    <Charts data={published.data} />
  ) : (
    <div className="panel" style={{ padding: 48 }}>
      <Empty description={published.isLoading ? 'Завантаження' : 'Опубліковані підсумки опитувань поки відсутні'} />
    </div>
  );

  return (
    <>
      <PageHeader title="Integrity Index" description="Результати анонімних опитувань про доброчесність. Індекс від 0 до 100: чим вищий, тим краще." />
      {isOfficer ? (
        <Tabs
          activeKey={params.get('tab') ?? 'analytics'}
          onChange={(k) => setParams({ tab: k }, { replace: true })}
          items={[
            { key: 'analytics', label: 'Аналітика (опубліковане)', children: analytics },
            { key: 'import', label: 'Імпорт і публікація', children: <ImportTab /> },
          ]}
        />
      ) : (
        analytics
      )}
    </>
  );
}
