import { DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Descriptions, Drawer, Input, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api, downloadFile, errorMessage } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { fmtDateTime } from '../lib/format';
import { TRUSTBOX_STATUS } from '../lib/labels';
import type { TrustBoxMessage } from '../lib/types';

type Status = TrustBoxMessage['status'];

export function InboxPage() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [status, setStatus] = useState<Status | 'ALL'>('ALL');
  const [opened, setOpened] = useState<TrustBoxMessage | null>(null);
  const [note, setNote] = useState('');
  const list = useQuery({
    queryKey: ['trustbox', status],
    queryFn: async () => (await api.get<TrustBoxMessage[]>('/trust-box/messages', { params: { status: status === 'ALL' ? undefined : status } })).data,
  });
  useEffect(() => setNote(opened?.officerNote ?? ''), [opened]);

  const update = useMutation({
    mutationFn: (body: { status?: Status; officerNote?: string }) => api.patch<TrustBoxMessage>(`/trust-box/messages/${opened!.id}`, body),
    onSuccess: (r) => {
      setOpened(r.data);
      message.success('Збережено');
      qc.invalidateQueries({ queryKey: ['trustbox'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const open = async (m: TrustBoxMessage) => {
    // окремий запит фіксує перегляд конкретного звернення в журналі дій
    const { data } = await api.get<TrustBoxMessage>(`/trust-box/messages/${m.id}`);
    setOpened(data);
  };

  return (
    <>
      <PageHeader title="Вхідні звернення" description="Повідомлення Скриньки довіри. Доступ лише в уповноваженого, кожен перегляд фіксується в журналі дій." />
      <div className="panel" style={{ padding: 16 }}>
        <Segmented style={{ marginBottom: 12 }} value={status} onChange={(v) => setStatus(v as Status | 'ALL')}
          options={[{ value: 'ALL', label: 'Усі' }, ...(Object.keys(TRUSTBOX_STATUS) as Status[]).map((k) => ({ value: k, label: TRUSTBOX_STATUS[k].label }))]} />
        <Table<TrustBoxMessage>
            scroll={{ x: 700 }}
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data}
          onRow={(r) => ({ onClick: () => open(r), style: { cursor: 'pointer', fontWeight: r.status === 'NEW' ? 600 : 400 } })}
          columns={[
            { title: 'Надійшло', dataIndex: 'createdAt', width: 150, render: (v: string) => <span className="num">{fmtDateTime(v)}</span> },
            { title: 'Відправник', width: 220, render: (_: unknown, r) => (r.isAnonymous ? <span className="muted">Анонімно</span> : r.contactInfo) },
            { title: 'Повідомлення', dataIndex: 'message', ellipsis: true },
            { title: 'Статус', dataIndex: 'status', width: 140, render: (s: Status) => <Tag color={TRUSTBOX_STATUS[s].color}>{TRUSTBOX_STATUS[s].label}</Tag> },
          ]}
        />
      </div>
      <Drawer open={Boolean(opened)} width={600} onClose={() => setOpened(null)} title="Звернення">
        {opened && (
          <>
            <Descriptions column={1} size="small" bordered styles={{ label: { width: 140 } }}>
              <Descriptions.Item label="Надійшло">{fmtDateTime(opened.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Відправник">{opened.isAnonymous ? 'Анонімно' : opened.contactInfo}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Select size="small" value={opened.status} style={{ width: 180 }} onChange={(s) => update.mutate({ status: s })}
                  options={(Object.keys(TRUSTBOX_STATUS) as Status[]).map((k) => ({ value: k, label: TRUSTBOX_STATUS[k].label }))} />
              </Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph className="pre" style={{ marginTop: 16, padding: 12, background: '#f5f4f0', borderRadius: 4 }}>{opened.message}</Typography.Paragraph>
            {opened.attachmentName && (
              <Button icon={<DownloadOutlined />} style={{ marginBottom: 16 }}
                onClick={() => downloadFile(`/trust-box/messages/${opened.id}/attachment`, opened.attachmentName!).catch((e) => message.error(errorMessage(e)))}>
                {opened.attachmentName}
              </Button>
            )}
            <Typography.Title level={5}>Службова примітка</Typography.Title>
            <Input.TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Видно лише уповноваженому" />
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" loading={update.isPending} onClick={() => update.mutate({ officerNote: note })}>Зберегти примітку</Button>
            </Space>
          </>
        )}
      </Drawer>
    </>
  );
}
