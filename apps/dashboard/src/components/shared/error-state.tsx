import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-destructive/30">
      <AlertTriangle className="h-12 w-12 text-destructive/50 mb-4" />
      <h3 className="font-head text-lg font-bold text-foreground mb-1">
        오류가 발생했습니다
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {message || '데이터를 불러오는 중 문제가 발생했습니다'}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
