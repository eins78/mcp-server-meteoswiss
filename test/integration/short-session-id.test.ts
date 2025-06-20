import { generateShortId, shortIdToUuid } from '../../src/support/short-id.js';
import { randomUUID } from 'node:crypto';

describe('Short Session IDs', () => {
  it('should generate short IDs from UUIDs', () => {
    const uuid = randomUUID();
    const shortId = generateShortId(uuid);
    
    // Short ID should be significantly shorter than UUID
    expect(shortId.length).toBeLessThan(uuid.length);
    expect(shortId.length).toBeGreaterThan(0);
    
    // Should be able to convert back to UUID
    const convertedUuid = shortIdToUuid(shortId);
    expect(convertedUuid).toBe(uuid);
  });
  
  it('should generate unique short IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateShortId());
    }
    
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });
  
  it('should generate consistent short IDs for the same UUID', () => {
    const uuid = randomUUID();
    const shortId1 = generateShortId(uuid);
    const shortId2 = generateShortId(uuid);
    
    expect(shortId1).toBe(shortId2);
  });
});