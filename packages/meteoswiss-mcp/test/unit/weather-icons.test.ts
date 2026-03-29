import { describe, expect, it } from '@jest/globals';
import { weatherIconDescription, weatherIconUrl } from '../../src/support/weather-icons.js';

describe('weatherIconDescription', () => {
  it('should return description for day codes', () => {
    expect(weatherIconDescription(1)).toBe('sunny');
    expect(weatherIconDescription(20)).toBe('very overcast with rain');
    expect(weatherIconDescription(35)).toBe('overcast and dry');
  });

  it('should return description for night codes', () => {
    expect(weatherIconDescription(101)).toBe('clear');
    expect(weatherIconDescription(128)).toBe('fog');
    expect(weatherIconDescription(142)).toBe('very cloudy, thundery snow showers');
  });

  it('should return unknown for unmapped codes', () => {
    expect(weatherIconDescription(0)).toBe('unknown (0)');
    expect(weatherIconDescription(50)).toBe('unknown (50)');
    expect(weatherIconDescription(999)).toBe('unknown (999)');
  });
});

describe('weatherIconUrl', () => {
  it('should return SVG URL for valid day codes', () => {
    expect(weatherIconUrl(1)).toBe(
      'https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/1.svg'
    );
    expect(weatherIconUrl(35)).toBe(
      'https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/35.svg'
    );
  });

  it('should return SVG URL for valid night codes', () => {
    expect(weatherIconUrl(101)).toBe(
      'https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/101.svg'
    );
    expect(weatherIconUrl(142)).toBe(
      'https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/142.svg'
    );
  });

  it('should return null for unknown codes', () => {
    expect(weatherIconUrl(0)).toBeNull();
    expect(weatherIconUrl(50)).toBeNull();
    expect(weatherIconUrl(99)).toBeNull();
    expect(weatherIconUrl(999)).toBeNull();
    expect(weatherIconUrl(-1)).toBeNull();
  });
});
