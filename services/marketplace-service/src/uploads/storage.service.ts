import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'minio';
import { AppConfig } from '../config';

/**
 * Lưu file vào MinIO (luật: ảnh, bằng chứng, biên lai nằm ở MinIO). Bucket công khai `san-public`
 * cho ảnh ai cũng xem được (logo shop, ảnh sản phẩm); trình duyệt mở thẳng bằng đường dẫn trả về.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client?: Client;
  private bucketReady = false;

  constructor(private readonly config: AppConfig) {}

  /** Lưu file công khai, trả đường dẫn đầy đủ để hiển thị */
  async putPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    const client = await this.publicBucket();
    await client.putObject(this.config.publicBucket, key, body, body.length, {
      'Content-Type': contentType,
    });
    return this.publicUrl(key);
  }

  /** Đường dẫn công khai của một file trong bucket san-public */
  publicUrl(key: string): string {
    return `${this.config.publicFileUrl}/${this.config.publicBucket}/${key}`;
  }

  /** Tạo bucket nếu chưa có và cho phép ai cũng đọc (chỉ đọc) */
  private async publicBucket(): Promise<Client> {
    const c = this.config;
    this.client ??= new Client({
      endPoint: c.minioEndpoint,
      port: c.minioPort,
      useSSL: c.minioUseSsl,
      accessKey: c.minioAccessKey,
      secretKey: c.minioSecretKey,
    });
    if (!this.bucketReady) {
      if (!(await this.client.bucketExists(c.publicBucket))) {
        await this.client.makeBucket(c.publicBucket);
        this.logger.log(`Đã tạo bucket ${c.publicBucket}`);
      }
      await this.client.setBucketPolicy(
        c.publicBucket,
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${c.publicBucket}/*`],
            },
          ],
        }),
      );
      this.bucketReady = true;
    }
    return this.client;
  }
}
