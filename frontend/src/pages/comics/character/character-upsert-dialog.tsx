import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import CharactersApi from '@/apis/characters'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AI_PROVIDER_LABELS } from '@/hooks/use-ai-providers'
import type { AiProviderId, AiProvidersResponse, ICharacter } from '@/service/types'

const SEX_OPTIONS = [
  { value: 'unspecified', label: '未指定' },
  { value: 'female', label: '女性' },
  { value: 'male', label: '男性' },
  { value: 'non-binary', label: '非二元' },
  { value: 'other', label: '其他' },
]

const FALLBACK_PROVIDERS: AiProvidersResponse = {
  defaults: {
    image: 'gemini',
    text: 'gemini',
  },
  providers: {
    gemini: { image: true, text: true },
    third_party: { image: true, text: true },
  },
}

function firstAvailableProvider(
  providers: AiProvidersResponse,
  kind: 'image' | 'text',
  preferred?: AiProviderId,
): AiProviderId {
  if (preferred && providers.providers[preferred]?.[kind]) return preferred
  const defaultProvider = providers.defaults[kind]
  if (providers.providers[defaultProvider]?.[kind]) return defaultProvider

  return ((Object.keys(providers.providers) as AiProviderId[]).find(
    (provider) => providers.providers[provider]?.[kind],
  ) ?? defaultProvider)
}

export function CharacterUpsertDialog({
  mode,
  open,
  character,
  initialValues,
  providers = FALLBACK_PROVIDERS,
  defaultProvider,
  onOpenChange,
  onSaved,
}: {
  mode: 'create' | 'edit'
  open: boolean
  character?: ICharacter
  initialValues?: Partial<Pick<ICharacter, 'name' | 'description' | 'sex' | 'style_prompt'>>
  providers?: AiProvidersResponse
  defaultProvider?: AiProviderId
  onOpenChange: (open: boolean) => void
  onSaved: (character: ICharacter) => void
}) {
  const imageOptions = useMemo(
    () => (Object.keys(providers.providers) as AiProviderId[]).filter(
      (provider) => providers.providers[provider]?.image,
    ),
    [providers],
  )
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sex, setSex] = useState('unspecified')
  const [stylePrompt, setStylePrompt] = useState('')
  const [optimize, setOptimize] = useState(false)
  const [provider, setProvider] = useState<AiProviderId>(
    firstAvailableProvider(providers, 'image', defaultProvider),
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(mode === 'edit' ? character?.name ?? '' : initialValues?.name ?? '')
    setDescription(mode === 'edit' ? character?.description ?? '' : initialValues?.description ?? '')
    setSex(mode === 'edit' ? character?.sex ?? 'unspecified' : initialValues?.sex ?? 'unspecified')
    setStylePrompt(mode === 'edit' ? character?.style_prompt ?? '' : initialValues?.style_prompt ?? '')
    setOptimize(false)
    setProvider(firstAvailableProvider(providers, 'image', defaultProvider))
  }, [character, defaultProvider, initialValues, mode, open, providers])

  const selectedTextProvider = firstAvailableProvider(providers, 'text', provider)
  const title = mode === 'edit' ? '编辑人物' : '新建人物'
  const submitLabel = mode === 'edit' ? '保存并重新生成' : '创建并生成'

  const handleSubmit = async () => {
    const cleanDescription = description.trim()
    if (!cleanDescription) {
      toast.error('人物描述不能为空')

      return
    }

    try {
      setSubmitting(true)
      const payload = {
        name: name.trim() || 'unspecified',
        description: cleanDescription,
        sex,
        style_prompt: stylePrompt.trim(),
        optimize,
        image_provider: provider,
        text_provider: selectedTextProvider,
      }
      const response = mode === 'edit' && character
        ? await CharactersApi.update(character.id, payload)
        : await CharactersApi.create(payload)

      onSaved(response.character)
      toast.success(mode === 'edit' ? '人物已更新，开始重新生成形象' : '人物已创建，开始生成形象')
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error?.message || (mode === 'edit' ? '人物更新失败' : '人物创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            保存后会重新排队生成人物形象，原失败状态会被新的生成状态替代。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="character-name">人物名称</Label>
            <Input
              id="character-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：白石遥"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="character-sex">性别</Label>
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger id="character-sex" className="w-full">
                <SelectValue placeholder="选择性别" />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="character-description">人物描述</Label>
            <Textarea
              id="character-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[180px] resize-y"
              placeholder="写清楚角色名、年龄、服装、发型、气质和漫画风格。"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="character-style">风格补充</Label>
            <Input
              id="character-style"
              value={stylePrompt}
              onChange={(event) => setStylePrompt(event.target.value)}
              placeholder="例如：日式校园漫画风格"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="character-provider">AI模型</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as AiProviderId)}>
              <SelectTrigger id="character-provider" className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {imageOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {AI_PROVIDER_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">提交前优化描述</p>
              <p className="text-xs text-muted-foreground">开启后会多调用一次文本模型。</p>
            </div>
            <Switch checked={optimize} onCheckedChange={setOptimize} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '提交中…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
