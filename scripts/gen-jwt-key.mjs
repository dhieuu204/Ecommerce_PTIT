// Tạo khóa RSA cố định cho user-service khi dev, in ra một dòng để dán vào services/user-service/.env.
// Chạy: node scripts/gen-jwt-key.mjs
// Khóa riêng là bí mật: không commit file .env, không gửi qua chat. Mỗi môi trường một khóa khác nhau.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
console.log(`JWT_PRIVATE_KEY="${pem.trim().replace(/\n/g, '\\n')}"`);
