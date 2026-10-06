import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@flycommerce/ui';
import { COLUMNS } from '../columns';

interface Props {
  value: string[];
  onValueChange(value: string[]): void;
  description: string;
}

export function ColumnChoice({ value, onValueChange, description }: Props) {
  // Rebuilt from the list, so the choice is always in the file's order.
  const toggle = (key: string, checked: boolean) =>
    onValueChange(COLUMNS.map((column) => column.key).filter((k) => (k === key ? checked : value.includes(k))));

  return (
    <FieldSet>
      <FieldLegend variant="label">Columns</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <FieldGroup data-slot="checkbox-group" className="grid grid-cols-2 sm:grid-cols-3">
        {COLUMNS.map((column) => (
          <Field key={column.key} orientation="horizontal">
            <Checkbox
              id={`column-${column.key}`}
              checked={value.includes(column.key)}
              onCheckedChange={(checked) => toggle(column.key, checked === true)}
            />
            <FieldLabel htmlFor={`column-${column.key}`}>{column.header}</FieldLabel>
          </Field>
        ))}
      </FieldGroup>
      {value.length === 0 && <FieldError>Choose at least one column.</FieldError>}
    </FieldSet>
  );
}
