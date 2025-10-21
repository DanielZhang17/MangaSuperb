import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function AIModelCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">AI模型</CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup type="single" defaultValue="gemini" className="w-full">
          <ToggleGroupItem value="gemini" className="w-1/2">Gemini</ToggleGroupItem>
          <ToggleGroupItem value="openai" className="w-1/2">OpenAI</ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}
