import { createClient } from '@supabase/supabase-js';
type TestDB = {
  public: {
    Tables: {
      alerts: {
        Row: { id: number; message: string; level: string | null };
        Insert: { message: string; level?: string | null };
        Update: { message?: string; level?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
const db = createClient<TestDB>('x', 'y');
async function test() {
  const { data, error } = await db.from('alerts').insert({ message: 'hello' }).select().single();
  if (!error) console.log(data.id);
  const { error: e2 } = await db.from('alerts').update({ level: 'info' }).eq('id', 1);
}
