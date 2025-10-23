import { Pencil } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'

// ------------------------------------
// 自定义 ToggleGroupItem 样式
// ------------------------------------
/**
 * 这是一个为深色主题定制的 ToggleGroupItem 样式。
 * shadcn/ui 默认的 'outline' 变体是为浅色模式设计的。
 */
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

// ------------------------------------
// 偏好设置组 (子组件)
// ------------------------------------
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

// ------------------------------------
// 人物偏好卡片 (子组件)
// ------------------------------------
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

// ------------------------------------
// 主页面组件
// ------------------------------------
export default function CharacterSettingsPage() {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground lg:p-12">
      
      {/* --------------------------- */}
      {/* 页面头部 */}
      {/* --------------------------- */}
      <header className="mb-10 flex items-center gap-4">
        <img
          src="https://placehold.co/64x64/334155/e2e8f0?text=Hu"
          alt="Hu Tao Avatar"
          className="h-16 w-16 rounded-full border-2 border-border"
        />
        <h1 className="text-3xl font-semibold">Hu Tao</h1>
        <Pencil className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground" />
      </header>

      {/* --------------------------- */}
      {/* 主内容网格 */}
      {/* --------------------------- */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        
        {/* --------------------------- */}
        {/* 左侧设置区域 (2/3 宽度) */}
        {/* --------------------------- */}
        <section className="flex flex-col gap-10 lg:col-span-2">
          
          <PreferenceGroup title="默认喜好">
            <ToggleGroup type="single" defaultValue="jp" className="flex flex-wrap gap-3">
              <ToggleGroupItem value="jp" className={toggleItemClasses}>
                日漫
              </ToggleGroupItem>
              <ToggleGroupItem value="us" className={toggleItemClasses}>
                美漫
              </ToggleGroupItem>
              <ToggleGroupItem value="cn" className={toggleItemClasses}>
                国漫
              </ToggleGroupItem>
              <ToggleGroupItem value="kr" className={toggleItemClasses}>
                韩漫
              </ToggleGroupItem>
            </ToggleGroup>
          </PreferenceGroup>

          <PreferenceGroup title="漫画网格布局">
            <ToggleGroup type="single" defaultValue="4-panel" className="flex flex-wrap gap-3">
              <ToggleGroupItem value="4-panel" className={toggleItemClasses}>
                四宫格
              </ToggleGroupItem>
              <ToggleGroupItem value="left-right" className={toggleItemClasses}>
                左右主辅
              </ToggleGroupItem>
              <ToggleGroupItem value="right-long" className={toggleItemClasses}>
                右侧长栏
              </ToggleGroupItem>
              <ToggleGroupItem value="top-down" className={toggleItemClasses}>
                上下排列
              </ToggleGroupItem>
            </ToggleGroup>
          </PreferenceGroup>
          
          <PreferenceGroup title="漫画语言">
            <Button
              className="h-auto px-6 py-2"
            >
              精确短语
            </Button>
          </PreferenceGroup>

        </section>

        {/* --------------------------- */}
        {/* 右侧人物偏好 (1/3 宽度) */}
        {/* --------------------------- */}
        <aside className="lg:col-span-1">
          <h2 className="mb-4 text-lg font-medium text-foreground">人物偏好</h2>
          <div className="grid grid-cols-2 gap-4">
            
            {/* 示例人物卡片 */}
            <CharacterCard 
              imageUrl="https://placehold.co/150x200/404040/9ca3af?text=男" 
              label="男, 年轻" 
            />
            <CharacterCard 
              imageUrl="https://placehold.co/150x200/404040/9ca3af?text=女" 
              label="女, 年轻" 
            />
            <CharacterCard 
              imageUrl="https://placehold.co/150x200/404040/9ca3af?text=男2" 
              label="男, 少年" 
            />
            <CharacterCard 
              imageUrl="https://placehold.co/150x200/404040/9ca3af?text=男3" 
              label="男, 大叔" 
            />

          </div>
        </aside>

      </main>
    </div>
  );
}