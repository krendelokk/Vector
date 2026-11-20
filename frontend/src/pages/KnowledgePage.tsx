import { DeleteOutlined, DownloadOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Empty, Form, Input, List, Modal, Popconfirm, Segmented, Select, Space, Tag } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, downloadFile, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { FilePicker } from '../components/FilePicker';
import { PageHeader } from '../components/PageHeader';
import { fmtDate } from '../lib/format';
import { KNOWLEDGE_CATEGORY } from '../lib/labels';
import type { KnowledgeCategory, KnowledgeItem } from '../lib/types';
import { useAuth } from '../store/auth';

const schema = z
  .object({
    category: z.enum(['COURSE', 'MEMO', 'TEMPLATE', 'REGULATION']),
    title: z.string().trim().min(2, 'Вкажіть назву').max(300),
    description: z.string().max(3000).optional(),
    url: z.union([z.literal(''), z.string().url('Некоректне посилання')]).optional(),
    file: z.any().optional(),
  })
  .refine((v) => Boolean(v.url) || v.file instanceof File, { path: ['url'], message: 'Додайте посилання або файл' });
type Values = z.infer<typeof schema>;

function AddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'MEMO', title: '', description: '', url: '', file: null },
  });
  const save = useMutation({
    mutationFn: (v: Values) => {
      const fd = new FormData();
      fd.append('category', v.category);
      fd.append('title', v.title);
      if (v.description) fd.append('description', v.description);
      if (v.url) fd.append('url', v.url);
      if (v.file) fd.append('file', v.file);
      return api.post('/knowledge-base', fd);
    },
    onSuccess: () => {
      message.success('Матеріал додано');
      qc.invalidateQueries({ queryKey: ['knowledge'] });
      reset();
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal open={open} title="Новий матеріал" okText="Додати" cancelText="Скасувати" onCancel={onClose} onOk={handleSubmit((v) => save.mutate(v))} confirmLoading={save.isPending} destroyOnHidden>
      <Form layout="vertical">
        <Field control={control} name="category" label="Категорія" render={(f) => (
          <Select {...f} options={Object.entries(KNOWLEDGE_CATEGORY).map(([value, label]) => ({ value, label }))} />
        )} />
        <Field control={control} name="title" label="Назва" required render={(f) => <Input {...f} />} />
        <Field control={control} name="description" label="Короткий опис" render={(f) => <Input.TextArea {...f} rows={3} />} />
        <Field control={control} name="url" label="Посилання" render={(f) => <Input {...f} placeholder="https://" />} />
        <Field control={control} name="file" label="Або файл" extra="PDF, DOCX, XLSX, CSV, JPG, PNG до 20 МБ"
          render={(f) => <FilePicker value={f.value} onChange={f.onChange} onError={(m) => message.error(m)} />} />
      </Form>
    </Modal>
  );
}

export function KnowledgePage() {
  const user = useAuth((s) => s.user)!;
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [category, setCategory] = useState<KnowledgeCategory | 'ALL'>('ALL');
  const [adding, setAdding] = useState(false);
  const isOfficer = user.role === 'COMPLIANCE_OFFICER';
  const items = useQuery({
    queryKey: ['knowledge', category],
    queryFn: async () => (await api.get<KnowledgeItem[]>('/knowledge-base', { params: { category: category === 'ALL' ? undefined : category } })).data,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge-base/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="База знань" description="Курси, пам'ятки, шаблони документів і нормативні акти з питань запобігання корупції."
        extra={isOfficer && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Додати матеріал</Button>} />
      <Segmented style={{ marginBottom: 16 }} value={category} onChange={(v) => setCategory(v as KnowledgeCategory | 'ALL')}
        options={[{ value: 'ALL', label: 'Усі' }, ...Object.entries(KNOWLEDGE_CATEGORY).map(([value, label]) => ({ value, label }))]} />
      <div className="panel" style={{ padding: '4px 20px' }}>
        <List
          loading={items.isLoading}
          dataSource={items.data}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Матеріалів у цій категорії немає" /> }}
          renderItem={(i) => (
            <List.Item
              actions={[
                i.url && <Button key="u" icon={<LinkOutlined />} href={i.url} target="_blank" rel="noopener noreferrer">Відкрити</Button>,
                i.fileName && <Button key="f" icon={<DownloadOutlined />} onClick={() => downloadFile(`/knowledge-base/${i.id}/file`, i.fileName!).catch((e) => message.error(errorMessage(e)))}>Завантажити</Button>,
                isOfficer && (
                  <Popconfirm key="d" title="Видалити матеріал?" okText="Видалити" cancelText="Ні" onConfirm={() => remove.mutate(i.id)}>
                    <Button danger icon={<DeleteOutlined />} aria-label="Видалити" />
                  </Popconfirm>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={<Space><span>{i.title}</span><Tag>{KNOWLEDGE_CATEGORY[i.category]}</Tag></Space>}
                description={<>{i.description && <div>{i.description}</div>}<span style={{ fontSize: 12 }}>Додано {fmtDate(i.createdAt)}{i.fileName ? `, файл ${i.fileName}` : ''}</span></>}
              />
            </List.Item>
          )}
        />
      </div>
      <AddModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
