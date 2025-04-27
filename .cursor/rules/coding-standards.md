# Coding Standards

This project adheres to the following coding standards to ensure consistency and maintainability:

## TypeScript Style

- Use explicit return types for functions
- Use type imports with the `type` keyword
- Follow verbatim module syntax (as configured in tsconfig.json)
- Use interface for object shapes and type for unions, intersections, and primitives

## Documentation

- Use JSDoc comments for all exported functions, classes, and interfaces
- Include parameter descriptions, return type descriptions, and examples where appropriate
- Document thrown exceptions

## Example

```typescript
/**
 * Retrieves weather data for a specific station.
 * 
 * @param stationId - The unique identifier for the weather station
 * @param dateRange - The date range for which to retrieve data
 * @returns The weather data for the specified station and date range
 * @throws {StationNotFoundError} If the station ID is invalid
 * 
 * @example
 * ```ts
 * const data = await getWeatherData('ABC123', { start: '2023-01-01', end: '2023-01-31' });
 * ```
 */
export function getWeatherData(
  stationId: string, 
  dateRange: DateRange
): Promise<WeatherData> {
  // Implementation
}
```

## Naming Conventions

- Use camelCase for variables, parameters, functions, and methods
- Use PascalCase for classes, interfaces, types, and enums
- Use UPPER_CASE for constants
- Prefix interfaces with "I" only for interface inheritances (e.g., IDisposable)
- Use meaningful and descriptive names

## File Organization

- One export per file when possible
- Group related functionality in directories
- Use index.ts files to re-export from a directory
- Keep files focused and not too large (< 300 lines if possible)
