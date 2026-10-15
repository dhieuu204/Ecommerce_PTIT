import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'minio';
import type { Readable } from 'node:stream';
import { AppConfig } from '../config';

/**
 * Lưu file vào MinIO (luật: ảnh, bằng chứng, biên lai nằm ở MinIO). Bucket công khai `san-public`
 * cho ảnh ai cũng xem được (logo shop, ảnh sản phẩm); trình duyệt mở thẳng bằng đường dẫn trả về.
 * Bucket riêng tư (P5: ảnh bằng chứng trả hàng) không ai mở thẳng được, chỉ xem qua API có kiểm quyền.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client?: Client;
  private bucketReady = false;
  private privateReady = false;

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

  /** Lưu file vào bucket riêng tư */
  async putPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = await this.privateBucket();
    await client.putObject(this.config.privateBucket, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  /** Đọc file trong bucket riêng tư (người gọi đã kiểm quyền) */
  async getPrivate(key: string): Promise<Readable> {
    const client = await this.privateBucket();
    return client.getObject(this.config.privateBucket, key);
  }

  private connect(): Client {
    const c = this.config;
    this.client ??= new Client({
      endPoint: c.minioEndpoint,
      port: c.minioPort,
      useSSL: c.minioUseSsl,
      accessKey: c.minioAccessKey,
      secretKey: c.minioSecretKey,
    });
    return this.client;
  }

  /** Tạo bucket nếu chưa có và cho phép ai cũng đọc (chỉ đọc) */
  private async publicBucket(): Promise<Client> {
    const c = this.config;
    const client = this.connect();
    if (!this.bucketReady) {
      if (!(await client.bucketExists(c.publicBucket))) {
        await client.makeBucket(c.publicBucket);
        this.logger.log(`Đã tạo bucket ${c.publicBucket}`);
      }
      await client.setBucketPolicy(
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
    return client;
  }

  /** Tạo bucket riêng tư nếu chưa có (không gắn chính sách đọc công khai) */
  private async privateBucket(): Promise<Client> {
    const client = this.connect();
    if (!this.privateReady) {
      if (!(await client.bucketExists(this.config.privateBucket))) {
        await client.makeBucket(this.config.privateBucket);
        this.logger.log(`Đã tạo bucket riêng tư ${this.config.privateBucket}`);
      }
      this.privateReady = true;
    }
    return client;
  }
}
