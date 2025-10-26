import { useAtom } from 'jotai'
import React from 'react'

import { userAtom } from '@/atoms'
import { InlineInput } from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { useAuth } from '@/hooks/use-auth'
import { useI18n } from '@/hooks/use-i18n'
import { getAvatarUrl, proxiedStatic } from '@/lib/utils'

const toggleItemClasses = `
  bg-card
  border-border
  text-muted-foreground
  hover:bg-accent
  hover:text-foreground
  data-[state=on]:bg-primary
  data-[state=on]:text-primary-foreground
  data-[state=on]:border-transparent
  rounded-lg
  px-6
  transition-all
`
interface PreferenceGroupProps {
  title: string;
  children: React.ReactNode;
}

const PreferenceGroup: React.FC<PreferenceGroupProps> = ({ title, children }) => (
  <div className="space-y-4">
    <h2 className="text-lg font-medium text-foreground">{title}</h2>
    <div>{children}</div>
  </div>
);
interface CharacterCardProps {
  imageUrl: string;
  label: string;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ imageUrl, label }) => (
  <div
    className="flex cursor-pointer flex-col items-center gap-3 rounded-xl bg-card p-3 transition-all hover:ring-2 hover:ring-primary"
  >
    <img
      src={imageUrl}
      alt={label}
      className="aspect-3/4 w-full rounded-lg object-cover"
    />
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export default function CharacterSettingsPage() {
  const { t } = useI18n(['me', 'common'])
  const [user] = useAtom(userAtom)
  const { updateUsername } = useAuth()
  const username = user?.username ?? String(t('me:username.guest'))
  const avatarUrl = getAvatarUrl(user?.avatar_index ?? null)

  // 人物偏好示例图（走存储代理）
  const base = 'https://storage.mangasuperb.anranz.xyz/static/'
  const personaImages = [1, 2, 3, 4].map((i) => ({
    imageUrl: proxiedStatic(base + encodeURIComponent(`形象${i}.png`)),
    label: `形象${i}`,
  }))

  return (
    <div className="min-h-screen bg-background p-8 text-foreground lg:p-12">
      <header className="mb-10 flex items-center gap-4">
        <img
          src={avatarUrl}
          alt={username}
          className="h-16 w-16 rounded-full border-2 border-border"
        />
        <div className="min-w-0">
          <InlineInput
            initialValue={username}
            submitLabel={String(t('me:username.save'))}
            placeholder={String(t('me:username.placeholder'))}
            renderDisplay={(val) => (
              <h1 className="text-3xl font-semibold truncate">{val}</h1>
            )}
            onSubmit={async (v) => {
              if (!v || v === user?.username) return
              await updateUsername({ username: v })
            }}
          />
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <section className="flex flex-col gap-10 lg:col-span-2">
          
          <PreferenceGroup title={String(t('me:preference.default'))}>
            <ToggleGroup type="single" defaultValue="jp" className="flex flex-wrap">
              <ToggleGroupItem value="jp" className={toggleItemClasses}>
                {String(t('home:category.jp'))}
              </ToggleGroupItem>
              <ToggleGroupItem value="us" className={toggleItemClasses}>
                {String(t('home:category.us'))}
              </ToggleGroupItem>
              <ToggleGroupItem value="cn" className={toggleItemClasses}>
                国漫风
              </ToggleGroupItem>
              <ToggleGroupItem value="kr" className={toggleItemClasses}>
                韩漫风
              </ToggleGroupItem>
            </ToggleGroup>
          </PreferenceGroup>

          <PreferenceGroup title={String(t('me:preference.grid'))}>
            <ToggleGroup type="single" defaultValue="4-panel" className="flex flex-wrap">
              <ToggleGroupItem value="4-panel" className={toggleItemClasses}>
                {String(t('me:grid.4panel'))}
              </ToggleGroupItem>
              <ToggleGroupItem value="left-right" className={toggleItemClasses}>
                {String(t('me:grid.leftRight'))}
              </ToggleGroupItem>
              <ToggleGroupItem value="right-long" className={toggleItemClasses}>
                {String(t('me:grid.rightLong'))}
              </ToggleGroupItem>
              <ToggleGroupItem value="top-down" className={toggleItemClasses}>
                {String(t('me:grid.topDown'))}
              </ToggleGroupItem>
            </ToggleGroup>
          </PreferenceGroup>
          
          <PreferenceGroup title={String(t('me:preference.language'))}>
            <Button
              className="h-auto px-6 py-2"
            >
              {String(t('me:preference.followComicLanguage'))}
            </Button>
          </PreferenceGroup>

        </section>

        <aside className="lg:col-span-1">
          <h2 className="mb-4 text-lg font-medium text-foreground">{String(t('me:aside.title'))}</h2>
          <div className="grid grid-cols-2 gap-4">
            {personaImages.map((p) => (
              <CharacterCard key={p.label} imageUrl={p.imageUrl} label={p.label} />
            ))}

          </div>
        </aside>

      </main>
    </div>
  );
}