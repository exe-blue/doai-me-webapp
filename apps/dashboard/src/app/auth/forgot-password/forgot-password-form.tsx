'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

const forgotPasswordSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 재설정 이메일 전송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground bg-background">
      {/* Accent bar */}
      <div className="bg-primary h-2 w-full" />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="font-head text-2xl font-bold">비밀번호 재설정</h1>
          <p className="text-sm text-muted-foreground">
            {sent
              ? '이메일을 확인해주세요'
              : '가입한 이메일 주소를 입력하면 재설정 링크를 보내드립니다'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {sent ? (
          /* Success state */
          <div className="space-y-4">
            <div className="border-2 border-foreground bg-primary/10 p-4 text-center space-y-3">
              <Mail className="h-10 w-10 mx-auto text-primary" />
              <p className="text-sm font-head font-semibold">
                비밀번호 재설정 링크를 이메일로 보냈습니다.
              </p>
              <p className="text-xs text-muted-foreground">
                이메일이 도착하지 않으면 스팸 폴더를 확인해주세요.
              </p>
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full gap-2 font-head font-semibold hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
            >
              <Link href="/auth/signin">
                <ArrowLeft className="h-4 w-4" />
                로그인으로 돌아가기
              </Link>
            </Button>
          </div>
        ) : (
          /* Form */
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

            <Button
              type="submit"
              className="w-full gap-2 font-head font-semibold hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  전송 중...
                </>
              ) : (
                <>
                  재설정 링크 보내기
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/auth/signin"
                className="font-head font-semibold text-foreground hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                로그인으로 돌아가기
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
