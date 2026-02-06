'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Upload, X, File, Image as ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileUploadProps {
  accept?: string;
  maxSize?: number; // in bytes
  multiple?: boolean;
  onUpload: (files: File[]) => void;
  onError?: (error: string) => void;
  className?: string;
}

interface FilePreview {
  file: File;
  preview?: string;
}

export function FileUpload({
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  multiple = false,
  onUpload,
  onError,
  className,
}: FileUploadProps) {
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateFile = useCallback((file: File): string | null => {
    if (maxSize && file.size > maxSize) {
      return `파일 크기가 ${formatFileSize(maxSize)}를 초과합니다.`;
    }
    if (accept) {
      const acceptedTypes = accept.split(',').map((t) => t.trim());
      const isAccepted = acceptedTypes.some((type) => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
      });
      if (!isAccepted) {
        return '지원하지 않는 파일 형식입니다.';
      }
    }
    return null;
  }, [accept, maxSize]);

  const processFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: FilePreview[] = [];

    Array.from(fileList).forEach((file) => {
      const error = validateFile(file);
      if (error) {
        onError?.(error);
        return;
      }

      const preview = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined;

      newFiles.push({ file, preview });
    });

    if (newFiles.length > 0) {
      if (multiple) {
        setFiles((prev) => [...prev, ...newFiles]);
      } else {
        // Clean up previous preview
        files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
        setFiles(newFiles.slice(0, 1));
      }
    }
  }, [files, multiple, onError, validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  }, [processFiles]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      const removed = newFiles.splice(index, 1)[0];
      if (removed.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return newFiles;
    });
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      onUpload(files.map((f) => f.file));
      // Clean up previews
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
        />
        <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          파일을 드래그하거나 클릭하여 업로드
        </p>
        {accept && (
          <p className="text-xs text-muted-foreground mt-1">
            지원 형식: {accept}
          </p>
        )}
        {maxSize && (
          <p className="text-xs text-muted-foreground">
            최대 크기: {formatFileSize(maxSize)}
          </p>
        )}
      </div>

      {/* File previews */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {files.map((filePreview, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50"
              >
                {filePreview.preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={filePreview.preview}
                    alt="Preview"
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : filePreview.file.type.startsWith('image/') ? (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                ) : (
                  <File className="h-10 w-10 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {filePreview.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(filePreview.file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}

            <Button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  업로드
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
