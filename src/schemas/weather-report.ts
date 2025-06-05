import { z } from 'zod';

/**
 * Weather report schema
 * Defines the structure for weather reports from the MeteoSwiss API
 */
export const WeatherReportSchema = z.object({
  region: z.enum(['north', 'south', 'west']),
  language: z.enum(['de', 'fr', 'it', 'en']).default('en'),
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
  region: z.enum(['north', 'south', 'west']).describe(
    'The Swiss region to get weather for. north: Northern Switzerland (Zurich, Basel, Bern, Swiss Plateau), south: Southern Switzerland (Ticino and southern valleys), west: Western Switzerland (Romandy - Geneva, Lausanne, western Alps)'
  ),
  language: z.enum(['de', 'fr', 'it', 'en']).default('en').describe(
    'Language for the weather report. de: German (primary for north), fr: French (primary for west), it: Italian (primary for south/Ticino), en: English (available for all regions)'
  ),
});

export type WeatherReport = z.infer<typeof WeatherReportSchema>;
export type GetWeatherReportParams = z.infer<typeof GetWeatherReportParamsSchema>;
