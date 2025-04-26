import Fastify from 'fastify';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.js';
import { getWeatherReport } from './tools/get-weather-report.js';

// Create Fastify instance
const fastify = Fastify({
  logger: true
});

// Define the port
const PORT = process.env.PORT || 3000;

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// MCP API endpoint for tools
fastify.post('/api/tools', async (request, reply) => {
  const body = request.body as any;
  
  if (!body || !body.name || !body.parameters) {
    reply.code(400);
    return { error: { message: 'Invalid request structure' } };
  }
  
  try {
    // Handle tool requests based on the name
    switch (body.name) {
      case 'getWeatherReport': {
        // Validate parameters
        const result = GetWeatherReportParamsSchema.safeParse(body.parameters);
        
        if (!result.success) {
          reply.code(400);
          return { error: { message: 'Invalid parameters', details: result.error.format() } };
        }
        
        // Execute the tool
        const weatherReport = await getWeatherReport(result.data);
        return { result: weatherReport };
      }
      
      default:
        reply.code(404);
        return { error: { message: `Tool '${body.name}' not found` } };
    }
  } catch (error) {
    console.error('Error processing tool request:', error);
    reply.code(500);
    return { error: { message: 'Internal server error' } };
  }
});

// MCP discovery endpoint - lists available tools
fastify.get('/api/tools', async () => {
  return {
    tools: [
      {
        name: 'getWeatherReport',
        description: 'Retrieves the latest weather report for a specified region',
        parameters: {
          type: 'object',
          properties: {
            region: {
              type: 'string',
              enum: ['north', 'south', 'west'],
              description: 'Region for the report'
            },
            language: {
              type: 'string',
              enum: ['de', 'fr', 'it', 'en'],
              description: 'Language for the report',
              default: 'en'
            }
          },
          required: ['region']
        }
      }
    ]
  };
});

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: PORT as number, host: '0.0.0.0' });
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET  /health          - Health check');
    console.log('- GET  /api/tools       - List available tools');
    console.log('- POST /api/tools       - Execute a tool');
    console.log('\nExample tool usage:');
    console.log(`curl -X POST http://localhost:${PORT}/api/tools -H "Content-Type: application/json" -d '{"name":"getWeatherReport","parameters":{"region":"north","language":"en"}}'`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start(); 
