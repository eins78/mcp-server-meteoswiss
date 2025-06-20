import short from 'short-uuid';
import { randomUUID } from 'node:crypto';

describe('Short Session IDs', () => {
  const translator = short();
  
  it('should generate short IDs from UUIDs', () => {
    const uuid = randomUUID();
    const shortId = translator.fromUUID(uuid);
    
    // Short ID should be significantly shorter than UUID
    expect(shortId.length).toBeLessThan(uuid.length);
    expect(shortId.length).toBeGreaterThan(0);
    
    // Should be able to convert back to UUID
    const convertedUuid = translator.toUUID(shortId);
    expect(convertedUuid).toBe(uuid);
  });
  
  it('should generate unique short IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(translator.fromUUID(randomUUID()));
    }
    
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });
  
  it('should generate consistent short IDs for the same UUID', () => {
    const uuid = randomUUID();
    const shortId1 = translator.fromUUID(uuid);
    const shortId2 = translator.fromUUID(uuid);
    
    expect(shortId1).toBe(shortId2);
  });
});