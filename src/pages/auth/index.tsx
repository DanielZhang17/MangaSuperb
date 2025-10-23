import { Rocket } from 'lucide-react' // Logo 占位符
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * 左侧的品牌展示面板
 */
const LeftPanel = () => (
  <div className="hidden h-screen flex-col justify-between bg-muted p-10 text-muted-foreground lg:flex">
    {/* 1. Logo */}
    <div className="flex items-center gap-3">
      {/* 使用 Lucide Rocket 图标作为 Logo 占位符 */}
      <div className="rounded-full bg-background p-2 text-foreground">
        <Rocket className="h-6 w-6" />
      </div>
      <span className="text-2xl font-bold text-foreground">MangaSuperb</span>
    </div>
    
    {/* 2. Manga 图片占位符 */}
    <div className="mx-auto w-full max-w-2xl rounded-lg bg-card p-2 shadow-lg">
      <div className="flex aspect-4/3 w-full items-center justify-center rounded bg-muted">
        <span className="text-muted-foreground">漫画图片占位符</span>
      </div>
    </div>
    
    {/* 3. Footer */}
    <p className="text-center text-sm">
      Power by MangaSuperb
    </p>
  </div>
)

/**
 * 右侧的认证表单 (登录/注册)
 */
const AuthForm = () => {
  // 使用 React 19 的 useState
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const isLogin = mode === 'login'

  return (
    <div className="relative flex h-screen flex-col justify-center bg-background p-10 text-foreground">
      
      {/* 1. 登录/注册 切换按钮 */}
      <div className="absolute top-8 right-8 flex gap-2">
        <Button
          variant={isLogin ? 'default' : 'ghost'}
          onClick={() => setMode('login')}
          className="h-auto px-6 py-2 text-base"
        >
          登录
        </Button>
        <Button
          variant={!isLogin ? 'default' : 'ghost'}
          onClick={() => setMode('register')}
          className="h-auto px-6 py-2 text-base"
        >
          注册
        </Button>
      </div>
      
      {/* 2. 表单容器 */}
      <div className="w-full max-w-sm mx-auto">
        
        {/* 注册模式下的标题 */}
        {!isLogin && (
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-semibold text-foreground">欢迎注册MangaSuperb</h1>
            <p className="mt-2 text-muted-foreground">探索/创作AI生成漫画</p>
          </div>
        )}
        
        {/* 登录模式下的标题 (图片1没有标题, 为保持一致性, 此处留空) */}
        {isLogin && (
          <div className="h-[84px]"> 
            {/* 这是一个占位符，以保持布局在切换时不会跳动 */}
          </div>
        )}

        {/* 3. 表单 */}
        <form className="space-y-6">
          
          {/* 用户名 (仅注册时显示) */}
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" placeholder="请输入用户名" className="h-12" />
            </div>
          )}
          
          {/* 邮箱 */}
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder={isLogin ? '邮箱' : '请输入邮箱'}
              className="h-12"
            />
          </div>

          {/* 密码 */}
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder={isLogin ? '密码' : '请输入密码'}
              className="h-12"
            />
          </div>
          
          {/* 4. 同意条款 */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox id="terms" />
            <label
              htmlFor="terms"
              className="text-sm text-muted-foreground"
            >
              我已阅读并同意 
              <a href="#" className="px-1 text-primary hover:underline">
                《用户协议》
              </a> 
              以及 
              <a href="#" className="pl-1 text-primary hover:underline">
                《隐私政策》
              </a>
            </label>
          </div>
          
          {/* 5. 提交按钮 */}
          <Button
            type="submit"
            className="mt-4 h-auto w-full py-6 text-lg font-semibold"
          >
            {isLogin ? 'LOGIN' : '注册'}
          </Button>
        </form>
      </div>
    </div>
  )
}

/**
 * 完整的认证页面
 */
export default function AuthPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
      <LeftPanel />
      <AuthForm />
    </div>
  )
}