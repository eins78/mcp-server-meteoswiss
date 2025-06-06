import { z } from 'zod';
import { texts } from '../texts/index.js';

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
  region: z.enum(['north', 'south', 'west']).describe(
    texts['region-parameter-description']
  ),
  language: z.enum(['de', 'fr', 'it']).default('de').describe(
    texts['language-parameter-description']
  ),
});

export type WeatherReport = z.infer<typeof WeatherReportSchema>;
export type GetWeatherReportParams = z.infer<typeof GetWeatherReportParamsSchema>; 
