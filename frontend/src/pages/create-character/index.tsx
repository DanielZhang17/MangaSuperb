import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@/components/ui/shadcn-io/dropzone'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCreateCharacter } from '@/hooks/use-characters'
import { useI18n } from '@/hooks/use-i18n'
import usePollCharacter from '@/hooks/use-poll-character'

import { LoadingModal } from './loading-modal'
import { CreationSuccessModal } from './success-modal'

export default function CharacterCreatorPage() {
  const { t } = useI18n(['createCharacter', 'common', 'home'])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loadingOpen, setLoadingOpen] = useState(false)
  const [files, setFiles] = useState<File[] | undefined>(undefined)
  const [optimize, setOptimize] = useState(false)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | undefined>(undefined)
  const [createdCharacter, setCreatedCharacter] = useState<import('@/service/types').ICharacter | undefined>(
    undefined,
  )
  const [jobId, setJobId] = useState<string | null>(null)
  const [characterDescription, setCharacterDescription] = useState(
    '他看上去约莫二十五六岁，身形清瘦如冬日枯枝。总在图书馆旧书区消磨时间的...（此处省略）...但他若有若无的面部轮廓堪称古典——额头饱满，鼻梁挺拔如希腊雕塑，但真正让人过目不忘的，是那双隐藏在无框眼镜后的眼睛。',
  )

  const { create, state } = useCreateCharacter()
  const placeholderImage = 'https://placehold.co/400x600/334155/e2e8f0?text=AI+Character'

  const VITE_API_KEY = import.meta.env.VITE_API_KEY as string | undefined

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(file)
    })

  const { startPolling, stopPolling } = usePollCharacter({
    intervalMs: 2000,
    maxAttempts: 30,
    onUpdate: (c) => setCreatedCharacter(c),
    onComplete: (c) => {
      setCreatedCharacter(c)
      setLoadingOpen(false)
      setIsModalOpen(true)
      toast.success('人物创建完成')
    },
    onTimeout: () => {
      setLoadingOpen(false)
      setIsModalOpen(true)
      toast.error('生成超时，请稍后在“我的人物”中查看')
    },
  })

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const handleCreate = async () => {
    setLoadingOpen(true)
    const name = `角色-${Date.now()}`

    // 处理参考图 base64 与 API Key 逻辑
    let referenceImages: string[] | undefined
    try {
      if (files && files.length > 0) {
        referenceImages = await Promise.all(files.slice(0, 3).map((f) => fileToDataUrl(f)))
      }
    } catch {
      setLoadingOpen(false)
      toast.error('参考图片读取失败，请重试')

      return
    }

    const needApiKey = optimize || (referenceImages && referenceImages.length > 0)
    if (needApiKey && !VITE_API_KEY) {
      setLoadingOpen(false)
      toast.error('未检测到 API Key，请在环境变量中设置 VITE_API_KEY')
      
      return
    }

    try {
      const res = await create({
        name,
        description: characterDescription,
        optimize,
        reference_images: referenceImages,
        api_key: needApiKey ? VITE_API_KEY : undefined,
      })

      setCreatedCharacter(res.character)
      setJobId(res.job_id)
      setGeneratedImageUrl(res.character?.image_url || placeholderImage)

      // 只有当后端已经是 completed 且有 image_url 时，才直接进入成功态；
      // 其它状态（包含 pending/processing/finished 等）都继续轮询，保持 loading 打开。
      if (res.character?.image_status === 'completed' && res.character?.image_url) {
        setLoadingOpen(false)
        setIsModalOpen(true)
        toast.success('人物创建成功')
      } else if (res.character?.id) {
        setLoadingOpen(true)
        startPolling(res.character.id)
      }
    } catch (err: any) {
      setLoadingOpen(false)
      toast.error(err?.message || '创建失败，请稍后重试')
    }
  }

  return (
    <div className="flex w-full min-h-screen p-8 bg-background text-foreground">
      <div className="flex flex-col w-1/2 space-y-6 pr-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{String(t('createCharacter:title.new'))}</h1>
          <div className="flex items-center space-x-2">
            <Label htmlFor="ai-optimize" className="text-muted-foreground">{String(t('createCharacter:aiOptimize'))}</Label>
            <Switch id="ai-optimize" checked={optimize} onCheckedChange={setOptimize} />
          </div>
        </header>
        <div>
          <Button variant="secondary">{String(t('createCharacter:random'))}</Button>
        </div>
        <Textarea
          value={characterDescription}
          onChange={(e) => setCharacterDescription(e.target.value)}
          className="min-h-[150px] resize-y"
          placeholder={String(t('createCharacter:description.placeholder'))}
        />
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">{String(t('createCharacter:reference.title'))}</h2>
            <span className="text-sm text-muted-foreground">{String(t('createCharacter:reference.count', { count: files?.length ?? 0 }))}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {String(t('createCharacter:reference.tip'))}
          </p>
          
          <Dropzone
            accept={{ 'image/*': [] }}
            maxFiles={3}
            src={files}
            onDrop={(accepted) => {
              setFiles(accepted.length ? accepted : undefined);
            }}
            className="w-fit"
          >
            <DropzoneEmptyState>
              <div className="flex w-full items-center p-8">
                <Plus className='size-8' />
              </div>
            </DropzoneEmptyState>
            <DropzoneContent />
          </Dropzone>
        </div>

        <div className="pt-4">
          <Button 
            size="lg" 
            className="w-48"
            disabled={state.isMutating}
            onClick={handleCreate}
          >
            {String(t('createCharacter:generate'))}
          </Button>
        </div>

      </div>

      <LoadingModal
        open={loadingOpen}
        onOpenChange={setLoadingOpen}
      />
      <CreationSuccessModal 
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        character={createdCharacter}
        jobId={jobId}
        fallbackImageUrl={generatedImageUrl ?? placeholderImage}
      />

    </div>
  );
}