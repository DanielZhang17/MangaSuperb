import { useAtom } from "jotai"
import { useEffect } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { activeTabAtom, characterStepAtom } from "./atoms"
import { LoadingView } from "./loading-view"

const charactersData = [
  { id: 1, name: "秦飞扬", gender: "男" },
  { id: 2, name: "马红梅", gender: "女" },
  { id: 3, name: "三殿主", gender: "男" },
]

function SelectionView() {
  const [, setCharacterStep] = useAtom(characterStepAtom)

  useEffect(() => {
    toast("请为你的人物选择形象", { position: "top-center" })
    toast("已根据故事为你识别到 3 个角色", { position: "top-center", duration: 4000 })
  }, [])

  return (
    <div className="space-y-8 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
        {charactersData.map((char) => (
          <Card key={char.id}>
            <CardContent className="p-4 flex flex-col items-center gap-4">
              <div className="w-full h-80 bg-gray-200 rounded-md"></div>
              <p className="font-semibold">{char.gender}，{char.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex justify-center">
        <Button size="lg" onClick={() => setCharacterStep('loading')}>下一步</Button>
      </div>
    </div>
  )
}

export function CharactersTab() {
  const [characterStep, setCharacterStep] = useAtom(characterStepAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)

  const handleCharacterLoadingComplete = () => {
    setActiveTab("image-generation")
    setCharacterStep("selection")
  }

  if (characterStep === 'loading') {
    return <LoadingView 
              initialText="漫画生成中..."
              onCompletion={handleCharacterLoadingComplete}
            />
  }

  return <SelectionView />
}
