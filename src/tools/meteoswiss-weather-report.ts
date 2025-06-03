import type { GetWeatherReportParams, WeatherReport } from '../schemas/weather-report.js';
import { getLatestWeatherReport } from '../data/weather-report-data.js';

/**
 * Implementation of the meteoswissWeatherReport MCP tool
 *
 * @param params - The parameters for the tool
 * @returns A Promise that resolves to the weather report
 */
export async function meteoswissWeatherReport(params: GetWeatherReportParams): Promise<WeatherReport> {
  const { region, language } = params;

  try {
    return await getLatestWeatherReport(region, language);
  } catch (error) {
    console.error('Error in meteoswissWeatherReport tool:', error);

    let errorMessage = `Failed to get weather report for region "${region}" in language "${language}"`;

    // Add more detailed information if available
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }

    throw new Error(errorMessage);
  }
}