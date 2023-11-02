const axios = require('axios');

async function testGetLocations() {
    try {
        const response = await axios.get('https://mygymapi.bebopbrands.com/locations', {
        });
        console.log( response.data);
    } catch (error) {
        console.error('Error getting user:', error.response ? error.response.data : error.message);
    }
}

testGetLocations();