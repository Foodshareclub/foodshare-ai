# Contributing to FoodShare AI

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and configure
4. Run migrations: `npx supabase db push`
5. Start dev server: `npm run dev`

## Code Standards

### TypeScript
- Strict mode enabled
- No implicit any
- Proper error handling
- Type all function parameters and returns

### Testing
- Write tests for new features
- Maintain >80% code coverage
- Run tests before committing: `npm test`

### Code Style
- Use ESLint configuration
- Format with Prettier
- Follow existing patterns

## Pull Request Process

1. Create a feature branch from `main`
2. Write tests for your changes
3. Ensure all tests pass: `npm test`
4. Run type check: `npm run type-check`
5. Run linter: `npm run lint`
6. Update documentation if needed
7. Submit PR with clear description

## Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `perf:` Performance improvement
- `chore:` Maintenance

Example: `feat: add rate limiting to API endpoints`

## Testing Guidelines

### Unit Tests
- Test individual functions
- Mock external dependencies
- Use descriptive test names

### Integration Tests
- Test API endpoints
- Test database operations
- Use test database

### Coverage
- Aim for >80% coverage
- Focus on critical paths
- Don't test trivial code

## Security

- Never commit secrets
- Use environment variables
- Follow security best practices
- Report vulnerabilities privately

## Questions?

Open an issue or reach out to the maintainers.
