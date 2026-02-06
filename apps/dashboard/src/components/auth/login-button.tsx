'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export function LoginButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  if (user) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="로그아웃"
        onClick={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.reload();
        }}
      >
        <LogOut className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="icon" asChild>
      <Link href="/auth/signin" aria-label="로그인">
        <LogIn className="h-5 w-5" />
      </Link>
    </Button>
  );
}
