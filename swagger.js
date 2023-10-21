const swaggerAutogen = require('swagger-autogen')()

const outputFile = './swagger_output.json'
const endpointsFiles = ['./index.js']
const host = process.env.K_REVISION + '.a.run.app';

const doc = {
    info: {
        version: "1.0.0",
        title: "MyGym BOT API",
        description: "MyGym BOT API Documentation for user-facing endpoints"
    },
    host: 'https://mygym-supabase-zabekaqepq-lz.a.run.app',
    basePath: "/",
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
   
}
    


swaggerAutogen(outputFile, endpointsFiles, doc)