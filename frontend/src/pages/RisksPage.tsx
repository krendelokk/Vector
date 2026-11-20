import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, AutoComplete, Button, Col, Form, Input, Modal, Popconfirm, Row, Segmented, Select, Space, Table } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { PageHeader, Stat } from '../components/PageHeader';
import { fmtDate } from '../lib/format';
import { RISK_LEVEL } from '../lib/labels';
import type { RiskItem, RiskLevel } from '../lib/types';
import { useAuth } from '../store/auth';

const schema = z.object({
  area: z.string().trim().min(2, 'Вкажіть сферу').max(200),
  description: z.string().trim().min(5, 'Опишіть ризик').max(5000),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  mitigation: z.string().max(5000).optional(),
});
type Values = z.infer<typeof schema>;

function LevelBadge({ level }: { level: RiskLevel }) {
  const l = RISK_LEVEL[level];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500, color: l.color }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
      {l.label}
    </span>
  );
}

function RiskModal({ open, item, areas, onClose }: { open: boolean; item: RiskItem | null; areas: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset(item ? { area: item.area, description: item.description, riskLevel: item.riskLevel, mitigation: item.mitigation ?? '' } : { area: '', description: '', riskLevel: 'MEDIUM', mitigation: '' });
  }, [open, item, reset]);
  const save = useMutation({
    mutationFn: (v: Values) => (item ? api.patch(`/risks/${item.id}`, v) : api.post('/risks', v)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['risks'] }); onClose(); },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal open={open} title={item ? 'Редагування ризику' : 'Новий ризик'} okText="Зберегти" cancelText="Скасувати" onCancel={onClose}
      onOk={handleSubmit((v) => save.mutate(v))} confirmLoading={save.isPending} width={640} destroyOnHidden>
      <Form layout="vertical">
        <Row gutter={12}>
          <Col span={14}>
            <Field control={control} name="area" label="Сфера" required render={(f) => (
              <AutoComplete {...f} options={areas.map((a) => ({ value: a }))} placeholder="Закупівлі, кадри, освітній процес" filterOption />
            )} />
          </Col>
          <Col span={10}>
            <Field control={control} name="riskLevel" label="Рівень" render={(f) => (
              <Select {...f} options={(Object.keys(RISK_LEVEL) as RiskLevel[]).map((k) => ({ value: k, label: RISK_LEVEL[k].label }))} />
            )} />
          </Col>
        </Row>
        <Field control={control} name="description" label="Опис ризику" required render={(f) => <Input.TextArea {...f} rows={3} />} />
        <Field control={control} name="mitigation" label="Заходи з мінімізації" render={(f) => <Input.TextArea {...f} rows={3} />} />
      </Form>
    </Modal>
  );
}

export function RisksPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { message } = App.useApp();
  const isOfficer = user.role === 'COMPLIANCE_OFFICER';
  const [level, setLevel] = useState<RiskLevel | 'ALL'>('ALL');
  const [area, setArea] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ open: boolean; item: RiskItem | null }>({ open: false, item: null });
  const risks = useQuery({ queryKey: ['risks'], queryFn: async () => (await api.get<RiskItem[]>('/risks')).data });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/risks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }),
    onError: (e) => message.error(errorMessage(e)),
  });

  const all = useMemo(() => risks.data ?? [], [risks.data]);
  const areas = useMemo(() => [...new Set(all.map((r) => r.area))].sort((a, b) => a.localeCompare(b, 'uk')), [all]);
  const filtered = all.filter((r) => (level === 'ALL' || r.riskLevel === level) && (!area || r.area === area));
  const count = (l: RiskLevel) => all.filter((r) => r.riskLevel === l).length;

  return (
    <>
      <PageHeader title="Реєстр корупційних ризиків" description="Ідентифіковані ризики, їхній рівень і заходи з мінімізації."
        extra={isOfficer && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ open: true, item: null })}>Додати ризик</Button>} />
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={8} md={4}><Stat label="Високий" value={<span style={{ color: RISK_LEVEL.HIGH.color }}>{count('HIGH')}</span>} /></Col>
        <Col xs={8} md={4}><Stat label="Середній" value={<span style={{ color: RISK_LEVEL.MEDIUM.color }}>{count('MEDIUM')}</span>} /></Col>
        <Col xs={8} md={4}><Stat label="Низький" value={<span style={{ color: RISK_LEVEL.LOW.color }}>{count('LOW')}</span>} /></Col>
      </Row>
      <div className="panel" style={{ padding: 16 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented value={level} onChange={(v) => setLevel(v as RiskLevel | 'ALL')}
            options={[{ value: 'ALL', label: 'Усі рівні' }, ...(['HIGH', 'MEDIUM', 'LOW'] as RiskLevel[]).map((k) => ({ value: k, label: RISK_LEVEL[k].label }))]} />
          <Select allowClear placeholder="Усі сфери" style={{ width: 240 }} value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} />
        </Space>
        <Table<RiskItem>
            scroll={{ x: 900 }}
          rowKey="id"
          loading={risks.isLoading}
          dataSource={filtered}
          pagination={false}
          columns={[
            { title: 'Рівень', dataIndex: 'riskLevel', width: 130, render: (l: RiskLevel) => <LevelBadge level={l} />,
              onCell: (r) => ({ style: { borderLeft: `3px solid ${RISK_LEVEL[r.riskLevel].color}` } }) },
            { title: 'Сфера', dataIndex: 'area', width: 180 },
            { title: 'Ризик', dataIndex: 'description' },
            { title: 'Заходи з мінімізації', dataIndex: 'mitigation', render: (v: string | null) => v ?? <span className="muted">не визначено</span> },
            { title: 'Оновлено', dataIndex: 'updatedAt', width: 110, render: (v: string) => <span className="num muted">{fmtDate(v)}</span> },
            ...(isOfficer
              ? [{
                  title: '', width: 96, render: (_: unknown, r: RiskItem) => (
                    <Space size={4}>
                      <Button size="small" icon={<EditOutlined />} aria-label="Змінити" onClick={() => setEditing({ open: true, item: r })} />
                      <Popconfirm title="Видалити ризик?" okText="Видалити" cancelText="Ні" onConfirm={() => remove.mutate(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Видалити" />
                      </Popconfirm>
                    </Space>
                  ),
                }]
              : []),
          ]}
        />
      </div>
      <RiskModal open={editing.open} item={editing.item} areas={areas} onClose={() => setEditing({ open: false, item: null })} />
    </>
  );
}
