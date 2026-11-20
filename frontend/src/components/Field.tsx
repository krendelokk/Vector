import { Form } from 'antd';
import type { ReactElement } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

/**
 * Зв'язка React Hook Form + Ant Design: поле AntD під контролем RHF,
 * помилки Zod показуються під полем.
 */
export function Field<T extends FieldValues>({
  control,
  name,
  label,
  required,
  extra,
  render,
}: {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  required?: boolean;
  extra?: string;
  render: (field: { value: any; onChange: (v: any) => void; onBlur: () => void }) => ReactElement;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item
          label={label}
          required={required}
          extra={extra}
          validateStatus={fieldState.error ? 'error' : undefined}
          help={fieldState.error?.message}
        >
          {render({ value: field.value, onChange: field.onChange, onBlur: field.onBlur })}
        </Form.Item>
      )}
    />
  );
}
