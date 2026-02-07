'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) throw error;
      setSuccess(true);

      setTimeout(() => {
        router.push('/auth/signin');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.');
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
          <h1 className="font-head text-2xl font-bold">새 비밀번호 설정</h1>
          <p className="text-sm text-muted-foreground">
            {success ? '비밀번호가 변경되었습니다' : '새로운 비밀번호를 입력해주세요'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success ? (
          <div className="space-y-4">
            <div className="border-2 border-foreground bg-primary/10 p-4 text-center space-y-3">
              <CheckCircle className="h-10 w-10 mx-auto text-primary" />
              <p className="text-sm font-head font-semibold">
                비밀번호가 성공적으로 변경되었습니다.
              </p>
              <p className="text-xs text-muted-foreground">
                잠시 후 로그인 페이지로 이동합니다...
              </p>
            </div>

            <Button
              asChild
              className="w-full gap-2 font-head font-semibold hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
            >
              <Link href="/auth/signin">
                로그인하기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="font-head font-semibold">
                새 비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-head font-semibold">
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
                  비밀번호 변경
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
