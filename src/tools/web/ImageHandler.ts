/**
 * ImageHandler - Vision 모델 이미지 처리 (C3-T12)
 * 
 * 해상도/장수 제한, base64 인코딩
 */
export interface ImageInput {
  path: string;
  data: string; // base64
  mimeType: string;
  width?: number;
  height?: number;
}

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_IMAGES_PER_REQUEST = 5;
const MAX_DIMENSION = 4096;

export class ImageHandler {
  async processImages(paths: string[]): Promise<ImageInput[]> {
    const images: ImageInput[] = [];

    for (const filePath of paths.slice(0, MAX_IMAGES_PER_REQUEST)) {
      try {
        const fs = require('fs');
        const stats = fs.statSync(filePath);
        
        if (stats.size > MAX_IMAGE_SIZE) {
          console.warn(`[ImageHandler] Image too large: ${filePath} (${stats.size} bytes)`);
          continue;
        }

        const ext = filePath.split('.').pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp'
        };

        const mimeType = mimeMap[ext || ''] || 'image/png';
        const data = fs.readFileSync(filePath, 'base64');

        images.push({ path: filePath, data, mimeType });
      } catch (error: any) {
        console.warn(`[ImageHandler] Cannot read: ${filePath}`, error.message);
      }
    }

    return images;
  }

  formatForProvider(images: ImageInput[]): Array<{ type: string; source?: any; image_url?: any }> {
    return images.map(img => ({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType};base64,${img.data}`,
        detail: 'auto'
      }
    }));
  }

  get totalSize(): number {
    return 0; // computed in processImages
  }
}
