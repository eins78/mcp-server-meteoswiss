import { z } from 'zod';

/**
 * Weather report schema
 * Defines the structure for weather reports from the MeteoSwiss API
 */
export const WeatherReportSchema = z.object({
  region: z.enum(['north', 'south', 'west']),
  language: z.enum(['de', 'fr', 'it']).default('de'),
  title: z.string(),
  updatedAt: z.string(),
  content: z.string(),
  forecast: z.array(
    z.object({
      day: z.string(),
      description: z.string(),
      temperature: z.string().optional(),
    })
  ),
  source: z.literal('meteoswiss'),
});

/**
 * Parameters schema for the meteoswissWeatherReport tool
 */
export const GetWeatherReportParamsSchema = z.object({
  region: z
    .enum(['north', 'south', 'west'], {
      message:
        "Region must be one of: 'north' (Northern Switzerland), 'south' (Ticino), or 'west' (Romandy).",
    })
    .describe(
      'Swiss region: north (Northern Switzerland including Zurich, Basel, Bern), south (Ticino and southern valleys), west (Romandy including Geneva, Lausanne)'
    ),
  language: z
    .enum(['de', 'fr', 'it'], {
      message:
        "Language must be one of: 'de' (German), 'fr' (French), or 'it' (Italian). English is NOT supported.",
    })
    .default('de')
    .describe(
      'Language for the weather report. ONLY Swiss official languages are supported: German (de), French (fr), or Italian (it). English (en) is NOT supported and will cause an error. Default is German (de) which should be used for most queries including Zurich.'
    ),
});

export type WeatherReport = z.infer<typeof WeatherReportSchema>;
export type GetWeatherReportParams = z.infer<typeof GetWeatherReportParamsSchema>;
