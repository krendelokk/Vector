import { PaperClipOutlined } from '@ant-design/icons';
import { Button, Upload } from 'antd';

export const ACCEPT_GENERAL = '.pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png';
const MAX_MB = 20;

/** Вибір одного файлу без автоматичного завантаження; перевірка розміру на клієнті. */
export function FilePicker({
  value,
  onChange,
  accept = ACCEPT_GENERAL,
  onError,
  label = 'Прикріпити файл',
}: {
  value?: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  onError?: (msg: string) => void;
  label?: string;
}) {
  return (
    <Upload
      accept={accept}
      maxCount={1}
      fileList={value ? [{ uid: '1', name: value.name, status: 'done' }] : []}
      beforeUpload={(file) => {
        if (file.size > MAX_MB * 1024 * 1024) {
          onError?.(`Файл перевищує ${MAX_MB} МБ`);
          return Upload.LIST_IGNORE;
        }
        onChange(file);
        return false;
      }}
      onRemove={() => onChange(null)}
    >
      <Button icon={<PaperClipOutlined />}>{label}</Button>
    </Upload>
  );
}
