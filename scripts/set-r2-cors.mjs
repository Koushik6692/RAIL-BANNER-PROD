import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";

loadEnv();

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const Bucket = process.env.R2_BUCKET_NAME;

const CORSConfiguration = {
  CORSRules: [
    {
      AllowedOrigins: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://rail-banner-editor-prototype.vercel.app",
      ],
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length"],
      MaxAgeSeconds: 3600,
    },
  ],
};

await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration }));
const current = await client.send(new GetBucketCorsCommand({ Bucket }));
console.log(JSON.stringify(current.CORSRules, null, 2));
