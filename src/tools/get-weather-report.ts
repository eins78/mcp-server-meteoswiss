import type { GetWeatherReportParams, WeatherReport } from '../schemas/weather-report.ts';
import { getLatestWeatherReport } from '../data/weather-report-data.ts';

/**
 * Implementation of the getWeatherReport MCP tool
 *
 * @param params - The parameters for the tool
 * @returns A Promise that resolves to the weather report
 */
export async function getWeatherReport(params: GetWeatherReportParams): Promise<WeatherReport> {
  const { region, language } = params;

  try {
    return await getLatestWeatherReport(region, language);
  } catch (error) {
    console.error('Error in getWeatherReport tool:', error);
    throw new Error(
      `Failed to get weather report for region "${region}" in language "${language}"`
    );
  }
}
