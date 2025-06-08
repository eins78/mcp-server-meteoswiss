import { z } from 'zod';

export const RegionSchema = z.enum(['north', 'south', 'west']);
export const LanguageSchema = z.enum(['de', 'fr', 'it', 'en']).default('en');

export type Region = z.infer<typeof RegionSchema>;
export type Language = z.infer<typeof LanguageSchema>;

export function validateRegion(region: string): Region {
  const result = RegionSchema.safeParse(region);
  if (!result.success) {
    // TODO: z.prettifyError wirth zod v4
    throw new Error(`Invalid region: ${region}. ${result.error.message}`);
  }
  return result.data;
}

export function validateLanguage(language: string): Language {
  const result = LanguageSchema.safeParse(language);
  if (!result.success) {
    // TODO: z.prettifyError wirth zod v4
    throw new Error(`Invalid language: ${language}. ${result.error.message}`);
  }
  return result.data;
}
