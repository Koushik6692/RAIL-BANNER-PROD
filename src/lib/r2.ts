import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mime from "mime/lite";

interface r2Params {
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  cdn: string;
}

interface PresignedUrlOptions {
  expiresIn?: number;
  contentType?: string;
}

export interface PresignedUpload {
  fileName: string;
  filePath: string;
  contentType: string;
  presignedUrl: string;
  url: string;
}

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === "function") {
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export class R2StorageService {
  private client: S3Client;
  private bucketName: string;
  private accountId: string;
  private cdn: string;

  constructor(params: r2Params) {
    this.bucketName = params.bucketName;
    this.accountId = params.accountId;
    this.cdn = params.cdn.replace(/\/$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${params.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: params.accessKeyId,
        secretAccessKey: params.secretAccessKey,
      },
    });
  }

  async uploadData(
    fileName: string,
    data: Buffer | string,
    contentType: string = "application/octet-stream",
  ): Promise<string> {
    try {
      const type = mime.getType(fileName) || contentType;

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileName,
          Body: data,
          ContentType: type,
        }),
      );

      return this.getUrl(fileName);
    } catch (error) {
      console.error("[R2] Failed to upload file:", fileName);
      console.error("[R2] Error stack:", error instanceof Error ? error.stack : error);
      throw new Error("Failed to upload to R2");
    }
  }

  async uploadJson(fileName: string, data: any): Promise<string> {
    const content = JSON.stringify(data);
    return this.uploadData(fileName, content, "application/json");
  }

  async getObjectBuffer(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      return streamToBuffer(res.Body);
    } catch (error: any) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getJson<T = any>(key: string): Promise<T | null> {
    const buf = await this.getObjectBuffer(key);
    if (!buf) return null;
    try {
      return JSON.parse(buf.toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  async createPresignedUpload(
    filePath: string,
    options: PresignedUrlOptions = {},
  ): Promise<PresignedUpload> {
    const inferredType =
      options.contentType || mime.getType(filePath) || "application/octet-stream";

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: filePath,
      ContentType: inferredType,
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn ?? 3600,
    });

    return {
      fileName: filePath.split("/").pop() || filePath,
      filePath,
      contentType: inferredType,
      presignedUrl,
      url: this.getUrl(filePath),
    };
  }

  async deleteObject(keyOrUrl: string): Promise<void> {
    const key = keyOrUrl.startsWith("http") ? keyOrUrl.replace(`${this.cdn}/`, "") : keyOrUrl;

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
  }

  getUrl(fileName: string): string {
    return `${this.cdn}/${fileName}`;
  }
}
