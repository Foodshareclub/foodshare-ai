# FoodShare AI - Enterprise-Grade Code Review Platform

AI-powered code review system with enterprise-grade reliability, security, and scalability.

## 🚀 Features

- **Automated Code Reviews**: AI-powered PR analysis with configurable depth
- **Multi-Repository Support**: Manage multiple repos with custom configurations
- **Incremental Reviews**: Smart diff analysis for efficient reviews
- **Enterprise Translation**: Multi-language support with self-hosted LLM integration
- **Queue System**: Reliable job processing with retry logic and DLQ
- **Real-time Monitoring**: Health checks, structured logging, and metrics
- **Enterprise Security**: Rate limiting, input validation, and audit trails

## 🏗️ Architecture

- **Frontend**: Next.js 16 with React 19
- **Backend**: Next.js API routes with TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI**: Groq/Ollama for code analysis
- **Queue**: PostgreSQL-based job queue with cron scheduling
- **Auth**: Supabase Auth with passkey support

## 📋 Prerequisites

- Node.js 20+
- Supabase account
- GitHub personal access token
- Groq API key (or Ollama instance)

## 🛠️ Setup

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd foodshare-ai
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

3. **Setup database**
   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Type checking
npm run type-check
```

## 🔒 Security Features

- **Rate Limiting**: Configurable per-endpoint limits
- **Input Validation**: Zod schemas for all inputs
- **Error Handling**: Structured error responses
- **Audit Logging**: Comprehensive request logging
- **Secrets Management**: Environment-based configuration

## 📊 Monitoring

### Health Checks
- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed system status

### Logging
Structured JSON logs with correlation IDs:
```typescript
import { logger } from '@/lib/logger';

logger.info('Operation completed', { userId, duration });
logger.error('Operation failed', error, { context });
```

## 🚦 API Usage

### Create Review
```bash
POST /api/review
{
  "owner": "username",
  "repo": "repository",
  "prNumber": 123,
  "depth": "standard"
}
```

### Check Job Status
```bash
GET /api/jobs?status=pending
```

### Translation API
```bash
# Single translation
POST /api/translate
{
  "text": "Hello world",
  "targetLanguage": "es",
  "quality": "high",
  "domain": "technical"
}

# Batch translation
POST /api/translate/batch
{
  "requests": [
    {"text": "Hello", "targetLanguage": "es"},
    {"text": "World", "targetLanguage": "fr"}
  ]
}
```

## 📈 Performance

- **Indexes**: Optimized database queries
- **Caching**: Strategic caching for frequent queries
- **Queue**: Efficient job processing with retry logic
- **DLQ**: Dead letter queue for failed jobs

## 🔧 Configuration

### Rate Limiting
Configure in `.env.local`:
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
```

### Cron Jobs
- `poll-repos`: Every 5 minutes
- `process-queue`: Every minute
- `scan-repos`: Every 2 hours
- `cleanup-dlq`: Weekly

## 📚 Documentation

- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Enterprise Readiness](ENTERPRISE_READINESS.md)

## 🏢 Enterprise Features

✅ Comprehensive error handling
✅ Input validation with Zod
✅ Rate limiting
✅ Structured logging
✅ Health monitoring
✅ Test coverage
✅ CI/CD pipeline
✅ TypeScript strict mode
✅ Dead letter queue
✅ Performance indexes

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT

## 🆘 Support

- Issues: GitHub Issues
- Security: security@foodshare.ai
- Docs: [Documentation](./docs)
