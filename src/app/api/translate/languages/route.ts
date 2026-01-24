import { NextRequest, NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api-handler';
import { translationService } from '@/lib/translation';

export const GET = apiHandler(async () => {
  const provider = translationService['providers'].get('llm');
  const languages = provider?.getSupportedLanguages() || [];
  
  const languageMap = {
    // Global
    en: { name: 'English', flag: '🇬🇧', region: 'Global' },
    es: { name: 'Spanish', flag: '🇪🇸', region: 'Global' },
    fr: { name: 'French', flag: '🇫🇷', region: 'Global' },
    pt: { name: 'Portuguese', flag: '🇵🇹', region: 'Global' },
    // European
    cs: { name: 'Czech', flag: '🇨🇿', region: 'European' },
    de: { name: 'German', flag: '🇩🇪', region: 'European' },
    ru: { name: 'Russian', flag: '🇷🇺', region: 'European' },
    uk: { name: 'Ukrainian', flag: '🇺🇦', region: 'European' },
    it: { name: 'Italian', flag: '🇮🇹', region: 'European' },
    pl: { name: 'Polish', flag: '🇵🇱', region: 'European' },
    nl: { name: 'Dutch', flag: '🇳🇱', region: 'European' },
    sv: { name: 'Swedish', flag: '🇸🇪', region: 'European' },
    // Asian
    zh: { name: 'Chinese', flag: '🇨🇳', region: 'Asian' },
    hi: { name: 'Hindi', flag: '🇮🇳', region: 'Asian' },
    ja: { name: 'Japanese', flag: '🇯🇵', region: 'Asian' },
    ko: { name: 'Korean', flag: '🇰🇷', region: 'Asian' },
    vi: { name: 'Vietnamese', flag: '🇻🇳', region: 'Asian' },
    id: { name: 'Indonesian', flag: '🇮🇩', region: 'Asian' },
    th: { name: 'Thai', flag: '🇹🇭', region: 'Asian' },
    // MENA
    ar: { name: 'Arabic', flag: '🇸🇦', region: 'MENA', rtl: true },
    tr: { name: 'Turkish', flag: '🇹🇷', region: 'MENA' },
  };

  const supportedLanguages = languages.map(code => ({
    code,
    ...languageMap[code as keyof typeof languageMap]
  }));

  return NextResponse.json({
    total: supportedLanguages.length,
    languages: supportedLanguages,
    regions: {
      Global: supportedLanguages.filter(l => l.region === 'Global').length,
      European: supportedLanguages.filter(l => l.region === 'European').length,
      Asian: supportedLanguages.filter(l => l.region === 'Asian').length,
      MENA: supportedLanguages.filter(l => l.region === 'MENA').length,
    }
  });
});
