import { zodResolver } from '@hookform/resolvers/zod'
import { Rocket } from 'lucide-react' // Logo 占位符
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import request from '@/service'

// 登录与注册校验规则
const anyZodResolver = zodResolver as unknown as (schema: unknown) => any

const LoginFormSchema = z.object({
  email: z.string().min(1, '邮箱不能为空').email('请输入有效邮箱'),
  password: z.string().min(6, '密码至少6位'),
  terms: z.boolean().refine((v) => v === true, '请勾选同意协议后继续'),
})

const RegisterFormSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符'),
  email: z.string().min(1, '邮箱不能为空').email('请输入有效邮箱'),
  password: z.string().min(6, '密码至少6位'),
  terms: z.boolean().refine((v) => v === true, '请勾选同意协议后继续'),
})

/**
 * 左侧的品牌展示面板
 */
const LeftPanel = () => (
  <div className="hidden h-screen flex-col justify-between bg-muted p-10 text-muted-foreground lg:flex">
    <div className="flex items-center gap-3">
      <div className="rounded-full bg-background p-2 text-foreground">
        <Rocket className="h-6 w-6" />
      </div>
      <span className="text-2xl font-bold text-foreground">MangaSuperb</span>
    </div>
    
    <div className="mx-auto w-full max-w-2xl rounded-lg bg-card p-2 shadow-lg">
      <div className="flex aspect-4/3 w-full items-center justify-center rounded bg-muted">
        <span className="text-muted-foreground">漫画图片占位符</span>
      </div>
    </div>
    
    <p className="text-center text-sm">
      Power by MangaSuperb
    </p>
  </div>
)

const AuthForm = () => {
  const navigate = useNavigate()

  // login form
  const loginForm = useForm({
    resolver: anyZodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '', terms: false },
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  // register form
  const registerForm = useForm({
    resolver: anyZodResolver(RegisterFormSchema),
    defaultValues: { username: '', email: '', password: '', terms: false },
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  async function onLoginSubmit(values: any) {
    const res = await request<{ email: string; password: string }, { token: string }>({
      method: 'POST',
      url: '/auth/login',
      data: { email: values.email, password: values.password },
      showError: true,
    })
    localStorage.setItem('token', (res as any)?.token ?? '')
    navigate('/')
  }

  async function onRegisterSubmit(values: any) {
    const res = await request<
      { username: string; email: string; password: string },
      { token: string }
    >({
      method: 'POST',
      url: '/auth/register',
      data: {
        username: values.username,
        email: values.email,
        password: values.password,
      },
      showError: true,
    })
    localStorage.setItem('token', (res as any)?.token ?? '')
    navigate('/')
  }

  return (
    <div className="relative flex h-screen flex-col justify-center bg-background p-10 text-foreground">
      <div className="w-full max-w-sm mx-auto">
        <Tabs defaultValue="login" className="w-full">
          <div className="flex w-full items-center justify-center">
            <TabsList className="grid w-[280px] grid-cols-2">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="login" className="mt-8">
            <div className="h-[84px]" />
            <Form {...loginForm}>
              <form className="space-y-6" onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                {/* 邮箱 */}
                <FormField
                  control={loginForm.control as any}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>邮箱</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="邮箱" className="h-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 密码 */}
                <FormField
                  control={loginForm.control as any}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密码</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="密码" className="h-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 协议 */}
                <FormField
                  control={loginForm.control as any}
                  name="terms"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-2 pt-2">
                        <FormControl>
                          <Checkbox
                            checked={Boolean(field.value)}
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                          />
                        </FormControl>
                        <Label className="text-sm text-muted-foreground">
                          我已阅读并同意
                          <a href="#" className="px-1 text-primary hover:underline">《用户协议》</a>
                          以及
                          <a href="#" className="pl-1 text-primary hover:underline">《隐私政策》</a>
                        </Label>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={loginForm.formState.isSubmitting}
                  className="mt-4 h-10 w-full py-6 text-lg font-semibold"
                >
                  {loginForm.formState.isSubmitting ? '处理中…' : 'LOGIN'}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="register" className="mt-8">
            <div className="mb-10">
              <h1 className="text-3xl font-semibold text-foreground">欢迎注册MangaSuperb</h1>
              <p className="mt-2 text-muted-foreground">根据小说AI生成相应漫画</p>
            </div>
            <Form {...registerForm}>
              <form className="space-y-6" onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                {/* 用户名 */}
                <FormField
                  control={registerForm.control as any}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>用户名</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入用户名" className="h-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 邮箱 */}
                <FormField
                  control={registerForm.control as any}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>邮箱</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="请输入邮箱" className="h-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 密码 */}
                <FormField
                  control={registerForm.control as any}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密码</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="请输入密码" className="h-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 协议 */}
                <FormField
                  control={registerForm.control as any}
                  name="terms"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-2 pt-2">
                        <FormControl>
                          <Checkbox
                            checked={Boolean(field.value)}
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                          />
                        </FormControl>
                        <Label className="text-sm text-muted-foreground">
                          我已阅读并同意
                          <a href="#" className="px-1 text-primary hover:underline">《用户协议》</a>
                          以及
                          <a href="#" className="pl-1 text-primary hover:underline">《隐私政策》</a>
                        </Label>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={registerForm.formState.isSubmitting}
                  className="mt-4 h-10 w-full py-6 text-lg font-semibold"
                >
                  {registerForm.formState.isSubmitting ? '处理中…' : '注册'}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
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