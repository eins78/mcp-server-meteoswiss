/**
 * MCP tool adapter for getLocalForecast.
 * Thin wrapper: validates input, calls data layer, formats output.
 */

import { getLocalForecast } from '../data/ogd-local-forecast.js';
import type { GetLocalForecastParams } from '../schemas/ogd-local-forecast.js';

/**
 * Execute the getLocalForecast tool.
 *
 * @param params - Validated tool parameters
 * @returns Structured forecast response
 */
export async function ogdLocalForecastTool(
  params: GetLocalForecastParams
): Promise<ReturnType<typeof getLocalForecast>> {
  return getLocalForecast(params);
}
