import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router'
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
import { useAuth } from '@/hooks/use-auth'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'

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
const LeftPanel = () => {
  const logoSrc = proxiedStatic('https://storage.mangasuperb.anranz.xyz/static/logo.png')
  const demoSrc = proxiedStatic('https://storage.mangasuperb.anranz.xyz/static/%E7%94%9F%E6%88%90%E7%9A%84%E6%BC%AB%E7%94%BB2.png')

  return (
    <div className="hidden h-screen flex-col justify-between bg-muted p-10 text-muted-foreground lg:flex">
      <div className="flex items-center gap-3">
        <img
          src={logoSrc}
          alt="logo"
          className="h-8 w-8 rounded object-cover invert dark:invert-0"
        />
        <span className="text-2xl font-bold text-foreground">MangaSuperb</span>
      </div>

      <div className="mx-auto w-full max-w-2xl rounded-lg bg-card p-2 shadow-lg">
        <div
          className="aspect-4/3 w-full rounded bg-muted bg-cover bg-center"
          style={{ backgroundImage: `url(${demoSrc})` }}
          aria-label="首页示例展示"
        />
      </div>

      <p className="text-center text-sm">
        Power by MangaSuperb
      </p>
    </div>
  )
}

const AuthForm = () => {
  const navigate = useNavigate()
  const location = useLocation() as any
  const { login, register: registerAction, loginState, registerState } = useAuth()
  const { t } = useI18n(['auth', 'common'])

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
    await login({ email: values.email, password: values.password })
    const to = location?.state?.from?.pathname ?? '/'
    navigate(to, { replace: true })
  }

  async function onRegisterSubmit(values: any) {
    await registerAction({
      username: values.username,
      email: values.email,
      password: values.password,
    })
    const to = location?.state?.from?.pathname ?? '/'
    navigate(to, { replace: true })
  }

  return (
    <div className="relative flex h-screen flex-col justify-center bg-background p-10 text-foreground">
      <div className="w-full max-w-sm mx-auto">
        <Tabs defaultValue="login" className="w-full">
          <div className="flex w-full items-center justify-center">
            <TabsList className="grid w-[280px] grid-cols-2">
              <TabsTrigger value="login">{String(t('auth:tabs.login'))}</TabsTrigger>
              <TabsTrigger value="register">{String(t('auth:tabs.register'))}</TabsTrigger>
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
                      <FormLabel>{String(t('auth:form.email'))}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={String(t('auth:form.email.placeholder'))} className="h-12" {...field} />
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
                      <FormLabel>{String(t('auth:form.password'))}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={String(t('auth:form.password.placeholder'))} className="h-12" {...field} />
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
                          {String(t('common:terms.label'))}
                          <a href="#" className="px-1 text-primary hover:underline">{String(t('common:terms.userAgreement'))}</a>
                          {' '}
                          &
                          {' '}
                          <a href="#" className="pl-1 text-primary hover:underline">{String(t('common:terms.privacyPolicy'))}</a>
                        </Label>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={loginForm.formState.isSubmitting || loginState.isMutating}
                  className="mt-4 h-10 w-full py-6 text-lg font-semibold"
                >
                  {loginForm.formState.isSubmitting || loginState.isMutating
                    ? String(t('common:action.processing'))
                    : String(t('auth:submit.login'))}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="register" className="mt-8">
            <div className="mb-10">
              <h1 className="text-3xl font-semibold text-foreground">{String(t('auth:title.register'))}</h1>
              <p className="mt-2 text-muted-foreground">{String(t('auth:subtitle.register'))}</p>
            </div>
            <Form {...registerForm}>
              <form className="space-y-6" onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                {/* 用户名 */}
                <FormField
                  control={registerForm.control as any}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{String(t('auth:form.username'))}</FormLabel>
                      <FormControl>
                        <Input placeholder={String(t('auth:form.username.placeholder'))} className="h-12" {...field} />
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
                      <FormLabel>{String(t('auth:form.email'))}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={String(t('auth:form.email.placeholder'))} className="h-12" {...field} />
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
                      <FormLabel>{String(t('auth:form.password'))}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={String(t('auth:form.password.placeholder'))} className="h-12" {...field} />
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
                          {String(t('common:terms.label'))}
                          <a href="#" className="px-1 text-primary hover:underline">{String(t('common:terms.userAgreement'))}</a>
                          {' '}
                          &
                          {' '}
                          <a href="#" className="pl-1 text-primary hover:underline">{String(t('common:terms.privacyPolicy'))}</a>
                        </Label>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={registerForm.formState.isSubmitting || registerState.isMutating}
                  className="mt-4 h-10 w-full py-6 text-lg font-semibold"
                >
                  {registerForm.formState.isSubmitting || registerState.isMutating
                    ? String(t('common:action.processing'))
                    : String(t('auth:submit.register'))}
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