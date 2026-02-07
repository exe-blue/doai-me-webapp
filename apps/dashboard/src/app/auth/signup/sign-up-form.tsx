'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@packages/ui';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { createClient } from '@/lib/supabase/client';

const signUpSchema = z
  .object({
    email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
    password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다.'),
    confirmPassword: z.string().min(1, '비밀번호 확인을 입력해주세요.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

type SignUpFormData = z.infer<typeof signUpSchema>;

export function SignUpForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormData) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground bg-background">
        <div className="bg-primary h-2 w-full" />
        <div className="p-6 space-y-4 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-primary" />
          <h2 className="font-head text-xl font-bold">이메일을 확인해주세요</h2>
          <p className="text-sm text-muted-foreground">
            확인 이메일을 보냈습니다. 이메일의 링크를 클릭하여 계정을 활성화해주세요.
          </p>
          <Link
            href="/auth/signin"
            className="inline-block text-sm font-head font-semibold text-foreground hover:underline"
          >
            로그인 페이지로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground bg-background">
      {/* Accent bar */}
      <div className="bg-primary h-2 w-full" />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="font-head text-2xl font-bold">DoAi.Me</h1>
          <p className="text-sm text-muted-foreground">
            새 계정을 만들어 시작하세요
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-head font-semibold">
              이메일
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="font-head font-semibold">
              비밀번호
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="confirmPassword"
              className="font-head font-semibold"
            >
              비밀번호 확인
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full gap-2 font-head font-semibold hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                처리 중...
              </>
            ) : (
              <>
                회원가입
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-foreground" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground font-head">
              또는
            </span>
          </div>
        </div>

        {/* OAuth buttons */}
        <OAuthButtons providers={['google', 'github', 'kakao']} />

        {/* Sign in link */}
        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{' '}
          <Link
            href="/auth/signin"
            className="font-head font-semibold text-foreground hover:underline"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
