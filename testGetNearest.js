const axios = require('axios');

async function testGetNearestLocation() {
    try {
        const response = await axios.get('http://localhost:3000/locations/nearest', {
            params: {
                lat: 47.2681310,
                lon: 39.7895040
            }
        });
        console.log(response.data);
    } catch (error) {
        console.error('Error getting nearest location:', error.response ? error.response.data : error.message);
    }
}

testGetNearestLocation();