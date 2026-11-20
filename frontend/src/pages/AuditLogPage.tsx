import { useQuery } from '@tanstack/react-query';
import { Select, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { fmtDateTime } from '../lib/format';
import { AUDIT_ACTIONS, AUDIT_ENTITIES, ROLE_LABELS } from '../lib/labels';
import type { AuditEntry } from '../lib/types';

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const data = useQuery({
    queryKey: ['audit', page, action],
    queryFn: async () => (await api.get<{ items: AuditEntry[]; total: number }>('/audit-log', { params: { page, pageSize: 50, action } })).data,
  });
  return (
    <>
      <PageHeader title="Журнал дій" description="Чутливі дії: рішення щодо звітів АНП, публікація Integrity Index, перегляд звернень Скриньки довіри, зміни облікових записів." />
      <div className="panel" style={{ padding: 16 }}>
        <Space style={{ marginBottom: 12 }}>
          <Select allowClear showSearch optionFilterProp="label" placeholder="Усі дії" style={{ width: 320 }} value={action}
            onChange={(v) => { setAction(v); setPage(1); }} options={Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }))} />
        </Space>
        <Table<AuditEntry>
            scroll={{ x: 720 }}
          rowKey="id" size="small" loading={data.isLoading} dataSource={data.data?.items}
          pagination={{ current: page, pageSize: 50, total: data.data?.total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: 'Час', dataIndex: 'createdAt', width: 160, render: (v: string) => <span className="num">{fmtDateTime(v)}</span> },
            { title: 'Користувач', width: 280, render: (_: unknown, r) => (r.user ? <>{r.user.fullName} <span className="muted">({ROLE_LABELS[r.user.role]})</span></> : <span className="muted">система</span>) },
            { title: 'Дія', dataIndex: 'action', render: (a: string, r) => <>{AUDIT_ACTIONS[a] ?? a}{r.details && (r.details as any).status && <Tag style={{ marginLeft: 8 }}>{String((r.details as any).status)}</Tag>}</> },
            { title: 'Об\'єкт', dataIndex: 'entity', width: 170, render: (v: string) => <span className="muted">{AUDIT_ENTITIES[v] ?? v}</span> },
          ]}
        />
      </div>
    </>
  );
}
