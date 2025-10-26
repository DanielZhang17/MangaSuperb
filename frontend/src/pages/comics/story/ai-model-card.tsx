import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/hooks/use-i18n'

export function AIModelCard() {
  const { t } = useI18n('comics')

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">{String(t('aiModel.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ToggleGroup type="single" defaultValue="gemini" className="w-full flex justify-center">
          <ToggleGroupItem value="gemini" className="w-1/3">Gemini</ToggleGroupItem>
          <ToggleGroupItem value="openai" className="w-1/3">OpenAI</ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}
