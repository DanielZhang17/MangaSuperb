import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AIModelCard } from "./ai-model-card"
import { MangaStyleCard } from "./manga-style-card"
import { MangaGridLayoutCard } from "./manga-grid-layout-card"
import { storyStepAtom, activeTabAtom } from "./atoms"
import { Card, CardContent } from "@/components/ui/card"
import { LoadingView } from "./loading-view"

const panelsData = [
  {
    id: 1,
    text: "秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声，顺着石梯，朝下方滚去。“姓马的，我诅咒你不得好死！”他竭斯底里的怒吼，充满怨毒。",
  },
  {
    id: 2,
    text: "好不容易，他才登上顶峰，可是没想到，这个女人竟如此歹毒，这不是摆明的断他活路吗？",
  },
  { id: 3, text: "“还敢诅咒我，真是不知死活，现在我就杀了你！”马红梅眸中杀机闪烁，正要追下去，斩草除根." },
  { id: 4, text: "“发生了什么事？”但就在这时，一道中气十足的喝声，从宫殿内传出." },
  { id: 5, text: "紧接着。宫殿内走出一个中年男人。他身高七尺，身穿一件紫色的衣服，龙行虎步，双目有神，不怒自威." },
  { id: 6, text: "马红梅黛眉一，转身看向中年男人，躬身道：“见过三殿主。”" },
  { id: 7, text: "三殿主点点头，看着不停朝下面滚去的秦飞扬，皱眉道：“他怎么又来了？" },
  { id: 8, text: "马红梅笑道：“还不是想要洗髓丹." },
  { id: 9, text: "三殿主疑惑道：“那他怎么滚下去了？”" },
]

function InputView() {
  const [, setStoryStep] = useAtom(storyStepAtom)
  return (
    <div className="space-y-8 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Panel */}
        <div className="md:col-span-2 space-y-4">
          <div className="relative">
            <Textarea
              placeholder="秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声，顺着石梯，朝下方滚去..."
              className="h-[600px] resize-none"
              defaultValue={panelsData.map(p => p.text).join("\n\n")}
            />
            <div className="absolute bottom-4 right-4 text-sm text-muted-foreground">
              260/1000字
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          <AIModelCard />
          <MangaStyleCard />
          <MangaGridLayoutCard />
        </div>
      </div>
      <div className="flex justify-center">
        <Button size="lg" onClick={() => setStoryStep('panels')}>下一步</Button>
      </div>
    </div>
  )
}

function PanelsView() {
  const [, setStoryStep] = useAtom(storyStepAtom)
  return (
    <div className="space-y-8 mt-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          {panelsData.map((panel) => (
            <div key={panel.id} className="flex items-start gap-4 p-4 border rounded-md">
              <div className="text-lg font-bold">{String(panel.id).padStart(2, '0')}</div>
              <div className="flex-1 text-muted-foreground">
                {panel.text}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex justify-center gap-4">
        <Button size="lg" variant="outline" onClick={() => setStoryStep('input')}>返回编辑</Button>
        <Button size="lg" onClick={() => setStoryStep('loading')}>下一步</Button>
      </div>
    </div>
  )
}

export function StoryTab() {
  const [storyStep, setStoryStep] = useAtom(storyStepAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)

  const handleStoryLoadingComplete = () => {
    setActiveTab("characters")
    setStoryStep("input")
  }

  if (storyStep === 'panels') {
    return <PanelsView />
  }
  
  if (storyStep === 'loading') {
    return <LoadingView 
              initialText="剧情解析中..." 
              onCompletion={handleStoryLoadingComplete}
              textChanges={[{ progress: 40, text: "漫画生成中..." }]}
            />
  }

  return <InputView />
}
