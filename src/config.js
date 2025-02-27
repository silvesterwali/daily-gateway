import dotenv from 'dotenv';

const env = process.env.NODE_ENV || 'development';

dotenv.config({ path: `.env.${env}` });
dotenv.config({ path: '.env' });

const port = Number.parseInt(process.env.PORT, 10) || 3000;

const getMysqlConfig = () => {
  const base = {
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    pool: { min: 2, max: 100 },
    acquireConnectionTimeout: 10000,
  };

  if (process.env.MYSQL_INSTANCE && process.env.NODE_ENV === 'production') {
    return { ...base, socketPath: `/cloudsql/${process.env.MYSQL_INSTANCE}` };
  }

  if (process.env.MYSQL_HOST) {
    return { ...base, host: process.env.MYSQL_HOST };
  }

  return base;
};

const config = {
  env,
  port,
  mysql: getMysqlConfig(),
  cookies: {
    secret: process.env.COOKIES_KEY,
    tracking: {
      opts: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10,
        overwrite: true,
        httpOnly: false,
        signed: false,
        secure: false,
        sameSite: 'lax',
      },
      key: 'da2',
    },
    session: {
      opts: {
        maxAge: 1000 * 60 * 30,
        overwrite: true,
        httpOnly: false,
        signed: false,
        secure: false,
        sameSite: 'lax',
      },
      key: 'das',
    },
    auth: {
      opts: {
        maxAge: 1000 * 60 * 15,
        overwrite: true,
        httpOnly: true,
        signed: true,
        secure: env === 'production',
        sameSite: 'lax',
      },
      key: 'da3',
    },
    referral: {
      opts: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        overwrite: true,
        httpOnly: true,
        signed: false,
        secure: false,
        sameSite: 'lax',
      },
      key: 'da4',
    },
    refreshToken: {
      opts: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10,
        overwrite: true,
        httpOnly: true,
        signed: true,
        secure: env === 'production',
        sameSite: 'lax',
      },
      key: 'da5',
    },
  },
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN : '*',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    authenticateUrl: 'https://github.com/login/oauth/access_token',
    scope: 'user:email',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    authenticateUrl: 'https://www.googleapis.com/oauth2/v4/token',
    scope: 'profile email',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    audience: process.env.JWT_AUDIENCE,
    issuer: process.env.JWT_ISSUER,
    expiresIn: 30 * 24 * 60 * 60 * 1000,
  },
  bluesnap: {
    apiKey: process.env.BLUESNAP_API_KEY,
    apiUrl: process.env.BLUESNAP_API_URL,
    checkoutUrl: process.env.BLUESNAP_CHECKOUT_URL,
    storeId: process.env.BLUESNAP_STORE_ID,
    ip: process.env.BLUESNAP_IP,
  },
  monetizationUrl: process.env.MONETIZATION_URL || 'http://localhost:9090',
  redirectorUrl: process.env.REDIRECTOR_URL || 'http://localhost:9090',
  besticonUrl: process.env.BESTICON_URL || 'http://localhost:8080',
  apiUrl: process.env.API_URL || 'http://localhost:5000',
  apiSecret: process.env.API_SECRET,
  scraperUrl: process.env.SCRAPER_URL || 'http://localhost:5001',
  scraperSecret: process.env.SCRAPER_SECRET,
  accessSecret: process.env.ACCESS_SECRET || 'topsecret',
  primaryAuthOrigin: process.env.PRIMARY_AUTH_ORIGIN,
  webappOrigin: process.env.WEBAPP_ORIGIN || 'http://localhost:5002',
  refreshToken: {
    secret: process.env.REFRESH_TOKEN_SECRET || 'topsecret',
    salt: process.env.REFRESH_TOKEN_SALT || 'salt',
  },
  amplitudeKey: process.env.AMPLITUDE_KEY || '',
  flagsmithKey: process.env.FLAGSMITH_KEY || 'key',
  flagsmithWebhookSecret: process.env.FLAGSMITH_WEBHOOK_SECRET || '',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASS,
  },
};

export default config;
