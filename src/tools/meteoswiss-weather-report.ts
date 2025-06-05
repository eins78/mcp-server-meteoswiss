import type { GetWeatherReportParams, WeatherReport } from '../schemas/weather-report.js';
import { getLatestWeatherReport } from '../data/weather-report-data.js';
import { debugTools } from '../support/logging.js';

/**
 * Implementation of the meteoswissWeatherReport MCP tool
 *
 * @param params - The parameters for the tool
 * @returns A Promise that resolves to the weather report
 */
export async function meteoswissWeatherReport(params: GetWeatherReportParams): Promise<WeatherReport> {
  const { region, language } = params;
  debugTools('meteoswissWeatherReport called with params: %O', params);
  
  const startTime = Date.now();
  try {
    const report = await getLatestWeatherReport(region, language);
    const duration = Date.now() - startTime;
    debugTools('Weather report retrieved successfully in %dms', duration);
    debugTools('Report summary: title=%s, forecast_count=%d', report.title, report.forecast.length);
    return report;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in meteoswissWeatherReport tool:', error);
    debugTools('Weather report failed after %dms: %O', duration, error);

    let errorMessage = `Failed to get weather report for region "${region}" in language "${language}"`;

    // Add more detailed information if available
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }

    throw new Error(errorMessage);
  }
}