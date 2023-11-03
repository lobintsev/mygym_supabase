const swaggerAutogen = require('swagger-autogen')()
require('dotenv').config();
const outputFile = './swagger_output.json'
const endpointsFiles = ['./index.js']

const doc = {
    info: {
        version: "1.0.0",
        title: "MyGym BOT API",
        description: "MyGym BOT API Documentation for user-facing endpoints"
    },
    host: `${process.env.HOST || 'api.mygym.world'}`,
    basePath: "/",
    schemes: ['https', 'http'],
    consumes: ['application/json'],
    produces: ['application/json'],
   
}
    


swaggerAutogen(outputFile, endpointsFiles, doc)