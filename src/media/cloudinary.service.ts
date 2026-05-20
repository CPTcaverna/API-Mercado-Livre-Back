import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
};

function extractCloudinaryErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === 'object' && record.error !== null) {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message.trim()) {
        return nested.message.trim();
      }
    }
  }
  return 'Falha ao enviar imagem para o Cloudinary.';
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private configured = false;

  private ensureConfigured(): void {
    if (this.configured) return;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'Cloudinary não configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no .env do backend.',
      );
    }

    if (cloudName.toLowerCase() === 'root') {
      throw new InternalServerErrorException(
        'CLOUDINARY_CLOUD_NAME inválido: use o Cloud name da conta (Dashboard Cloudinary), não o nome da API Key.',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.configured = true;
  }

  async uploadImage(file: Express.Multer.File): Promise<CloudinaryUploadResult> {
    this.ensureConfigured();

    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo de imagem enviado.');
    }
    if (file.size > MAX_BYTES) {
      throw new PayloadTooLargeException('Imagem muito grande. Máximo: 5 MB.');
    }
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'Formato não suportado. Use JPEG, PNG, WebP ou GIF.',
      );
    }

    try {
      const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'mercado-livre-items',
            resource_type: 'image',
            transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
          },
          (err, uploadResult) => {
            if (err) {
              reject(err);
              return;
            }
            if (!uploadResult?.secure_url) {
              reject(new Error('Cloudinary não retornou URL da imagem.'));
              return;
            }
            resolve({
              url: uploadResult.secure_url,
              publicId: uploadResult.public_id,
            });
          },
        );
        stream.end(file.buffer);
      });

      return result;
    } catch (err) {
      this.logger.warn(`Cloudinary upload failed: ${extractCloudinaryErrorMessage(err)}`);
      throw new BadRequestException(extractCloudinaryErrorMessage(err));
    }
  }
}
