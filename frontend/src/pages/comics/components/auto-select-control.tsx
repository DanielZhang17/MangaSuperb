import { useId } from 'react'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoPreference } from '@/service/types'

const AUTO_VALUE = '__auto__'

export interface AutoSelectOption<T extends string> {
  value: T
  label: string
}

interface AutoSelectControlProps<T extends string> {
  label: string
  value: AutoPreference<T>
  options: AutoSelectOption<T>[]
  onChange: (value: AutoPreference<T>) => void
}

export function AutoSelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: AutoSelectControlProps<T>) {
  const { t } = useI18n('common')
  const id = useId()
  const selectValue = value.mode === 'manual' ? value.value : AUTO_VALUE

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === AUTO_VALUE) {
            onChange({ mode: 'auto' })

            return
          }

          onChange({ mode: 'manual', value: nextValue as T })
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_VALUE}>{String(t('preference.auto'))}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
