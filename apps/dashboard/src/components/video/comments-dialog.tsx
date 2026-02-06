'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MessageSquare } from 'lucide-react';

interface Comment {
  id: string;
  content: string;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
}

interface CommentsDialogProps {
  videoId: string;
  videoTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommentsDialog({ videoId, videoTitle, open, onOpenChange }: CommentsDialogProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !videoId) return;

    async function fetchComments() {
      setLoading(true);
      try {
        const res = await fetch(`/api/comments?video_id=${videoId}&all=true`);
        const data = await res.json();
        if (data.success) {
          setComments(data.comments || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchComments();
  }, [open, videoId]);

  const unusedCount = comments.filter(c => !c.is_used).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            댓글 목록
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{videoTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">로딩중...</div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            등록된 댓글이 없습니다
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              총 {comments.length}개 (미사용: {unusedCount}개)
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start gap-2 p-2 rounded border border-border text-sm"
                >
                  <span className="flex-1 text-foreground">{comment.content}</span>
                  <Badge
                    className={
                      comment.is_used
                        ? 'bg-gray-300 text-gray-700 border-gray-700 border-2 text-[10px]'
                        : 'bg-green-400 text-green-900 border-green-900 border-2 text-[10px]'
                    }
                  >
                    {comment.is_used ? '사용됨' : '미사용'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
