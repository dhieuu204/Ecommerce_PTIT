import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'minio';
import type { Readable } from 'node:stream';
import { AppConfig } from '../config';

/**
 * Lưu ảnh biên lai hoàn tay vào MinIO, bucket riêng tư (không ai mở thẳng được);
 * admin tài chính xem qua API của payment-service.
 */
@Injectable()
export class ReceiptStorage {
  private readonly logger = new Logger(ReceiptStorage.name);
  private client?: Client;
  private bucketReady = false;

  constructor(private readonly config: AppConfig) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = await this.bucket();
    await client.putObject(this.config.privateBucket, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  async get(key: string): Promise<Readable> {
    const client = await this.bucket();
    return client.getObject(this.config.privateBucket, key);
  }

  private async bucket(): Promise<Client> {
    const c = this.config;
    this.client ??= new Client({
      endPoint: c.minioEndpoint,
      port: c.minioPort,
      useSSL: c.minioUseSsl,
      accessKey: c.minioAccessKey,
      secretKey: c.minioSecretKey,
    });
    if (!this.bucketReady) {
      if (!(await this.client.bucketExists(c.privateBucket))) {
        await this.client.makeBucket(c.privateBucket);
        this.logger.log(`Đã tạo bucket riêng tư ${c.privateBucket}`);
      }
      this.bucketReady = true;
    }
    return this.client;
  }
}
