import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function AIModelCard() {
  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">AI模型</CardTitle>
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
