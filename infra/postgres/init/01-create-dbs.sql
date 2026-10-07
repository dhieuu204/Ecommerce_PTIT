-- Một máy chủ PostgreSQL, 4 database riêng, mỗi service một tài khoản (ARCH-01).
-- Mật khẩu ở đây chỉ dùng khi chạy local.
CREATE USER user_svc WITH PASSWORD 'user_svc';
CREATE USER marketplace_svc WITH PASSWORD 'marketplace_svc';
CREATE USER payment_svc WITH PASSWORD 'payment_svc';
CREATE USER approval_svc WITH PASSWORD 'approval_svc';

-- CREATEDB chỉ để `prisma migrate dev` tạo database tạm (shadow) khi chạy local.
ALTER USER user_svc CREATEDB;
ALTER USER marketplace_svc CREATEDB;
ALTER USER payment_svc CREATEDB;
ALTER USER approval_svc CREATEDB;

CREATE DATABASE user_db OWNER user_svc;
CREATE DATABASE market_db OWNER marketplace_svc;
CREATE DATABASE payment_db OWNER payment_svc;
CREATE DATABASE approval_db OWNER approval_svc;

-- Không cho tài khoản của service này kết nối vào database của service khác.
REVOKE CONNECT ON DATABASE user_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE market_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE payment_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE approval_db FROM PUBLIC;

-- Tìm kiếm không dấu cho marketplace (SRC).
\connect market_db
CREATE EXTENSION IF NOT EXISTS unaccent;
