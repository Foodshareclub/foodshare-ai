import '@testing-library/jest-dom';

// Mock environment variables
process.env.GITHUB_TOKEN = 'test-token';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
