import sharp from 'sharp';
import type { FrameData, ThumbnailFrame } from './types';

export class ThumbnailGenerator {
  private width: number;
  private quality: number;

  constructor(width = 160, quality = 50) {
    this.width = width;
    this.quality = quality;
  }

  async generate(frame: FrameData): Promise<ThumbnailFrame> {
    const thumbnailData = await sharp(Buffer.from(frame.data))
      .resize(this.width)
      .jpeg({ quality: this.quality })
      .toBuffer();

    return {
      deviceId: frame.deviceId,
      data: new Uint8Array(thumbnailData),
      timestamp: frame.timestamp,
      width: this.width,
      height: Math.round((frame.height / frame.width) * this.width),
    };
  }

  setWidth(width: number): void {
    this.width = width;
  }

  setQuality(quality: number): void {
    this.quality = quality;
  }
}
